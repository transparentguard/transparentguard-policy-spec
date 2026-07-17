# TransparentGuard Policy Spec Changelog

All notable changes to the TransparentGuard Policy Spec are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This spec follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — Phase 9: Provider Scoping and Data Sovereignty

### Added

**Rule-level provider scoping — Tier 1 (Section 30)**
- `providers` field on rule objects: a glob list of `provider/model` patterns that scope a rule to specific providers.
- When set, the rule is **skipped** (not blocked) for providers that don't match — distinct from `enforce_type: provider_allowlist` which blocks the call.
- Supports wildcards (`openai/*`), negations (`!deepseek/*`), and `any`.
- Negations evaluated first: `["!deepseek/*", "any"]` blocks deepseek, allows all others.
- Missing provider field on payload → rule evaluates (fail-open for unscoped rules).

**Rule-level provider scoping — Tiers 2 & 3 (Section 30)**
- `provider_match` field on rule objects: capability, risk-tier, training-cutoff, training-jurisdiction, and attestation matching.
- `capabilities`: rule skipped if provider lacks any required capability.
- `risk_tier`: rule skipped if provider's risk tier is not in the accepted list.
- `min_context_window`: rule skipped if provider context window is below threshold.
- `training_cutoff_after`: rule skipped if provider training cutoff precedes this date.
- `blocked_training_jurisdictions` (on `provider_match`): rule skipped if provider trained in any listed country.
- `requires_attestation`: rule skipped if provider lacks any required compliance attestation.
- `requires_signed_response`: rule skipped unless provider returns TG-compatible signed response.
- `excludes`: explicit glob exclusion list evaluated before positive criteria.
- Unknown providers (not in registry) with attestation requirements → rule skipped (fail-open).

**TG Provider Registry (Section 30.7)**
- `packages/runtime/src/registry/provider-registry.ts` — embedded open registry of AI providers.
- Initial entries: OpenAI, Anthropic, Google DeepMind, Mistral AI, Cohere, AWS Bedrock, Azure OpenAI, DeepSeek, Ollama, Hugging Face, Replicate.
- Per-provider fields: `headquarters_jurisdiction`, `training_jurisdictions`, `processing_regions`, `capabilities`, `risk_tier`, `max_context_window`, `training_cutoff`, `attestations`, `supports_signed_responses`.
- Model-level overrides that merge with provider defaults.
- `registry/REGISTRY.md` — open registry documentation, capability identifiers, attestation identifiers, risk tier definitions, submission process.
- `PROVIDER_REGISTRY.getProvider("openai/gpt-4o")` returns merged provider+model entry.
- All provider scoping exports available from `@transparentguard/runtime` barrel.

**`enforce_type: data_sovereignty` (Section 31)**
- New enforce type that extends `data_residency` with a full three-jurisdiction model.
- `data_subject_jurisdiction` — configures who this rule applies to and how jurisdiction is inferred (`geo_ip`, `request_header`, `metadata`). `accept` list with `EU`/`EEA` shorthand expansion. Rule is skipped (not violated) when subject is outside the accept list.
- `allowed_processor_regions` — cloud regions where AI processing is permitted. Prefix wildcards supported (`eu-*`).
- `blocked_processor_jurisdictions` — ISO 3166-1 alpha-2 codes. Takes precedence over `allowed_processor_regions`. Evaluated against the embedded region→jurisdiction mapping table covering all AWS, GCP, and Azure regions.
- `blocked_training_jurisdictions` (on rule) — blocks calls to providers whose models were trained in listed countries. Resolved from TG Provider Registry.
- `transfer_mechanism.require_one_of` — verifies a lawful GDPR transfer mechanism is in place. Values: `adequacy_decision`, `standard_contractual_clauses`, `binding_corporate_rules`, `derogation`. Adequacy decisions resolved from embedded table; SCCs/BCRs asserted via `metadata.tg_transfer_mechanism`.
- `legal_basis` — machine-readable legal basis code emitted in every sovereignty audit event (does not affect enforcement).
- Full sovereignty audit trail: `subject_jurisdiction`, `processor_jurisdiction`, `processor_region`, `transfer_mechanism_used`, `legal_basis` emitted as tags on every audit event from a sovereignty rule.

