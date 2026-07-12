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
