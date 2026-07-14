"""
TransparentGuard Python SDK — Evaluation Engine
Core rule evaluation logic implementing TPS v1.0.
Runs all rule types: redact, classify, enforce, tag, block, log.
"""

from __future__ import annotations

import hashlib
import re
import secrets
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
    """Very light heuristics — sufficient for free-tier classification."""
    lower = text.lower()
    if "toxicity" in classifier:
        toxic_words = [
            "hate", "kill", "racist", "Nazi", "slur",
            "shit", "fuck", "bitch", "asshole",
        ]
        count = sum(1 for w in toxic_words if w.lower() in lower)
        return min(count * 0.25, 1.0)
    if "prompt-injection" in classifier:
        injection_phrases = [
            "ignore previous instructions",
            "disregard all prior",
            "forget your instructions",
            "you are now",
            "act as",
            "jailbreak",
            "DAN mode",
            "do anything now",
            "bypass your",
        ]
        count = sum(1 for p in injection_phrases if p.lower() in lower)
        return min(count * 0.4, 1.0)
    if "pii" in classifier:
        pii_signals = ["@", "ssn", "dob", "passport", "credit card"]
        count = sum(1 for s in pii_signals if s.lower() in lower)
        return min(count * 0.3, 1.0)
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
    if enforce_type == "provider_allowlist":
        provider = payload.get("provider", "")  # type: ignore[union-attr]
        allowed = rule.get("allowed_providers", [])
        if allowed and not any(provider.startswith(p) for p in allowed):
            on_violation = rule.get("on_violation", "block")
            outcome = "blocked" if on_violation == "block" else "warned"
            v: Violation = {
                "rule_id": rule["id"],
                "outcome": outcome,
                "detail": f"Provider '{provider}' is not in allowed list: {allowed}",
                "category": "provider_allowlist",
            }
            event = _build_audit_event(
                policy=policy, rule=rule,
                event_type="blocked" if outcome == "blocked" else "warned",
                stage=stage, tags=tags, request_id=request_id,
                detail=v["detail"], violation=v,
            )
            return outcome, v, event

    # All other enforce types — pass through in Python SDK v0.1
    event = _build_audit_event(
        policy=policy, rule=rule, event_type="allowed",
        stage=stage, tags=tags, request_id=request_id,
    )
    return "passed", None, event


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