**TG Adequacy Decision Table (Section 31.5)**
- `packages/runtime/src/registry/adequacy-decisions.ts` — embedded EU Commission adequacy decision table.
- Full adequacy: Andorra, Argentina, Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, New Zealand, Republic of Korea, Switzerland, UK, Uruguay.
- Conditional adequacy: Canada (PIPEDA sector), United States (DPF-certified organizations).
- Not-adequate entries for CN, RU, BY, IR, IN, BR (non-exhaustive).
- `isAdequate()`, `getAdequacyStatus()`, `isInEEA()`, `EU_EEA_JURISDICTIONS` exported from runtime barrel.

**New example**
- `examples/data-sovereignty.yaml` — full working example covering EU GDPR sovereignty, US HIPAA sovereignty, capability-scoped PII redaction, and high-risk provider blocking.

**Schema updates (tps-v1.json)**
- `providers` and `provider_match` fields added to rule object.
- `data_sovereignty` added to `enforce_type` enum.
- `data_subject_jurisdiction`, `allowed_processor_regions`, `blocked_processor_jurisdictions`, `blocked_training_jurisdictions`, `transfer_mechanism`, `legal_basis` fields added to rule object.
- New `$defs/provider_match`, `$defs/data_subject_jurisdiction`, `$defs/transfer_mechanism` definitions.
- New `allOf` conditional: `data_sovereignty` enforce type requires at least one of `allowed_processor_regions`, `blocked_processor_jurisdictions`, or `blocked_training_jurisdictions`.
- `allowed_regions` description updated to note `data_sovereignty` with `allowed_processor_regions` is preferred for new deployments.

**Runtime exports**
- `ProviderCapabilityMatch`, `DataSubjectJurisdiction`, `TransferMechanismConfig` types exported from `@transparentguard/runtime`.
- `providerMatchesRuleScope`, `matchesProviderGlob` exported.
- `enforceDataSovereignty` exported.
- `PROVIDER_REGISTRY`, `ProviderRegistryEntry` exported.
- `ADEQUACY_DECISIONS`, `AdequacyEntry`, `TransferMechanism`, `getAdequacyStatus`, `isAdequate`, `isInEEA`, `EU_EEA_JURISDICTIONS` exported.

### Changed

- `EnforceType` union in `packages/runtime/src/types.ts` extended with `"data_sovereignty"`.
- `TPSRule` interface extended with all new provider scoping and sovereignty fields.
- Engine `evaluateRule()` now checks `providerMatchesRuleScope()` before dispatching to any rule evaluator.
- `enforce_type: provider_allowlist` description updated to clarify the distinction from rule-level `providers` scoping.

---

## [Unreleased] — Runtime v0.3.1 enforcement tightening

### Changed

**Free tier now requires an API key**
- All free tier users must obtain a `tg_sk_live_` API key via signup at transparentguard.com.
- The key is free, permanent, and requires no credit card.
- Set `TG_API_KEY` in your environment before initializing the runtime.
- Previously, the free tier ran without any API key. This is no longer supported.
- Air-gapped and enterprise deployments are unaffected and continue to use `TG_LICENSE_KEY`.

### Changed (continued)

**License enforcement — fail-closed on API unreachability**
- The runtime no longer silently downgrades to the free tier when the TransparentGuard license API is unreachable.
- New behavior: if a valid license status was cached within the last hour (grace window), that status is used and a warning is logged. If no grace cache is available, the runtime throws `TransparentGuardError` with code `api_unreachable` rather than continuing as free.
- This prevents the bypass vector where network-isolating the license server allowed indefinite free-tier operation.

**Audit chain integrity — gated on `audit_chain_integrity` feature**
- `audit.chain_integrity.enabled: true` in a TPS policy now requires the `audit_chain_integrity` license feature (Startup tier and above).
- Free-tier callers with `chain_integrity` configured will see a warning logged and chain integrity will be silently disabled (fields `prev_event_hash` and `chain_sequence` will not be set on audit events).
- Previously, chain integrity ran for any caller who configured it.

**Threshold breach notifications — gated on `threshold_notifications` feature**
- `action: notify` (outbound webhook) and `action: block_all` (system-wide suspension) in `thresholds` now require the `threshold_notifications` license feature (Startup tier and above).
- Free-tier callers will see a per-trigger warning logged; the violation is still counted and the `threshold_triggered` audit event is still emitted, but the outbound action is suppressed.
- `action: escalate` is unaffected — it only sets evaluation tags and produces no outbound I/O or system state changes, so it remains available on all tiers.
- Previously, all threshold actions ran regardless of license tier.

