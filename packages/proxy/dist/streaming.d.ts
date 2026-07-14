/**
 * TransparentGuard Proxy — SSE Streaming Helpers
 *
 * Buffer-mode streaming: the proxy collects all SSE chunks from the upstream,
 * assembles the full response content, runs policy evaluation, then re-emits
 * the (possibly redacted or replaced) chunks to the client.
 *
 * This gives full post-response coverage at the cost of delaying the first token
 * until the entire upstream response is received. That's the correct behaviour
 * for HIPAA-grade compliance — partial responses are not safe to emit before evaluation.
 */
import type { ServerResponse } from "node:http";
import type { OpenAIChatChunk } from "./types.js";
/**
 * Parse raw SSE lines into an array of parsed event data objects.
 * Handles both JSON chunks and the terminal [DONE] marker.
 */
export declare function parseSseLines(lines: string[]): Array<OpenAIChatChunk | "[DONE]">;
/**
 * Assemble the full text content from a list of parsed SSE chunks.
 */
export declare function assembleContent(chunks: Array<OpenAIChatChunk | "[DONE]">): string;
/**
 * Set SSE response headers. Must be called before writing any data.
 */
export declare function startSseResponse(res: ServerResponse, extraHeaders?: Record<string, string>): void;
/**
 * Emit the original buffered chunks to the client, with optional content replacement.
 *
 * @param res        Response to write to
 * @param chunks     Original parsed chunks from the upstream
 * @param replacement If provided, emits a single synthetic chunk with this content instead
 */
export declare function emitSseChunks(res: ServerResponse, chunks: Array<OpenAIChatChunk | "[DONE]">, replacement?: string): void;
/**
 * Reconstruct SSE chunks with redacted content replacing the original.
 * Tries to distribute the replacement across the original chunk boundaries
 * (best-effort) so chunk counts remain similar.
 */
export declare function emitRedactedSseChunks(res: ServerResponse, chunks: Array<OpenAIChatChunk | "[DONE]">, redactedContent: string): void;
//# sourceMappingURL=streaming.d.ts.map