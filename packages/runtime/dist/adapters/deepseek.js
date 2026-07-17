"use strict";
/**
 * TransparentGuard — DeepSeek Provider Adapter
 *
 * DeepSeek is OpenAI Chat Completions API-compatible.
 * Covers: deepseek/deepseek-chat, deepseek/deepseek-coder, deepseek/deepseek-reasoner, etc.
 * API spec: https://platform.deepseek.com/api-docs/
 *
 * Note: DeepSeek processes data in China (CN). Policies using data_sovereignty with
 * blocked_processor_jurisdictions: [CN] or blocked_training_jurisdictions: [CN]
 * will block requests routed to this provider.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepSeekAdapter = void 0;
const openai_js_1 = require("./openai.js");
exports.deepSeekAdapter = {
    providerId: "deepseek",
    displayName: "DeepSeek",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        headerFormat: "Bearer {key}",
    },
    region: {
        regions: ["cn-hangzhou"],
        jurisdiction: "CN",
        trainingJurisdiction: "CN",
    },
    capabilities: ["chat", "code", "streaming", "function_calling"],
    normalizeRequest(raw) {
        const payload = openai_js_1.openAIAdapter.normalizeRequest(raw);
        const model = String(raw["model"] ?? "");
        return { ...payload, provider: `deepseek/${model}`, model };
    },
    denormalizeRequest(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeRequest(payload, original);
    },
    normalizeResponse(raw, model) {
        const payload = openai_js_1.openAIAdapter.normalizeResponse(raw, model);
        return { ...payload, provider: `deepseek/${model}` };
    },
    denormalizeResponse(payload, original) {
        return openai_js_1.openAIAdapter.denormalizeResponse(payload, original);
    },
};
//# sourceMappingURL=deepseek.js.map