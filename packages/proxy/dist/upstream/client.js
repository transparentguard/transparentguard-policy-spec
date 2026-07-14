"use strict";
/**
 * TransparentGuard Proxy — Upstream HTTP Client
 *
 * A thin wrapper around Node's built-in fetch for forwarding requests
 * to the upstream LLM provider. Forwards all relevant headers and the body
 * verbatim, only swapping in the upstream API key.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.callUpstream = callUpstream;
const UPSTREAM_TIMEOUT_MS = 120_000; // 2 minutes — generous for slow models
// Headers that must NOT be forwarded to the upstream.
// The proxy sets its own values for these.
const STRIP_REQUEST_HEADERS = new Set([
    "host",
    "connection",
    "content-length", // recalculated by fetch
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    "proxy-authorization",
    "proxy-connection",
    "keep-alive",
]);
/**
 * Call the upstream provider and return the full response.
 *
 * For streaming requests this buffers the entire SSE response into rawChunks
 * so the proxy can evaluate the assembled content before re-emitting.
 */
async function callUpstream(req) {
    const url = req.upstreamBase.replace(/\/$/, "") + req.path;
    const forwardHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${req.apiKey}`,
        "User-Agent": "transparentguard-proxy/0.1.0",
    };
    // Forward safe original headers
    for (const [key, value] of Object.entries(req.headers)) {
        const lower = key.toLowerCase();
        if (!STRIP_REQUEST_HEADERS.has(lower) && lower !== "authorization") {
            forwardHeaders[key] = value;
        }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(url, {
            method: req.method,
            headers: forwardHeaders,
            body: req.body,
            signal: controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timeout);
        throw new Error(`Upstream request failed: ${String(err)}`);
    }
    finally {
        clearTimeout(timeout);
    }
    // Collect response headers
    const respHeaders = {};
    response.headers.forEach((value, key) => {
        respHeaders[key] = value;
    });
    if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return {
            status: response.status,
            headers: respHeaders,
            body: errorBody,
            rawChunks: [],
            ok: false,
        };
    }
    if (req.stream) {
        // Buffer the SSE stream into lines
        const rawChunks = [];
        const text = await response.text();
        // Split by SSE event boundaries (\n\n) and collect data lines
        const lines = text.split("\n");
        for (const line of lines) {
            rawChunks.push(line);
        }
        return {
            status: response.status,
            headers: respHeaders,
            body: text,
            rawChunks,
            ok: true,
        };
    }
    const body = await response.text();
    return {
        status: response.status,
        headers: respHeaders,
        body,
        rawChunks: [],
        ok: true,
    };
}
//# sourceMappingURL=client.js.map