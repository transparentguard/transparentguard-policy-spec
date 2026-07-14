---
name: Phase 5 compliance layer
description: What was built in Phase 5, key decisions, and where things live in the runtime package.
---

## What Phase 5 adds (runtime v0.3.0)

**Compliance framework templates** — `packages/runtime/templates/`: hipaa.yaml, gdpr.yaml, soc2.yaml, fedramp.yaml. Activate with `compliance_frameworks: [fedramp-moderate]` (key must match `ComplianceFramework` type exactly).

**Advanced classifiers** — `src/evaluators/built-in/pii-medical-v1.ts` and `pii-financial-v1.ts`. Registered in `heuristicClassify` via `case "built-in/pii-medical-v1"` etc. Medical: CPT, ICD-10, NDC, NPI, lab values. Financial: ABA checksum, CUSIP, ISIN, LEI, MICR, ACH.

**Custom classifier registry** — `src/evaluators/classifier-registry.ts`. Exports `registerClassifier`, `resolveCustomClassifier`, `getClassifier`. `CustomClassifierDef` is the local registry type; `CustomClassifierSpec` in types.ts is the policy schema type — same shape, structural typing makes them compatible.

**PIE shadow mode** — `src/pie/shadow.ts`. `runShadowClassifier()` fires in `queueMicrotask`, never blocks. Logs `tg.pie.shadow_disagreement` JSON to stdout when |delta| > threshold.

**PIE drift detection** — `src/pie/drift.ts`. `checkFrameworkDrift(frameworks)` returns warnings for any framework whose runtime template version lags the latest known regulatory guidance.

**PIE evidence export** — `src/pie/evidence.ts`. `generateEvidencePackage(events, framework, opts)` returns a structured JSON package with per-control status for SOC 2, FedRAMP, HIPAA, and GDPR auditors.

**Trust chain receipts** — `src/trust/receipt.ts`. `generateReceipt()` produces ECDSA-P256 signed receipt; falls back to ephemeral key if `TG_SIGNING_KEY` env is not set. `EvaluationReceipt` interface is defined in `types.ts` and imported in receipt.ts (not the other way around).

**Key rotation watcher** — `src/trust/keys.ts`. `startKeyRotationWatcher(url)` polls JWK endpoint on a timer; uses `unref()` to avoid holding the event loop.

**Receipt in evaluate()** — `generateReceipt` is called at the end of `evaluate()` and attached as `result.receipt`. Can be skipped per-call with `options.generateReceipt === false`.

## Key decisions
**Why:** `EvaluationReceipt` defined in `types.ts`, imported in `receipt.ts` — avoids circular dep. Receipt never fails evaluation (returns `null` on error, converted to `undefined`).
**Why:** Shadow mode uses `queueMicrotask` — semantically "after current sync work, before I/O" — appropriate for a non-blocking fire-and-forget that still runs in the same event loop tick.
**Why:** `PIEShadowModeConfig` is defined in both `types.ts` (for policy schema) and `pie/shadow.ts` (for the function signature) — same shape, TypeScript structural typing accepts them interchangeably.

## GitHub
Tag: v0.3.0 on `transparentguard/runtime` main. All 22 files (14 new, 8 modified).
