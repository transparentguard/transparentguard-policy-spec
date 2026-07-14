"use strict";
/**
 * TransparentGuard Proxy — HTTP Server
 *
 * Plain Node.js http.createServer — no framework.
 * Routes:
 *   GET  /health         → 200 OK (liveness probe)
 *   GET  /ready          → 200 if policy loaded, 503 if not
 *   POST /v1/chat/completions   → OpenAI handler
 *   POST /v1/messages           → Anthropic handler
 *   POST /v1/*                  → OpenAI handler (catch-all for other v1 paths)
 *   *    *               → 404
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const node_http_1 = __importDefault(require("node:http"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const openai_js_1 = require("./handlers/openai.js");
const anthropic_js_1 = require("./handlers/anthropic.js");
const health_js_1 = require("./handlers/health.js");
function makeRequestId() {
    return `tgr_${node_crypto_1.default.randomBytes(10).toString("hex")}`;
}
/**
 * Extract the API key for forwarding to the upstream.
 * Priority:
 *   1. Config override (--upstream-api-key or UPSTREAM_API_KEY)
 *   2. Authorization: Bearer <key> header from the client request
 *   3. x-api-key header (Anthropic convention)
 */
function extractUpstreamApiKey(req, configOverride) {
    if (configOverride)
        return configOverride;
    const auth = req.headers["authorization"];
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
        return auth.slice("bearer ".length).trim();
    }
    const apiKey = req.headers["x-api-key"];
    if (apiKey)
        return Array.isArray(apiKey) ? apiKey[0] ?? "" : apiKey;
    return "";
}
function isAnthropicPath(url) {
    return url === "/v1/messages" || url.startsWith("/v1/messages?");
}
function isOpenAIPath(url) {
    return url.startsWith("/v1/");
}
function startServer(config) {
    const { tg, upstream, upstreamApiKey, port, logLevel } = config;
    const server = node_http_1.default.createServer((req, res) => {
        const url = req.url ?? "/";
        const method = req.method ?? "GET";
        // Health checks (no auth, no OTEL overhead)
        if (method === "GET" && url === "/health") {
            (0, health_js_1.handleHealth)(res);
            return;
        }
        if (method === "GET" && url === "/ready") {
            (0, health_js_1.handleReady)(res, tg);
            return;
        }
        // All other paths require a POST
        if (method !== "POST") {
            (0, health_js_1.handleNotFound)(req, res);
            return;
        }
        const apiKey = extractUpstreamApiKey(req, upstreamApiKey);
        if (!apiKey) {
            const body = JSON.stringify({
                error: {
                    message: "No API key found. Send Authorization: Bearer <key> or set --upstream-api-key.",
                    type: "authentication_error",
                    code: "no_api_key",
                },
            });
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(body);
            return;
        }
        const ctx = {
            requestId: makeRequestId(),
            method,
            path: url,
            upstreamApiKey: apiKey,
            startMs: Date.now(),
        };
        if (logLevel === "debug" || logLevel === "info") {
            console.log(`[TG] ${method} ${url} → request_id=${ctx.requestId}`);
        }
        const finish = () => {
            if (logLevel === "debug") {
                console.log(`[TG] ${ctx.requestId} done in ${Date.now() - ctx.startMs}ms`);
            }
        };
        res.on("finish", finish);
        res.on("close", finish);
        if (isAnthropicPath(url)) {
            void (0, anthropic_js_1.handleAnthropic)(req, res, ctx, tg, upstream);
        }
        else if (isOpenAIPath(url)) {
            void (0, openai_js_1.handleOpenAI)(req, res, ctx, tg, upstream);
        }
        else {
            (0, health_js_1.handleNotFound)(req, res);
        }
    });
    server.listen(port, () => {
        console.log(`[TransparentGuard] Proxy listening on port ${port}`);
        console.log(`[TransparentGuard] Upstream: ${upstream}`);
        console.log(`[TransparentGuard] Policy: ${tg.getPolicy().name}`);
    });
    return server;
}
//# sourceMappingURL=server.js.map