"use strict";
/**
 * TransparentGuard Proxy — Health & Readiness Handlers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHealth = handleHealth;
exports.handleReady = handleReady;
exports.handleNotFound = handleNotFound;
function handleHealth(res) {
    const body = JSON.stringify({ status: "ok", service: "transparentguard-proxy" });
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}
function handleReady(res, tg) {
    if (!tg) {
        const body = JSON.stringify({ status: "initializing" });
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(body);
        return;
    }
    const policy = tg.getPolicy();
    const body = JSON.stringify({
        status: "ready",
        policy: policy.name,
        policy_version: policy.tps_version,
    });
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}
function handleNotFound(req, res) {
    const body = JSON.stringify({
        error: {
            message: `Route not found: ${req.method ?? "?"} ${req.url ?? "/"}`,
            type: "invalid_request_error",
            code: "not_found",
        },
    });
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(body);
}
//# sourceMappingURL=health.js.map