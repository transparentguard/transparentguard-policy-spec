"""
transparentguard — Python SDK
AI policy enforcement implementing the TransparentGuard Policy Spec (TPS) v1.0.

Quick start:
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
import os
from typing import Any, Optional, Union

from .types import (
    TPSPolicy,
    EvaluateOptions,
    EvaluateResult,
    RequestPayload,
    ResponsePayload,
    TransparentGuardOptions,
)
from .loader import load_policy_async, load_policy_sync, parse_policy, PolicyLoadError
from .license import check_license_async, check_license_sync, LicenseStatus, TransparentGuardError
from .engine import evaluate
from .audit import AuditEmitter
from .testing import run_policy_tests, format_test_results, PolicyTestSuiteResult
from .pii import detect_pii, redact_text, expand_categories, PiiMatch

# Public re-exports
__all__ = [
    # Main entry point
    "tg",
    "TransparentGuard",
    # Types
    "TPSPolicy",
    "EvaluateOptions",
    "EvaluateResult",
    "RequestPayload",
    "ResponsePayload",
    "TransparentGuardOptions",
    "LicenseStatus",
    # Errors
    "TransparentGuardError",
    "PolicyLoadError",
    # Functions
    "evaluate",
    "run_policy_tests",
    "format_test_results",
    "detect_pii",
    "redact_text",
    "expand_categories",
    "PiiMatch",
    # Result types
    "PolicyTestSuiteResult",
]

__version__ = "0.1.0"


# ---------------------------------------------------------------------------
# TransparentGuard class — full-featured client
# ---------------------------------------------------------------------------

class TransparentGuard:
    """
    Main TransparentGuard client.
    Use tg.wrap() for lazy-init (no await needed).
    Use TransparentGuard.init() for explicit async initialization.
    """

    def __init__(
        self,
        policy: TPSPolicy,
        license_status: LicenseStatus,
        api_key: Optional[str] = None,
    ) -> None:
        self._policy = policy
        self._license = license_status
        self._api_key = api_key
        self._emitter = AuditEmitter(policy["audit"])

    @classmethod
    async def init(
        cls,
        *,
        policy: Union[str, TPSPolicy],
        api_key: Optional[str] = None,
        api_base_url: Optional[str] = None,
        offline_mode: bool = False,
    ) -> "TransparentGuard":
        """Async factory — loads policy and checks license."""
        if isinstance(policy, str):
            loaded_policy = await load_policy_async(policy)
        else:
            loaded_policy = policy

        license_status = await check_license_async(api_key, api_base_url, offline_mode)
        return cls(loaded_policy, license_status, api_key)

    @classmethod
    def init_sync(
        cls,
        *,
        policy: Union[str, TPSPolicy],
        api_key: Optional[str] = None,
        api_base_url: Optional[str] = None,
        offline_mode: bool = False,
    ) -> "TransparentGuard":
        """Sync factory — loads policy and checks license synchronously."""
        if isinstance(policy, str):
            loaded_policy = load_policy_sync(policy)
        else:
            loaded_policy = policy

        license_status = check_license_sync(api_key, api_base_url, offline_mode)
        return cls(loaded_policy, license_status, api_key)

    def wrap(self, client: Any) -> Any:
        """
        Wraps an OpenAI or Anthropic client with transparent policy enforcement.
        The returned client is a drop-in replacement.
        """
        if _is_openai(client):
            from .wrappers.openai_wrapper import WrappedOpenAIClient
            return WrappedOpenAIClient(client, self._policy, self._license, self._api_key)
        if _is_anthropic(client):
            from .wrappers.anthropic_wrapper import WrappedAnthropicClient
            return WrappedAnthropicClient(client, self._policy, self._license, self._api_key)
        raise TransparentGuardError(
            "TransparentGuard.wrap(): unrecognized client type. "
            "Supported: openai.OpenAI, openai.AsyncOpenAI, anthropic.Anthropic, anthropic.AsyncAnthropic. "
            "For other providers, use evaluate() directly.",
            "policy_violation",
        )

    def evaluate(
        self,
        stage: str,
        payload: Union[RequestPayload, ResponsePayload],
        options: Optional[EvaluateOptions] = None,
    ) -> EvaluateResult:
        opts = dict(options) if options else {}
        if self._api_key and "api_key" not in opts:
            opts["api_key"] = self._api_key
        result = evaluate(stage, payload, self._policy, self._license, opts)  # type: ignore[arg-type]
        self._emitter.enqueue_many(result["audit_events"])
        return result

    def test(self) -> PolicyTestSuiteResult:
        return run_policy_tests(self._policy, self._license)

    def get_policy(self) -> TPSPolicy:
        return self._policy

    def get_license_status(self) -> LicenseStatus:
        return self._license

    async def flush_audit(self) -> None:
        await self._emitter.flush()


# ---------------------------------------------------------------------------
# Lazy-init wrapper (no await required at call site)
# ---------------------------------------------------------------------------

class _LazyClient:
    """Lazy-initialized client — policy loads on the first wrap call."""

    def __init__(
        self,
        client: Any,
        *,
        policy: Union[str, TPSPolicy],
        api_key: Optional[str],
        api_base_url: Optional[str],
        offline_mode: bool,
    ) -> None:
        self._client = client
        self._policy = policy
        self._api_key = api_key
        self._api_base_url = api_base_url
        self._offline_mode = offline_mode
        self._tg: Optional[TransparentGuard] = None
        self._wrapped: Optional[Any] = None

    def _get_wrapped_sync(self) -> Any:
        if self._wrapped is not None:
            return self._wrapped
        tg = TransparentGuard.init_sync(
            policy=self._policy,
            api_key=self._api_key,
            api_base_url=self._api_base_url,
            offline_mode=self._offline_mode,
        )
        self._tg = tg
        self._wrapped = tg.wrap(self._client)
        return self._wrapped

    async def _get_wrapped_async(self) -> Any:
        if self._wrapped is not None:
            return self._wrapped
        tg = await TransparentGuard.init(
            policy=self._policy,
            api_key=self._api_key,
            api_base_url=self._api_base_url,
            offline_mode=self._offline_mode,
        )
        self._tg = tg
        self._wrapped = tg.wrap(self._client)
        return self._wrapped

    @property
    def chat(self) -> "_LazyChatCompletions":
        return _LazyChatCompletions(self)

    @property
    def messages(self) -> "_LazyMessages":
        return _LazyMessages(self)


class _LazyChatCompletions:
    def __init__(self, lazy: _LazyClient) -> None:
        self._lazy = lazy

    @property
    def completions(self) -> "_LazyCompletions":
        return _LazyCompletions(self._lazy)


class _LazyCompletions:
    def __init__(self, lazy: _LazyClient) -> None:
        self._lazy = lazy

    def create(self, **kwargs: Any) -> Any:
        wrapped = self._lazy._get_wrapped_sync()
        return wrapped.chat.completions.create(**kwargs)

    async def acreate(self, **kwargs: Any) -> Any:
        wrapped = await self._lazy._get_wrapped_async()
        return await wrapped.chat.completions.acreate(**kwargs)


class _LazyMessages:
    def __init__(self, lazy: _LazyClient) -> None:
        self._lazy = lazy

    def create(self, **kwargs: Any) -> Any:
        wrapped = self._lazy._get_wrapped_sync()
        return wrapped.messages.create(**kwargs)

    async def acreate(self, **kwargs: Any) -> Any:
        wrapped = await self._lazy._get_wrapped_async()
        return await wrapped.messages.acreate(**kwargs)


# ---------------------------------------------------------------------------
# tg — public API
# ---------------------------------------------------------------------------

class _TG:
    """
    TransparentGuard SDK entry point.

    Usage:
        from transparentguard import tg
        client = tg.wrap(OpenAI(), policy="./policies/prod.yaml")
    """

    def wrap(
        self,
        client: Any,
        *,
        policy: Union[str, TPSPolicy],
        api_key: Optional[str] = None,
        api_base_url: Optional[str] = None,
        offline_mode: bool = False,
    ) -> _LazyClient:
        """
        Returns a lazy-initialized wrapped client.
        Policy loads and license check happen on the first API call.

        Args:
            client: An OpenAI or Anthropic client instance.
            policy: Path to a TPS YAML policy file, or an already-loaded TPSPolicy dict.
            api_key: Optional TransparentGuard API key (reads TG_API_KEY env var if not set).
            api_base_url: Optional TransparentGuard API base URL.
            offline_mode: If True, skip license check (free tier assumed).
        """
        resolved_api_key = api_key or os.environ.get("TG_API_KEY")
        return _LazyClient(
            client,
            policy=policy,
            api_key=resolved_api_key,
            api_base_url=api_base_url,
            offline_mode=offline_mode,
        )

    @staticmethod
    def load_policy(path: str) -> TPSPolicy:
        """Load and validate a TPS policy file synchronously."""
        return load_policy_sync(path)

    @staticmethod
    async def load_policy_async(path: str) -> TPSPolicy:
        """Load and validate a TPS policy file asynchronously."""
        return await load_policy_async(path)


tg = _TG()


# ---------------------------------------------------------------------------
# Type detection helpers
# ---------------------------------------------------------------------------

def _is_openai(client: Any) -> bool:
    module = type(client).__module__ or ""
    return module.startswith("openai") or (
        hasattr(client, "chat") and hasattr(getattr(client, "chat", None), "completions")
    )


def _is_anthropic(client: Any) -> bool:
    module = type(client).__module__ or ""
    return module.startswith("anthropic") or (
        hasattr(client, "messages") and hasattr(getattr(client, "messages", None), "create")
    )
