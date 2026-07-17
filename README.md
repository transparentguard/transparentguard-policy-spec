# TransparentGuard Policy Spec (TPS)

**Version:** 1.0  
**Status:** Stable  
**License:** MIT  
**Maintainer:** TransparentGuard  

---

## What This Repository Is

This repository contains the official specification for the **TransparentGuard Policy Spec (TPS)** — an open, versioned YAML standard for declaring AI safety and compliance policies.

TPS defines how developers write policy files that sit between their application and any LLM provider. A policy file declares what is allowed, what is blocked, what gets redacted, and what gets logged on every LLM request and response. Any runtime that claims TPS compatibility must implement this specification fully and correctly.

This specification is independent of any specific runtime implementation. You can implement TPS in any language on any infrastructure. The TransparentGuard Runtime (TGR) is the reference implementation, but it is not the only valid one.

---

## What TPS Is Not

TPS is not an LLM gateway. It does not route, load-balance, or proxy model calls.  
TPS is not an observability platform. It does not store or visualize data.  
TPS is not a model evaluation framework. It does not score model quality.  

TPS is exclusively a **policy declaration standard** for AI compliance and safety enforcement.

---

## Repository Structure

```
spec/
  README.md               This file
  SPEC.md                 Full specification document
  CHANGELOG.md            Version history and breaking changes
  LICENSE                 MIT license

schema/
  tps-v1.json             JSON Schema for validating TPS v1 policy files

examples/
  minimal.yaml            The smallest valid TPS file
  basic-safety.yaml       General-purpose safety guardrails
  hipaa.yaml              HIPAA-compliant healthcare AI environment
  eu-gdpr.yaml            GDPR-compliant European deployment
  eu-ai-act.yaml          EU AI Act high-risk system configuration
  rag-grounding.yaml      Factual grounding guardrails for RAG systems
  multi-environment.yaml  Dev, staging, and production in one file
```

---

## Quick Start

A minimal valid TPS policy file:

```yaml
tps_version: "1.0"
name: "my-first-policy"

rules:
  - id: block-pii-outbound
    stage: pre-request
    action: redact
    targets:
      - type: pii
        categories: [email, phone, ssn]
    on_violation: redact
    log: true

audit:
  enabled: true
  destination: "file://./logs/audit.jsonl"
```

Point any TPS-compatible runtime at this file and every LLM call your application makes will have outbound PII redacted and logged.

---

## API Key

