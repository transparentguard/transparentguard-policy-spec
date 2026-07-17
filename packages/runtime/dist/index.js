"use strict";
/**
 * @transparentguard/runtime
 *
 * TransparentGuard Runtime — AI policy enforcement engine.
 * Implements the TransparentGuard Policy Spec (TPS) v1.0.
 *
 * @example Drop-in wrapper (recommended):
 * ```typescript
 * import { TransparentGuard } from "@transparentguard/runtime";
 * import OpenAI from "openai";
 *
 * const tg = await TransparentGuard.init({
 *   policy: "./policies/production-hipaa.yaml",
 *   apiKey: process.env.TG_API_KEY,
 * });
 *
 * const client = tg.wrap(new OpenAI());
 * const response = await client.chat.completions.create({ ... });
 * ```
 *
 * @example Direct evaluate() call:
 * ```typescript
 * const result = await tg.evaluate("pre-request", {
 *   messages: [{ role: "user", content: "Hello" }],
 *   provider: "openai/gpt-4o",
 * });
 * if (!result.allowed) throw new Error(result.violations[0]?.detail ?? "Blocked");
 * ```
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.bedrockAdapter = exports.vllmAdapter = exports.mistralAdapter = exports.vertexAdapter = exports.groqAdapter = exports.anthropicAdapter = exports.openAIAdapter = exports.evaluatePassthroughStream = exports.evaluateWindowedStream = exports.resolveStreamConfig = exports.findPublicKey = exports.getActiveKeySet = exports.getActivePublicKeys = exports.stopKeyRotationWatcher = exports.startKeyRotationWatcher = exports.getSigningPublicKey = exports.verifyReceipt = exports.generateReceipt = exports.runShadowClassifier = exports.getAllFrameworkVersions = exports.getFrameworkVersion = exports.checkFrameworkDrift = exports.generateEvidencePackage = exports.resolveCustomClassifier = exports.listClassifiers = exports.getClassifier = exports.registerClassifier = exports.classifyFinancialPii = exports.classifyMedicalPii = exports.FEDRAMP_RULES = exports.EU_AI_ACT_RULES = exports.SOC2_RULES = exports.GDPR_RULES = exports.HIPAA_RULES = exports.parseWindowMs = exports.clearBlockAll = exports.getBlockAllState = exports.formatTestResults = exports.runPolicyTests = exports.expandCategories = exports.redactText = exports.detectPii = exports.approximateTokenCount = exports.toOcsfEvent = exports.checkLicense = exports.assertFeature = exports.verifyOfflineKey = exports.TransparentGuardError = exports.PolicySignatureError = exports.PolicyLoadError = void 0;
exports.submitJob = exports.getJob = exports.listJobs = exports.checkDrift = exports.readDriftWindow = exports.appendDriftEntry = exports.autoLabelFromFile = exports.autoLabel = exports.registerAutoLabeler = exports.formatVersionList = exports.verifySnapshot = exports.resolveDatasetVersion = exports.listVersions = exports.createSnapshot = exports.formatValidationReport = exports.validateDataset = exports.listDatasets = exports.getManifest = exports.exportJsonl = exports.computeStats = exports.importJsonl = exports.addExample = exports.readVersionedExamples = exports.readExamples = exports.fileHash = exports.textId = exports.datasetDir = exports.tgDataDir = exports.EU_EEA_JURISDICTIONS = exports.isInEEA = exports.isAdequate = exports.getAdequacyStatus = exports.ADEQUACY_DECISIONS = exports.PROVIDER_REGISTRY = exports.enforceDataSovereignty = exports.matchesProviderGlob = exports.providerMatchesRuleScope = exports.formatPolicyTestResults = exports.loadPolicy = exports.parsePolicy = exports.tg = exports.TransparentGuard = exports.hasAdapter = exports.listAdapters = exports.resolveAdapter = exports.registerAdapter = exports.baichuanAdapter = exports.zhipuAdapter = exports.moonshotAdapter = exports.deepSeekAdapter = void 0;
exports.toHuggingFaceReadme = exports.formatModelCard = exports.generateModelCard = exports.verifyArtifact = exports.signArtifact = exports.loadAndInfer = exports.clearActiveLearningQueue = exports.readActiveLearningQueue = exports.appendActiveLearningEntry = exports.formatModelList = exports.listArtifactVersions = exports.listModelClassifiers = exports.setHead = exports.updateManifest = exports.resolveModelVersion = exports.loadArtifact = exports.createArtifact = exports.weightsHash = exports.artifactDir = exports.modelDir = exports.modelsBaseDir = exports.LocalTrainerBackend = exports.localBackend = exports.listBackends = exports.getBackend = exports.registerBackend = exports.formatProvenance = exports.verifyProvenance = exports.signProvenance = exports.buildProvenance = exports.formatJobList = exports.cancelTrainingJob = exports.refreshJobStatus = void 0;
exports.testPolicy = testPolicy;
const loader_js_1 = require("./loader.js");
Object.defineProperty(exports, "loadPolicy", { enumerable: true, get: function () { return loader_js_1.loadPolicy; } });
Object.defineProperty(exports, "parsePolicy", { enumerable: true, get: function () { return loader_js_1.parsePolicy; } });
const engine_js_1 = require("./engine.js");
const checker_js_1 = require("./license/checker.js");
const emitter_js_1 = require("./audit/emitter.js");
const openai_js_1 = require("./wrappers/openai.js");
const anthropic_js_1 = require("./wrappers/anthropic.js");
const runner_js_1 = require("./testing/runner.js");
Object.defineProperty(exports, "formatPolicyTestResults", { enumerable: true, get: function () { return runner_js_1.formatTestResults; } });
var loader_js_2 = require("./loader.js");
Object.defineProperty(exports, "PolicyLoadError", { enumerable: true, get: function () { return loader_js_2.PolicyLoadError; } });
Object.defineProperty(exports, "PolicySignatureError", { enumerable: true, get: function () { return loader_js_2.PolicySignatureError; } });
var checker_js_2 = require("./license/checker.js");
Object.defineProperty(exports, "TransparentGuardError", { enumerable: true, get: function () { return checker_js_2.TransparentGuardError; } });
Object.defineProperty(exports, "verifyOfflineKey", { enumerable: true, get: function () { return checker_js_2.verifyOfflineKey; } });
Object.defineProperty(exports, "assertFeature", { enumerable: true, get: function () { return checker_js_2.assertFeature; } });
Object.defineProperty(exports, "checkLicense", { enumerable: true, get: function () { return checker_js_2.checkLicense; } });
var ocsf_js_1 = require("./audit/ocsf.js");
Object.defineProperty(exports, "toOcsfEvent", { enumerable: true, get: function () { return ocsf_js_1.toOcsfEvent; } });
var token_budget_js_1 = require("./enforcements/token-budget.js");
Object.defineProperty(exports, "approximateTokenCount", { enumerable: true, get: function () { return token_budget_js_1.approximateTokenCount; } });
var pii_js_1 = require("./evaluators/pii.js");
Object.defineProperty(exports, "detectPii", { enumerable: true, get: function () { return pii_js_1.detectPii; } });
Object.defineProperty(exports, "redactText", { enumerable: true, get: function () { return pii_js_1.redactText; } });
Object.defineProperty(exports, "expandCategories", { enumerable: true, get: function () { return pii_js_1.expandCategories; } });
var runner_js_2 = require("./testing/runner.js");
Object.defineProperty(exports, "runPolicyTests", { enumerable: true, get: function () { return runner_js_2.runPolicyTests; } });
Object.defineProperty(exports, "formatTestResults", { enumerable: true, get: function () { return runner_js_2.formatTestResults; } });
var engine_js_2 = require("./threshold/engine.js");
Object.defineProperty(exports, "getBlockAllState", { enumerable: true, get: function () { return engine_js_2.getBlockAllState; } });
Object.defineProperty(exports, "clearBlockAll", { enumerable: true, get: function () { return engine_js_2.clearBlockAll; } });
Object.defineProperty(exports, "parseWindowMs", { enumerable: true, get: function () { return engine_js_2.parseWindowMs; } });
// ---------------------------------------------------------------------------
// Phase 5 — Compliance framework rule sets
// ---------------------------------------------------------------------------
var hipaa_js_1 = require("./frameworks/hipaa.js");
Object.defineProperty(exports, "HIPAA_RULES", { enumerable: true, get: function () { return hipaa_js_1.HIPAA_RULES; } });
var gdpr_js_1 = require("./frameworks/gdpr.js");
Object.defineProperty(exports, "GDPR_RULES", { enumerable: true, get: function () { return gdpr_js_1.GDPR_RULES; } });
var soc2_js_1 = require("./frameworks/soc2.js");
Object.defineProperty(exports, "SOC2_RULES", { enumerable: true, get: function () { return soc2_js_1.SOC2_RULES; } });
var eu_ai_act_js_1 = require("./frameworks/eu-ai-act.js");
Object.defineProperty(exports, "EU_AI_ACT_RULES", { enumerable: true, get: function () { return eu_ai_act_js_1.EU_AI_ACT_RULES; } });
var fedramp_js_1 = require("./frameworks/fedramp.js");
Object.defineProperty(exports, "FEDRAMP_RULES", { enumerable: true, get: function () { return fedramp_js_1.FEDRAMP_RULES; } });
// ---------------------------------------------------------------------------
// Phase 5 — Advanced classifiers
// ---------------------------------------------------------------------------
var pii_medical_v1_js_1 = require("./evaluators/built-in/pii-medical-v1.js");
Object.defineProperty(exports, "classifyMedicalPii", { enumerable: true, get: function () { return pii_medical_v1_js_1.classifyMedicalPii; } });
var pii_financial_v1_js_1 = require("./evaluators/built-in/pii-financial-v1.js");
Object.defineProperty(exports, "classifyFinancialPii", { enumerable: true, get: function () { return pii_financial_v1_js_1.classifyFinancialPii; } });
// ---------------------------------------------------------------------------
// Phase 5 — Custom classifier registry (OEM)
// ---------------------------------------------------------------------------
var classifier_registry_js_1 = require("./evaluators/classifier-registry.js");
Object.defineProperty(exports, "registerClassifier", { enumerable: true, get: function () { return classifier_registry_js_1.registerClassifier; } });
Object.defineProperty(exports, "getClassifier", { enumerable: true, get: function () { return classifier_registry_js_1.getClassifier; } });
Object.defineProperty(exports, "listClassifiers", { enumerable: true, get: function () { return classifier_registry_js_1.listClassifiers; } });
Object.defineProperty(exports, "resolveCustomClassifier", { enumerable: true, get: function () { return classifier_registry_js_1.resolveCustomClassifier; } });
// ---------------------------------------------------------------------------
// Phase 5 — Policy Intelligence Engine (PIE)
// ---------------------------------------------------------------------------
var evidence_js_1 = require("./pie/evidence.js");
Object.defineProperty(exports, "generateEvidencePackage", { enumerable: true, get: function () { return evidence_js_1.generateEvidencePackage; } });
var drift_js_1 = require("./pie/drift.js");
Object.defineProperty(exports, "checkFrameworkDrift", { enumerable: true, get: function () { return drift_js_1.checkFrameworkDrift; } });
Object.defineProperty(exports, "getFrameworkVersion", { enumerable: true, get: function () { return drift_js_1.getFrameworkVersion; } });
Object.defineProperty(exports, "getAllFrameworkVersions", { enumerable: true, get: function () { return drift_js_1.getAllFrameworkVersions; } });
var shadow_js_1 = require("./pie/shadow.js");
Object.defineProperty(exports, "runShadowClassifier", { enumerable: true, get: function () { return shadow_js_1.runShadowClassifier; } });
// ---------------------------------------------------------------------------
// Phase 5 — Cryptographic Trust Chain
// ---------------------------------------------------------------------------
var receipt_js_1 = require("./trust/receipt.js");
Object.defineProperty(exports, "generateReceipt", { enumerable: true, get: function () { return receipt_js_1.generateReceipt; } });
Object.defineProperty(exports, "verifyReceipt", { enumerable: true, get: function () { return receipt_js_1.verifyReceipt; } });
Object.defineProperty(exports, "getSigningPublicKey", { enumerable: true, get: function () { return receipt_js_1.getSigningPublicKey; } });
var keys_js_1 = require("./trust/keys.js");
Object.defineProperty(exports, "startKeyRotationWatcher", { enumerable: true, get: function () { return keys_js_1.startKeyRotationWatcher; } });
Object.defineProperty(exports, "stopKeyRotationWatcher", { enumerable: true, get: function () { return keys_js_1.stopKeyRotationWatcher; } });
Object.defineProperty(exports, "getActivePublicKeys", { enumerable: true, get: function () { return keys_js_1.getActivePublicKeys; } });
Object.defineProperty(exports, "getActiveKeySet", { enumerable: true, get: function () { return keys_js_1.getActiveKeySet; } });
Object.defineProperty(exports, "findPublicKey", { enumerable: true, get: function () { return keys_js_1.findPublicKey; } });
// ---------------------------------------------------------------------------
// Phase 10 — Streaming Enforcement Engine (Section 25)
// ---------------------------------------------------------------------------
var stream_evaluator_js_1 = require("./streaming/stream-evaluator.js");
Object.defineProperty(exports, "resolveStreamConfig", { enumerable: true, get: function () { return stream_evaluator_js_1.resolveStreamConfig; } });
Object.defineProperty(exports, "evaluateWindowedStream", { enumerable: true, get: function () { return stream_evaluator_js_1.evaluateWindowedStream; } });
Object.defineProperty(exports, "evaluatePassthroughStream", { enumerable: true, get: function () { return stream_evaluator_js_1.evaluatePassthroughStream; } });
var openai_js_2 = require("./adapters/openai.js");
Object.defineProperty(exports, "openAIAdapter", { enumerable: true, get: function () { return openai_js_2.openAIAdapter; } });
var anthropic_js_2 = require("./adapters/anthropic.js");
Object.defineProperty(exports, "anthropicAdapter", { enumerable: true, get: function () { return anthropic_js_2.anthropicAdapter; } });
var groq_js_1 = require("./adapters/groq.js");
Object.defineProperty(exports, "groqAdapter", { enumerable: true, get: function () { return groq_js_1.groqAdapter; } });
var vertex_js_1 = require("./adapters/vertex.js");
Object.defineProperty(exports, "vertexAdapter", { enumerable: true, get: function () { return vertex_js_1.vertexAdapter; } });
var mistral_js_1 = require("./adapters/mistral.js");
Object.defineProperty(exports, "mistralAdapter", { enumerable: true, get: function () { return mistral_js_1.mistralAdapter; } });
var vllm_js_1 = require("./adapters/vllm.js");
Object.defineProperty(exports, "vllmAdapter", { enumerable: true, get: function () { return vllm_js_1.vllmAdapter; } });
var bedrock_js_1 = require("./adapters/bedrock.js");
Object.defineProperty(exports, "bedrockAdapter", { enumerable: true, get: function () { return bedrock_js_1.bedrockAdapter; } });
var deepseek_js_1 = require("./adapters/deepseek.js");
Object.defineProperty(exports, "deepSeekAdapter", { enumerable: true, get: function () { return deepseek_js_1.deepSeekAdapter; } });
var moonshot_js_1 = require("./adapters/moonshot.js");
Object.defineProperty(exports, "moonshotAdapter", { enumerable: true, get: function () { return moonshot_js_1.moonshotAdapter; } });
var zhipu_js_1 = require("./adapters/zhipu.js");
Object.defineProperty(exports, "zhipuAdapter", { enumerable: true, get: function () { return zhipu_js_1.zhipuAdapter; } });
var baichuan_js_1 = require("./adapters/baichuan.js");
Object.defineProperty(exports, "baichuanAdapter", { enumerable: true, get: function () { return baichuan_js_1.baichuanAdapter; } });
var loader_js_3 = require("./adapters/loader.js");
Object.defineProperty(exports, "registerAdapter", { enumerable: true, get: function () { return loader_js_3.registerAdapter; } });
Object.defineProperty(exports, "resolveAdapter", { enumerable: true, get: function () { return loader_js_3.resolveAdapter; } });
Object.defineProperty(exports, "listAdapters", { enumerable: true, get: function () { return loader_js_3.listAdapters; } });
Object.defineProperty(exports, "hasAdapter", { enumerable: true, get: function () { return loader_js_3.hasAdapter; } });
// ---------------------------------------------------------------------------
// Gate 1 — Policy-level license validator
// ---------------------------------------------------------------------------
/**
 * Scans a fully-loaded policy and throws immediately if any declared feature
 * exceeds what the current license covers.
 *
 * This is Gate 1 — it fires at TransparentGuard.init() time so a misconfigured
 * policy is rejected before any LLM call is ever made.
 *
 * Gate 2 is the assertFeature() call at each individual execution site inside
 * engine.ts, stream-evaluator.ts, audit/emitter.ts, and adapters/loader.ts.
 * Both gates must be bypassed independently — patching one leaves the other intact.
 *
 * The tier model is strictly cumulative (compounding upward):
 *   Free < Startup < Growth < Enterprise < OEM
 * Each tier includes all features from every tier below it.
 */
