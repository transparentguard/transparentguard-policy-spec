"use strict";
/**
 * TransparentGuard — Groq Provider Adapter
 *
 * Groq is OpenAI Chat Completions API-compatible.
 * Covers: groq/llama-3.1-70b-versatile, groq/mixtral-8x7b-32768, etc.
 * API spec: https://console.groq.com/docs/openai
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.groqAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.groqAdapter = {
    providerId: "groq",
    displayName: "Groq",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        headerFormat: "Bearer {key}",
    },
    region: {
        regions: ["us-east-1", "us-west-2"],
        jurisdiction: "US",
        trainingJurisdiction: "US",
    },
    capabilities: ["chat", "function_calling", "code", "streaming"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `groq/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `groq/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=groq.js.map