"use strict";
/**
 * TransparentGuard Runtime — Evaluation Engine
 * The core rule graph builder and evaluate() function.
 * Implements all TPS v1.0 rule types.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandCategories = void 0;
exports.evaluate = evaluate;
const crypto_1 = __importDefault(require("crypto"));
const emitter_js_1 = require("./audit/emitter.js");
const pii_js_1 = require("./evaluators/pii.js");
Object.defineProperty(exports, "expandCategories", { enumerable: true, get: function () { return pii_js_1.expandCategories; } });
const classifier_api_js_1 = require("./evaluators/classifier-api.js");
const provider_allowlist_js_1 = require("./enforcements/provider-allowlist.js");
const token_budget_js_1 = require("./enforcements/token-budget.js");
const rate_limit_js_1 = require("./enforcements/rate-limit.js");
const tool_allowlist_js_1 = require("./enforcements/tool-allowlist.js");
const schema_validation_js_1 = require("./enforcements/schema-validation.js");
const confidentiality_js_1 = require("./enforcements/confidentiality.js");
const data_residency_js_1 = require("./enforcements/data-residency.js");
const data_sovereignty_js_1 = require("./enforcements/data-sovereignty.js");
const provider_scoping_js_1 = require("./enforcements/provider-scoping.js");
const engine_js_1 = require("./threshold/engine.js");
const checker_js_1 = require("./license/checker.js");
// ---------------------------------------------------------------------------
// Compliance framework rule injection
// Per spec Section 15: framework rules are PREPENDED before user-declared rules.
// ---------------------------------------------------------------------------
const hipaa_js_1 = require("./frameworks/hipaa.js");
const gdpr_js_1 = require("./frameworks/gdpr.js");
const eu_ai_act_js_1 = require("./frameworks/eu-ai-act.js");
const soc2_js_1 = require("./frameworks/soc2.js");
const fedramp_js_1 = require("./frameworks/fedramp.js");
const classifier_registry_js_1 = require("./evaluators/classifier-registry.js");
const shadow_js_1 = require("./pie/shadow.js");
const receipt_js_1 = require("./trust/receipt.js");
const FRAMEWORK_RULES = {
    hipaa: hipaa_js_1.HIPAA_RULES,
    gdpr: gdpr_js_1.GDPR_RULES,
    "eu-ai-act": eu_ai_act_js_1.EU_AI_ACT_RULES,
    soc2: soc2_js_1.SOC2_RULES,
    "fedramp-moderate": fedramp_js_1.FEDRAMP_RULES,
};
const DEFAULT_API_BASE = "https://api.transparentguard.dev";
// ---------------------------------------------------------------------------
// Stage matching
// ---------------------------------------------------------------------------
function stageMatches(ruleStage, evaluationStage) {
    if (ruleStage === "both")
        return evaluationStage === "pre-request" || evaluationStage === "post-response";
    return ruleStage === evaluationStage;
}
/**
 * Determines if a rule should be evaluated based on sample_rate.
 * Uses a deterministic hash of requestId + ruleId so the same call
 * produces the same sampling decision on replay.
 */
function shouldSampleRule(rule, requestId) {
    if (!rule.sample_rate || rule.sample_rate >= 1.0)
        return true;
    const hash = crypto_1.default
        .createHash("sha256")
        .update(`${requestId}:${rule.id}`)
        .digest("hex");
    const fraction = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    return fraction < rule.sample_rate;
}
/**
 * Determines the active rules for a given environment.
 */
