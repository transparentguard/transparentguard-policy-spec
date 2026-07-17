/**
 * TransparentGuard — AWS Bedrock Provider Adapter
 *
 * Uses the Bedrock Converse API (unified interface across all Bedrock models).
 * Covers: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0,
 *         bedrock/amazon.titan-text-premier-v1:0, etc.
 * API spec: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
 *
 * Bedrock Converse request format:
 * {
 *   "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
 *   "messages": [{ "role": "user", "content": [{ "text": "Hello" }] }],
 *   "system": [{ "text": "You are..." }],
 *   "inferenceConfig": { "maxTokens": 1024 }
 * }
 */
import type { ProviderAdapter } from "./adapter.js";
export declare const bedrockAdapter: ProviderAdapter;
//# sourceMappingURL=bedrock.d.ts.map