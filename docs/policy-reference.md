# Policy Reference

A TransparentGuard Policy Spec (TPS) file is plain YAML. It declares rules, compliance frameworks, audit configuration, environments, and optional inline tests. The full specification is in [SPEC.md](../SPEC.md) — 32 sections, 3,600+ lines.

---

## Top-level structure

```yaml
tps_version: "1.0"
name: "my-policy"
description: "Production HIPAA + SOC 2 enforcement"
fail_mode: "closed"        # "closed" (default) = block on engine error
                           # "open" = pass through with audit event on error

provider:
  - openai/*               # match all OpenAI models
  - anthropic/*            # match all Anthropic models

compliance_frameworks:     # Startup tier+ required
  - hipaa
  - soc2

environments:
  - name: production
    strict: true
    fail_mode: "closed"
  - name: staging
    strict: false
    fail_mode: "open"
  - name: dev
    strict: false
    disabled_rules:
      - token-budget-hard-cap

rules:
  - id: redact-phi
    stage: pre-request
    action: redact
    targets:
      - type: pii
        categories: [phi]
    on_violation: redact
    log: true

audit:
  enabled: true
  destination: "s3://my-bucket/tg-audit/"
  format: ocsf
  chain_integrity:
    enabled: true
    algorithm: sha256

thresholds:
  - id: phi-breach-alert
    rule_id: redact-phi
    violation_type: rule_triggered
    count: 100
    window: 1h
    action: notify
    notify_url: "https://hooks.mycompany.com/hipaa-alert"
    payload_template: hipaa-breach-v1

tests:
  - id: ssn-redacted
    stage: pre-request
    input:
      messages:
        - role: user
          content: "My SSN is 123-45-6789"
    expect:
      outcome: allowed_with_modifications
```

## Rule stages

| Stage | Intercepts |
|---|---|
| `pre-request` | The prompt/messages before they reach the LLM provider |
| `post-response` | The LLM response before it reaches the application |
| `tool-call` | Tool call arguments in agentic workflows |
| `tool-response` | Tool call responses in agentic workflows |

## Rule actions

| Action | Effect |
|---|---|
| `block` | Reject the request/response entirely |
| `redact` | Replace matched content with `[REDACTED]` or a custom mask |
| `flag` | Allow but emit a violation audit event |
| `enforce` | Evaluate structured enforcement types (provider allowlist, data residency, etc.) |

## Streaming modes

```yaml
rules:
  - id: redact-pii-outbound
    stage: post-response
    action: redact
    targets:
      - type: pii
        categories: [email, ssn]
    streaming:
      mode: window           # buffer (default) | window | passthrough
      window_tokens: 64      # rolling window size (window mode only)
      on_stream_violation: block  # block | passthrough_and_log
```

## Provider scoping

```yaml
rules:
  - id: vision-pii-rule
    stage: pre-request
    action: redact
    providers: [openai/*, anthropic/*, "!ollama/*"]
    provider_match:
      capabilities: [vision]
      risk_tier: [low, medium]
      blocked_training_jurisdictions: [CN, RU]
    targets:
      - type: pii
        categories: [pii_all]
```

## Data sovereignty

```yaml
rules:
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
    transfer_mechanism:
      require_one_of: [adequacy_decision, standard_contractual_clauses]
    legal_basis: gdpr_article_6_1_b
    on_violation: block
```

## Full specification

- **SPEC.md:** [../SPEC.md](../SPEC.md) — 32 sections covering every field, constraint, and conformance requirement  
- **JSON Schema:** [../schema/tps-v1.json](../schema/tps-v1.json) — Draft 2020-12, use with `tg validate`  
- **Examples:** [../examples/](../examples/) — HIPAA, GDPR, EU AI Act, RAG grounding, multi-environment