function getActiveRules(policy, environment) {
    const baseRules = policy.rules.filter((r) => r.enabled !== false);
    if (!environment)
        return baseRules;
    const env = policy.environments?.find((e) => e.name === environment);
    if (!env)
        return baseRules;
    let active = baseRules;
    if (env.active_rules?.length) {
        const allowed = new Set(env.active_rules);
        active = active.filter((r) => allowed.has(r.id));
    }
    else if (env.disabled_rules?.length) {
        const disabled = new Set(env.disabled_rules);
        active = active.filter((r) => !disabled.has(r.id));
    }
    return active;
}
// ---------------------------------------------------------------------------
// Individual rule evaluators
// ---------------------------------------------------------------------------
async function evaluateRule(rule, ctx) {
    // ── Rule-level provider scoping (Tiers 1-3, Section 30) ─────────────────
    // A scope miss SKIPS the rule — it does not block the call.
    if (!(0, provider_scoping_js_1.providerMatchesRuleScope)(rule, ctx)) {
        const providerName = "provider" in ctx.payload ? (ctx.payload.provider ?? "unknown") : "unknown";
        return {
            ruleId: rule.id,
            outcome: "skipped",
            auditEvent: (0, emitter_js_1.buildAuditEvent)({
                policy: ctx.policy, rule, eventType: "allowed", stage: ctx.stage,
                payload: ctx.payload, tags: ctx.tags, requestId: ctx.requestId,
                detail: `Rule "${rule.id}" skipped: provider "${providerName}" is not in this rule's scope.`,
            }),
        };
    }
    switch (rule.action) {
        case "redact":
            return evaluateRedact(rule, ctx);
        case "classify":
            return evaluateClassify(rule, ctx);
        case "enforce":
            return evaluateEnforce(rule, ctx);
        case "tag":
            return evaluateTag(rule, ctx);
        case "block":
            return evaluateBlock(rule, ctx);
        case "log":
            return evaluateLog(rule, ctx);
        default:
            return {
                ruleId: rule.id,
                outcome: "skipped",
                auditEvent: (0, emitter_js_1.buildAuditEvent)({
                    policy: ctx.policy, rule, eventType: "error", stage: ctx.stage,
                    payload: ctx.payload, tags: ctx.tags, requestId: ctx.requestId,
                    detail: `Unknown rule action: ${String(rule.action)}`,
                }),
            };
    }
}
async function evaluateRedact(rule, ctx) {
    const { payload, policy, stage, requestId, tags } = ctx;
    const targets = rule.targets ?? [];
    const allViolations = [];
    let currentPayload = { ...payload };
    for (const target of targets) {
        if (target.type === "pii") {
            const texts = extractTexts(currentPayload);
            let hasMatch = false;
            for (const { key, text } of texts) {
                const matches = (0, pii_js_1.detectPii)(text, target);
                if (matches.length === 0)
                    continue;
                hasMatch = true;
                const redacted = (0, pii_js_1.redactText)(text, matches);
                currentPayload = applyRedactedText(currentPayload, key, redacted);
                for (const match of matches) {
                    allViolations.push({
                        rule_id: rule.id,
                        rule_description: rule.description,
                        outcome: "redacted",
                        detail: `Redacted ${match.category} at position ${match.start}–${match.end}`,
                        category: match.category,
                        span: { start: match.start, end: match.end, original: match.original },
                    });
                }
            }
            if (!hasMatch)
                continue;
        }
        else if (target.type === "pattern") {
            const texts = extractTexts(currentPayload);
            for (const { key, text } of texts) {
                const flags = buildPatternFlags(target.flags);
                let re;
                try {
                    re = new RegExp(target.pattern, flags);
                }
                catch {
                    continue;
                }
                const newText = text.replace(re, "[REDACTED:PATTERN]");
                if (newText !== text) {
                    currentPayload = applyRedactedText(currentPayload, key, newText);
                    allViolations.push({
                        rule_id: rule.id,
                        rule_description: rule.description,
                        outcome: "redacted",
                        detail: `Redacted pattern match: ${target.description ?? target.pattern}`,
                        category: "pattern",
                    });
                }
            }
        }
        else if (target.type === "keyword") {
            const texts = extractTexts(currentPayload);
            for (const { key, text } of texts) {
                let newText = text;
                const caseSensitive = target.case_sensitive !== false;
                for (const keyword of target.keywords) {
                    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const pattern = target.match_mode === "substring"
                        ? escaped
                        : `\\b${escaped}\\b`;
                    const re = new RegExp(pattern, caseSensitive ? "g" : "gi");
                    if (re.test(newText)) {
                        newText = newText.replace(re, "[REDACTED:KEYWORD]");
                        allViolations.push({
                            rule_id: rule.id,
                            rule_description: rule.description,
                            outcome: "redacted",
                            detail: `Redacted keyword: "${keyword}"`,
                            category: "keyword",
                        });
                    }
                }
                if (newText !== text) {
                    currentPayload = applyRedactedText(currentPayload, key, newText);
                }
            }
        }
        else if (target.type === "semantic") {
            // Semantic redact requires paid-tier ML classifiers
            if (!ctx.isPaidTier) {
                allViolations.push({
                    rule_id: rule.id,
                    rule_description: rule.description,
                    outcome: "warned",
                    detail: "Semantic target redaction requires a paid TransparentGuard plan.",
                    category: "semantic_not_available",
                });
            }
            // Paid-tier implementation delegated to the classifier API
        }
    }
    if (allViolations.length === 0) {
        return {
            ruleId: rule.id,
            outcome: "passed",
            auditEvent: (0, emitter_js_1.buildAuditEvent)({
                policy, rule, eventType: "allowed", stage, payload, tags, requestId,
            }),
        };
    }
    const onViolation = rule.on_violation ?? "redact";
    if (onViolation === "block") {
        return {
            ruleId: rule.id,
            outcome: "blocked",
            violation: allViolations[0],
            auditEvent: (0, emitter_js_1.buildAuditEvent)({
                policy, rule, eventType: "blocked", stage, payload, tags, requestId,
                detail: allViolations[0]?.detail,
            }),
        };
    }
    return {
        ruleId: rule.id,
        outcome: "redacted",
        violation: allViolations[0],
        payload: currentPayload,
        auditEvent: (0, emitter_js_1.buildAuditEvent)({
            policy, rule, eventType: "redacted", stage, payload, tags, requestId,
            detail: `${allViolations.length} item(s) redacted`,
        }),
    };
}
async function evaluateClassify(rule, ctx) {
    const { payload, policy, stage, requestId, tags, apiKey, apiBaseUrl, isPaidTier, licenseStatus } = ctx;
    const classifier = rule.classifier;
    const threshold = rule.threshold;
    const invertThreshold = rule.invert_threshold ?? false;
    const text = extractPrimaryText(payload);
    let score;
    let source;
    // Check custom classifier registry first (policy-defined or process-registered)
    const customSpec = ctx.policy.custom_classifiers?.find((c) => c.name === classifier) ??
        (0, classifier_registry_js_1.getClassifier)(classifier);
    if (customSpec) {
        // Custom classifier registry requires OEM embed license
        (0, checker_js_1.assertFeature)(licenseStatus, "oem_embed", "Custom classifier registry");
        const result = await (0, classifier_registry_js_1.resolveCustomClassifier)(text, customSpec);
        score = result.score;
        source = result.source;
    }
    else if (isPaidTier && apiKey) {
        try {
            const result = await (0, classifier_api_js_1.callClassifierApi)({ classifier, text, stage }, apiKey, apiBaseUrl);
            score = result.score;
            source = result.source;
        }
        catch {
            // API failure — fall back to heuristic
            const result = (0, classifier_api_js_1.heuristicClassify)(classifier, text);
            score = result.score;
            source = result.source + " (fallback)";
        }
    }
    else {
        const result = (0, classifier_api_js_1.heuristicClassify)(classifier, text);
        score = result.score;
        source = result.source;
    }
    // PIE shadow mode — paid feature (Growth+), non-blocking, never affects outcome
    (0, shadow_js_1.runShadowClassifier)(classifier, text, score, licenseStatus.features.includes("pie") ? ctx.policy.pie?.shadow_mode : undefined, ctx.requestId, (clf, t) => (0, classifier_api_js_1.heuristicClassify)(clf, t));
    const triggered = invertThreshold ? score < threshold : score >= threshold;
    if (!triggered) {
        return {
            ruleId: rule.id,
            outcome: "passed",
            auditEvent: (0, emitter_js_1.buildAuditEvent)({
                policy, rule, eventType: "allowed", stage, payload, tags, requestId,
            }),
        };
    }
    const onViolation = rule.on_violation ?? "block";
    const outcome = onViolation === "block" ? "blocked" : "warned";
    const violation = {
        rule_id: rule.id,
        rule_description: rule.description,
        outcome,
        detail: `Classifier "${classifier}" returned score ${score.toFixed(3)} (threshold: ${threshold}, source: ${source})`,
        category: classifier,
    };
    return {
        ruleId: rule.id,
        outcome,
        violation,
        auditEvent: (0, emitter_js_1.buildAuditEvent)({
            policy, rule,
            eventType: outcome === "blocked" ? "blocked" : "warned",
            stage, payload, tags, requestId,
            detail: violation.detail,
        }),
    };
}
async function evaluateEnforce(rule, ctx) {
    const enforceCtx = { ...ctx, rule };
    switch (rule.enforce_type) {
        case "provider_allowlist":
            return (0, provider_allowlist_js_1.enforceProviderAllowlist)(enforceCtx);
        case "token_budget":
            return (0, token_budget_js_1.enforceTokenBudget)(enforceCtx);
        case "rate_limit":
            return (0, rate_limit_js_1.enforceRateLimit)(enforceCtx);
        case "tool_allowlist":
            return (0, tool_allowlist_js_1.enforceToolAllowlist)(enforceCtx);
        case "schema_validation":
            return (0, schema_validation_js_1.enforceSchemaValidation)(enforceCtx);
        case "confidentiality":
            return (0, confidentiality_js_1.enforceConfidentiality)(enforceCtx);
        case "data_residency":
            return (0, data_residency_js_1.enforceDataResidency)(enforceCtx);
        case "data_sovereignty":
            return (0, data_sovereignty_js_1.enforceDataSovereignty)(enforceCtx);
        case "factual_grounding": {
            const groundingRule = {
                ...rule,
                action: "classify",
                classifier: "built-in/factual-grounding-v1",
                threshold: rule.threshold ?? 0.50,
                invert_threshold: true,
            };
            return evaluateClassify(groundingRule, { ...ctx, rule: groundingRule });
        }
        default:
            return {
                ruleId: rule.id,
                outcome: "skipped",
                auditEvent: (0, emitter_js_1.buildAuditEvent)({
                    policy: ctx.policy, rule, eventType: "error", stage: ctx.stage,
                    payload: ctx.payload, tags: ctx.tags, requestId: ctx.requestId,
                    detail: `Unknown enforce_type: ${String(rule.enforce_type)}`,
                }),
            };
    }
}
async function evaluateTag(rule, ctx) {
    const { payload, policy, stage, requestId, tags } = ctx;
    Object.assign(tags, rule.tags ?? {});
    return {
        ruleId: rule.id,
        outcome: "passed",
        auditEvent: (0, emitter_js_1.buildAuditEvent)({
            policy, rule, eventType: "allowed", stage, payload, tags, requestId,
        }),
    };
}
async function evaluateBlock(rule, ctx) {
    const { payload, policy, stage, requestId, tags } = ctx;
    const message = rule.block_message ?? `Blocked by policy rule "${rule.id}"`;
    const violation = {
        rule_id: rule.id,
        rule_description: rule.description,
        outcome: "blocked",
        detail: message,
        category: "explicit_block",
    };
    return {
        ruleId: rule.id,
        outcome: "blocked",
        violation,
        auditEvent: (0, emitter_js_1.buildAuditEvent)({
            policy, rule, eventType: "blocked", stage, payload, tags, requestId, detail: message,
        }),
    };
}
async function evaluateLog(rule, ctx) {
    const { payload, policy, stage, requestId, tags } = ctx;
    return {
        ruleId: rule.id,
        outcome: "passed",
        auditEvent: (0, emitter_js_1.buildAuditEvent)({
            policy, rule, eventType: "allowed", stage, payload, tags, requestId,
        }),
    };
}
// ---------------------------------------------------------------------------
// Main evaluate() function — with fail_mode wrapper (Phase 10 / Section 3a)
// ---------------------------------------------------------------------------
/**
 * Core evaluation logic. Called by the public evaluate() wrapper.
 * Never call this directly — always call evaluate() so the fail_mode
 * try/catch wraps the entire execution.
 */
