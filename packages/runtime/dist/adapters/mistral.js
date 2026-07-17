"use strict";
/**
 * TransparentGuard — Mistral AI Provider Adapter
 *
 * Mistral is OpenAI Chat Completions API-compatible.
 * Covers: mistral/mistral-large-latest, mistral/mistral-small-latest, etc.
 * API spec: https://docs.mistral.ai/api/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mistralAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.mistralAdapter = {
    providerId: "mistral",
    displayName: "Mistral AI",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        headerFormat: "Bearer {key}",
    },
    region: {
        // Mistral processes data in France (EU)
        regions: ["eu-west-3", "eu-central-1"],
        jurisdiction: "FR",
        trainingJurisdiction: "FR",
    },
    capabilities: ["chat", "function_calling", "code", "streaming", "embeddings"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `mistral/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `mistral/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=mistral.js.map