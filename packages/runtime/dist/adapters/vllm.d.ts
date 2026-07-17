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
import type { ProviderAdapter } from "./adapter.js";
export declare const vllmAdapter: ProviderAdapter;
//# sourceMappingURL=vllm.d.ts.map