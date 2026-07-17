/**
 * TransparentGuard Runtime — Provider Adapter Loader
 *
 * Maintains the built-in adapter registry and resolves a ProviderAdapter from
 * a TPS provider string (e.g. "openai/gpt-4o" → openAIAdapter).
 *
 * Community adapters can be registered at process startup via registerAdapter().
 */
import type { ProviderAdapter } from "./adapter.js";
import type { LicenseStatus } from "../license/checker.js";
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
export declare function registerAdapter(adapter: ProviderAdapter, license?: LicenseStatus): void;
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
export declare function resolveAdapter(providerString: string): ProviderAdapter | null;
/**
 * List all currently registered adapters (built-in + community).
 * Returns a stable copy — mutation of the returned array does not affect the registry.
 */
export declare function listAdapters(): ProviderAdapter[];
/**
 * Check whether an adapter is registered for a given provider string or provider ID.
 */
export declare function hasAdapter(providerStringOrId: string): boolean;
//# sourceMappingURL=loader.d.ts.map