**Compliance framework templates — gated on `compliance_frameworks` feature**
- `compliance_frameworks` in a TPS policy now requires the `compliance_frameworks` license feature (Startup tier and above).
- Free-tier callers that declare `compliance_frameworks` will receive `TransparentGuardError` with code `feature_requires_paid_tier`.
- Previously, all framework rule sets (HIPAA, GDPR, SOC 2, EU AI Act, FedRAMP) ran regardless of license tier.

**Custom classifier registry — gated on `oem_embed` feature**
- Resolving a classifier via `custom_classifiers` in a TPS policy or via `registerClassifier()` now requires the `oem_embed` license feature (OEM tier).
- Previously, custom classifiers ran for any caller who configured them.

**PIE shadow mode — gated on `pie` feature**
- `pie.shadow_mode` in a TPS policy is silently disabled unless the `pie` license feature is present (Growth tier and above).
- Non-throwing: shadow mode simply does not run rather than erroring, since it is a background observability feature.

**Evaluation receipts — gated on `trust_chain` feature**
- Signed ECDSA-P256 evaluation receipts are only generated when the `trust_chain` license feature is present (Enterprise tier and above).
- Previously, receipts were generated unconditionally for all callers.

### Added

**New `LicenseFeature` values**
- `"trust_chain"` — controls receipt generation and key rotation watcher access.
- `"pie"` — controls PIE shadow mode and drift detection.
- `"audit_chain_integrity"` — controls SHA-256/SHA3-256 Merkle chain on audit logs.
- `"threshold_notifications"` — controls `action: notify` webhook delivery and `action: block_all` system suspension.

**Threshold `action: escalate` remains free** — it only tags the evaluation context; no outbound I/O or system state change occurs.

---

## [1.0.0] - 2026-07-12

Initial stable release of the TransparentGuard Policy Spec.

### Added

**Core structure**
- `tps_version` field declaring the spec version targeted by a policy file.
- `name` and `description` top-level fields.
- `provider` field supporting `any` or a list of provider identifiers with `{provider}/{model}` and `{provider}/*` syntax.
- `environments` section with `name`, `strict`, `active_rules`, `disabled_rules`, and `on_unknown_provider` fields.
- `rules` section with full rule object schema.
- `compliance_frameworks` section.
- `audit` section.

**Rule system**
- `redact` action with `pii`, `pattern`, `keyword`, and `semantic` target types.
- `classify` action with `classifier`, `threshold`, and `invert_threshold` fields.
- `enforce` action with `enforce_type` values: `provider_allowlist`, `token_budget`, `data_residency`, `rate_limit`, `schema_validation`, `confidentiality`, `factual_grounding`.
- `tag` action.
- `block` action with `block_message`.
- `log` action with `log_level`.
- `on_violation` values: `block`, `redact`, `warn`, `log`, `allow`.
- `enabled`, `log`, and `metadata` fields on all rule objects.

**PII categories**
- Personal Identifiers: `name`, `email`, `phone`, `address`, `ip_address`, `username`, `device_id`, `url`.
- Government Identifiers: `ssn`, `passport`, `driver_license`, `national_id`, `tax_id`, `voter_id`.
- Financial Identifiers: `credit_card`, `bank_account`, `iban`, `swift`, `crypto_address`.
- Healthcare Identifiers: `mrn`, `dob`, `age`, `health_condition`, `insurance_id`, `npi`, `dea`.
- Sensitive Attributes: `race`, `religion`, `political_opinion`, `sexual_orientation`, `biometric`, `genetic`, `union_membership`.
- Shortcut categories: `phi`, `pii_standard`, `pii_financial`, `pii_sensitive`, `pii_all`.

**Built-in classifiers**
- `built-in/prompt-injection-v1` and `built-in/prompt-injection-v2`
- `built-in/toxicity-v1`
- `built-in/hate-speech-v1`
- `built-in/sexual-content-v1`
- `built-in/violence-v1`
- `built-in/self-harm-v1`
- `built-in/factual-grounding-v1`
- `built-in/pii-general-v1`
- `built-in/semantic-v1`

**Compliance frameworks**
- `hipaa`
- `gdpr`
- `eu-ai-act`
- `soc2`
- `fedramp-moderate`
- `ccpa`