async function coreEvaluate(stage, payload, policy, licenseStatus, options = {}) {
    const requestId = options.requestId ?? (0, emitter_js_1.makeId)();
    const environment = options.environment;
    const apiKeyId = options.apiKeyId ?? ("api_key_id" in payload ? payload.api_key_id : undefined);
    const apiKey = options.apiKey; // injected by TransparentGuard class or caller
    const isPaidTier = licenseStatus.tier !== "free" || licenseStatus.trialActive;
    const apiBaseUrl = DEFAULT_API_BASE;
    // Check block_all state from threshold engine
    const blockAllState = (0, engine_js_1.getBlockAllState)();
    if (blockAllState.active) {
        return {
            allowed: false,
            payload,
            violations: [{
                    rule_id: blockAllState.thresholdId,
                    outcome: "blocked",
                    detail: blockAllState.message,
                    category: "threshold_block_all",
                }],
            tags: {},
            audit_events: [],
            evaluated_at: new Date().toISOString(),
            policy_name: policy.name,
        };
    }
    const tags = {};
    const allViolations = [];
    const allAuditEvents = [];
    let currentPayload = { ...payload };
    let blocked = false;
    let hasAnyViolation = false;
    // Gate compliance framework injection — requires paid license (Startup tier and above)
    if ((policy.compliance_frameworks ?? []).length > 0) {
        (0, checker_js_1.assertFeature)(licenseStatus, "compliance_frameworks", "Compliance framework templates (HIPAA, GDPR, EU AI Act, SOC 2, FedRAMP)");
    }
    // Per spec Section 15: compliance framework rules are PREPENDED before user rules.
    // Per spec Section 20.3 (deny-by-default): framework rules run first, then user rules.
    const frameworkRules = [];
    for (const framework of policy.compliance_frameworks ?? []) {
        const rules = FRAMEWORK_RULES[framework];
        if (rules)
            frameworkRules.push(...rules);
    }
    const userRules = getActiveRules(policy, environment);
    const allRules = [...frameworkRules, ...userRules];
    for (const rule of allRules) {
        // Skip rules that don't apply to this stage
        if (!stageMatches(rule.stage, stage))
            continue;
        // Skip explicitly disabled rules
        if (rule.enabled === false)
            continue;
        // Sampling — emit sampled_out audit event when rule is skipped
        if (!shouldSampleRule(rule, requestId)) {
            allAuditEvents.push((0, emitter_js_1.buildAuditEvent)({
                policy, rule, eventType: "sampled_out", stage,
                payload: currentPayload, tags, requestId,
                detail: `sampled_out (rate=${rule.sample_rate ?? 1})`,
            }));
            continue;
        }
        const ctx = {
            rule,
            stage,
            payload: currentPayload,
            policy,
            environment,
            requestId,
            apiKeyId,
            apiKey,
            apiBaseUrl,
            tags,
            isPaidTier,
            licenseStatus,
        };
        let result;
        try {
            result = await evaluateRule(rule, ctx);
        }
        catch (err) {
            const event = (0, emitter_js_1.buildAuditEvent)({
                policy, rule, eventType: "error", stage,
                payload: currentPayload, tags, requestId,
                detail: `Rule evaluation error: ${String(err)}`,
            });
            allAuditEvents.push(event);
            // Errors in individual rules do not block unless in strict mode
            const env = policy.environments?.find((e) => e.name === environment);
            if (env?.strict) {
                blocked = true;
                break;
            }
            continue;
        }
        allAuditEvents.push(result.auditEvent);
        if (result.payload) {
            currentPayload = result.payload;
        }
        if (result.violation) {
            allViolations.push(result.violation);
            hasAnyViolation = true;
            // Feed violation into threshold engine
            const thresholdResults = (0, engine_js_1.evaluateThresholds)(policy, rule.id, result.violation.outcome, policy.name, licenseStatus.features);
            for (const tf of thresholdResults) {
                allAuditEvents.push(tf.auditEvent);
                // If a threshold triggered block_all, set blocked flag for this call too
                if (tf.action === "block_all") {
                    blocked = true;
                }
            }
        }
        if (result.outcome === "blocked") {
            blocked = true;
            break;
        }
    }
    // Deny-by-default: if no violation occurred and no rule explicitly allowed,
    // block the call when default_action is "deny".
    // Per spec Section 20: the call is allowed only if at least one rule "passed"
    // — since all non-violating rules return "passed", we only block when no rules
    // ran at all for this stage and the policy is deny-by-default.
    if (!blocked && policy.default_action === "deny" && !hasAnyViolation) {
        const stageRules = allRules.filter((r) => stageMatches(r.stage, stage) && r.enabled !== false);
        if (stageRules.length === 0) {
            // No rules matched this stage — deny-by-default blocks the call
            blocked = true;
            allViolations.push({
                rule_id: "__default_deny__",
                outcome: "blocked",
                detail: "No rules matched this stage and policy default_action is deny.",
                category: "default_deny",
            });
        }
    }
    // Determine overall outcome for EvaluateResult
    const redactionCount = allViolations.filter((v) => v.outcome === "redacted").length;
    void redactionCount; // used by wrappers inspecting violations
    const evaluatedAt = new Date().toISOString();
    // Generate signed evaluation receipt (non-fatal — failure never blocks)
    // Signed receipts require trust_chain feature (Enterprise tier and above)
    const skipReceipt = options.generateReceipt === false ||
        !licenseStatus.features.includes("trust_chain");
    const receipt = skipReceipt
        ? undefined
        : ((0, receipt_js_1.generateReceipt)(payload, policy, !blocked, allViolations.length) ?? undefined);
    return {
        allowed: !blocked,
        payload: currentPayload,
        violations: allViolations,
        tags,
        audit_events: allAuditEvents,
        evaluated_at: evaluatedAt,
        policy_name: policy.name,
        receipt,
    };
}
function extractTexts(payload) {
    const entries = [];
    if ("messages" in payload) {
        const req = payload;
        for (let i = 0; i < req.messages.length; i++) {
            const msg = req.messages[i];
            if (msg && msg.content) {
                entries.push({ key: `messages.${i}.content`, text: msg.content });
            }
        }
    }
    else {
        const res = payload;
        if (res.content) {
            entries.push({ key: "content", text: res.content });
        }
    }
    return entries;
}
function extractPrimaryText(payload) {
    if ("messages" in payload) {
        const req = payload;
        return req.messages
            .filter((m) => Boolean(m.content))
            .map((m) => m.content)
            .join("\n");
    }
    return payload.content ?? "";
}
function applyRedactedText(payload, key, redactedText) {
    if (key === "content") {
        return { ...payload, content: redactedText };
    }
    if (key.startsWith("messages.")) {
        const parts = key.split(".");
        const idx = parseInt(parts[1] ?? "0", 10);
        const req = payload;
        const messages = req.messages.map((msg, i) => {
            if (i === idx)
                return { ...msg, content: redactedText };
            return msg;
        });
        return { ...req, messages };
    }
    return payload;
}
function buildPatternFlags(flags) {
    let f = "g";
    if (flags?.includes("case_insensitive"))
        f += "i";
    if (flags?.includes("multiline"))
        f += "m";
    if (flags?.includes("dotall"))
        f += "s";
    return f;
}
/**
 * Public evaluate() entry point.
 *
 * Wraps coreEvaluate() with fail_mode handling (Section 3a — Phase 10):
 *   fail_mode: "closed" (default) — rethrow any unexpected engine error (safest)
 *   fail_mode: "open"             — on error, return allowed: true with audit event
 *
 * Precedence: environment.fail_mode > policy.fail_mode > "closed"
 */
