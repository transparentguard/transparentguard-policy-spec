"use strict";
/**
 * TransparentGuard — Zhipu AI Provider Adapter (Community)
 *
 * Zhipu AI (GLM) uses an OpenAI-compatible API.
 * Covers: zhipu/glm-4, zhipu/glm-4v, zhipu/glm-3-turbo
 * API spec: https://open.bigmodel.cn/dev/api
 *
 * Note: Zhipu AI processes data in China (CN).
 * Auth uses JWT tokens generated from the API key; the headerFormat
 * carries the pre-signed JWT — the proxy layer generates the JWT before injection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.zhipuAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.zhipuAdapter = {
    providerId: "zhipu",
    displayName: "Zhipu AI (GLM)",
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
    capabilities: ["chat", "function_calling", "vision", "code", "streaming", "embeddings"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `zhipu/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `zhipu/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=zhipu.js.map