**Audit system**
- Destinations: `file://`, `s3://`, `gs://`, `az://`, `postgres://`, `http://`, `stdout://`.
- Formats: `ndjson`, `json`.
- `retention_days`, `include_redacted_content`, `include_full_request`, `include_full_response`.
- `events` filter list.
- `batch_size` and `flush_interval_ms`.
- Standard audit event format v1.0 with `tg_event_version`, `event_id`, `outcome`, and full per-rule evaluation records.

**Deny by default mode (Section 20)**
- `default_action` top-level field with values `allow` (default) and `deny`.
- Zero-trust posture: `default_action: deny` blocks any call not explicitly permitted by an `on_violation: allow` rule.
- Startup warning when `default_action: deny` is set with no allow rules.
- `catch-all-block` rule ID convention for suppressing the startup warning.

**Policy inheritance (Section 21)**
- `extends` top-level field accepting local file paths, `tps://` registry URIs, and `https://` URIs.
- Defined merge semantics for rules (append with override by ID), environments (replace), compliance_frameworks (union), audit (replace), and default_action (override).
- Official TPS Policy Registry at `tps://transparentguard.dev/policies/`.
- Remote URI fetching with TTL-based caching and strict-mode fallback behavior.
- Maximum inheritance chain depth of 5 levels with circular inheritance detection.

**Agentic AI and tool call rules (Section 22)**
- `stage: tool-call` for rules that fire when an agentic model issues a tool call intent.
- `enforce_type: tool_allowlist` with `allowed_tools`, `blocked_tools`, and `tool_argument_targets` fields.
- Tool call audit events with `tool_name`, `arguments`, `call_index`, and `agent_loop_step` fields.
- Trust level tagging for sub-agent calls via `tg_agent_trust_level` tag.
- Synthetic tool response injection when a tool call is blocked (agent loop continues).

**Canary tokens (Section 23)**
- `canary_tokens: true` field on confidentiality enforce rules.
- Per-request random token embedding into protected content before forwarding to provider.
- Exact-match binary detection with no false positives.
- Canary token audit fields: `token_id`, `embedded`, `detected_in_response`, `detection_method`.
- Documented interaction with `similarity_threshold` (both run independently, violation fires if either triggers).

**Rule sampling (Section 24)**
- `sample_rate` field on all rule objects (float, exclusive 0.0 to inclusive 1.0, default 1.0).
- Deterministic sampling decision derived from `request_id` and `rule_id` for consistent replay.
- `sampled_out` audit event result for rules not evaluated due to sampling.
- Startup warning when a `block` rule has `sample_rate` below 1.0.
- `metadata.sampling_rationale` convention for suppressing the warning.
- Recommended sample rate table by rule type.

**Streaming-aware enforcement (Section 25)**
- `streaming` field on rule objects with `mode` (`buffer`, `window`, `passthrough`), `window_tokens`, and `on_stream_violation`.
- `audit.streaming` global default streaming configuration.
- Rule-level `streaming` overrides the global audit default.
- Mid-stream violation termination with structured SSE error event.
- Recommended `window_tokens` values by detection target type.

**Cryptographic policy signing (Section 26)**
- `signature` top-level block with `algorithm`, `key_id`, `signed_at`, `value`, and `required` fields.
- Supported algorithms: `ed25519` (recommended), `rsa-pss-sha256`, `ecdsa-p256-sha256`.
- Canonical form for signing defined as JSON Canonical Form per RFC 8785 with the `signature` field removed.
- Keyring configuration format with per-key validity windows.
- CLI commands: `transparentguard keys generate`, `transparentguard sign`, `transparentguard verify`.

**Policy testing syntax (Section 27)**
- `tests` top-level list of inline unit test objects.
- Test fields: `id`, `description`, `stage`, `input`, `expect`.
- `input` supports `messages`, `response`, `tool_call`, `provider`, and `model_parameters`.
- `expect` supports `outcome`, `rules_triggered` (with `action_taken` and `min_violations`), `rules_not_triggered`, and `redactions`.
- `transparentguard test` CLI command with structured pass/fail output and exit code 0/1.

