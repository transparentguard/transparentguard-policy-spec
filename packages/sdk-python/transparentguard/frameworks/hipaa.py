"""
TransparentGuard Python SDK — HIPAA Compliance Framework Rules
Activated by compliance_frameworks: [hipaa]
"""

from __future__ import annotations
from typing import List
from ..types import TPSRule

HIPAA_RULES: List[TPSRule] = [
    {
        "id": "tg_framework_hipaa_tag",
        "description": "HIPAA framework: Tags every call with HIPAA compliance context.",
        "stage": "both",
        "action": "tag",
        "tags": {
            "tg_compliance_framework": "hipaa",
            "tg_hipaa_active": "true",
        },
        "metadata": {
            "regulatory_ref": "HIPAA 45 CFR 164 — Security and Privacy Rules",
            "framework": "hipaa",
        },
    },
    {
        "id": "tg_framework_hipaa_redact_phi_pre",
        "description": "HIPAA framework: Redacts PHI from outbound prompts. 45 CFR 164.514.",
        "stage": "pre-request",
        "action": "redact",
        "targets": [
            {
                "type": "pii",
                "categories": ["phi"],
                "confidence_threshold": 0.75,
            }
        ],
        "on_violation": "redact",
        "log": True,
        "metadata": {
            "regulatory_ref": "45 CFR 164.514 — Safe Harbor De-identification",
            "framework": "hipaa",
        },
    },
    {
        "id": "tg_framework_hipaa_redact_phi_post",
        "description": "HIPAA framework: Redacts PHI from LLM responses. 45 CFR 164.502.",
        "stage": "post-response",
        "action": "redact",
        "targets": [
            {
                "type": "pii",
                "categories": ["phi"],
                "confidence_threshold": 0.78,
            }
        ],
        "on_violation": "redact",
        "log": True,
        "metadata": {
            "regulatory_ref": "45 CFR 164.502 — Uses and Disclosures of PHI",
            "framework": "hipaa",
        },
    },
    {
        "id": "tg_framework_hipaa_block_injection",
        "description": "HIPAA framework: Blocks prompt injection targeting PHI access.",
        "stage": "pre-request",
        "action": "classify",
        "classifier": "built-in/prompt-injection-v2",
        "threshold": 0.80,
        "on_violation": "block",
        "log": True,
        "metadata": {
            "regulatory_ref": "45 CFR 164.312 — Technical Safeguards",
            "framework": "hipaa",
        },
    },
    {
        "id": "tg_framework_hipaa_log_all",
        "description": "HIPAA framework: Logs all LLM calls for HIPAA audit trail. 45 CFR 164.312(b).",
        "stage": "post-response",
        "action": "log",
        "log_level": "info",
        "metadata": {
            "regulatory_ref": "45 CFR 164.312(b) — Audit Controls",
            "framework": "hipaa",
        },
    },
]
