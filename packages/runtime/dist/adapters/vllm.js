"use strict";
/**
 * TransparentGuard — vLLM Provider Adapter
 *
 * vLLM serves an OpenAI-compatible API for self-hosted open-source models.
 * Covers: vllm/llama-3-70b-instruct, vllm/mistral-7b-v0.3, etc.
 * API spec: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
 *
 * Region/jurisdiction fields reflect self-hosted deployments (operator-defined).
 * The proxy layer should override these at runtime when the deployment region is known.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vllmAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.vllmAdapter = {
    providerId: "vllm",
    displayName: "vLLM (self-hosted)",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        // vLLM accepts any bearer token when auth is enabled; token is often "EMPTY"
        headerFormat: "Bearer {key}",
    },
    region: {
        // Self-hosted: operator-defined. We use a sentinel value here.
        // The data_sovereignty enforcer skips jurisdiction checks when jurisdiction is "self-hosted".
        regions: ["self-hosted"],
        jurisdiction: "self-hosted",
        trainingJurisdiction: "self-hosted",
    },
    capabilities: ["chat", "function_calling", "code", "streaming", "embeddings"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `vllm/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `vllm/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=vllm.js.map