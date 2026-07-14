/**
 * TransparentGuard Proxy — OpenAI Handler
 *
 * Handles POST /v1/chat/completions (and any other /v1/* paths).
 * Runs pre-request policy evaluation, forwards to upstream, runs post-response
 * policy evaluation, then returns the (possibly redacted or blocked) response.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TransparentGuard } from "@transparentguard/runtime";
import type { RequestContext } from "../types.js";
export declare function handleOpenAI(req: IncomingMessage, res: ServerResponse, ctx: RequestContext, tg: TransparentGuard, upstream: string): Promise<void>;
//# sourceMappingURL=openai.d.ts.map