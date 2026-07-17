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
import type { EvaluateOptions, EvaluateResult, RequestPayload, ResponsePayload, RuleStage, TPSPolicy, TransparentGuardOptions } from "./types.js";
import { loadPolicy, parsePolicy } from "./loader.js";
import { WrappedOpenAIClient } from "./wrappers/openai.js";
import { WrappedAnthropicClient } from "./wrappers/anthropic.js";
import { formatTestResults } from "./testing/runner.js";
import type { LicenseStatus } from "./license/checker.js";
import type { OpenAIClientLike } from "./wrappers/openai.js";
import type { AnthropicClientLike } from "./wrappers/anthropic.js";
import type { PolicyTestSuiteResult } from "./testing/runner.js";
export type { TPSPolicy, TPSRule, TPSAudit, TPSEnvironment, TPSSignature, TPSPolicyTest, TPSPolicyTestExpect, TPSPolicyTestInput, TPSPolicyTestExpectRuleTriggered, TPSPolicyTestExpectRedaction, TPSThreshold, ThresholdAction, ThresholdViolationType, ThresholdPayloadTemplate, ComplianceFramework, PiiCategory, PiiTarget, PatternTarget, KeywordTarget, SemanticTarget, TPSTarget, RuleStage, RuleAction, EnforceType, OnViolation, RuleStreaming, AuditNotify, AuditStreamingConfig, AuditChainIntegrity, StreamMode, OnStreamViolation, Message, RequestPayload, ResponsePayload, ToolCall, ToolCallPayload, EvaluateResult, Violation, ViolationOutcome, AuditEvent, AuditEventType, OCSFEvent, TransparentGuardOptions, EvaluateOptions, CompiledRule, EvaluationContext, RuleResult, } from "./types.js";
export { PolicyLoadError, PolicySignatureError } from "./loader.js";
export { TransparentGuardError, verifyOfflineKey, assertFeature, checkLicense } from "./license/checker.js";
export type { LicenseStatus, LicenseTier, LicenseFeature } from "./license/checker.js";
export { toOcsfEvent } from "./audit/ocsf.js";
export { approximateTokenCount } from "./enforcements/token-budget.js";
export { detectPii, redactText, expandCategories } from "./evaluators/pii.js";
export { runPolicyTests, formatTestResults } from "./testing/runner.js";
export type { PolicyTestResult, PolicyTestSuiteResult } from "./testing/runner.js";
export { getBlockAllState, clearBlockAll, parseWindowMs } from "./threshold/engine.js";
export { HIPAA_RULES } from "./frameworks/hipaa.js";
export { GDPR_RULES } from "./frameworks/gdpr.js";
export { SOC2_RULES } from "./frameworks/soc2.js";
export { EU_AI_ACT_RULES } from "./frameworks/eu-ai-act.js";
export { FEDRAMP_RULES } from "./frameworks/fedramp.js";
export { classifyMedicalPii } from "./evaluators/built-in/pii-medical-v1.js";
export { classifyFinancialPii } from "./evaluators/built-in/pii-financial-v1.js";
export { registerClassifier, getClassifier, listClassifiers, resolveCustomClassifier, } from "./evaluators/classifier-registry.js";
export type { CustomClassifierDef } from "./evaluators/classifier-registry.js";
export { generateEvidencePackage } from "./pie/evidence.js";
export type { EvidencePackage, EvidenceControl, EvidenceExportOptions } from "./pie/evidence.js";
export { checkFrameworkDrift, getFrameworkVersion, getAllFrameworkVersions } from "./pie/drift.js";
export type { DriftWarning } from "./pie/drift.js";
export { runShadowClassifier } from "./pie/shadow.js";
export type { PIEShadowModeConfig as PIEShadowConfig } from "./pie/shadow.js";
export { generateReceipt, verifyReceipt, getSigningPublicKey } from "./trust/receipt.js";
export { startKeyRotationWatcher, stopKeyRotationWatcher, getActivePublicKeys, getActiveKeySet, findPublicKey, } from "./trust/keys.js";
export type { JwkPublicKey, KeySet } from "./trust/keys.js";
export { resolveStreamConfig, evaluateWindowedStream, evaluatePassthroughStream, } from "./streaming/stream-evaluator.js";
export type { StreamEvalConfig, StreamChunkAdapter, } from "./streaming/stream-evaluator.js";
export type { ProviderAdapter, ProviderAuthConfig, ProviderRegionInfo, } from "./adapters/adapter.js";
export { openAIAdapter } from "./adapters/openai.js";
export { anthropicAdapter } from "./adapters/anthropic.js";
export { groqAdapter } from "./adapters/groq.js";
export { vertexAdapter } from "./adapters/vertex.js";
export { mistralAdapter } from "./adapters/mistral.js";
export { vllmAdapter } from "./adapters/vllm.js";
export { bedrockAdapter } from "./adapters/bedrock.js";
export { deepSeekAdapter } from "./adapters/deepseek.js";
export { moonshotAdapter } from "./adapters/moonshot.js";
export { zhipuAdapter } from "./adapters/zhipu.js";
export { baichuanAdapter } from "./adapters/baichuan.js";
export { registerAdapter, resolveAdapter, listAdapters, hasAdapter, } from "./adapters/loader.js";
export declare class TransparentGuard {
    private readonly policy;
    private readonly license;
    private readonly options;
    private readonly emitter;
    private constructor();
    /**
     * Initialize TransparentGuard with a policy file path or inline policy object.
     * Validates the policy, resolves `extends` chains, verifies signatures, and checks the license.
     */
    static init(options: TransparentGuardOptions): Promise<TransparentGuard>;
    /**
     * Evaluate a request or response payload against the loaded policy.
     * The stored apiKey is automatically injected for paid-tier classifier access.
     */
    evaluate(stage: RuleStage, payload: RequestPayload | ResponsePayload, evaluateOptions?: EvaluateOptions): Promise<EvaluateResult>;
    /**
     * Wraps an OpenAI or Anthropic client with transparent policy enforcement.
     * The returned client is a drop-in replacement — use it exactly like the standard SDK.
     */
    wrap(client: OpenAIClientLike): WrappedOpenAIClient;
    wrap(client: AnthropicClientLike): WrappedAnthropicClient;
    /**
     * Runs all inline tests declared in the policy's `tests` section.
     * No real LLM calls are made — only policy evaluation logic is exercised.
     */
    test(): Promise<PolicyTestSuiteResult>;
    /** Returns the loaded and validated policy object. */
    getPolicy(): TPSPolicy;
    /** Returns the current license status. */
    getLicenseStatus(): LicenseStatus;
    /**
     * Flushes all buffered audit events to the configured destination.
     * Call before process shutdown to ensure no events are lost.
     */
    flushAudit(): Promise<void>;
}
/**
 * @example
 * ```typescript
 * import { tg } from "@transparentguard/runtime";
 * const client = await tg.init({ policy: "./policy.yaml" });
 * ```
 */
