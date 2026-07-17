"use strict";
/**
 * TransparentGuard — Moonshot AI Provider Adapter (Community)
 *
 * Moonshot (Kimi) is OpenAI Chat Completions API-compatible.
 * Covers: moonshot/moonshot-v1-8k, moonshot/moonshot-v1-32k, moonshot/moonshot-v1-128k
 * API spec: https://platform.moonshot.cn/docs/api-reference
 *
 * Note: Moonshot processes data in China (CN).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.moonshotAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.moonshotAdapter = {
    providerId: "moonshot",
    displayName: "Moonshot AI (Kimi)",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        headerFormat: "Bearer {key}",
    },
    region: {
        regions: ["cn-beijing"],
        jurisdiction: "CN",
        trainingJurisdiction: "CN",
    },
    capabilities: ["chat", "code", "streaming"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `moonshot/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `moonshot/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=moonshot.js.map