function validatePolicyLicense(policy, license) {
    // Compliance framework templates — Startup+
    if ((policy.compliance_frameworks ?? []).length > 0) {
        (0, checker_js_1.assertFeature)(license, "compliance_frameworks", "Compliance framework templates (HIPAA, GDPR, EU AI Act, SOC 2, FedRAMP)");
    }
    // PIE config — Growth+
    if (policy.pie) {
        (0, checker_js_1.assertFeature)(license, "pie", "Policy Intelligence Engine (PIE)");
    }
    // Multi-environment block — Growth+
    if ((policy.environments ?? []).length > 0) {
        (0, checker_js_1.assertFeature)(license, "multi_environment", "Multi-environment policy scoping");
    }
    // Streaming window / passthrough — Startup+
    const streamMode = policy.audit?.streaming?.mode;
    if (streamMode === "window" || streamMode === "passthrough") {
        (0, checker_js_1.assertFeature)(license, "streaming_window", "Streaming window/passthrough mode");
    }
    // Audit chain integrity — Startup+
    if (policy.audit?.chain_integrity?.enabled) {
        (0, checker_js_1.assertFeature)(license, "audit_chain_integrity", "Audit chain integrity");
    }
    // Audit destinations — Startup+
    const dest = policy.audit?.destination;
    if (dest) {
        if (dest.startsWith("s3://")) {
            (0, checker_js_1.assertFeature)(license, "audit_s3", "S3 audit destinations");
        }
        else if (dest.startsWith("postgres://") || dest.startsWith("postgresql://")) {
            (0, checker_js_1.assertFeature)(license, "audit_postgres", "PostgreSQL audit destinations");
        }
        else if (dest.startsWith("gcs://")) {
            (0, checker_js_1.assertFeature)(license, "audit_gcs", "GCS audit destinations");
        }
        else if (dest.startsWith("azure://")) {
            (0, checker_js_1.assertFeature)(license, "audit_azure", "Azure audit destinations");
        }
    }
    // Custom classifier registry — OEM
    if ((policy.custom_classifiers ?? []).length > 0) {
        (0, checker_js_1.assertFeature)(license, "oem_embed", "Custom classifier registry");
    }
    // Rule-level feature checks
    for (const rule of policy.rules ?? []) {
        // ML classifiers — Startup+
        if (rule.action === "classify") {
            (0, checker_js_1.assertFeature)(license, "ml_classifiers", "ML classifier rules");
        }
        if (rule.action === "enforce") {
            // Confidentiality enforcement — Startup+
            if (rule.enforce_type === "confidentiality") {
                (0, checker_js_1.assertFeature)(license, "confidentiality_check", "Confidentiality enforcement rules");
            }
            // Data sovereignty — Enterprise+
            if (rule.enforce_type === "data_sovereignty") {
                (0, checker_js_1.assertFeature)(license, "data_sovereignty", "Data sovereignty enforcement");
            }
        }
        // Provider risk-tier filtering — Startup+
        if (rule.provider_match?.risk_tier?.length) {
            (0, checker_js_1.assertFeature)(license, "provider_risk_tier", "Provider risk-tier filtering");
        }
        // Blocked training jurisdictions — Enterprise+
        if (rule.provider_match
            ?.blocked_training_jurisdictions?.length) {
            (0, checker_js_1.assertFeature)(license, "blocked_training_jurisdictions", "Blocked training jurisdiction filtering");
        }
    }
}
// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------
class TransparentGuard {
    policy;
    license;
    options;
    emitter;
    constructor(policy, license, options) {
        this.policy = policy;
        this.license = license;
        this.options = options;
        this.emitter = new emitter_js_1.AuditEmitter(policy.audit, license.features);
    }
    /**
     * Initialize TransparentGuard with a policy file path or inline policy object.
     * Validates the policy, resolves `extends` chains, verifies signatures, and checks the license.
     */
    static async init(options) {
        let policy;
        if (typeof options.policy === "string") {
            policy = await (0, loader_js_1.loadPolicy)(options.policy);
        }
        else {
            policy = options.policy;
        }
        const license = await (0, checker_js_1.checkLicense)(options.apiKey, options.apiBaseUrl, options.offlineMode);
        // Gate 2: offline mode requires Enterprise tier
        if (options.offlineMode) {
            (0, checker_js_1.assertFeature)(license, "offline_mode", "Offline mode (zero-network operation)");
        }
        // Gate 1: scan the full policy upfront and reject any feature the license does not cover.
        // This runs before any evaluation so misconfigured policies fail fast at startup,
        // not mid-request. Gate 2 assertFeature calls at each execution site provide the
        // second enforcement layer — both must be patched out to bypass.
        validatePolicyLicense(policy, license);
        return new TransparentGuard(policy, license, options);
    }
    /**
     * Evaluate a request or response payload against the loaded policy.
     * The stored apiKey is automatically injected for paid-tier classifier access.
     */
    async evaluate(stage, payload, evaluateOptions = {}) {
        const result = await (0, engine_js_1.evaluate)(stage, payload, this.policy, this.license, {
            apiKey: this.options.apiKey, // inject stored apiKey
            ...evaluateOptions, // caller options take precedence
        });
        this.emitter.enqueueMany(result.audit_events);
        return result;
    }
    wrap(client) {
        if (isOpenAIClient(client)) {
            return new openai_js_1.WrappedOpenAIClient(client, this.policy, this.license, this.options);
        }
        if (isAnthropicClient(client)) {
            return new anthropic_js_1.WrappedAnthropicClient(client, this.policy, this.license, this.options);
        }
        throw new Error("TransparentGuard.wrap(): unrecognized client type. " +
            "Supported clients: OpenAI, Anthropic. " +
            "For other providers, use the direct evaluate() API.");
    }
    /**
     * Runs all inline tests declared in the policy's `tests` section.
     * No real LLM calls are made — only policy evaluation logic is exercised.
     */
    async test() {
        return (0, runner_js_1.runPolicyTests)(this.policy, this.license);
    }
    /** Returns the loaded and validated policy object. */
    getPolicy() {
        return this.policy;
    }
    /** Returns the current license status. */
    getLicenseStatus() {
        return this.license;
    }
    /**
     * Flushes all buffered audit events to the configured destination.
     * Call before process shutdown to ensure no events are lost.
     */
    async flushAudit() {
        await this.emitter.flush();
    }
}
exports.TransparentGuard = TransparentGuard;
// ---------------------------------------------------------------------------
// Convenience factory — functional style
// ---------------------------------------------------------------------------
/**
 * @example
 * ```typescript
 * import { tg } from "@transparentguard/runtime";
 * const client = await tg.init({ policy: "./policy.yaml" });
 * ```
 */
