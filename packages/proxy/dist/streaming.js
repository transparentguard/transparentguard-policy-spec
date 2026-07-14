"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSseLines = parseSseLines;
exports.assembleContent = assembleContent;
exports.startSseResponse = startSseResponse;
exports.emitSseChunks = emitSseChunks;
exports.emitRedactedSseChunks = emitRedactedSseChunks;
// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------
/**
 * Parse raw SSE lines into an array of parsed event data objects.
 * Handles both JSON chunks and the terminal [DONE] marker.
 */
function parseSseLines(lines) {
    const result = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:"))
            continue;
        const data = trimmed.slice("data:".length).trim();
        if (data === "[DONE]") {
            result.push("[DONE]");
            continue;
        }
        if (!data || data === "")
            continue;
        try {
            result.push(JSON.parse(data));
        }
        catch {
            // Non-JSON data line — skip
        }
    }
    return result;
}
/**
 * Assemble the full text content from a list of parsed SSE chunks.
 */
function assembleContent(chunks) {
    let content = "";
    for (const chunk of chunks) {
        if (chunk === "[DONE]")
            continue;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta)
            content += delta;
    }
    return content;
}
// ---------------------------------------------------------------------------
// SSE emission
// ---------------------------------------------------------------------------
/**
 * Set SSE response headers. Must be called before writing any data.
 */
function startSseResponse(res, extraHeaders) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // disable Nginx buffering
        ...extraHeaders,
    });
}
/**
 * Emit the original buffered chunks to the client, with optional content replacement.
 *
 * @param res        Response to write to
 * @param chunks     Original parsed chunks from the upstream
 * @param replacement If provided, emits a single synthetic chunk with this content instead
 */
function emitSseChunks(res, chunks, replacement) {
    if (replacement !== undefined) {
        // Emit a single synthetic chunk with the replacement content
        const firstRealChunk = chunks.find((c) => c !== "[DONE]");
        if (firstRealChunk) {
            const synthetic = {
                ...firstRealChunk,
                choices: [{
                        index: 0,
                        delta: { content: replacement },
                        finish_reason: "stop",
                    }],
            };
            res.write(`data: ${JSON.stringify(synthetic)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        return;
    }
    // Re-emit all original chunks faithfully
    for (const chunk of chunks) {
        if (chunk === "[DONE]") {
            res.write("data: [DONE]\n\n");
        }
        else {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
    }
}
/**
 * Reconstruct SSE chunks with redacted content replacing the original.
 * Tries to distribute the replacement across the original chunk boundaries
 * (best-effort) so chunk counts remain similar.
 */
function emitRedactedSseChunks(res, chunks, redactedContent) {
    // Simple strategy: emit one chunk per original content chunk, proportional split
    const contentChunks = chunks.filter((c) => c !== "[DONE]" && Boolean(c.choices[0]?.delta?.content));
    if (contentChunks.length === 0) {
        emitSseChunks(res, chunks, redactedContent);
        return;
    }
    // Distribute redacted content across the original chunk count
    const chunkSize = Math.ceil(redactedContent.length / contentChunks.length);
    let offset = 0;
    for (let i = 0; i < contentChunks.length; i++) {
        const original = contentChunks[i];
        if (!original)
            continue;
        const slice = redactedContent.slice(offset, offset + chunkSize);
        offset += chunkSize;
        const synthetic = {
            ...original,
            choices: [{
                    index: 0,
                    delta: { content: slice || "" },
                    finish_reason: i === contentChunks.length - 1 ? "stop" : null,
                }],
        };
        res.write(`data: ${JSON.stringify(synthetic)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
}
//# sourceMappingURL=streaming.js.map