"""
TransparentGuard Python SDK — License Checker
Validates TransparentGuard API keys and determines tier/feature access.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import datetime
import logging

logger = logging.getLogger(__name__)

_API_BASE = "https://api.transparentguard.com"

# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------


class TransparentGuardError(Exception):
    """Raised when a TransparentGuard policy or license check fails."""

    VALID_CODES = {
        "trial_expired",
        "invalid_key",
        "rate_limited",
        "api_unreachable",
        "feature_requires_paid_tier",
        "policy_violation",
        "policy_load_error",
        "signature_error",
    }

    def __init__(self, message: str, code: str, detail: Optional[str] = None) -> None:
        super().__init__(message)
        self.code = code
        self.detail = detail


# ---------------------------------------------------------------------------
# License tiers and features
# ---------------------------------------------------------------------------


class LicenseTier(str, Enum):
    free = "free"
    starter = "starter"
    professional = "professional"
    enterprise = "enterprise"


@dataclass
class LicenseStatus:
    tier: LicenseTier = LicenseTier.free
    trial_active: bool = False
    trial_expires_at: Optional[str] = None
    features: List[str] = field(default_factory=list)
    key_id: Optional[str] = None
    organization: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def is_paid(self) -> bool:
        return self.tier != LicenseTier.free or self.trial_active

    def has_feature(self, feature: str) -> bool:
        return feature in self.features


# ---------------------------------------------------------------------------
# Free-tier defaults
# ---------------------------------------------------------------------------

_FREE_LICENSE = LicenseStatus(
    tier=LicenseTier.free,
    trial_active=False,
    features=["pii_detection", "pattern_redaction", "keyword_redaction", "audit_logging"],
)


# ---------------------------------------------------------------------------
# License check
# ---------------------------------------------------------------------------


async def check_license_async(
    api_key: Optional[str] = None,
    api_base_url: Optional[str] = None,
    offline_mode: bool = False,
) -> LicenseStatus:
    """
    Async license check. Returns LicenseStatus.
    Falls back to free tier on network failure unless offline_mode=False with a key.
    """
    if not api_key:
        return _FREE_LICENSE

    if offline_mode:
        return LicenseStatus(
            tier=LicenseTier.starter,
            trial_active=False,
            features=["pii_detection", "pattern_redaction", "keyword_redaction", "audit_logging"],
        )

    try:
        import httpx  # type: ignore[import]
        base = (api_base_url or _API_BASE).rstrip("/")
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base}/v1/license/check",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "transparentguard-python-sdk/0.1.0",
                },
            )
            if resp.status_code == 401:
                raise TransparentGuardError(
                    "TransparentGuard API key is invalid or expired.",
                    "invalid_key",
                )
            if resp.status_code == 429:
                raise TransparentGuardError(
                    "TransparentGuard license check rate limited. Retry after a moment.",
                    "rate_limited",
                )
            if resp.status_code != 200:
                logger.warning(
                    "TransparentGuard license check returned HTTP %s; falling back to free tier.",
                    resp.status_code,
                )
                return _FREE_LICENSE

            data: Dict[str, Any] = resp.json()
            tier_str = data.get("tier", "free")
            try:
                tier = LicenseTier(tier_str)
            except ValueError:
                tier = LicenseTier.free

            # Check trial expiry
            trial_active = data.get("trial_active", False)
            trial_expires_at = data.get("trial_expires_at")
            if trial_expires_at:
                expires = datetime.datetime.fromisoformat(trial_expires_at.replace("Z", "+00:00"))
                now = datetime.datetime.now(tz=datetime.timezone.utc)
                if expires < now:
                    trial_active = False
                    if tier == LicenseTier.free:
                        raise TransparentGuardError(
                            "Your TransparentGuard trial has expired. "
                            "Visit https://transparentguard.com/pricing to upgrade.",
                            "trial_expired",
                        )

            return LicenseStatus(
                tier=tier,
                trial_active=trial_active,
                trial_expires_at=trial_expires_at,
                features=data.get("features", []),
                key_id=data.get("key_id"),
                organization=data.get("organization"),
                raw=data,
            )
    except TransparentGuardError:
        raise
    except Exception as exc:
        logger.warning(
            "TransparentGuard license check failed (%s); falling back to free tier.",
            exc,
        )
        return _FREE_LICENSE


def check_license_sync(
    api_key: Optional[str] = None,
    api_base_url: Optional[str] = None,
    offline_mode: bool = False,
) -> LicenseStatus:
    """Synchronous license check. Runs the async version in a new event loop."""
    import asyncio
    return asyncio.run(check_license_async(api_key, api_base_url, offline_mode))