export declare const tg: {
    init: typeof TransparentGuard.init;
};
export { parsePolicy, loadPolicy };
export type { OpenAIClientLike, OpenAIChatCompletionCreateParams, OpenAIChatCompletion, OpenAIChatCompletionChunk, OpenAIChatCompletionChunkDelta, OpenAIChatCompletionChoice, OpenAIChatCompletionChunkChoice, WrappedOpenAIClient, } from "./wrappers/openai.js";
export type { AnthropicClientLike, AnthropicCreateParams, AnthropicResponse, AnthropicStreamEvent, AnthropicMessage, AnthropicContentBlock, WrappedAnthropicClient, } from "./wrappers/anthropic.js";
/** Run policy tests without a TransparentGuard instance (CI helper) */
export declare function testPolicy(policy: TPSPolicy): Promise<PolicyTestSuiteResult>;
export { formatTestResults as formatPolicyTestResults };
export type { ProviderCapabilityMatch, DataSubjectJurisdiction, TransferMechanismConfig, } from "./types.js";
export { providerMatchesRuleScope, matchesProviderGlob } from "./enforcements/provider-scoping.js";
export { enforceDataSovereignty } from "./enforcements/data-sovereignty.js";
export { PROVIDER_REGISTRY } from "./registry/provider-registry.js";
export type { ProviderRegistryEntry } from "./registry/provider-registry.js";
export { ADEQUACY_DECISIONS, getAdequacyStatus, isAdequate, isInEEA, EU_EEA_JURISDICTIONS, } from "./registry/adequacy-decisions.js";
export type { AdequacyEntry, TransferMechanism } from "./registry/adequacy-decisions.js";
export type { LabeledExample, DatasetStats, DatasetVersion, DatasetManifest, TrainingSpec, TrainingJob, JobStatus, ModelManifest, ModelArtifact, ModelCard, ActiveLearningEntry, DriftReport, DriftWindowEntry, SLSAProvenance, ITrainerBackend, DataSource, BackendId, ModelArchitecture, AddExampleOptions, ValidationReport, ValidationFinding, ValidationSeverity, ValidationConfig, SnapshotResult, AutoLabelResult, ModelLoadOptions, } from "./training/index.js";
export { tgDataDir, datasetDir, textId, fileHash, readExamples, readVersionedExamples, addExample, importJsonl, computeStats, exportJsonl, getManifest, listDatasets, validateDataset, formatValidationReport, createSnapshot, listVersions, resolveDatasetVersion, verifySnapshot, formatVersionList, registerAutoLabeler, autoLabel, autoLabelFromFile, appendDriftEntry, readDriftWindow, checkDrift, listJobs, getJob, submitJob, refreshJobStatus, cancelTrainingJob, formatJobList, buildProvenance, signProvenance, verifyProvenance, formatProvenance, registerBackend, getBackend, listBackends, localBackend, LocalTrainerBackend, modelsBaseDir, modelDir, artifactDir, weightsHash, createArtifact, loadArtifact, resolveModelVersion, updateManifest, setHead, listModelClassifiers, listArtifactVersions, formatModelList, appendActiveLearningEntry, readActiveLearningQueue, clearActiveLearningQueue, loadAndInfer, signArtifact, verifyArtifact, generateModelCard, formatModelCard, toHuggingFaceReadme, } from "./training/index.js";
//# sourceMappingURL=index.d.ts.map