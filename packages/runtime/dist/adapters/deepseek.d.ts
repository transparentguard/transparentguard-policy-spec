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
import type { ProviderAdapter } from "./adapter.js";
export declare const deepSeekAdapter: ProviderAdapter;
//# sourceMappingURL=deepseek.d.ts.map