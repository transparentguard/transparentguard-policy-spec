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
import type { ProviderAdapter } from "./adapter.js";
export declare const zhipuAdapter: ProviderAdapter;
//# sourceMappingURL=zhipu.d.ts.map