**Tamper-Evident Audit Log Chaining (Section 28)**
- `audit.chain_integrity` configuration object with `enabled`, `algorithm`, `sidecar_path`, `verify_on_startup`, and `alert_on_break` fields.
- `previous_event_hash` and `chain_sequence` fields added to the standard audit event format (Section 14).
- Every audit event includes the cryptographic hash of the previous event computed over its RFC 8785 canonical JSON form with `previous_event_hash` excluded.
- Supported hash algorithms: `sha256` (default, FIPS 180-4) and `sha3-256` (FIPS 202).
- Chain root nonce: a 32-byte random value stored in the sidecar file that anchors the chain and prevents wholesale chain replacement attacks.
- Chain sidecar file format specified with atomic write-then-rename requirement to prevent corruption.
- `transparentguard audit verify-chain` CLI command with plain text and JSON output formats and exit code 0/1 for CI use.
- `chain_break` event type for `audit.notify` delivery when a break is detected.
- Regulatory significance documented for HIPAA 45 CFR 164.312(b), GDPR Article 32, EU AI Act Article 12, and SOC 2 CC7.2 and CC9.1.
- Validation rules 44, 45, and 46 covering algorithm values, startup behavior, and sidecar path requirements.
- New conformance requirements covering chain computation, sidecar maintenance, startup verification, and break alerting.

**Automated Breach Notification Triggers (Section 29)**
- `thresholds` top-level list with full threshold object schema.
- Threshold fields: `id`, `description`, `rule_id`, `violation_type`, `count`, `window`, `action`, `notify_url`, `payload_template`, `block_message`, `enabled`, `metadata`.
- `violation_type` values: `blocked`, `redacted`, `warned`, `error`, `sampled_out`.
- `window` duration syntax specified: integer plus unit suffix (`m`, `h`, `d`) with no space, rolling not fixed.
- `action` values: `notify` (async webhook POST), `block_all` (immediate system suspension), `escalate` (tag-based severity elevation).
- `payload_template` values: `hipaa-breach-v1`, `gdpr-article-33`, `eu-ai-act-article-73`, `soc2-incident-v1`, and `custom/{identifier}`.
- All four payload template output formats fully specified with exact field names and auto-populated vs. required-human-input field distinction.
- `threshold_triggered` audit event format specified with `discovery_timestamp` as the legally significant detection timestamp for regulatory deadline calculation.
- HIPAA: 60-day notification clock anchor, 45 CFR 164.400-414 field set, HHS form field mapping.
- GDPR: 72-hour notification deadline calculation, Article 33(3) field set, DPO contact propagation.
- EU AI Act: Article 73 serious incident field set, risk classification propagation, `block_all` action as suspension demonstration.
- SOC 2: CC7.2 and CC9.1 incident record field set, severity and containment fields.
- Regulatory compliance reference table with notification deadlines and trigger strategies per framework.
- Full YAML configuration examples for HIPAA, GDPR, and EU AI Act production deployments.
- Validation rules 36 through 43 covering threshold ID uniqueness, rule_id reference validity, violation_type values, window syntax, count constraints, action values, notify_url scheme, and payload_template identifiers.
- New conformance requirements covering threshold evaluation, action delivery, regulation-formatted payload generation, and threshold_triggered audit event emission.

**JSON Schema (tps-v1.json)**
- `schema/tps-v1.json` JSON Schema (Draft 2020-12) covering all base and extended fields.
- `allOf` conditional validation for action-specific required fields.
- `tool-call` stage constraint limiting permitted actions.
- `$defs/threshold` object with full field validation and `allOf` conditionals for `notify_url` and `block_message` requirements.
- `$defs/audit_chain_integrity` object with full field validation.
- `thresholds` added to top-level properties.
- `chain_integrity` added to `$defs/audit` properties.
- `previous_event_hash` and `chain_sequence` documented in Section 14.
- Complete `$defs` for `rule_streaming`, `audit_notify`, `audit_streaming`, `signature`, `policy_test`, `threshold`, and `audit_chain_integrity`.

**Validation rules**
- 46 total validation rules (expanded from 35).
- Rules 36-43 cover threshold and chain integrity constraints.
- Rules 44-46 cover chain integrity configuration constraints.

**Examples**
- `examples/minimal.yaml`
- `examples/basic-safety.yaml`
- `examples/hipaa.yaml`
- `examples/eu-gdpr.yaml`
- `examples/eu-ai-act.yaml`
- `examples/rag-grounding.yaml`
- `examples/multi-environment.yaml`
