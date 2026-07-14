"""
TransparentGuard Python SDK — Anthropic Wrapper
Drop-in replacement for the Anthropic client with transparent policy enforcement.
Supports both sync and async usage. Streaming uses buffer mode.

Usage:
    from transparentguard import tg
    from anthropic import Anthropic

    client = tg.wrap(Anthropic(), policy="./policies/prod.yaml")
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello"}],
    )
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator, Dict, Iterator, List, Optional

from ..types import (
    EvaluateOptions,
    Message,
    RequestPayload,
    ResponsePayload,
    TPSPolicy,
)
from ..license import LicenseStatus, TransparentGuardError
from ..engine import evaluate
from ..audit import AuditEmitter


def _extract_text(content: Any) -> str:
    """Extract text from Anthropic content (string or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") if isinstance(b, dict) else getattr(b, "text", "")
            for b in content
            if (isinstance(b, dict) and b.get("type") == "text") or
               (hasattr(b, "type") and b.type == "text")
        )
    return str(content) if content else ""


class WrappedAnthropicClient:
    """
    Sync/async Anthropic wrapper that enforces TransparentGuard policy on
    every messages.create() call.
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
    def messages(self) -> "_Messages":
        return _Messages(self)

    def _build_request_payload(self, params: Dict[str, Any]) -> RequestPayload:
        messages: List[Message] = []
        system = params.get("system")
        if system:
            messages.append({"role": "system", "content": system})
        for m in params.get("messages", []):
            content = _extract_text(m.get("content", "")) if isinstance(m, dict) else _extract_text(getattr(m, "content", ""))
            role = m.get("role", "user") if isinstance(m, dict) else getattr(m, "role", "user")
            messages.append({"role": role, "content": content})
        return {
            "messages": messages,
            "provider": f"anthropic/{params.get('model', 'unknown')}",
            "model": params.get("model"),
            "max_tokens": params.get("max_tokens"),
        }

    def _do_pre_request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        request_payload = self._build_request_payload(params)
        opts: EvaluateOptions = {}
        if self._api_key:
            opts["api_key"] = self._api_key

        result = evaluate("pre-request", request_payload, self._policy, self._license, opts)
        self._emitter.enqueue_many(result["audit_events"])

        if not result["allowed"]:
            violation = result["violations"][0] if result["violations"] else None
            raise TransparentGuardError(
                violation["detail"] if violation else "Request blocked by policy.",
                "policy_violation",
            )

        redacted = result["payload"]
        redacted_messages_raw = [m for m in redacted.get("messages", []) if m.get("role") != "system"]  # type: ignore[union-attr]
        redacted_system = next(
            (m.get("content") for m in redacted.get("messages", []) if m.get("role") == "system"),  # type: ignore[union-attr]
            params.get("system"),
        )
        new_messages = [
            {"role": m["role"], "content": m.get("content", "")}
            for m in redacted_messages_raw
        ]
        new_params = {**params, "messages": new_messages}
        if redacted_system:
            new_params["system"] = redacted_system
        return new_params

    def _do_post_response(
        self,
        content: str,
        model: str,
        system_prompt: Optional[str],
        usage: Optional[Dict[str, Any]] = None,
    ) -> str:
        response_payload: ResponsePayload = {
            "content": content,
            "provider": f"anthropic/{model}",
            "model": model,
        }
        if system_prompt:
            response_payload["system_prompt"] = system_prompt
        if usage:
            response_payload["usage"] = usage

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
        """Sync create."""
        redacted_params = self._do_pre_request(params)
        system_prompt = params.get("system")

        if params.get("stream"):
            return self._create_streaming_sync(redacted_params, system_prompt)

        response = self._inner.messages.create(**redacted_params)
        raw_content = _extract_text(response.content) if hasattr(response, "content") else ""
        model = getattr(response, "model", params.get("model", "unknown"))
        usage = {
            "prompt_tokens": getattr(getattr(response, "usage", None), "input_tokens", None),
            "completion_tokens": getattr(getattr(response, "usage", None), "output_tokens", None),
        }
        final_content = self._do_post_response(raw_content, model, system_prompt, usage)

        # Patch response content — fail closed: if we cannot apply redaction, block the response
        if hasattr(response, "content") and isinstance(response.content, list) and response.content:
            block0 = response.content[0]
            if not hasattr(block0, "text"):
                raise TransparentGuardError(
                    "Redaction could not be applied: Anthropic response content block has no "
                    "'text' attribute. Response blocked to prevent potential PII leak.",
                    "policy_violation",
                )
            block0.text = final_content
        return response

    def _create_streaming_sync(
        self,
        params: Dict[str, Any],
        system_prompt: Optional[str],
    ) -> Iterator[Any]:
        events: List[Any] = []
        full_text = ""
        model = params.get("model", "unknown")

        with self._inner.messages.stream(**{k: v for k, v in params.items() if k != "stream"}) as stream:
            for event in stream:
                events.append(event)
                if hasattr(event, "type") and event.type == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta and getattr(delta, "type", None) == "text_delta":
                        full_text += getattr(delta, "text", "")
                if hasattr(event, "model") and event.model:
                    model = event.model

        final_text = self._do_post_response(full_text, model, system_prompt)
        if final_text != full_text:
            # Yield a synthetic text_delta event
            from dataclasses import dataclass

            @dataclass
            class _Delta:
                type: str = "text_delta"
                text: str = ""

            @dataclass
            class _SyntheticEvent:
                type: str = "content_block_delta"
                index: int = 0
                delta: Any = None

            yield _SyntheticEvent(delta=_Delta(text=final_text))
        else:
            yield from events

    async def acreate(self, **params: Any) -> Any:
        """Async create."""
        redacted_params = self._do_pre_request(params)
        system_prompt = params.get("system")

        if params.get("stream"):
            return self._acreate_streaming(redacted_params, system_prompt)

        response = await self._inner.messages.acreate(**redacted_params)
        raw_content = _extract_text(response.content) if hasattr(response, "content") else ""
        model = getattr(response, "model", params.get("model", "unknown"))
        final_content = self._do_post_response(raw_content, model, system_prompt)
        if hasattr(response, "content") and isinstance(response.content, list) and response.content:
            block0 = response.content[0]
            if not hasattr(block0, "text"):
                raise TransparentGuardError(
                    "Redaction could not be applied: Anthropic response content block has no "
                    "'text' attribute. Response blocked to prevent potential PII leak.",
                    "policy_violation",
                )
            block0.text = final_content
        await self._emitter.flush()
        return response

    async def _acreate_streaming(
        self,
        params: Dict[str, Any],
        system_prompt: Optional[str],
    ) -> AsyncGenerator[Any, None]:
        events: List[Any] = []
        full_text = ""
        model = params.get("model", "unknown")

        async with self._inner.messages.stream(**{k: v for k, v in params.items() if k != "stream"}) as stream:
            async for event in stream:
                events.append(event)
                if hasattr(event, "type") and event.type == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta and getattr(delta, "type", None) == "text_delta":
                        full_text += getattr(delta, "text", "")
                if hasattr(event, "model") and event.model:
                    model = event.model

        final_text = self._do_post_response(full_text, model, system_prompt)
        await self._emitter.flush()

        if final_text != full_text:
            from dataclasses import dataclass

            @dataclass
            class _Delta:
                type: str = "text_delta"
                text: str = ""

            @dataclass
            class _SyntheticEvent:
                type: str = "content_block_delta"
                index: int = 0
                delta: Any = None

            yield _SyntheticEvent(delta=_Delta(text=final_text))
        else:
            for event in events:
                yield event


class _Messages:
    def __init__(self, wrapper: WrappedAnthropicClient) -> None:
        self._wrapper = wrapper

    def create(self, **kwargs: Any) -> Any:
        return self._wrapper.create(**kwargs)

    async def acreate(self, **kwargs: Any) -> Any:
        return await self._wrapper.acreate(**kwargs)
