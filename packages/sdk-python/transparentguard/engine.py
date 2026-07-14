"""
TransparentGuard Python SDK — Evaluation Engine
Core rule evaluation logic implementing TPS v1.0.
Runs all rule types: redact, classify, enforce, tag, block, log.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from .types import (
    AuditEvent,
    EvaluateOptions,
    EvaluateResult,
    RequestPayload,
    ResponsePayload,
    TPSPolicy,
    TPSRule,
    Violation,
)
from .pii import detect_pii, redact_text, PiiTarget
from .license import LicenseStatus

# ---------------------------------------------------------------------------
# Framework rules injection
# ---------------------------------------------------------------------------

from .frameworks.hipaa import HIPAA_RULES
from .frameworks.gdpr import GDPR_RULES
from .frameworks.eu_ai_act import EU_AI_ACT_RULES
from .frameworks.soc2 import SOC2_RULES

# ---------------------------------------------------------------------------
# Optional Redis client — shared state for token budget and rate limiting.
# Falls back to in-process counters with a logged warning if unavailable.
# ---------------------------------------------------------------------------

_redis_client: Any = None
_redis_init_lock = threading.Lock()
_redis_init_done = False


def _get_redis() -> Any:
    """Returns a connected redis.Redis client, or None if unavailable."""
    global _redis_client, _redis_init_done
    if _redis_init_done:
        return _redis_client
    with _redis_init_lock:
        if _redis_init_done:
            return _redis_client
        _redis_init_done = True
        url = os.environ.get("TG_REDIS_URL")
        if not url:
            return None
        try:
            import redis as _redis_lib  # type: ignore[import]
            client = _redis_lib.from_url(
                url,
                socket_connect_timeout=2,
                socket_timeout=2,
                decode_responses=True,
            )
            client.ping()
            _redis_client = client
            return client
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger("transparentguard").warning(
                "TG_REDIS_URL is set but Redis connection failed (%s). "
                "Token budget and rate limits will use per-process counters. "
                "Limits may be exceeded in multi-replica deployments.",
                exc,
            )
            return None


# ---------------------------------------------------------------------------
# In-process fallback counters (per-process only — not shared across replicas)
# ---------------------------------------------------------------------------

_counter_lock = threading.Lock()
_token_counters: Dict[str, int] = {}        # "key:day:YYYY-MM-DD" -> count
_rate_windows: Dict[str, List[float]] = {}  # "key:rpm|rph" -> [timestamps_ms]


# ---------------------------------------------------------------------------
# Token counting — tiktoken when installed, blended heuristic fallback
# ---------------------------------------------------------------------------

def _count_tokens(text: str, model: str = "") -> int:
    """
    Counts tokens using tiktoken when installed, else a blended heuristic.
    - gpt-4o / o-series → o200k_base
    - everything else   → cl100k_base
    - claude/*          → Anthropic-documented 3.5 chars/token
    """
    if not text:
        return 0
    try:
        import tiktoken  # type: ignore[import]
        if "claude" in model.lower():
            return max(1, round(len(text) / 3.5))
        enc_name = "o200k_base" if any(x in model for x in ("gpt-4o", "o1-", "o3-", "o4-")) else "cl100k_base"
        enc = tiktoken.get_encoding(enc_name)
        return len(enc.encode(text))
    except ImportError:
        pass
    words = len(text.split())
    chars = len(text)
    return max(1, int((words * 1.3 + chars / 4.0) / 2))


def _count_request_tokens(payload: Any, model: str = "") -> int:
    total = 0
    for msg in payload.get("messages", []):
        content = msg.get("content") or ""
        if content:
            total += _count_tokens(str(content), model)
        total += 4  # OpenAI per-message overhead
    total += 2  # Reply priming
    return total


def _day_key(api_key_id: str) -> str:
    import datetime
    d = datetime.datetime.now(tz=datetime.timezone.utc)
    return f"tg:tok:{api_key_id}:day:{d.year}-{d.month:02d}-{d.day:02d}"


def _hour_key(api_key_id: str) -> str:
    import datetime
    d = datetime.datetime.now(tz=datetime.timezone.utc)
    return f"tg:tok:{api_key_id}:hr:{d.year}-{d.month:02d}-{d.day:02d}T{d.hour:02d}"


# ---------------------------------------------------------------------------
# Redis Lua scripts (atomic)
# ---------------------------------------------------------------------------

_TOKEN_LUA = """
local day_k   = KEYS[1]
local hr_k    = KEYS[2]
local tokens  = tonumber(ARGV[1])
local max_day = tonumber(ARGV[2])
local max_hr  = tonumber(ARGV[3])
local day_use = tonumber(redis.call('GET', day_k) or 0)
local hr_use  = tonumber(redis.call('GET', hr_k)  or 0)
if max_day > 0 and day_use + tokens > max_day then
  return {'day_exceeded', tostring(day_use + tokens)}
end
if max_hr > 0 and hr_use + tokens > max_hr then
  return {'hr_exceeded', tostring(hr_use + tokens)}
end
redis.call('INCRBY', day_k, tokens)
redis.call('EXPIRE',  day_k, 172800)
redis.call('INCRBY', hr_k,  tokens)
redis.call('EXPIRE',  hr_k,  7200)
return {'ok', tostring(day_use + tokens)}
"""

_RATE_LUA = """
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local ttl    = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = tonumber(redis.call('ZCARD', key))
if count >= limit then
  return {count, 'exceeded'}
end
local seq = redis.call('INCR', key .. ':seq')
redis.call('ZADD', key, now, tostring(now) .. '-' .. tostring(seq))
redis.call('EXPIRE', key, ttl)
redis.call('EXPIRE', key .. ':seq', ttl)
return {count + 1, 'ok'}
"""

# ISO 3166-1 alpha-2 → broad geographic region (data residency mapping)
_REGION_MAP: Dict[str, str] = {
    "US": "us", "CA": "ca",
    "GB": "eu", "DE": "eu", "FR": "eu", "NL": "eu", "IE": "eu",
    "SE": "eu", "NO": "eu", "DK": "eu", "FI": "eu", "AT": "eu",
    "BE": "eu", "CH": "eu", "ES": "eu", "IT": "eu", "PL": "eu",
    "PT": "eu", "CZ": "eu", "RO": "eu", "HU": "eu", "SK": "eu",
    "AU": "ap-southeast", "NZ": "ap-southeast",
    "JP": "ap-northeast", "KR": "ap-northeast",
    "SG": "ap-southeast", "IN": "ap-south",
    "BR": "sa-east",
}


_FRAMEWORK_RULES: Dict[str, List[TPSRule]] = {
    "hipaa": HIPAA_RULES,
    "gdpr": GDPR_RULES,
    "eu-ai-act": EU_AI_ACT_RULES,
    "soc2": SOC2_RULES,
}

# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------

def _make_id() -> str:
    return f"tge_{secrets.token_hex(12)}"

# ---------------------------------------------------------------------------
# Audit event builder
# ---------------------------------------------------------------------------

def _build_audit_event(
    *,
    policy: TPSPolicy,
    rule: TPSRule,
    event_type: str,
    stage: str,
    tags: Dict[str, str],
    request_id: str,
    detail: Optional[str] = None,
    violation: Optional[Violation] = None,
) -> AuditEvent:
    event: AuditEvent = {
        "id": _make_id(),
        "timestamp": _utcnow(),
        "policy_name": policy["name"],
        "policy_version": "1.0",
        "rule_id": rule["id"],
        "event_type": event_type,
        "stage": stage,
        "tags": dict(tags),
    }
    if detail:
        event["metadata"] = {"detail": detail}
    if violation:
        event["violation"] = violation
    return event


def _utcnow() -> str:
    import datetime
    return datetime.datetime.now(tz=datetime.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Text extraction utilities
# ---------------------------------------------------------------------------

def _extract_texts(payload: Union[RequestPayload, ResponsePayload]) -> List[Tuple[str, str]]:
    """Returns list of (key, text) pairs from the payload."""
    entries: List[Tuple[str, str]] = []
    if "messages" in payload:
        req = payload  # type: ignore[assignment]
        for i, msg in enumerate(req.get("messages", [])):
            content = msg.get("content")
            if content:
                entries.append((f"messages.{i}.content", content))
    else:
        res = payload  # type: ignore[assignment]
        content = res.get("content", "")
        if content:
            entries.append(("content", content))
    return entries


def _extract_primary_text(payload: Union[RequestPayload, ResponsePayload]) -> str:
    if "messages" in payload:
        return "\n".join(
            m.get("content", "") or ""
            for m in payload.get("messages", [])  # type: ignore[arg-type]
            if m.get("content")
        )
    return payload.get("content", "")  # type: ignore[return-value]


def _apply_redacted_text(
    payload: Union[RequestPayload, ResponsePayload],
    key: str,
    text: str,
) -> Union[RequestPayload, ResponsePayload]:
    if key == "content":
        result = dict(payload)
        result["content"] = text
        return result  # type: ignore[return-value]
    if key.startswith("messages."):
        parts = key.split(".")
        idx = int(parts[1])
        req = dict(payload)
        messages = list(req.get("messages", []))  # type: ignore[arg-type]
        msg = dict(messages[idx])
        msg["content"] = text
        messages[idx] = msg
        req["messages"] = messages
        return req  # type: ignore[return-value]
    return payload


# ---------------------------------------------------------------------------
# Rule evaluators
# ---------------------------------------------------------------------------

def _evaluate_redact(
    rule: TPSRule,
    payload: Union[RequestPayload, ResponsePayload],
    tags: Dict[str, str],
    policy: TPSPolicy,
    stage: str,
    request_id: str,
) -> Tuple[str, Optional[Violation], Union[RequestPayload, ResponsePayload], AuditEvent]:
    """Returns (outcome, violation, payload, audit_event)."""
    all_violations: List[Violation] = []
    current_payload = dict(payload)  # type: ignore[arg-type]

    for target in (rule.get("targets") or []):
        t_type = target.get("type")
        if t_type == "pii":
            texts = _extract_texts(current_payload)  # type: ignore[arg-type]
            for key, text in texts:
                matches = detect_pii(text, target)  # type: ignore[arg-type]
                if not matches:
                    continue
                redacted = redact_text(text, matches)
                current_payload = dict(_apply_redacted_text(current_payload, key, redacted))  # type: ignore[arg-type]
                for m in matches:
                    all_violations.append({
                        "rule_id": rule["id"],
                        "outcome": "redacted",
                        "detail": f"Redacted {m.category} at position {m.start}–{m.end}",
                        "category": m.category,
                    })

        elif t_type == "pattern":
            pattern_str = target.get("pattern", "")
            flags_list = target.get("flags", [])
            flags = re.IGNORECASE if "case_insensitive" in (flags_list or []) else 0
            if "multiline" in (flags_list or []):
                flags |= re.MULTILINE
            if "dotall" in (flags_list or []):
                flags |= re.DOTALL
            try:
                regex = re.compile(pattern_str, flags | re.IGNORECASE)
            except re.error:
                continue
            texts = _extract_texts(current_payload)  # type: ignore[arg-type]
            for key, text in texts:
                new_text, n = regex.subn("[REDACTED:PATTERN]", text)
                if n > 0:
                    current_payload = dict(_apply_redacted_text(current_payload, key, new_text))  # type: ignore[arg-type]
                    all_violations.append({
                        "rule_id": rule["id"],
                        "outcome": "redacted",
                        "detail": f"Redacted {n} pattern match(es): {target.get('description', pattern_str)}",
                        "category": "pattern",
                    })

        elif t_type == "keyword":
            keywords = target.get("keywords", [])
            case_sensitive = target.get("case_sensitive", True)
            match_mode = target.get("match_mode", "whole_word")
            texts = _extract_texts(current_payload)  # type: ignore[arg-type]
            for key, text in texts:
                new_text = text
                for kw in keywords:
                    escaped = re.escape(kw)
                    pattern = escaped if match_mode == "substring" else rf"\b{escaped}\b"
                    re_flags = 0 if case_sensitive else re.IGNORECASE
                    new_text, n = re.subn(pattern, "[REDACTED:KEYWORD]", new_text, flags=re_flags)
                    if n > 0:
                        all_violations.append({
                            "rule_id": rule["id"],
                            "outcome": "redacted",
                            "detail": f"Redacted keyword: '{kw}'",
                            "category": "keyword",
                        })
                if new_text != text:
                    current_payload = dict(_apply_redacted_text(current_payload, key, new_text))  # type: ignore[arg-type]

    if not all_violations:
        event = _build_audit_event(
            policy=policy, rule=rule, event_type="allowed",
            stage=stage, tags=tags, request_id=request_id,
        )
        return "passed", None, current_payload, event  # type: ignore[return-value]

    on_violation = rule.get("on_violation", "redact")
    if on_violation == "block":
        v = all_violations[0]
        event = _build_audit_event(
            policy=policy, rule=rule, event_type="blocked",
            stage=stage, tags=tags, request_id=request_id,
            detail=v["detail"], violation=v,
        )
        return "blocked", v, current_payload, event  # type: ignore[return-value]

    v = all_violations[0]
    event = _build_audit_event(
        policy=policy, rule=rule, event_type="redacted",
        stage=stage, tags=tags, request_id=request_id,
        detail=f"{len(all_violations)} item(s) redacted", violation=v,
    )
    return "redacted", v, current_payload, event  # type: ignore[return-value]


def _evaluate_classify(
    rule: TPSRule,
    payload: Union[RequestPayload, ResponsePayload],
    tags: Dict[str, str],
    policy: TPSPolicy,
    stage: str,
    request_id: str,
) -> Tuple[str, Optional[Violation], AuditEvent]:
    """Heuristic-only classifier (ML API not called in Python SDK v0.1)."""
    text = _extract_primary_text(payload)
    classifier = rule.get("classifier", "")
    threshold = rule.get("threshold", 0.5)
    invert = rule.get("invert_threshold", False)

    score = _heuristic_score(classifier, text)
    triggered = (score < threshold) if invert else (score >= threshold)

    if not triggered:
        event = _build_audit_event(
            policy=policy, rule=rule, event_type="allowed",
            stage=stage, tags=tags, request_id=request_id,
        )
        return "passed", None, event

    on_violation = rule.get("on_violation", "block")
    outcome = "blocked" if on_violation == "block" else "warned"
    v: Violation = {
        "rule_id": rule["id"],
        "outcome": outcome,
        "detail": f"Classifier '{classifier}' score {score:.3f} (threshold: {threshold})",
        "category": classifier,
    }
    event = _build_audit_event(
        policy=policy, rule=rule,
        event_type="blocked" if outcome == "blocked" else "warned",
        stage=stage, tags=tags, request_id=request_id,
        detail=v["detail"], violation=v,
    )
    return outcome, v, event


def _heuristic_score(classifier: str, text: str) -> float:
    """
    Returns a risk score 0.0–1.0 for the given classifier.
    - PII classifiers delegate to the full regex detector in pii.py.
    - Other classifiers use vocabulary-aware phrase matching.
    """
    lower = text.lower()

    if "toxicity" in classifier:
        toxic_words = [
            "hate", "kill", "racist", "nazi", "slur",
            "shit", "fuck", "bitch", "asshole", "bastard", "cunt",
        ]
        count = sum(1 for w in toxic_words if w in lower)
        return min(count * 0.25, 1.0)

    if "prompt-injection" in classifier:
        injection_phrases = [
            "ignore previous instructions", "ignore all instructions",
            "disregard all prior", "forget your instructions",
            "you are now", "act as if", "jailbreak", "dan mode",
            "do anything now", "bypass your", "override your",
            "pretend you are", "from now on you",
            "your real instructions", "new instructions:",
        ]
        count = sum(1 for p in injection_phrases if p in lower)
        return min(count * 0.3, 1.0)

    if "hate-speech" in classifier:
        hate_phrases = [
            "go back to", "your kind", "subhuman", "inferior race",
            "white supremacy", "ethnic cleansing", "final solution",
        ]
        count = sum(1 for p in hate_phrases if p in lower)
        return min(count * 0.4, 1.0)

    if "self-harm" in classifier:
        phrases = [
            "kill myself", "end my life", "suicide", "self-harm",
            "cut myself", "want to die", "don't want to live", "hang myself",
        ]
        count = sum(1 for p in phrases if p in lower)
        return min(count * 0.4, 1.0)

    if "violence" in classifier:
        phrases = [
            "how to make a bomb", "how to make explosives", "how to kill",
            "attack plan", "weapon instructions", "synthesize poison",
        ]
        count = sum(1 for p in phrases if p in lower)
        return min(count * 0.4, 1.0)

    if "pii" in classifier:
        # Delegate to the full regex-based PII detector — not a substring heuristic
        pii_target: PiiTarget = {"type": "pii", "categories": ["pii_all"]}
        matches = detect_pii(text, pii_target)
        if not matches:
            return 0.0
        return min(max(m.confidence for m in matches), 1.0)

    return 0.0


def _evaluate_tag(
    rule: TPSRule,
    tags: Dict[str, str],
    policy: TPSPolicy,
    stage: str,
    request_id: str,
    payload: Union[RequestPayload, ResponsePayload],
) -> Tuple[str, AuditEvent]:
    for k, v in (rule.get("tags") or {}).items():
        tags[k] = v
    event = _build_audit_event(
        policy=policy, rule=rule, event_type="allowed",
        stage=stage, tags=tags, request_id=request_id,
    )
    return "passed", event


def _evaluate_block(
    rule: TPSRule,
    tags: Dict[str, str],
    policy: TPSPolicy,
    stage: str,
    request_id: str,
    payload: Union[RequestPayload, ResponsePayload],
) -> Tuple[str, Violation, AuditEvent]:
    message = rule.get("block_message") or f"Blocked by policy rule '{rule['id']}'"
    v: Violation = {
        "rule_id": rule["id"],
        "outcome": "blocked",
        "detail": message,
        "category": "explicit_block",
    }
    event = _build_audit_event(
        policy=policy, rule=rule, event_type="blocked",
        stage=stage, tags=tags, request_id=request_id,
        detail=message, violation=v,
    )
    return "blocked", v, event


def _evaluate_log(
    rule: TPSRule,
    tags: Dict[str, str],
    policy: TPSPolicy,
    stage: str,
    request_id: str,
) -> Tuple[str, AuditEvent]:
    event = _build_audit_event(
        policy=policy, rule=rule, event_type="allowed",
        stage=stage, tags=tags, request_id=request_id,
    )
    return "passed", event


# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

def _should_sample(rule: TPSRule, request_id: str) -> bool:
    sample_rate = rule.get("sample_rate")
    if sample_rate is None or sample_rate >= 1.0:
        return True
    digest = hashlib.sha256(f"{request_id}:{rule['id']}".encode()).hexdigest()
    fraction = int(digest[:8], 16) / 0xFFFFFFFF
    return fraction < sample_rate


# ---------------------------------------------------------------------------
# Main evaluate function
# ---------------------------------------------------------------------------

def evaluate(
    stage: str,
    payload: Union[RequestPayload, ResponsePayload],
    policy: TPSPolicy,
    license_status: LicenseStatus,
    options: Optional[EvaluateOptions] = None,
) -> EvaluateResult:
    """
    Evaluate a request or response payload against all applicable policy rules.
    Framework rules are PREPENDED before user-declared rules (TPS Section 15).

    This is a synchronous function — use the async wrappers for async codebases.
    """
    opts = options or {}
    request_id = opts.get("request_id") or _make_id()
    environment = opts.get("environment")

    tags: Dict[str, str] = {}
    violations: List[Violation] = []
    audit_events: List[AuditEvent] = []
    current_payload: Union[RequestPayload, ResponsePayload] = dict(payload)  # type: ignore[assignment]
    blocked = False

    # Collect framework rules (prepended per spec)
    framework_rules: List[TPSRule] = []
    for fw in (policy.get("compliance_frameworks") or []):
        framework_rules.extend(_FRAMEWORK_RULES.get(fw, []))

    # Collect user rules filtered by environment
    user_rules = _get_active_rules(policy, environment)
    all_rules = [*framework_rules, *user_rules]

    for rule in all_rules:
        rule_stage = rule.get("stage", "both")
        if not _stage_matches(rule_stage, stage):
            continue
        if rule.get("enabled") is False:
            continue
        if not _should_sample(rule, request_id):
            audit_events.append(_build_audit_event(
                policy=policy, rule=rule, event_type="sampled_out",
                stage=stage, tags=tags, request_id=request_id,
            ))
            continue

        action = rule.get("action", "log")
        outcome: str = "passed"
        violation: Optional[Violation] = None
        audit_event: Optional[AuditEvent] = None

        if action == "redact":
            outcome, violation, current_payload, audit_event = _evaluate_redact(
                rule, current_payload, tags, policy, stage, request_id
            )
        elif action == "classify":
            outcome, violation, audit_event = _evaluate_classify(
                rule, current_payload, tags, policy, stage, request_id
            )
        elif action == "tag":
            outcome, audit_event = _evaluate_tag(
                rule, tags, policy, stage, request_id, current_payload
            )
        elif action == "block":
            outcome, violation, audit_event = _evaluate_block(
                rule, tags, policy, stage, request_id, current_payload
            )
        elif action == "log":
            outcome, audit_event = _evaluate_log(rule, tags, policy, stage, request_id)
        elif action == "enforce":
            # Enforcement rules in Python SDK: basic provider allowlist support
            outcome, violation, audit_event = _evaluate_enforce(
                rule, current_payload, tags, policy, stage, request_id
            )
        else:
            audit_event = _build_audit_event(
                policy=policy, rule=rule, event_type="error",
                stage=stage, tags=tags, request_id=request_id,
                detail=f"Unknown rule action: {action}",
            )

        if audit_event:
            audit_events.append(audit_event)
        if violation:
            violations.append(violation)
        if outcome == "blocked":
            blocked = True
            break

    # Deny-by-default
    if not blocked and policy.get("default_action") == "deny" and not violations:
        stage_rules = [r for r in all_rules if _stage_matches(r.get("stage", "both"), stage) and r.get("enabled") is not False]
        if not stage_rules:
            blocked = True
            violations.append({
                "rule_id": "__default_deny__",
                "outcome": "blocked",
                "detail": "No rules matched this stage and policy default_action is deny.",
                "category": "default_deny",
            })

    return {
        "allowed": not blocked,
        "payload": current_payload,
        "violations": violations,
        "tags": tags,
        "audit_events": audit_events,
        "evaluated_at": _utcnow(),
        "policy_name": policy["name"],
    }


def _evaluate_enforce(
    rule: TPSRule,
    payload: Union[RequestPayload, ResponsePayload],
    tags: Dict[str, str],
    policy: TPSPolicy,
    stage: str,
    request_id: str,
) -> Tuple[str, Optional[Violation], AuditEvent]:
    enforce_type = rule.get("enforce_type", "")
    on_violation = rule.get("on_violation", "block")
    model = str(payload.get("model") or "")  # type: ignore[union-attr]

    def _violation(detail: str, category: str) -> Tuple[str, Optional[Violation], AuditEvent]:
        outcome = "blocked" if on_violation == "block" else "warned"
        v: Violation = {"rule_id": rule["id"], "outcome": outcome, "detail": detail, "category": category}
        ev = _build_audit_event(
            policy=policy, rule=rule,
            event_type="blocked" if outcome == "blocked" else "warned",
            stage=stage, tags=tags, request_id=request_id,
            detail=detail, violation=v,
        )
        return outcome, v, ev

    def _passed() -> Tuple[str, Optional[Violation], AuditEvent]:
        ev = _build_audit_event(
            policy=policy, rule=rule, event_type="allowed",
            stage=stage, tags=tags, request_id=request_id,
        )
        return "passed", None, ev

    # ------------------------------------------------------------------
    # 1. provider_allowlist
    # ------------------------------------------------------------------
    if enforce_type == "provider_allowlist":
        provider = str(payload.get("provider") or "")  # type: ignore[union-attr]
        allowed = rule.get("allowed_providers") or []
        if allowed and not any(provider.startswith(p) for p in allowed):
            return _violation(
                f"Provider '{provider}' is not in allowed list: {allowed}",
                "provider_allowlist",
            )
        return _passed()

    # ------------------------------------------------------------------
    # 2. token_budget
    # ------------------------------------------------------------------
    if enforce_type == "token_budget":
        request_tokens = _count_request_tokens(payload, model)

        max_per_req = rule.get("max_tokens_per_request")
        if max_per_req and request_tokens > max_per_req:
            return _violation(
                f"Request token count {request_tokens} exceeds per-request limit {max_per_req}",
                "token_budget_per_request",
            )

        api_key_id = tags.get("api_key_id") or request_id
        max_day = rule.get("max_tokens_per_day_per_key") or 0
        max_hr  = rule.get("max_tokens_per_hour_per_key") or 0

        if max_day or max_hr:
            r = _get_redis()
            if r is not None:
                result = r.eval(
                    _TOKEN_LUA, 2,
                    _day_key(api_key_id), _hour_key(api_key_id),
                    request_tokens, max_day, max_hr,
                )
                status = result[0] if isinstance(result, (list, tuple)) else result
                total  = result[1] if isinstance(result, (list, tuple)) else "?"
                if status == "day_exceeded":
                    return _violation(
                        f"Daily token limit reached: {total} > {max_day} tokens/day for this key",
                        "token_budget_per_day",
                    )
                if status == "hr_exceeded":
                    return _violation(
                        f"Hourly token limit reached: {total} > {max_hr} tokens/hour for this key",
                        "token_budget_per_hour",
                    )
            else:
                with _counter_lock:
                    dk = _day_key(api_key_id)
                    hk = _hour_key(api_key_id)
                    day_used = _token_counters.get(dk, 0)
                    hr_used  = _token_counters.get(hk, 0)
                    if max_day and day_used + request_tokens > max_day:
                        return _violation(
                            f"Daily token limit reached: {day_used + request_tokens} > {max_day}",
                            "token_budget_per_day",
                        )
                    if max_hr and hr_used + request_tokens > max_hr:
                        return _violation(
                            f"Hourly token limit reached: {hr_used + request_tokens} > {max_hr}",
                            "token_budget_per_hour",
                        )
                    _token_counters[dk] = day_used + request_tokens
                    _token_counters[hk] = hr_used  + request_tokens
        return _passed()

    # ------------------------------------------------------------------
    # 3. rate_limit
    # ------------------------------------------------------------------
    if enforce_type == "rate_limit":
        api_key_id = tags.get("api_key_id") or request_id
        now_ms = time.time() * 1000.0
        max_rpm = rule.get("max_requests_per_minute_per_key") or 0
        max_rph = rule.get("max_requests_per_hour_per_key") or 0

        r = _get_redis()
        if r is not None:
            if max_rpm:
                res = r.eval(_RATE_LUA, 1, f"tg:rl:{api_key_id}:rpm", now_ms, 60_000, max_rpm, 120)
                status = res[1] if isinstance(res, (list, tuple)) else ""
                if status == "exceeded":
                    return _violation(
                        f"Rate limit exceeded: >{max_rpm} requests/minute for key",
                        "rate_limit_per_minute",
                    )
            if max_rph:
                res = r.eval(_RATE_LUA, 1, f"tg:rl:{api_key_id}:rph", now_ms, 3_600_000, max_rph, 7200)
                status = res[1] if isinstance(res, (list, tuple)) else ""
                if status == "exceeded":
                    return _violation(
                        f"Rate limit exceeded: >{max_rph} requests/hour for key",
                        "rate_limit_per_hour",
                    )
        else:
            with _counter_lock:
                cutoff_min = now_ms - 60_000
                cutoff_hr  = now_ms - 3_600_000
                min_key = f"tg:rl:{api_key_id}:rpm"
                hr_key  = f"tg:rl:{api_key_id}:rph"
                _rate_windows[min_key] = [t for t in _rate_windows.get(min_key, []) if t > cutoff_min]
                _rate_windows[hr_key]  = [t for t in _rate_windows.get(hr_key, [])  if t > cutoff_hr]
                if max_rpm and len(_rate_windows[min_key]) >= max_rpm:
                    return _violation(
                        f"Rate limit exceeded: >{max_rpm} requests/minute for key",
                        "rate_limit_per_minute",
                    )
                if max_rph and len(_rate_windows[hr_key]) >= max_rph:
                    return _violation(
                        f"Rate limit exceeded: >{max_rph} requests/hour for key",
                        "rate_limit_per_hour",
                    )
                _rate_windows[min_key].append(now_ms)
                _rate_windows[hr_key].append(now_ms)
        return _passed()

    # ------------------------------------------------------------------
    # 4. data_residency
    # ------------------------------------------------------------------
    if enforce_type == "data_residency":
        allowed_regions = [reg.lower() for reg in (rule.get("allowed_regions") or [])]
        if not allowed_regions:
            return _passed()

        metadata = payload.get("metadata") or {}  # type: ignore[union-attr]
        region = str(metadata.get("tg_region", "")).lower() if isinstance(metadata, dict) else ""

        if not region:
            return _violation(
                "data_residency: no region metadata on request (set metadata.tg_region). "
                "Cannot enforce residency without declared region.",
                "data_residency_missing_region",
            )

        iso_mapped = _REGION_MAP.get(region.upper(), "").lower()
        if region not in allowed_regions and iso_mapped not in allowed_regions:
            return _violation(
                f"Region '{region}' is not in allowed regions: {allowed_regions}. "
                "Data may not leave the declared residency boundary.",
                "data_residency_violation",
            )
        return _passed()

    # ------------------------------------------------------------------
    # 5. tool_allowlist
    # ------------------------------------------------------------------
    if enforce_type == "tool_allowlist":
        allowed_tools: List[str] = rule.get("allowed_tools") or []
        blocked_tools: List[str] = rule.get("blocked_tools") or []

        tool_names: List[str] = []
        # Tool definitions in request
        for tool in (payload.get("tools") or []):  # type: ignore[union-attr]
            name = ""
            if isinstance(tool, dict):
                name = (tool.get("function") or {}).get("name") or tool.get("name") or ""
            if name:
                tool_names.append(str(name))
        # Tool calls inside messages
        for msg in (payload.get("messages") or []):  # type: ignore[union-attr]
            for tc in (msg.get("tool_calls") or []):
                name = ""
                if isinstance(tc, dict):
                    name = (tc.get("function") or {}).get("name") or ""
                if name:
                    tool_names.append(str(name))

        for name in tool_names:
            if blocked_tools and name in blocked_tools:
                return _violation(
                    f"Tool '{name}' is explicitly blocked by policy.",
                    "tool_blocked",
                )
            if allowed_tools and name not in allowed_tools:
                return _violation(
                    f"Tool '{name}' is not in the allowed tools list: {allowed_tools}",
                    "tool_not_allowed",
                )
        return _passed()

    # ------------------------------------------------------------------
    # 6. schema_validation
    # ------------------------------------------------------------------
    if enforce_type == "schema_validation":
        expected_schema = rule.get("expected_schema")
        if not expected_schema:
            return _passed()

        content = payload.get("content")  # type: ignore[union-attr]
        if content is None:
            return _passed()

        if isinstance(content, str):
            try:
                data = json.loads(content)
            except (json.JSONDecodeError, ValueError):
                return _violation(
                    "schema_validation: response content is not valid JSON.",
                    "schema_validation_not_json",
                )
        else:
            data = content

        try:
            import jsonschema  # type: ignore[import]
            validator = jsonschema.Draft7Validator(expected_schema)
            errors = list(validator.iter_errors(data))
            if errors:
                first = errors[0]
                return _violation(
                    f"schema_validation: response failed — {first.message} "
                    f"at path {list(first.absolute_path)}",
                    "schema_validation_failed",
                )
        except ImportError:
            if not isinstance(data, dict):
                return _violation(
                    "schema_validation: response is not a JSON object "
                    "(install jsonschema for full Draft-7 validation).",
                    "schema_validation_failed",
                )
        return _passed()

    # ------------------------------------------------------------------
    # 7. confidentiality — n-gram verbatim leak detection
    # ------------------------------------------------------------------
    if enforce_type == "confidentiality":
        protected_ref = rule.get("protected_content_ref", "system_prompt")
        similarity_threshold = float(rule.get("similarity_threshold", 0.3))

        source = ""
        if protected_ref == "system_prompt":
            source = payload.get("system_prompt") or ""  # type: ignore[union-attr]
            if not source:
                source = next(
                    (m.get("content", "") for m in (payload.get("messages") or [])  # type: ignore[union-attr]
                     if m.get("role") == "system"),
                    "",
                )

        if not source:
            return _passed()

        response_text = str(payload.get("content") or "")  # type: ignore[union-attr]
        if not response_text:
            return _passed()

        def ngrams(text: str, n: int) -> set:
            tokens = text.lower().split()
            return {tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)}

        n = 6
        src_grams  = ngrams(source, n)
        resp_grams = ngrams(response_text, n)
        if not src_grams:
            return _passed()

        overlap = len(src_grams & resp_grams) / len(src_grams)
        if overlap >= similarity_threshold:
            return _violation(
                f"Confidentiality violation: response contains {overlap:.0%} verbatim overlap "
                f"with protected {protected_ref} (threshold: {similarity_threshold:.0%})",
                "confidentiality_leak",
            )
        return _passed()

    # ------------------------------------------------------------------
    # 8. factual_grounding — token-level F1 overlap (SQuAD-style)
    # ------------------------------------------------------------------
    if enforce_type == "factual_grounding":
        similarity_threshold = float(rule.get("similarity_threshold", 0.5))
        context_docs = payload.get("context_documents") or []  # type: ignore[union-attr]
        if not context_docs:
            return _passed()

        response_text = str(payload.get("content") or "")  # type: ignore[union-attr]
        if not response_text:
            return _passed()

        import string as _string

        def token_set(text: str) -> set:
            return set(text.lower().translate(str.maketrans("", "", _string.punctuation)).split())

        resp_tokens: set = token_set(response_text)
        ctx_tokens: set = set()
        for doc in context_docs:
            ctx_tokens |= token_set(str(doc))

        if not resp_tokens or not ctx_tokens:
            return _passed()

        common = resp_tokens & ctx_tokens
        if not common:
            f1 = 0.0
        else:
            precision = len(common) / len(resp_tokens)
            recall    = len(common) / len(ctx_tokens)
            f1 = 2 * precision * recall / (precision + recall)

        if f1 < similarity_threshold:
            return _violation(
                f"Factual grounding check failed: response F1 overlap with context is "
                f"{f1:.2f} (minimum required: {similarity_threshold:.2f})",
                "factual_grounding_failed",
            )
        return _passed()

    # Unknown enforce_type — pass through with a logged warning
    import logging as _logging
    _logging.getLogger("transparentguard").debug(
        "Unrecognised enforce_type '%s' in rule '%s' — passing through.",
        enforce_type, rule.get("id"),
    )
    return _passed()


def _stage_matches(rule_stage: str, eval_stage: str) -> bool:
    if rule_stage == "both":
        return eval_stage in ("pre-request", "post-response")
    return rule_stage == eval_stage


def _get_active_rules(policy: TPSPolicy, environment: Optional[str]) -> List[TPSRule]:
    base = [r for r in policy.get("rules", []) if r.get("enabled") is not False]
    if not environment:
        return base
    envs = policy.get("environments") or []
    env = next((e for e in envs if e.get("name") == environment), None)
    if not env:
        return base
    if env.get("active_rules"):
        allowed = set(env["active_rules"])
        return [r for r in base if r["id"] in allowed]
    if env.get("disabled_rules"):
        disabled = set(env["disabled_rules"])
        return [r for r in base if r["id"] not in disabled]
    return base