exports.tg = {
    init: TransparentGuard.init.bind(TransparentGuard),
};
/** Run policy tests without a TransparentGuard instance (CI helper) */
async function testPolicy(policy) {
    const { checkLicense: cl } = await Promise.resolve().then(() => __importStar(require("./license/checker.js")));
    const license = await cl(undefined, undefined, false);
    return (0, runner_js_1.runPolicyTests)(policy, license);
}
// ---------------------------------------------------------------------------
// Type guards for client detection
// ---------------------------------------------------------------------------
function isOpenAIClient(client) {
    return (typeof client === "object" &&
        client !== null &&
        "chat" in client &&
        typeof client.chat === "object" &&
        client.chat !== null &&
        "completions" in (client.chat ?? {}));
}
function isAnthropicClient(client) {
    return (typeof client === "object" &&
        client !== null &&
        "messages" in client &&
        typeof client.messages === "object" &&
        client.messages !== null &&
        "create" in (client.messages ?? {}));
}
var provider_scoping_js_1 = require("./enforcements/provider-scoping.js");
Object.defineProperty(exports, "providerMatchesRuleScope", { enumerable: true, get: function () { return provider_scoping_js_1.providerMatchesRuleScope; } });
Object.defineProperty(exports, "matchesProviderGlob", { enumerable: true, get: function () { return provider_scoping_js_1.matchesProviderGlob; } });
var data_sovereignty_js_1 = require("./enforcements/data-sovereignty.js");
Object.defineProperty(exports, "enforceDataSovereignty", { enumerable: true, get: function () { return data_sovereignty_js_1.enforceDataSovereignty; } });
var provider_registry_js_1 = require("./registry/provider-registry.js");
Object.defineProperty(exports, "PROVIDER_REGISTRY", { enumerable: true, get: function () { return provider_registry_js_1.PROVIDER_REGISTRY; } });
var adequacy_decisions_js_1 = require("./registry/adequacy-decisions.js");
Object.defineProperty(exports, "ADEQUACY_DECISIONS", { enumerable: true, get: function () { return adequacy_decisions_js_1.ADEQUACY_DECISIONS; } });
Object.defineProperty(exports, "getAdequacyStatus", { enumerable: true, get: function () { return adequacy_decisions_js_1.getAdequacyStatus; } });
Object.defineProperty(exports, "isAdequate", { enumerable: true, get: function () { return adequacy_decisions_js_1.isAdequate; } });
Object.defineProperty(exports, "isInEEA", { enumerable: true, get: function () { return adequacy_decisions_js_1.isInEEA; } });
Object.defineProperty(exports, "EU_EEA_JURISDICTIONS", { enumerable: true, get: function () { return adequacy_decisions_js_1.EU_EEA_JURISDICTIONS; } });
var index_js_1 = require("./training/index.js");
// Dataset — store
Object.defineProperty(exports, "tgDataDir", { enumerable: true, get: function () { return index_js_1.tgDataDir; } });
Object.defineProperty(exports, "datasetDir", { enumerable: true, get: function () { return index_js_1.datasetDir; } });
Object.defineProperty(exports, "textId", { enumerable: true, get: function () { return index_js_1.textId; } });
Object.defineProperty(exports, "fileHash", { enumerable: true, get: function () { return index_js_1.fileHash; } });
Object.defineProperty(exports, "readExamples", { enumerable: true, get: function () { return index_js_1.readExamples; } });
Object.defineProperty(exports, "readVersionedExamples", { enumerable: true, get: function () { return index_js_1.readVersionedExamples; } });
Object.defineProperty(exports, "addExample", { enumerable: true, get: function () { return index_js_1.addExample; } });
Object.defineProperty(exports, "importJsonl", { enumerable: true, get: function () { return index_js_1.importJsonl; } });
Object.defineProperty(exports, "computeStats", { enumerable: true, get: function () { return index_js_1.computeStats; } });
Object.defineProperty(exports, "exportJsonl", { enumerable: true, get: function () { return index_js_1.exportJsonl; } });
Object.defineProperty(exports, "getManifest", { enumerable: true, get: function () { return index_js_1.getManifest; } });
Object.defineProperty(exports, "listDatasets", { enumerable: true, get: function () { return index_js_1.listDatasets; } });
// Dataset — validator
Object.defineProperty(exports, "validateDataset", { enumerable: true, get: function () { return index_js_1.validateDataset; } });
Object.defineProperty(exports, "formatValidationReport", { enumerable: true, get: function () { return index_js_1.formatValidationReport; } });
// Dataset — versioning
Object.defineProperty(exports, "createSnapshot", { enumerable: true, get: function () { return index_js_1.createSnapshot; } });
Object.defineProperty(exports, "listVersions", { enumerable: true, get: function () { return index_js_1.listVersions; } });
Object.defineProperty(exports, "resolveDatasetVersion", { enumerable: true, get: function () { return index_js_1.resolveDatasetVersion; } });
Object.defineProperty(exports, "verifySnapshot", { enumerable: true, get: function () { return index_js_1.verifySnapshot; } });
Object.defineProperty(exports, "formatVersionList", { enumerable: true, get: function () { return index_js_1.formatVersionList; } });
// Dataset — auto-labeler
Object.defineProperty(exports, "registerAutoLabeler", { enumerable: true, get: function () { return index_js_1.registerAutoLabeler; } });
Object.defineProperty(exports, "autoLabel", { enumerable: true, get: function () { return index_js_1.autoLabel; } });
Object.defineProperty(exports, "autoLabelFromFile", { enumerable: true, get: function () { return index_js_1.autoLabelFromFile; } });
// Dataset — drift
Object.defineProperty(exports, "appendDriftEntry", { enumerable: true, get: function () { return index_js_1.appendDriftEntry; } });
Object.defineProperty(exports, "readDriftWindow", { enumerable: true, get: function () { return index_js_1.readDriftWindow; } });
Object.defineProperty(exports, "checkDrift", { enumerable: true, get: function () { return index_js_1.checkDrift; } });
// Jobs — manager
Object.defineProperty(exports, "listJobs", { enumerable: true, get: function () { return index_js_1.listJobs; } });
Object.defineProperty(exports, "getJob", { enumerable: true, get: function () { return index_js_1.getJob; } });
Object.defineProperty(exports, "submitJob", { enumerable: true, get: function () { return index_js_1.submitJob; } });
Object.defineProperty(exports, "refreshJobStatus", { enumerable: true, get: function () { return index_js_1.refreshJobStatus; } });
Object.defineProperty(exports, "cancelTrainingJob", { enumerable: true, get: function () { return index_js_1.cancelTrainingJob; } });
Object.defineProperty(exports, "formatJobList", { enumerable: true, get: function () { return index_js_1.formatJobList; } });
// Jobs — manifest (SLSA)
Object.defineProperty(exports, "buildProvenance", { enumerable: true, get: function () { return index_js_1.buildProvenance; } });
Object.defineProperty(exports, "signProvenance", { enumerable: true, get: function () { return index_js_1.signProvenance; } });
Object.defineProperty(exports, "verifyProvenance", { enumerable: true, get: function () { return index_js_1.verifyProvenance; } });
Object.defineProperty(exports, "formatProvenance", { enumerable: true, get: function () { return index_js_1.formatProvenance; } });
// Backends
Object.defineProperty(exports, "registerBackend", { enumerable: true, get: function () { return index_js_1.registerBackend; } });
Object.defineProperty(exports, "getBackend", { enumerable: true, get: function () { return index_js_1.getBackend; } });
Object.defineProperty(exports, "listBackends", { enumerable: true, get: function () { return index_js_1.listBackends; } });
Object.defineProperty(exports, "localBackend", { enumerable: true, get: function () { return index_js_1.localBackend; } });
Object.defineProperty(exports, "LocalTrainerBackend", { enumerable: true, get: function () { return index_js_1.LocalTrainerBackend; } });
// Models — store
Object.defineProperty(exports, "modelsBaseDir", { enumerable: true, get: function () { return index_js_1.modelsBaseDir; } });
Object.defineProperty(exports, "modelDir", { enumerable: true, get: function () { return index_js_1.modelDir; } });
Object.defineProperty(exports, "artifactDir", { enumerable: true, get: function () { return index_js_1.artifactDir; } });
Object.defineProperty(exports, "weightsHash", { enumerable: true, get: function () { return index_js_1.weightsHash; } });
Object.defineProperty(exports, "createArtifact", { enumerable: true, get: function () { return index_js_1.createArtifact; } });
Object.defineProperty(exports, "loadArtifact", { enumerable: true, get: function () { return index_js_1.loadArtifact; } });
Object.defineProperty(exports, "resolveModelVersion", { enumerable: true, get: function () { return index_js_1.resolveModelVersion; } });
Object.defineProperty(exports, "updateManifest", { enumerable: true, get: function () { return index_js_1.updateManifest; } });
Object.defineProperty(exports, "setHead", { enumerable: true, get: function () { return index_js_1.setHead; } });
Object.defineProperty(exports, "listModelClassifiers", { enumerable: true, get: function () { return index_js_1.listModelClassifiers; } });
Object.defineProperty(exports, "listArtifactVersions", { enumerable: true, get: function () { return index_js_1.listArtifactVersions; } });
Object.defineProperty(exports, "formatModelList", { enumerable: true, get: function () { return index_js_1.formatModelList; } });
// Models — loader
Object.defineProperty(exports, "appendActiveLearningEntry", { enumerable: true, get: function () { return index_js_1.appendActiveLearningEntry; } });
Object.defineProperty(exports, "readActiveLearningQueue", { enumerable: true, get: function () { return index_js_1.readActiveLearningQueue; } });
Object.defineProperty(exports, "clearActiveLearningQueue", { enumerable: true, get: function () { return index_js_1.clearActiveLearningQueue; } });
Object.defineProperty(exports, "loadAndInfer", { enumerable: true, get: function () { return index_js_1.loadAndInfer; } });
// Models — signing
Object.defineProperty(exports, "signArtifact", { enumerable: true, get: function () { return index_js_1.signArtifact; } });
Object.defineProperty(exports, "verifyArtifact", { enumerable: true, get: function () { return index_js_1.verifyArtifact; } });
// Models — card
Object.defineProperty(exports, "generateModelCard", { enumerable: true, get: function () { return index_js_1.generateModelCard; } });
Object.defineProperty(exports, "formatModelCard", { enumerable: true, get: function () { return index_js_1.formatModelCard; } });
Object.defineProperty(exports, "toHuggingFaceReadme", { enumerable: true, get: function () { return index_js_1.toHuggingFaceReadme; } });
//# sourceMappingURL=index.js.map