async function evaluate(stage, payload, policy, licenseStatus, options = {}) {
    const env = policy.environments?.find((e) => e.name === options.environment);
    const failMode = env?.fail_mode ?? policy.fail_mode ?? "closed";
    try {
        return await coreEvaluate(stage, payload, policy, licenseStatus, options);
    }
    catch (err) {
        if (failMode === "open") {
            // Fail-open: allow the call through and log the system error as an audit event.
            // The caller receives allowed: true but the audit trail records what went wrong.
            return {
                allowed: true,
                payload,
                violations: [],
                tags: { "tg.fail_mode": "open", "tg.system_error": String(err) },
                audit_events: [
                    {
                        id: (0, emitter_js_1.makeId)(),
                        timestamp: new Date().toISOString(),
                        policy_name: policy.name,
                        policy_version: "1.0",
                        event_type: "error",
                        stage,
                        tags: { "tg.fail_mode": "open" },
                        metadata: {
                            error: String(err),
                            fail_mode: "open",
                            environment: options.environment ?? "__default__",
                        },
                    },
                ],
                evaluated_at: new Date().toISOString(),
                policy_name: policy.name,
            };
        }
        // fail_mode: "closed" — rethrow; caller (wrapper or consumer) handles it
        throw err;
    }
}
//# sourceMappingURL=engine.js.map