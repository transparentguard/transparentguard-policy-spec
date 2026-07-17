"use strict";
/**
 * TransparentGuard Runtime — Provider Adapter Loader
 *
 * Maintains the built-in adapter registry and resolves a ProviderAdapter from
 * a TPS provider string (e.g. "openai/gpt-4o" → openAIAdapter).
 *
 * Community adapters can be registered at process startup via registerAdapter().
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdapter = registerAdapter;
exports.resolveAdapter = resolveAdapter;
exports.listAdapters = listAdapters;
exports.hasAdapter = hasAdapter;
const checker_js_1 = require("../license/checker.js");
const openai_js_1 = require("./openai.js");
const anthropic_js_1 = require("./anthropic.js");
const groq_js_1 = require("./groq.js");
const vertex_js_1 = require("./vertex.js");
const mistral_js_1 = require("./mistral.js");
const vllm_js_1 = require("./vllm.js");
const bedrock_js_1 = require("./bedrock.js");
const deepseek_js_1 = require("./deepseek.js");
const moonshot_js_1 = require("./moonshot.js");
const zhipu_js_1 = require("./zhipu.js");
const baichuan_js_1 = require("./baichuan.js");
// ---------------------------------------------------------------------------
// Internal registry
// ---------------------------------------------------------------------------
const ADAPTER_REGISTRY = new Map();
function seed(adapter) {
    ADAPTER_REGISTRY.set(adapter.providerId.toLowerCase(), adapter);
}
// Seed all built-in adapters
seed(openai_js_1.openAIAdapter);
seed(anthropic_js_1.anthropicAdapter);
seed(groq_js_1.groqAdapter);
seed(vertex_js_1.vertexAdapter);
seed(mistral_js_1.mistralAdapter);
seed(vllm_js_1.vllmAdapter);
seed(bedrock_js_1.bedrockAdapter);
seed(deepseek_js_1.deepSeekAdapter);
seed(moonshot_js_1.moonshotAdapter);
seed(zhipu_js_1.zhipuAdapter);
seed(baichuan_js_1.baichuanAdapter);
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Register a custom or community ProviderAdapter.
 * If an adapter with the same providerId is already registered, it is replaced.
 *
 * @example
 * ```ts
 * import { registerAdapter } from "@transparentguard/runtime";
 * registerAdapter({
 *   providerId: "myco",
 *   displayName: "MyCo LLM API",
 *   // ... full ProviderAdapter implementation
 * });
 * ```
 */
function registerAdapter(adapter, license) {
    // Gate 2: custom adapters require Growth tier. Pass your LicenseStatus to enforce.
    if (license !== undefined) {
        (0, checker_js_1.assertFeature)(license, "custom_adapter", "Custom provider adapters (registerAdapter)");
    }
    ADAPTER_REGISTRY.set(adapter.providerId.toLowerCase(), adapter);
}
/**
 * Resolve a ProviderAdapter from a TPS provider string.
 *
 * The provider string format is "{providerId}/{modelId}" (e.g., "openai/gpt-4o").
 * Only the prefix segment before the first "/" is used for lookup.
 * Returns null when no adapter is registered for the given provider.
 *
 * @example
 * ```ts
 * const adapter = resolveAdapter("openai/gpt-4o");   // → openAIAdapter
 * const adapter = resolveAdapter("groq/mixtral-8x7b"); // → groqAdapter
 * const adapter = resolveAdapter("unknown/model");    // → null
 * ```
 */
function resolveAdapter(providerString) {
    const providerId = providerString.split("/")[0]?.toLowerCase() ?? "";
    return ADAPTER_REGISTRY.get(providerId) ?? null;
}
/**
 * List all currently registered adapters (built-in + community).
 * Returns a stable copy — mutation of the returned array does not affect the registry.
 */
function listAdapters() {
    return Array.from(ADAPTER_REGISTRY.values());
}
/**
 * Check whether an adapter is registered for a given provider string or provider ID.
 */
function hasAdapter(providerStringOrId) {
    return resolveAdapter(providerStringOrId) !== null;
}
//# sourceMappingURL=loader.js.map