/**
 * TransparentGuard — Google Vertex AI Provider Adapter
 *
 * Covers Vertex AI Generative AI API (Gemini models via Vertex).
 * Uses the generateContent endpoint format.
 * Covers: vertex/gemini-1.5-pro, vertex/gemini-1.5-flash, etc.
 * API spec: https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest
 *
 * Vertex request format:
 * {
 *   "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
 *   "systemInstruction": { "parts": [{ "text": "..." }] },
 *   "generationConfig": { "maxOutputTokens": 1024 }
 * }
 */
import type { ProviderAdapter } from "./adapter.js";
export declare const vertexAdapter: ProviderAdapter;
//# sourceMappingURL=vertex.d.ts.map