All tiers, including the free tier, require a TransparentGuard API key. Keys are free, permanent, and require no credit card. Obtain one at [transparentguard.com](https://transparentguard.com).

Set the key in your environment before initializing the runtime:

```bash
export TG_API_KEY="tg_sk_live_..."
```

Air-gapped and enterprise deployments use `TG_LICENSE_KEY` instead. See the offline license documentation for details.

---

## Specification Document

Read [SPEC.md](./SPEC.md) for the complete specification. Every field, every valid value, every behavior, and every conformance requirement is documented there.

---

## JSON Schema

The file `schema/tps-v1.json` is a JSON Schema (Draft 2020-12) that can be used to validate any TPS v1 policy file programmatically. Use it in your editor, your CI pipeline, or your runtime's file loader to catch errors before they reach production.

Validate a policy file using the TransparentGuard CLI:

```bash
transparentguard validate ./policies/production.yaml
```

Or using any JSON Schema validator directly (note: convert YAML to JSON first):

```bash
yq -o json ./policies/production.yaml | ajv validate -s schema/tps-v1.json -d -
```

---

## Versioning

TPS follows semantic versioning. The version declared in a policy file (`tps_version`) must match a version that the runtime supports. Runtimes must reject policy files with an unsupported version rather than silently ignoring unknown fields.

Minor version bumps (1.0 to 1.1) add new optional fields and rule types. Existing valid files remain valid.  
Major version bumps (1.x to 2.0) may introduce breaking changes. A compatibility guide will be published for every major version.

---

## Conformance

A runtime claims TPS v1 conformance when it:

1. Accepts all valid TPS v1 files without error
2. Rejects all invalid TPS v1 files with a descriptive error
3. Implements all rule types defined in this specification
4. Produces audit events in the format defined in this specification
5. Passes the TPS v1 conformance test suite (see `tests/` in the reference implementation)

---

## Contributing

This specification is maintained openly. To propose a change:

1. Open an issue describing the problem or gap
2. Submit a pull request with the proposed change to SPEC.md and schema/tps-v1.json
3. Changes require review from at least two maintainers before merging

Breaking changes require a deprecation period of one full minor version cycle.

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Phase 10 — Performance, Security Posture & Provider Adapters

### Fail-open / Fail-closed (`fail_mode`)

Per-environment and policy-level control over what happens when TG itself errors (network failure, unexpected exception) — distinct from a policy violation:

```yaml
fail_mode: "closed"   # global default: block on engine error

environments:
  - name: production
    fail_mode: "closed"   # safest for HIPAA/FedRAMP
  - name: staging
    fail_mode: "open"     # pass-through with audit event on error
```

### Streaming Window + Passthrough Modes

All three TPS streaming modes are now fully implemented in the OpenAI and Anthropic wrappers:

```typescript
// Window mode — evaluate every 100 tokens, abort mid-stream on violation
const client = tg.wrap(new OpenAI());
const stream = await client.chat.completions.create(
  { model: "gpt-4o", messages, stream: true },
  { streamMode: "window", windowTokens: 100, onStreamViolation: "block" }
);

// Passthrough — yield immediately, evaluate at end
const stream = await client.chat.completions.create(
  { model: "gpt-4o", messages, stream: true },
  { streamMode: "passthrough", onStreamViolation: "passthrough_and_log" }
);
```

### Provider Adapter Interface (Section 32)

Formal `ProviderAdapter` interface with 11 built-in adapters:

| Provider     | Compat      | Jurisdiction |
|--------------|-------------|:------------:|
| `openai`     | OpenAI      | US           |
| `anthropic`  | Native      | US           |
| `groq`       | OpenAI      | US           |
| `vertex`     | Native      | US           |
| `mistral`    | OpenAI      | FR (EU)      |
| `vllm`       | OpenAI      | self-hosted  |
| `bedrock`    | Native      | US           |
| `deepseek`   | OpenAI      | CN           |
| `moonshot`   | OpenAI      | CN           |
| `zhipu`      | OpenAI      | CN           |
| `baichuan`   | OpenAI      | CN           |

```typescript
import { resolveAdapter, registerAdapter } from "@transparentguard/runtime";
const adapter = resolveAdapter("openai/gpt-4o");
// adapter.region.jurisdiction → "US"

// Register a custom adapter
registerAdapter({ providerId: "myco", ... });
```

### Helm Security Hardening

`charts/transparentguard-proxy/templates/networkpolicy.yaml` — opt-in `NetworkPolicy`:
- Egress: DNS + HTTPS only; all other egress denied.
- Ingress: same-namespace only by default; fully configurable.
- Enable with `networkPolicy.enabled: true` in values.

`values.yaml` now defaults to the Kubernetes "restricted" Pod Security Standard (`runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`).

### Multi-cloud Terraform

- `deploy/terraform/modules/gcp/` — Cloud Run + VPC + Cloud SQL + GCS + Artifact Registry + Secret Manager
- `deploy/terraform/modules/azure/` — Container Apps + VNet + PostgreSQL Flexible + Blob Storage + Key Vault + Managed Identity
- AWS module (Phase 7) unchanged.

---

## Phase 9 — Provider Scoping and Data Sovereignty (Section 30 & 31)

### Rule-Level Provider Scoping (Section 30)

A three-tier system for scoping individual rules to specific providers without blocking the overall call:

**Tier 1 — Glob list:** Rules can declare which providers they apply to. Non-matching providers cause the rule to be *skipped*, not blocked.

```yaml
- id: vision-pii-rule
  stage: pre-request
  action: redact
  providers: [openai/*, anthropic/*, "!ollama/*"]
  targets:
    - type: pii
      categories: [pii_all]
  on_violation: redact
```

**Tier 2 — Capability matching:** Rules activate only when the provider has specific capabilities, risk tier, or training cutoff:

```yaml
  provider_match:
    capabilities: [vision, reasoning]
    risk_tier: [low, medium]
    training_cutoff_after: "2024-01-01"
    blocked_training_jurisdictions: [CN, RU]
```

**Tier 3 — Attestation gating:** Rules require compliance certifications from the provider:

```yaml
  provider_match:
    requires_attestation: [hipaa-baa, soc2-type2]
```

Capability and attestation data comes from the **TG Provider Registry** (`registry/REGISTRY.md`) — an open, versioned catalog of AI providers. Current registry includes: OpenAI, Anthropic, Google DeepMind, Mistral AI, Cohere, AWS Bedrock, Azure OpenAI, DeepSeek, Ollama, Hugging Face, and Replicate.

---

### Data Sovereignty (Section 31)

Full three-jurisdiction sovereignty enforcement via `enforce_type: data_sovereignty`:

```yaml
- id: eu-sovereignty
  stage: pre-request
  action: enforce
  enforce_type: data_sovereignty
  data_subject_jurisdiction:
    infer_from: geo_ip
    accept: [EU, EEA, UK]
    fallback: EU
  allowed_processor_regions: [eu-west-1, eu-central-1, europe-west-*]
  blocked_processor_jurisdictions: [CN, RU, BY, IR]
  blocked_training_jurisdictions: [CN]
  transfer_mechanism:
    require_one_of: [adequacy_decision, standard_contractual_clauses]
  legal_basis: gdpr_article_6_1_b
  on_violation: block
```

The runtime ships with:
- **TG Adequacy Decision table** — all EU Commission adequacy decisions including the EU-US DPF
- **Region→jurisdiction mapping** — all AWS, GCP, and Azure regions mapped to ISO 3166-1 countries
- **Legal basis codes** — machine-readable codes for GDPR, HIPAA, and CCPA

New example: `examples/data-sovereignty.yaml`.
