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
import http from "node:http";
import type { ProxyConfig } from "./types.js";
export declare function startServer(config: ProxyConfig): http.Server;
//# sourceMappingURL=server.d.ts.map