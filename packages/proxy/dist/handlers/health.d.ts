/**
 * TransparentGuard Proxy — Health & Readiness Handlers
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TransparentGuard } from "@transparentguard/runtime";
export declare function handleHealth(res: ServerResponse): void;
export declare function handleReady(res: ServerResponse, tg: TransparentGuard | null): void;
export declare function handleNotFound(req: IncomingMessage, res: ServerResponse): void;
//# sourceMappingURL=health.d.ts.map