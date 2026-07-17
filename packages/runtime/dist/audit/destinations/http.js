"use strict";
/**
 * TransparentGuard Runtime — HTTP(S) Audit Destination
 * Posts audit events to an HTTPS webhook endpoint.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpDestination = void 0;
const emitter_js_1 = require("../emitter.js");
const DEFAULT_TIMEOUT_MS = 10_000;
class HttpDestination {
    url;
    constructor(url) {
        this.url = url;
    }
    async write(events, format) {
        if (events.length === 0)
            return;
        const body = emitter_js_1.AuditEmitter.serialize(events, format);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
        try {
            const response = await fetch(this.url, {
                method: "POST",
                headers: {
                    "Content-Type": format === "json" ? "application/json" : "application/x-ndjson",
                    "User-Agent": "transparentguard-runtime/0.1.0",
                },
                body,
                signal: controller.signal,
            });
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(`HTTP audit destination returned ${response.status}: ${text}`);
            }
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async flush() {
        // HTTP writes are fire-and-forget in write() — nothing to flush
    }
}
exports.HttpDestination = HttpDestination;
//# sourceMappingURL=http.js.map