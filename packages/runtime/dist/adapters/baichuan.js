"use strict";
/**
 * TransparentGuard — Baichuan AI Provider Adapter (Community)
 *
 * Baichuan uses an OpenAI-compatible Chat Completions API.
 * Covers: baichuan/Baichuan4, baichuan/Baichuan3-Turbo, baichuan/Baichuan3-Turbo-128k
 * API spec: https://platform.baichuan-ai.com/docs/api
 *
 * Note: Baichuan AI processes data in China (CN).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.baichuanAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.baichuanAdapter = {
    providerId: "baichuan",
    displayName: "Baichuan AI",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        headerFormat: "Bearer {key}",
    },
    region: {
        regions: ["cn-shenzhen"],
        jurisdiction: "CN",
        trainingJurisdiction: "CN",
    },
    capabilities: ["chat", "streaming"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `baichuan/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `baichuan/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=baichuan.js.map