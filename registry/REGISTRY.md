# TransparentGuard Provider Registry

The TG Provider Registry is an open, versioned catalog of AI model providers. It enables the **three-tier provider scoping** and **data sovereignty** features of the TransparentGuard Policy Spec (TPS).

---

## Purpose

Policy authors need to write rules that apply to specific providers — or more powerfully, to classes of providers defined by their capabilities, risk tier, compliance attestations, and training jurisdictions — without hardcoding model names that change frequently.

The registry solves this by giving every provider a stable slug and a machine-readable capability profile that policy rules can match against.

---

## Registry Entry Schema

```json
{
  "id": "openai",
  "name": "OpenAI",
  "headquarters_jurisdiction": "US",
  "training_jurisdictions": ["US"],
  "processing_regions": ["us-east-1", "eu-west-1", "..."],
  "capabilities": ["text_generation", "function_calling", "vision", "..."],
  "risk_tier": "medium",
  "max_context_window": 128000,
  "training_cutoff": "2024-04-01",
  "attestations": ["soc2-type2", "iso-27001", "hipaa-baa", "gdpr-dpa"],
  "supports_signed_responses": false,
  "models": [
    {
      "id": "gpt-4o",
      "capabilities": ["text_generation", "function_calling", "vision"],
      "max_context_window": 128000,
      "training_cutoff": "2024-04-01"
    }
  ]
}
```

---

## Field Definitions

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable slug. Used as the prefix in provider/model identifiers: `openai/gpt-4o`. |
| `name` | string | Human-readable provider name. |
| `headquarters_jurisdiction` | ISO 3166-1 | Country where the company is incorporated and headquartered. |
| `training_jurisdictions` | ISO 3166-1[] | Countries where models are trained. Used by `blocked_training_jurisdictions` in data sovereignty rules. |
| `processing_regions` | string[] | Cloud regions where inference can occur. |
| `capabilities` | string[] | Published capability flags. See Capability Identifiers below. |
| `risk_tier` | low/medium/high/critical | Aggregate risk classification for this provider's flagship models. |
| `max_context_window` | integer | Maximum tokens (prompt + completion) across flagship models. |
| `training_cutoff` | ISO-8601 | Date of the latest known training data cutoff. |
| `attestations` | string[] | Compliance certifications held at the company level. See Attestation Identifiers below. |
| `supports_signed_responses` | boolean | Whether the provider returns a TG-compatible signed response header. |
| `models[]` | array | Model-level overrides. Fields here merge with provider defaults. |

---

## Capability Identifiers

| Identifier | Description |
|---|---|
| `text_generation` | Standard prompt → completion |
| `function_calling` | Structured tool/function calling |
| `vision` | Image input (multimodal) |
| `multimodal` | Audio, video, or document input beyond images |
| `structured_output` | Guaranteed JSON/schema-constrained output |
| `embedding` | Vector embedding generation |
| `reranking` | Document reranking |
| `code_generation` | Code-specialized generation |
| `reasoning` | Extended chain-of-thought / thinking models |
| `fine_tuning` | Provider offers fine-tuning on this model family |

---

## Attestation Identifiers

| Identifier | Description |
|---|---|
| `soc2-type2` | SOC 2 Type II audit passed |
| `iso-27001` | ISO/IEC 27001 certified |
| `hipaa-baa` | Provider will sign a HIPAA Business Associate Agreement |
| `gdpr-dpa` | Provider will sign a GDPR Data Processing Agreement |
| `fedramp-moderate` | FedRAMP Moderate authorization |
| `fedramp-high` | FedRAMP High authorization |
| `pci-dss` | PCI DSS Level 1 compliant |
| `hitrust` | HITRUST CSF certified |
| `ccpa` | CCPA compliant |

---

## Risk Tiers

| Tier | Meaning |
|---|---|
| `low` | On-premises / self-hosted / government-cloud providers with full audit control |
| `medium` | Major commercial API providers with standard compliance certifications |
| `high` | Providers in high-risk jurisdictions, limited attestations, or significant data access concerns |
| `critical` | Providers under active sanctions regimes or with government-mandated data access obligations |

---

## Using the Registry in TPS Rules

### Tier 1 — Glob scoping

```yaml
- id: hipaa-providers-only
  stage: pre-request
  action: enforce
  enforce_type: provider_allowlist
  providers: [openai/*, anthropic/*, aws-bedrock/*]
  allowed_providers: [openai/*, anthropic/*, aws-bedrock/*]
  on_violation: block
```

### Tier 2 — Capability matching

```yaml
- id: vision-rule-only-for-vision-models
  stage: pre-request
  action: redact
  providers: []
  provider_match:
    capabilities: [vision]
    min_context_window: 32000
  targets:
    - type: pii
      categories: [pii_all]
  on_violation: redact
```

### Tier 3 — Attestation gating

```yaml
- id: phi-attestation-gate
  stage: pre-request
  action: enforce
  enforce_type: provider_allowlist
  provider_match:
    requires_attestation: [hipaa-baa, soc2-type2]
    blocked_training_jurisdictions: [CN, RU, BY, IR]
  allowed_providers: ["*"]
  on_violation: block
```

---

## Submitting a Provider

To add or update a provider entry, open a pull request against this repository with the proposed entry in `packages/runtime/src/registry/provider-registry.ts`. All entries must include:

- Verifiable public documentation for each attestation claimed
- A link to the provider's data processing agreement (for `gdpr-dpa`)
- The source of the `training_jurisdictions` claim (privacy policy, technical documentation, or regulatory filing)

Entries are reviewed by TransparentGuard maintainers and merged when verified.
