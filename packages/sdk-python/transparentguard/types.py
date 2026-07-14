"""
TransparentGuard Python SDK — Type Definitions
Mirrors the TransparentGuard Policy Spec (TPS) v1.0 structure.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from typing_extensions import TypedDict, NotRequired


# ---------------------------------------------------------------------------
# PII
# ---------------------------------------------------------------------------

PiiCategory = Literal[
    "name", "email", "phone", "address", "ip_address", "username",
    "device_id", "url",
    "ssn", "passport", "driver_license", "national_id", "tax_id", "voter_id",
    "credit_card", "bank_account", "iban", "swift", "crypto_address",
    "mrn", "dob", "age", "health_condition", "insurance_id", "npi", "dea",
    "race", "religion", "political_opinion", "sexual_orientation",
    "biometric", "genetic", "union_membership",
    "phi", "pii_standard", "pii_financial", "pii_sensitive", "pii_all",
]

ComplianceFramework = Literal["hipaa", "gdpr", "eu-ai-act", "soc2", "fedramp-moderate", "ccpa"]

RuleStage = Literal["pre-request", "post-response", "both", "tool-call"]

RuleAction = Literal["redact", "classify", "enforce", "tag", "block", "log"]

EnforceType = Literal[
    "provider_allowlist", "token_budget", "data_residency", "rate_limit",
    "tool_allowlist", "schema_validation", "confidentiality", "factual_grounding",
]

OnViolation = Literal["block", "redact", "warn", "log", "allow"]

ViolationOutcome = Literal["blocked", "redacted", "warned", "allowed", "error", "sampled_out"]

AuditEventType = Literal[
    "allowed", "blocked", "redacted", "warned", "error",
    "sampled_out", "threshold_triggered", "chain_break",
]

ThresholdAction = Literal["notify", "block_all", "escalate"]

ThresholdViolationType = Literal["blocked", "redacted", "warned", "error", "sampled_out"]

ThresholdPayloadTemplate = Literal[
    "hipaa-breach-v1", "gdpr-article-33", "eu-ai-act-article-73", "soc2-incident-v1",
]


# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------

class PiiTarget(TypedDict):
    type: Literal["pii"]
    categories: List[str]
    confidence_threshold: NotRequired[float]


class PatternTarget(TypedDict):
    type: Literal["pattern"]
    pattern: str
    description: NotRequired[str]
    flags: NotRequired[List[Literal["case_insensitive", "multiline", "dotall"]]]


class KeywordTarget(TypedDict):
    type: Literal["keyword"]
    keywords: List[str]
    match_mode: NotRequired[Literal["whole_word", "substring"]]
    case_sensitive: NotRequired[bool]


class SemanticTarget(TypedDict):
    type: Literal["semantic"]
    concepts: List[str]
    similarity_threshold: NotRequired[float]
    model: NotRequired[str]


TPSTarget = Union[PiiTarget, PatternTarget, KeywordTarget, SemanticTarget]


# ---------------------------------------------------------------------------
# Rule
# ---------------------------------------------------------------------------

class RuleStreaming(TypedDict):
    mode: Literal["buffer", "window", "passthrough"]
    window_tokens: NotRequired[int]
    on_stream_violation: NotRequired[str]


class AuditNotify(TypedDict):
    url: str
    headers: NotRequired[Dict[str, str]]
    retry_count: NotRequired[int]
    timeout_seconds: NotRequired[int]


class TPSRule(TypedDict):
    id: str
    description: NotRequired[str]
    stage: str
    action: str
    enabled: NotRequired[bool]
    targets: NotRequired[List[TPSTarget]]
    classifier: NotRequired[str]
    threshold: NotRequired[float]
    invert_threshold: NotRequired[bool]
    enforce_type: NotRequired[str]
    allowed_providers: NotRequired[List[str]]
    allowed_regions: NotRequired[List[str]]
    blocked_tools: NotRequired[List[str]]
    allowed_tools: NotRequired[List[str]]
    expected_schema: NotRequired[Dict[str, Any]]
    on_violation: NotRequired[str]
    block_message: NotRequired[str]
    log: NotRequired[bool]
    log_level: NotRequired[str]
    tags: NotRequired[Dict[str, str]]
    sample_rate: NotRequired[float]
    streaming: NotRequired[RuleStreaming]
    notify: NotRequired[AuditNotify]
    metadata: NotRequired[Dict[str, Any]]
    max_tokens: NotRequired[int]
    max_input_tokens: NotRequired[int]
    max_output_tokens: NotRequired[int]
    requests_per: NotRequired[str]
    requests_limit: NotRequired[int]


# ---------------------------------------------------------------------------
# Threshold
# ---------------------------------------------------------------------------

class TPSThreshold(TypedDict):
    id: str
    rule_id: str
    violation_type: str
    count: int
    window: str
    action: str
    enabled: NotRequired[bool]
    notify_url: NotRequired[str]
    block_message: NotRequired[str]
    payload_template: NotRequired[str]
    metadata: NotRequired[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class AuditChainIntegrity(TypedDict):
    enabled: bool
    algorithm: NotRequired[Literal["sha-256", "sha3-256"]]
    sidecar_path: NotRequired[str]
    verify_on_startup: NotRequired[bool]
    alert_on_break: NotRequired[bool]


class AuditStreamingConfig(TypedDict):
    mode: NotRequired[Literal["buffer", "window", "passthrough"]]
    window_tokens: NotRequired[int]
    on_stream_violation: NotRequired[str]


class TPSAudit(TypedDict):
    enabled: bool
    destination: NotRequired[str]
    format: NotRequired[Literal["ndjson", "json", "ocsf"]]
    retention_days: NotRequired[int]
    include_payload: NotRequired[bool]
    chain_integrity: NotRequired[AuditChainIntegrity]
    streaming: NotRequired[AuditStreamingConfig]
    notify: NotRequired[AuditNotify]


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

class TPSEnvironment(TypedDict):
    name: str
    strict: NotRequired[bool]
    active_rules: NotRequired[List[str]]
    disabled_rules: NotRequired[List[str]]
    on_unknown_provider: NotRequired[Literal["block", "warn", "allow"]]


# ---------------------------------------------------------------------------
# Signature
# ---------------------------------------------------------------------------

class TPSSignature(TypedDict):
    algorithm: Literal["ed25519", "rsa-pss-sha256", "ecdsa-p256-sha256"]
    public_key: NotRequired[str]
    key_id: NotRequired[str]
    value: str
    required: NotRequired[bool]


# ---------------------------------------------------------------------------
# Policy tests
# ---------------------------------------------------------------------------

class TPSPolicyTestExpectRuleTriggered(TypedDict):
    rule_id: str
    action_taken: NotRequired[str]
    min_violations: NotRequired[int]


class TPSPolicyTestExpectRedaction(TypedDict):
    category: str
    count: NotRequired[int]


class TPSPolicyTestExpect(TypedDict):
    outcome: Literal["allowed", "allowed_with_modifications", "blocked", "warned"]
    rules_triggered: NotRequired[List[TPSPolicyTestExpectRuleTriggered]]
    rules_not_triggered: NotRequired[List[str]]
    redactions: NotRequired[List[TPSPolicyTestExpectRedaction]]


class TPSPolicyTestInputMessage(TypedDict):
    role: str
    content: str


class TPSPolicyTestInputToolCall(TypedDict):
    tool_name: str
    arguments: NotRequired[Dict[str, Any]]


class TPSPolicyTestInputResponse(TypedDict):
    content: str


class TPSPolicyTestInput(TypedDict):
    messages: NotRequired[List[TPSPolicyTestInputMessage]]
    response: NotRequired[TPSPolicyTestInputResponse]
    provider: NotRequired[str]
    tool_call: NotRequired[TPSPolicyTestInputToolCall]


class TPSPolicyTest(TypedDict):
    id: str
    description: NotRequired[str]
    stage: str
    input: TPSPolicyTestInput
    expect: TPSPolicyTestExpect


# ---------------------------------------------------------------------------
# Top-level policy
# ---------------------------------------------------------------------------

class TPSPolicy(TypedDict):
    tps_version: str
    name: str
    description: NotRequired[str]
    extends: NotRequired[str]
    default_action: NotRequired[Literal["allow", "deny"]]
    provider: NotRequired[str]
    rules: List[TPSRule]
    compliance_frameworks: NotRequired[List[str]]
    environments: NotRequired[List[TPSEnvironment]]
    thresholds: NotRequired[List[TPSThreshold]]
    tests: NotRequired[List[TPSPolicyTest]]
    audit: TPSAudit
    signature: NotRequired[TPSSignature]
    metadata: NotRequired[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Payload types
# ---------------------------------------------------------------------------

class Message(TypedDict):
    role: str
    content: Optional[str]
    name: NotRequired[str]
    tool_call_id: NotRequired[str]


class RequestPayload(TypedDict):
    messages: List[Message]
    provider: str
    model: NotRequired[str]
    api_key_id: NotRequired[str]
    max_tokens: NotRequired[Optional[int]]
    metadata: NotRequired[Dict[str, Any]]


class ResponsePayload(TypedDict):
    content: str
    provider: str
    model: NotRequired[str]
    api_key_id: NotRequired[str]
    usage: NotRequired[Dict[str, Any]]
    system_prompt: NotRequired[Optional[str]]
    metadata: NotRequired[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Violation / audit
# ---------------------------------------------------------------------------

class ViolationSpan(TypedDict):
    start: int
    end: int
    original: str


class Violation(TypedDict):
    rule_id: str
    rule_description: NotRequired[str]
    outcome: str
    detail: str
    category: NotRequired[str]
    span: NotRequired[ViolationSpan]


class AuditEvent(TypedDict):
    id: str
    timestamp: str
    policy_name: str
    policy_version: str
    rule_id: str
    event_type: str
    stage: str
    tags: NotRequired[Dict[str, str]]
    metadata: NotRequired[Dict[str, Any]]
    violation: NotRequired[Violation]
    chain_hash: NotRequired[str]
    chain_sequence: NotRequired[int]


# ---------------------------------------------------------------------------
# Evaluate result
# ---------------------------------------------------------------------------

class EvaluateResult(TypedDict):
    allowed: bool
    payload: Union[RequestPayload, ResponsePayload]
    violations: List[Violation]
    tags: Dict[str, str]
    audit_events: List[AuditEvent]
    evaluated_at: str
    policy_name: str


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------

class EvaluateOptions(TypedDict, total=False):
    request_id: str
    environment: str
    api_key_id: str
    api_key: str


class TransparentGuardOptions(TypedDict, total=False):
    policy: Union[str, TPSPolicy]
    api_key: str
    api_base_url: str
    offline_mode: bool
