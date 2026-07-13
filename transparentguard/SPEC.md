# TransparentGuard — Full Technical Specification

---

## What It Is

TransparentGuard is a **cloud-neutral, Git-native AI policy engine** — a spec and a runtime that
sits between any application and any LLM provider, intercepting every request and response,
evaluating it against declared policies, and enforcing guardrails before anything moves.

It is **not** an LLM gateway (it doesn't route or proxy model calls as its primary job).
It is **not** an observability tool (though it produces audit logs as a byproduct).
It is specifically and only the **compliance and safety enforcement layer** for AI systems — the
thing you drop in once and never argue about in a compliance audit again.

The product ships as two things that are inseparable by design:

1. **The TransparentGuard Policy Spec (TPS)** — an open, versioned YAML standard for declaring AI
   policies. Anyone can read it, auditors can verify it, other tools can implement it. This is the
   open-source layer submitted to a neutral standards body (CNCF target).

2. **The TransparentGuard Runtime (TGR)** — the enforcement engine that reads TPS files and
   executes them. Self-hostable (Docker, Kubernetes, bare metal). Also available as a hosted
   managed service. This is what you license.

---

## What It Does

### Core Enforcement (every tier)

**Pre-request inspection**
Every LLM call passes through TransparentGuard before it reaches the provider. The engine evaluates:
- PII detection and redaction (names, SSNs, credit card numbers, medical record numbers, etc.)
- Prompt injection detection (attempts to override system instructions)
- Prohibited content screening (topics, keywords, regex patterns, semantic classifiers)
- Token budget enforcement (hard cap per request, per user, per key)
- Provider allowlist enforcement (only these models are permitted for this key/environment)
- Metadata tagging (attach compliance context to every outbound call)

**Post-response inspection**
Every response is evaluated before it reaches your application:
- Output PII scan (catch model hallucinations that include real personal data)
- Toxicity and harmful content scoring
- Confidentiality filter (prevent the model from leaking system prompt contents)
- Schema validation (structured output compliance — does the response match the declared format)
- Factual grounding check (for RAG systems — flag responses not grounded in provided context)

**Policy evaluation**
All of the above is governed by a single TPS policy file committed to Git alongside your code:

```yaml
version: "1.0"
name: "production-hipaa"
provider: any

environments:
  - name: production
    strict: true
  - name: staging
    strict: false

rules:
  - id: pii-redact-outbound
    stage: pre-request
    action: redact
    targets:
      - type: pii
        categories: [ssn, dob, mrn, phone, email, credit_card]
    on_violation: block
    log: true

  - id: prompt-injection-guard
    stage: pre-request
    action: classify
    classifier: built-in/prompt-injection-v2
    threshold: 0.82
    on_violation: block
    log: true

  - id: provider-allowlist
    stage: pre-request
    action: enforce
    allowed_providers:
      - openai/gpt-4o
      - anthropic/claude-3.5-sonnet
    on_violation: block
    log: true

  - id: output-pii-scan
    stage: post-response
    action: redact
    targets:
      - type: pii
        categories: [ssn, dob, mrn]
    on_violation: redact
    log: true

  - id: token-budget
    stage: pre-request
    action: enforce
    max_tokens_per_request: 8192
    max_tokens_per_day_per_key: 1000000
    on_violation: block
    log: true

compliance_frameworks:
  - hipaa
  - gdpr

audit:
  enabled: true
  destination: s3://your-bucket/tg-audit-logs
  retention_days: 2555   # 7 years — HIPAA requirement
  format: json
  include_redacted_content: false
```

---

### Compliance Framework Templates (Growth tier and above)

Pre-built rule libraries mapped to specific regulations. Activate with one line.

**HIPAA**
- PHI detection across 18 HIPAA Safe Harbor identifiers
- Minimum necessary principle enforcement
- Audit log format compliant with HIPAA §164.312(b)
- BAA-ready audit trail generation
- Automated 7-year retention policy

**GDPR / EU AI Act**
- EU PII categories (national ID, health data, biometric)
- Right to erasure: flag any request/response that would store personal data without basis
- EU AI Act risk classification tagging (minimal / limited / high / unacceptable)
- High-risk system guardrails (human oversight enforcement, logging requirements)
- Data residency enforcement (block requests that would route outside declared regions)

**SOC 2 Type II**
- Complete request/response audit trail
- Access control enforcement per key
- Anomaly detection flags for audit reviewers
- Evidence package export (formatted for auditors, covers CC6 and CC7 controls)

**FedRAMP (Moderate)**
- NIST 800-53 control mapping
- System boundary enforcement (allowlisted providers only)
- Continuous monitoring log format
- Incident log export compatible with ISSO reporting requirements

---

### Audit Trail and Compliance Reporting

Every intercepted call produces a structured audit event:

```json
{
  "event_id": "tg_01J3X...",
  "timestamp": "2026-07-12T14:32:01.004Z",
  "environment": "production",
  "policy_version": "1.0",
  "policy_id": "production-hipaa",
  "provider": "openai/gpt-4o",
  "key_id": "key_prod_abc123",
  "request": {
    "token_count": 412,
    "rules_evaluated": ["pii-redact-outbound", "prompt-injection-guard", "provider-allowlist", "token-budget"],
    "violations": [
      {
        "rule_id": "pii-redact-outbound",
        "category": "ssn",
        "action_taken": "redacted",
        "redacted_count": 1
      }
    ],
    "passed": true
  },
  "response": {
    "token_count": 218,
    "rules_evaluated": ["output-pii-scan"],
    "violations": [],
    "passed": true
  },
  "latency_added_ms": 4,
  "compliance_frameworks": ["hipaa"],
  "outcome": "allowed"
}
```

From these events, TransparentGuard generates:
- **Real-time dashboard** — violation rates, blocked requests, PII redaction frequency, provider usage
- **Compliance report exports** — formatted for HIPAA auditors, GDPR DPAs, SOC 2 auditors, FedRAMP ISSOs
- **Git-diff style policy change log** — every policy change tracked and timestamped, who changed what and when

---

### Integration Surface

TransparentGuard integrates in three ways — customers choose based on their architecture:

**1. SDK (recommended for new builds)**
Drop-in wrapper around any LLM client. Zero infrastructure change.
```typescript
import { tg } from "@transparentguard/sdk";
import OpenAI from "openai";

const client = tg.wrap(new OpenAI(), { policy: "./policies/production-hipaa.yaml" });

// Everything else is identical to normal OpenAI usage
const response = await client.chat.completions.create({ ... });
```

**2. Sidecar proxy (recommended for existing systems)**
Run TransparentGuard as a local proxy. Point your existing LLM client at `localhost:8080` instead
of `api.openai.com`. No application code changes. Works with any language, any framework.

```bash
docker run -p 8080:8080 \
  -v ./policies:/policies \
  transparentguard/proxy:latest \
  --policy /policies/production-hipaa.yaml \
  --upstream https://api.openai.com
```

**3. Managed hosted endpoint (for teams that don't want to self-host)**
Point your LLM calls at `api.transparentguard.com/v1` instead of your provider directly.
TransparentGuard enforces your policy, forwards to your provider, returns the response.
Fully managed. No infrastructure.

---

### What TransparentGuard Does NOT Do

- It does not store your prompts or responses (audit logs contain metadata and redacted
  summaries, not full content, unless you explicitly configure otherwise)
- It does not route or load-balance between providers (that's OpenRouter's job)
- It does not fine-tune or evaluate model quality
- It does not generate responses — it only evaluates them

---

## Benefits

### For AI-native software companies selling to enterprise

- **Unblock enterprise deals.** The #1 reason enterprise procurement stalls on AI vendor due
  diligence is "what happens to our data" and "how do you prove safety." TransparentGuard gives
  you a concrete, auditable answer in a form that legal teams recognize.
- **Close faster.** Ship your compliance documentation as a TPS policy file and a generated audit
  report. Your sales engineer spends 20 minutes instead of 3 weeks.
- **No compliance engineering headcount.** Building this in-house requires a senior engineer who
  understands both LLM behavior and regulatory requirements. That person costs $250k+/year.
  TransparentGuard costs a fraction of that and is maintained for you.

### For regulated-industry AI builders (healthcare, finance, legal, gov)

- **HIPAA-ready on day one.** Pre-built PHI detection and audit trail means your AI feature is
  HIPAA-compliant before you write a line of business logic.
- **Auditor-ready evidence.** When your SOC 2 auditor asks for evidence of AI system controls,
  you export a formatted report from the dashboard. No manual log parsing.
- **EU AI Act compliance.** High-risk AI system requirements (human oversight, logging,
  transparency) are enforced at the infrastructure level, not left to individual developers to
  remember.

### For engineering teams

- **Git-native.** Policy is a YAML file. It goes through code review, gets version-tagged, and
  rolls back with a `git revert`. No separate compliance dashboard to keep in sync with your code.
- **Language-agnostic.** Works with Python, TypeScript, Go, Ruby, Java — any language that can
  make an HTTP call.
- **Provider-agnostic.** OpenAI, Anthropic, Bedrock, Vertex, Groq, Mistral, Ollama, vLLM — all
  enforced by the same policy file.
- **Measured latency.** Median enforcement overhead is under 5ms. P99 under 20ms. Designed to be
  invisible in production.

---

## Ideal Customer Profile (ICP)

### Primary ICP — AI-native B2B SaaS, Series A to C

**Who they are:**
Companies that have built an AI-powered product and are actively selling to mid-market or
enterprise customers. 15-150 employees. AI is core to their product, not a feature.

**Why they buy:**
They are losing or slowing enterprise deals because procurement and legal are asking compliance
questions they can't answer with confidence. They need a credible, auditable compliance layer
immediately. They don't have the engineering bandwidth to build it themselves and don't want to.

**Examples:**
- AI-powered legal document review tools selling to law firms
- AI medical scribe or clinical decision support tools selling to hospitals
- AI underwriting or fraud detection tools selling to insurers
- AI contract analysis tools selling to corporate legal departments
- AI financial research tools selling to asset managers

**Budget authority:** CTO or VP Engineering, often with sign-off from General Counsel or CISO.
**Deal size:** $2,500–$8,000/month. Annual contracts.
**Sales motion:** Product-led (SDK installs in a day), sales-assisted to close annual contract.

---

### Secondary ICP — Enterprise internal AI platform teams

**Who they are:**
Teams at large enterprises (1,000+ employees) building internal LLM-powered tools — copilots,
document processors, internal chatbots — and needing to satisfy their own internal security,
compliance, and legal teams before rolling out broadly.

**Why they buy:**
Internal security review is blocking rollout. They need to show their CISO a documented,
enforceable policy for AI usage across the organization. They can't use an off-the-shelf product
that sends data to a third party without data processing agreements. They need self-hosted.

**Examples:**
- Fortune 500 financial services firms building internal AI assistants
- Hospital systems building clinical AI tools for internal use
- Government agencies and defense contractors
- European enterprises with strict data residency requirements

**Budget authority:** CISO, CTO, or Head of AI Platform. Procurement-heavy.
**Deal size:** $50,000–$250,000/year. Multi-year contracts common.
**Sales motion:** Enterprise sales with proof-of-concept period. Self-hosted deployment.

---

### Tertiary ICP — AI infrastructure and tooling companies

**Who they are:**
Companies building LLM gateways, AI developer tools, AI agents platforms, or MLOps
infrastructure who want to offer compliance capabilities to their own customers without building
the policy engine themselves. They embed TransparentGuard as a licensed component.

**Why they buy:**
Their customers are asking for compliance features. Building a full policy engine is a 6-month
engineering project outside their core competency. Licensing TransparentGuard lets them ship
the feature in weeks and focus on their actual product.

**Examples:**
- LLM gateway providers (embed TPS as their native policy layer)
- AI agent platforms (enforce guardrails on autonomous agent actions)
- MLOps platforms (add AI safety controls to model serving infrastructure)
- Vertical AI platforms (healthcare AI platforms, legal AI platforms)

**Deal type:** OEM / embedded license. Revenue share or flat annual license per distribution.
**Deal size:** $25,000–$150,000/year base + usage-based component.

---

## Pricing Model

### Structure: Platform fee + usage component + compliance modules

Three levers intentionally — this is how enterprise infrastructure pricing works. The platform fee
covers the right to use. The usage component scales with their AI usage and creates revenue that
grows without more sales effort. The compliance modules are the high-margin add-ons that address
specific regulatory needs.

---

### Tier 1 — Developer (Free, self-hosted only)

**Price:** $0

**What's included:**
- Full TPS spec (open source, always free)
- Self-hosted runtime (Docker image, no call-home requirement)
- Core guardrails: PII detection (regex), prompt injection (heuristic), content filtering, token budgets
- JSON audit logs to local disk or any destination you configure
- Up to 500,000 LLM calls/month evaluated
- Community support (GitHub Issues, Discord)
- **Not included:** compliance framework templates, ML classifiers, medical/financial PII classifiers, PIE, signed receipts, evidence export, S3/GCS/Azure/Postgres audit destinations, audit chain integrity, threshold breach notifications (`action: notify`), threshold system suspension (`action: block_all`)
- No compliance report export
- No SLA

**Purpose:** Developer adoption, community building, bottom-up growth into companies.

---

### Tier 2 — Startup



**Price:** $800/month (billed annually: $9,600/year) or $1,100/month-to-month

**What's included:**
- Everything in Developer
- Hosted managed endpoint option (no self-hosting required)
- Up to 5,000,000 LLM calls/month evaluated
- Overage: $0.12 per 10,000 additional calls
- **One compliance framework:** HIPAA OR GDPR (choose at signup)
- Compliance report export (PDF, JSON)
- **Audit chain integrity:** tamper-evident SHA-256/SHA3-256 Merkle chain on all audit logs (HIPAA §164.312(b), SOC 2 CC7.2)
- **Threshold breach notifications:** `action: notify` outbound webhooks and `action: block_all` system suspension on rolling-window violation counts
- Dashboard with violation analytics and cost tracking
- Slack/email support, 48-hour response SLA
- Up to 5 team members
- 1-year audit log retention

**Target:** Early-stage AI companies closing their first enterprise deals. At $800/month, a single
unblocked enterprise deal pays for 1–3 years of TransparentGuard.

---

### Tier 3 — Growth

**Price:** $3,500/month (billed annually: $42,000/year) or $4,500/month-to-month

**What's included:**
- Everything in Startup
- Up to 25,000,000 LLM calls/month evaluated
- Overage: $0.08 per 10,000 additional calls
- **All compliance frameworks:** HIPAA + GDPR/EU AI Act + SOC 2
- HIPAA BAA available (signed on request)
- DPA (Data Processing Agreement) for GDPR available
- **Policy Intelligence Engine (PIE):** shadow classifier scoring, framework drift detection
- **Audit evidence export:** structured JSON/PDF packages for SOC 2, HIPAA, GDPR auditors
- Custom policy rule builder (UI-based, no YAML required for common rules)
- Multi-environment support (dev/staging/prod with separate policies)
- SSO (SAML/OIDC)
- Up to 25 team members
- 7-year audit log retention (HIPAA compliant)
- Priority support, 8-hour response SLA
- Quarterly compliance review call

**Target:** Series A/B AI companies with active enterprise sales pipeline. The HIPAA BAA and DPA
alone justify this tier for companies in healthcare and European markets.

---

### Tier 4 — Enterprise

**Price:** Starting at $80,000/year. Custom quote.

**What's included:**
- Everything in Growth
- Unlimited LLM calls evaluated (negotiated rate for very high volume)
- **Self-hosted deployment support** (Kubernetes Helm chart, Terraform modules, dedicated
  onboarding engineer)
- FedRAMP Moderate framework (government customers, NIST SP 800-53 Rev 5)
- Custom compliance framework development (your industry-specific rules, built by TransparentGuard
  team)
- **Cryptographic trust chain:** ECDSA-P256 signed evaluation receipts for every enforcement decision
- **Key rotation watcher:** zero-downtime signing key rotation via JWK endpoint
- Dedicated Slack channel with engineering team access
- 99.99% uptime SLA (hosted) or deployment SLA (self-hosted)
- Up to unlimited team members
- Data residency options (EU-only, US-only, or your own infrastructure)
- Annual penetration test results on request
- MSA, enterprise DPA, custom legal terms

**Target:** Fortune 500 internal AI platform teams, government contractors, large healthcare
systems, large financial institutions. One deal at this tier covers the full annual cost of a
junior engineer.

---

### Tier 5 — OEM / Embedded License

**Price:** $30,000/year base + $0.04 per 10,000 calls routed through your product

**What's included:**
- License to embed the TransparentGuard Runtime in your product
- White-label option (remove TransparentGuard branding, use your own)
- API access to all compliance report generation endpoints (build your own UI on top)
- All compliance frameworks included (HIPAA, GDPR, EU AI Act, SOC 2, FedRAMP Moderate)
- **Custom classifier registry:** register domain-specific classifiers (pattern, keyword, webhook) via TPS policy
- All PIE features: shadow mode, drift detection, evidence export
- All trust chain features: signed receipts, key rotation watcher
- Dedicated integration engineering support during onboarding (first 90 days)
- Co-marketing opportunity (listed as "Powered by TransparentGuard" if desired)
- Source code escrow available for enterprise customers

**Target:** AI gateway companies, AI agent platforms, vertical AI SaaS companies that want to
offer compliance as a native feature.

---

## Revenue Model and Projections

### Year 1 target: $600,000–$1,200,000 ARR

Assumptions: Strong developer adoption of free tier creates pipeline. 12-month sales cycle for
Enterprise. Startup and Growth tiers close in days to weeks via product-led motion.

| Segment | Customers | Avg ARR | Revenue |
|---|---|---|---|
| Startup | 40 | $9,600 | $384,000 |
| Growth | 8 | $42,000 | $336,000 |
| Enterprise | 1 | $100,000 | $100,000 |
| OEM | 1 | $30,000 + usage | $50,000 |
| **Total** | **50** | | **~$870,000** |

---

### Year 2 target: $3,000,000–$6,000,000 ARR

By Year 2, the compounding dynamics kick in:
- EU AI Act enforcement pressure accelerates growth tier upgrades
- First OEM deals begin distributing volume (usage component scales automatically)
- Enterprise pipeline matures from Year 1 developer installs

| Segment | Customers | Avg ARR | Revenue |
|---|---|---|---|
| Startup | 120 | $9,600 | $1,152,000 |
| Growth | 30 | $42,000 | $1,260,000 |
| Enterprise | 6 | $120,000 | $720,000 |
| OEM | 4 | $80,000 | $320,000 |
| **Total** | **160** | | **~$3,452,000** |

---

### Year 3 target: $10,000,000–$20,000,000 ARR

At this point, the OEM channel becomes significant. Each OEM partner that ships TransparentGuard
to their customers multiplies the call volume (and usage revenue) without additional sales effort.
One LLM gateway company with 5,000 customers running 1M calls/day generates ~$1.7M/year in usage
fees alone on the OEM rate.

---

### Key revenue characteristics

- **High net revenue retention.** Customers don't churn unless they shut down their AI product.
  As their AI usage grows, their call volume grows, and their usage fees grow automatically.
- **Expansion is passive.** You don't sell the expansion — their growth triggers it.
- **Compliance events are demand catalysts.** Every new regulation (EU AI Act enforcement, new
  HIPAA guidance, state AI bills) is a sales event for TransparentGuard. The regulatory
  environment is your marketing team.
- **Gross margins are high.** Core cost is infrastructure (compute for policy evaluation). At
  scale, policy evaluation is cheap per-call. 80%+ gross margin is achievable at Growth tier and
  above.

---

## Competitive Positioning

| | TransparentGuard | AWS Bedrock Guardrails | Azure AI Content Safety | OpenRouter | LiteLLM |
|---|---|---|---|---|---|
| Provider-agnostic | ✅ | ❌ AWS only | ❌ Azure only | ❌ | Partial |
| Git-native policy | ✅ | ❌ | ❌ | ❌ | ❌ |
| Open spec | ✅ | ❌ | ❌ | ❌ | ❌ |
| HIPAA BAA | ✅ | ✅ (via AWS) | ✅ (via Azure) | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ | ✅ |
| Compliance report export | ✅ | ❌ | ❌ | ❌ | ❌ |
| OEM/embed license | ✅ | ❌ | ❌ | ❌ | ❌ |
| EU AI Act templates | ✅ | ❌ | Partial | ❌ | ❌ |

The only row AWS and Azure win on is their own-cloud integration. Everything else is
TransparentGuard's advantage.

---

## Name

**TransparentGuard**
Tagline: *The AI policy layer that works everywhere.*

Domain target: `transparentguard.com` / `transparentguard.dev`
GitHub org: `github.com/transparentguard`
Spec repo: `github.com/transparentguard/spec` (the open standard, MIT licensed)
Runtime repo: `github.com/transparentguard/runtime` (open-core, BSL or Apache 2.0)
