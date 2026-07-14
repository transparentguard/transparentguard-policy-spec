/**
 * TransparentGuard Proxy — Anthropic Handler
 *
 * Handles POST /v1/messages (Anthropic Messages API).
 * Mirrors the OpenAI handler design: pre-request eval → upstream → post-response eval.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TransparentGuard } from "@transparentguard/runtime";
import type { RequestContext } from "../types.js";
export declare function handleAnthropic(req: IncomingMessage, res: ServerResponse, ctx: RequestContext, tg: TransparentGuard, upstream: string): Promise<void>;
//# sourceMappingURL=anthropic.d.ts.map