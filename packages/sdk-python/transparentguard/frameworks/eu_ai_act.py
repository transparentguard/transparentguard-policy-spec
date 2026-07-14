"""
TransparentGuard Python SDK — EU AI Act Compliance Framework Rules
Activated by compliance_frameworks: [eu-ai-act]
"""

from __future__ import annotations
from typing import List
from ..types import TPSRule

EU_AI_ACT_RULES: List[TPSRule] = [
    {
        "id": "tg_framework_eu_ai_act_tag_risk",
        "description": "EU AI Act framework: Tags every request with risk classification context. Articles 6-9.",
        "stage": "both",
        "action": "tag",
        "tags": {
            "tg_compliance_framework": "eu-ai-act",
            "tg_eu_ai_act_risk_class": "limited",
            "tg_eu_ai_act_transparency_required": "true",
        },
        "metadata": {
            "regulatory_ref": "EU AI Act Articles 6-9 — Risk Classification",
            "framework": "eu-ai-act",
        },
    },
    {
        "id": "tg_framework_eu_ai_act_block_injection",
        "description": "EU AI Act framework: Blocks prompt injection. Article 15 — accuracy and robustness.",
        "stage": "pre-request",
        "action": "classify",
        "classifier": "built-in/prompt-injection-v2",
        "threshold": 0.75,
        "on_violation": "block",
        "log": True,
        "metadata": {
            "regulatory_ref": "EU AI Act Article 15 — Accuracy, Robustness and Cybersecurity",
            "framework": "eu-ai-act",
        },
    },
    {
        "id": "tg_framework_eu_ai_act_redact_pii_pre",
        "description": "EU AI Act framework: Redacts personal data from prompts. Article 10(5) — data governance.",
        "stage": "pre-request",
        "action": "redact",
        "targets": [
            {
                "type": "pii",
                "categories": [
                    "name", "email", "phone", "ssn", "national_id",
                    "passport", "driver_license", "health_condition",
                    "race", "religion", "political_opinion", "sexual_orientation",
                    "biometric", "genetic",
                ],
                "confidence_threshold": 0.78,
            }
        ],
        "on_violation": "redact",
        "log": True,
        "metadata": {
            "regulatory_ref": "EU AI Act Article 10(5) — Data Governance",
            "framework": "eu-ai-act",
        },
    },
    {
        "id": "tg_framework_eu_ai_act_block_toxicity",
        "description": "EU AI Act framework: Blocks toxic content outputs. Article 9(2) — risk management.",
        "stage": "post-response",
        "action": "classify",
        "classifier": "built-in/toxicity-v1",
        "threshold": 0.80,
        "on_violation": "block",
        "log": True,
        "metadata": {
            "regulatory_ref": "EU AI Act Article 9 — Risk Management System",
            "framework": "eu-ai-act",
        },
    },
    {
        "id": "tg_framework_eu_ai_act_log_all",
        "description": "EU AI Act framework: Records audit events for every LLM call. Article 12 — record-keeping.",
        "stage": "post-response",
        "action": "log",
        "log_level": "info",
        "metadata": {
            "regulatory_ref": "EU AI Act Article 12 — Record-Keeping",
            "framework": "eu-ai-act",
        },
    },
]
