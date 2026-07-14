"use strict";
/**
 * TransparentGuard Proxy — Anthropic Handler
 *
 * Handles POST /v1/messages (Anthropic Messages API).
 * Mirrors the OpenAI handler design: pre-request eval → upstream → post-response eval.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAnthropic = handleAnthropic;
const client_js_1 = require("../upstream/client.js");
const telemetry_js_1 = require("../telemetry.js");
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
function sendError(res, status, message, type = "invalid_request_error") {
    const body = JSON.stringify({ type: "error", error: { type, message } });
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}
// Extract flat text from Anthropic message content
function extractAnthropicContent(body) {
    const parts = [];
    for (const msg of body.messages ?? []) {
        if (typeof msg.content === "string") {
            parts.push(msg.content);
        }
        else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === "text" && block.text)
                    parts.push(block.text);
            }
        }
    }
    return parts.join("\n");
}
async function handleAnthropic(req, res, ctx, tg, upstream) {
    const tracer = (0, telemetry_js_1.getTracer)();
    await tracer.startActiveSpan(`POST ${ctx.path}`, { kind: telemetry_js_1.SpanKind.SERVER }, async (rootSpan) => {
        try {
            rootSpan.setAttributes({
                "http.method": "POST",
                "http.route": ctx.path,
                "tg.request_id": ctx.requestId,
            });
            // ------------------------------------------------------------------
            // 1. Parse body
            // ------------------------------------------------------------------
            let rawBody;
            try {
                rawBody = await readBody(req);
            }
            catch (err) {
                sendError(res, 400, `Failed to read request body: ${String(err)}`);
                rootSpan.end();
                return;
            }
            let body;
            try {
                body = JSON.parse(rawBody);
            }
            catch {
                sendError(res, 400, "Request body is not valid JSON.");
                rootSpan.end();
                return;
            }
            rootSpan.setAttributes({
                "llm.vendor": "anthropic",
                "llm.request.model": body.model ?? "unknown",
            });
            // ------------------------------------------------------------------
            // 2. Pre-request evaluation
            // ------------------------------------------------------------------
            const VALID_ROLES = new Set(["system", "user", "assistant", "tool"]);
            const requestMessages = (body.messages ?? []).map((m) => ({
                role: (VALID_ROLES.has(m.role) ? m.role : "user"),
                content: typeof m.content === "string" ? m.content : extractAnthropicContent({ ...body, messages: [m] }),
            }));
            if (body.system) {
                requestMessages.unshift({ role: "system", content: body.system });
            }
            const preResult = await tracer.startActiveSpan("tg.evaluate.pre_request", async (span) => {
                try {
                    return await tg.evaluate("pre-request", { messages: requestMessages, provider: "anthropic", model: body.model }, { requestId: ctx.requestId });
                }
                finally {
                    span.end();
                }
            });
            if (!preResult.allowed) {
                const blockMsg = preResult.violations[0]?.detail ??
                    "Request blocked by TransparentGuard policy.";
                sendError(res, 400, blockMsg, "policy_violation");
                rootSpan.setStatus({ code: telemetry_js_1.SpanStatusCode.ERROR, message: "pre-request blocked" });
                rootSpan.end();
                return;
            }
            // ------------------------------------------------------------------
            // 3. Forward to upstream
            // ------------------------------------------------------------------
            const reqHeaders = {};
            for (const [k, v] of Object.entries(req.headers)) {
                if (v !== undefined) {
                    reqHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
                }
            }
            // Anthropic uses x-api-key instead of Authorization Bearer
            const upstreamResp = await tracer.startActiveSpan("tg.upstream.call", { kind: telemetry_js_1.SpanKind.CLIENT }, async (span) => {
                span.setAttributes({ "http.url": upstream, "http.method": "POST", "http.route": ctx.path });
                try {
                    const resp = await (0, client_js_1.callUpstream)({
                        upstreamBase: upstream,
                        path: ctx.path,
                        method: "POST",
                        apiKey: ctx.upstreamApiKey,
                        body: rawBody,
                        headers: {
                            ...reqHeaders,
                            "x-api-key": ctx.upstreamApiKey,
                            "anthropic-version": req.headers["anthropic-version"] ?? "2023-06-01",
                        },
                        stream: Boolean(body.stream),
                    });
                    span.setAttributes({ "http.status_code": resp.status });
                    return resp;
                }
                finally {
                    span.end();
                }
            });
            if (!upstreamResp.ok) {
                res.writeHead(upstreamResp.status, { "Content-Type": "application/json" });
                res.end(upstreamResp.body);
                rootSpan.end();
                return;
            }
            // ------------------------------------------------------------------
            // 4. Post-response evaluation
            // ------------------------------------------------------------------
            let responseContent = "";
            if (!body.stream) {
                try {
                    const resp = JSON.parse(upstreamResp.body);
                    responseContent = resp.content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text ?? "")
                        .join("");
                }
                catch {
                    // Pass through unparseable response
                }
            }
            const postResult = await tracer.startActiveSpan("tg.evaluate.post_response", async (span) => {
                try {
                    return await tg.evaluate("post-response", { content: responseContent, provider: "anthropic", model: body.model }, { requestId: ctx.requestId });
                }
                finally {
                    span.end();
                }
            });
            // ------------------------------------------------------------------
            // 5. Return response
            // ------------------------------------------------------------------
            if (!postResult.allowed) {
                const blockMsg = postResult.violations[0]?.detail ??
                    "Response blocked by TransparentGuard policy.";
                sendError(res, 400, blockMsg, "policy_violation");
            }
            else {
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "X-TransparentGuard-Request-ID": ctx.requestId,
                });
                res.end(upstreamResp.body);
            }
            rootSpan.setStatus({ code: telemetry_js_1.SpanStatusCode.OK });
        }
        catch (err) {
            console.error(`[TransparentGuard] Anthropic handler error: ${String(err)}`);
            if (!res.headersSent) {
                sendError(res, 500, "Internal proxy error.", "internal_error");
            }
            rootSpan.setStatus({ code: telemetry_js_1.SpanStatusCode.ERROR, message: String(err) });
        }
        finally {
            rootSpan.end();
        }
    });
}
//# sourceMappingURL=anthropic.js.map