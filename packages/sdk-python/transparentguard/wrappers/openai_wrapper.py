"""
TransparentGuard Python SDK — OpenAI Wrapper
Drop-in replacement for the OpenAI client with transparent policy enforcement.
Supports both sync and async usage. Streaming uses buffer mode by default.

Usage:
    from transparentguard import tg
    from openai import OpenAI

    client = tg.wrap(OpenAI(), policy="./policies/prod.yaml")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator, Dict, Generator, Iterator, List, Optional, Union

from ..types import (
    EvaluateOptions,
    RequestPayload,
    ResponsePayload,
    TPSPolicy,
    Message,
)
from ..license import LicenseStatus, TransparentGuardError
from ..engine import evaluate
from ..audit import AuditEmitter


class WrappedOpenAIClient:
    """
    Sync/async OpenAI wrapper that enforces TransparentGuard policy on
    every chat.completions.create() call.
    Streaming uses buffer mode: all chunks collected, response evaluated,
    then re-yielded.
    """

    def __init__(
        self,
        inner: Any,
        policy: TPSPolicy,
        license_status: LicenseStatus,
        api_key: Optional[str] = None,
    ) -> None:
        self._inner = inner
        self._policy = policy
        self._license = license_status
        self._api_key = api_key
        self._emitter = AuditEmitter(policy["audit"])

    @property
    def chat(self) -> "_ChatCompletions":
        return _ChatCompletions(self)

    def _build_request_payload(self, params: Dict[str, Any]) -> RequestPayload:
        messages: List[Message] = []
        for m in params.get("messages", []):
            messages.append({
                "role": m.get("role", "user"),
                "content": m.get("content"),
            })
        return {
            "messages": messages,
            "provider": f"openai/{params.get('model', 'unknown')}",
            "model": params.get("model"),
            "max_tokens": params.get("max_tokens"),
        }

    def _build_response_payload(
        self,
        content: str,
        model: str,
        system_prompt: Optional[str],
        usage: Optional[Dict[str, Any]] = None,
    ) -> ResponsePayload:
        payload: ResponsePayload = {
            "content": content,
            "provider": f"openai/{model}",
            "model": model,
        }
        if system_prompt:
            payload["system_prompt"] = system_prompt
        if usage:
            payload["usage"] = usage
        return payload

    def _get_system_prompt(self, params: Dict[str, Any]) -> Optional[str]:
        return next(
            (m.get("content") for m in params.get("messages", []) if m.get("role") == "system"),
            None,
        )

    def _do_pre_request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates pre-request stage synchronously.
        Returns the (possibly modified) params with redacted messages.
        Raises TransparentGuardError if blocked.
        """
        request_payload = self._build_request_payload(params)
        opts: EvaluateOptions = {}
        if self._api_key:
            opts["api_key"] = self._api_key

        result = evaluate("pre-request", request_payload, self._policy, self._license, opts)
        self._emitter.enqueue_many(result["audit_events"])

        if not result["allowed"]:
            violation = result["violations"][0] if result["violations"] else None
            loop = asyncio.get_event_loop() if asyncio.get_event_loop().is_running() else None
            if loop:
                asyncio.ensure_future(self._emitter.flush())
            raise TransparentGuardError(
                violation["detail"] if violation else "Request blocked by policy.",
                "policy_violation",
            )

        # Rebuild params with redacted messages
        redacted_payload = result["payload"]
        new_messages = [
            {"role": m["role"], "content": m.get("content", "")}
            for m in redacted_payload.get("messages", [])  # type: ignore[union-attr]
        ]
        return {**params, "messages": new_messages}

    def _do_post_response(
        self,
        content: str,
        model: str,
        system_prompt: Optional[str],
        usage: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Evaluates post-response stage synchronously.
        Returns (possibly modified) content.
        Raises TransparentGuardError if blocked.
        """
        response_payload = self._build_response_payload(content, model, system_prompt, usage)
        opts: EvaluateOptions = {}
        if self._api_key:
            opts["api_key"] = self._api_key

        result = evaluate("post-response", response_payload, self._policy, self._license, opts)
        self._emitter.enqueue_many(result["audit_events"])

        if not result["allowed"]:
            violation = result["violations"][0] if result["violations"] else None
            raise TransparentGuardError(
                violation["detail"] if violation else "Response blocked by policy.",
                "policy_violation",
            )

        return result["payload"].get("content", content)  # type: ignore[union-attr]

    def create(self, **params: Any) -> Any:
        """Sync create — evaluates pre and post, returns completion."""
        redacted_params = self._do_pre_request(params)
        system_prompt = self._get_system_prompt(params)

        if params.get("stream"):
            return self._create_streaming_sync(redacted_params, system_prompt)

        completion = self._inner.chat.completions.create(**redacted_params)
        content = completion.choices[0].message.content or "" if completion.choices else ""
        model = completion.model
        usage = {
            "prompt_tokens": getattr(getattr(completion, "usage", None), "prompt_tokens", None),
            "completion_tokens": getattr(getattr(completion, "usage", None), "completion_tokens", None),
        }
        final_content = self._do_post_response(content, model, system_prompt, usage)

        # Patch content in-place (OpenAI object is mutable)
        if completion.choices:
            completion.choices[0].message.content = final_content
        return completion

    def _create_streaming_sync(
        self,
        params: Dict[str, Any],
        system_prompt: Optional[str],
    ) -> Iterator[Any]:
        """Buffer all chunks, evaluate, then yield."""
        chunks = []
        full_content = ""
        model = params.get("model", "unknown")

        for chunk in self._inner.chat.completions.create(**{**params, "stream": True}):
            chunks.append(chunk)
            delta_content = None
            if chunk.choices:
                delta = chunk.choices[0].delta
                delta_content = getattr(delta, "content", None)
            if delta_content:
                full_content += delta_content
            if hasattr(chunk, "model") and chunk.model:
                model = chunk.model

        final_content = self._do_post_response(full_content, model, system_prompt)
        if final_content != full_content and chunks:
            # Yield a single synthetic chunk
            import copy
            synthetic = copy.deepcopy(chunks[0])
            if synthetic.choices:
                synthetic.choices[0].delta.content = final_content
                synthetic.choices[0].finish_reason = "stop"
            yield synthetic
        else:
            yield from chunks

    async def acreate(self, **params: Any) -> Any:
        """Async create."""
        redacted_params = self._do_pre_request(params)
        system_prompt = self._get_system_prompt(params)

        if params.get("stream"):
            return self._acreate_streaming(redacted_params, system_prompt)

        completion = await self._inner.chat.completions.acreate(**redacted_params)
        content = completion.choices[0].message.content or "" if completion.choices else ""
        model = completion.model
        usage = {
            "prompt_tokens": getattr(getattr(completion, "usage", None), "prompt_tokens", None),
            "completion_tokens": getattr(getattr(completion, "usage", None), "completion_tokens", None),
        }
        final_content = self._do_post_response(content, model, system_prompt, usage)
        if completion.choices:
            completion.choices[0].message.content = final_content
        await self._emitter.flush()
        return completion

    async def _acreate_streaming(
        self,
        params: Dict[str, Any],
        system_prompt: Optional[str],
    ) -> AsyncGenerator[Any, None]:
        chunks: List[Any] = []
        full_content = ""
        model = params.get("model", "unknown")

        async for chunk in await self._inner.chat.completions.acreate(**{**params, "stream": True}):
            chunks.append(chunk)
            if chunk.choices:
                delta_content = getattr(chunk.choices[0].delta, "content", None)
                if delta_content:
                    full_content += delta_content
            if hasattr(chunk, "model") and chunk.model:
                model = chunk.model

        final_content = self._do_post_response(full_content, model, system_prompt)
        await self._emitter.flush()

        if final_content != full_content and chunks:
            import copy
            synthetic = copy.deepcopy(chunks[0])
            if synthetic.choices:
                synthetic.choices[0].delta.content = final_content
                synthetic.choices[0].finish_reason = "stop"
            yield synthetic
        else:
            for chunk in chunks:
                yield chunk


class _ChatCompletions:
    def __init__(self, wrapper: WrappedOpenAIClient) -> None:
        self._wrapper = wrapper

    @property
    def completions(self) -> "_Completions":
        return _Completions(self._wrapper)


class _Completions:
    def __init__(self, wrapper: WrappedOpenAIClient) -> None:
        self._wrapper = wrapper

    def create(self, **kwargs: Any) -> Any:
        return self._wrapper.create(**kwargs)

    async def acreate(self, **kwargs: Any) -> Any:
        return await self._wrapper.acreate(**kwargs)
