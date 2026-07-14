"""
TransparentGuard Python SDK — GDPR Compliance Framework Rules
Activated by compliance_frameworks: [gdpr]
"""

from __future__ import annotations
from typing import List
from ..types import TPSRule

GDPR_RULES: List[TPSRule] = [
    {
        "id": "tg_framework_gdpr_tag",
        "description": "GDPR framework: Tags every call with GDPR compliance context.",
        "stage": "both",
        "action": "tag",
        "tags": {
            "tg_compliance_framework": "gdpr",
            "tg_gdpr_active": "true",
        },
        "metadata": {
            "regulatory_ref": "GDPR (EU) 2016/679",
            "framework": "gdpr",
        },
    },
    {
        "id": "tg_framework_gdpr_redact_personal_data_pre",
        "description": "GDPR framework: Redacts personal data from prompts. Article 5(1)(c) — data minimisation.",
        "stage": "pre-request",
        "action": "redact",
        "targets": [
            {
                "type": "pii",
                "categories": ["pii_all"],
                "confidence_threshold": 0.78,
            }
        ],
        "on_violation": "redact",
        "log": True,
        "metadata": {
            "regulatory_ref": "GDPR Article 5(1)(c) — Data Minimisation",
            "framework": "gdpr",
        },
    },
    {
        "id": "tg_framework_gdpr_redact_personal_data_post",
        "description": "GDPR framework: Redacts personal data from LLM responses. Article 5(1)(f) — integrity and confidentiality.",
        "stage": "post-response",
        "action": "redact",
        "targets": [
            {
                "type": "pii",
                "categories": ["pii_all"],
                "confidence_threshold": 0.80,
            }
        ],
        "on_violation": "redact",
        "log": True,
        "metadata": {
            "regulatory_ref": "GDPR Article 5(1)(f) — Integrity and Confidentiality",
            "framework": "gdpr",
        },
    },
    {
        "id": "tg_framework_gdpr_block_injection",
        "description": "GDPR framework: Blocks prompt injection attempts. Article 32 — security of processing.",
        "stage": "pre-request",
        "action": "classify",
        "classifier": "built-in/prompt-injection-v2",
        "threshold": 0.78,
        "on_violation": "block",
        "log": True,
        "metadata": {
            "regulatory_ref": "GDPR Article 32 — Security of Processing",
            "framework": "gdpr",
        },
    },
    {
        "id": "tg_framework_gdpr_log_all",
        "description": "GDPR framework: Logs all LLM calls for accountability. Article 5(2) — accountability principle.",
        "stage": "post-response",
        "action": "log",
        "log_level": "info",
        "metadata": {
            "regulatory_ref": "GDPR Article 5(2) — Accountability",
            "framework": "gdpr",
        },
    },
]
