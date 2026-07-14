"""
TransparentGuard Python SDK — SOC 2 Compliance Framework Rules
Activated by compliance_frameworks: [soc2]
"""

from __future__ import annotations
from typing import List
from ..types import TPSRule

SOC2_RULES: List[TPSRule] = [
    {
        "id": "tg_framework_soc2_tag",
        "description": "SOC 2 framework: Tags every request with SOC 2 compliance context. CC6.1.",
        "stage": "both",
        "action": "tag",
        "tags": {
            "tg_compliance_framework": "soc2",
            "tg_soc2_control": "CC6.1",
            "tg_audit_evidence": "true",
        },
        "metadata": {
            "regulatory_ref": "SOC 2 CC6.1 — Logical and Physical Access Controls",
            "framework": "soc2",
        },
    },
    {
        "id": "tg_framework_soc2_block_injection",
        "description": "SOC 2 framework: Blocks prompt injection. CC6.8 — Restricts unauthorized access.",
        "stage": "pre-request",
        "action": "classify",
        "classifier": "built-in/prompt-injection-v2",
        "threshold": 0.78,
        "on_violation": "block",
        "log": True,
        "metadata": {
            "regulatory_ref": "SOC 2 CC6.8 — Restricts Unauthorized Access",
            "framework": "soc2",
        },
    },
    {
        "id": "tg_framework_soc2_redact_sensitive_pre",
        "description": "SOC 2 framework: Redacts sensitive PII from prompts. CC6.5.",
        "stage": "pre-request",
        "action": "redact",
        "targets": [
            {
                "type": "pii",
                "categories": [
                    "ssn", "credit_card", "bank_account", "iban",
                    "passport", "driver_license", "national_id",
                    "health_condition", "biometric",
                ],
                "confidence_threshold": 0.82,
            }
        ],
        "on_violation": "redact",
        "log": True,
        "metadata": {
            "regulatory_ref": "SOC 2 CC6.5 — Disposal and Remediation of Protected Information",
            "framework": "soc2",
        },
    },
    {
        "id": "tg_framework_soc2_log_all",
        "description": "SOC 2 framework: Logs all LLM calls. CC7.2 — monitors for anomalies.",
        "stage": "post-response",
        "action": "log",
        "log_level": "info",
        "metadata": {
            "regulatory_ref": "SOC 2 CC7.2 — Monitors System Components for Anomalies",
            "framework": "soc2",
        },
    },
]
