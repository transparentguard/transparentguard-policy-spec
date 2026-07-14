/**
 * TransparentGuard Proxy — Upstream HTTP Client
 *
 * A thin wrapper around Node's built-in fetch for forwarding requests
 * to the upstream LLM provider. Forwards all relevant headers and the body
 * verbatim, only swapping in the upstream API key.
 */
export interface UpstreamRequest {
    /** Full upstream base URL (e.g. https://api.openai.com) */
    upstreamBase: string;
    /** Path to forward (e.g. /v1/chat/completions) */
    path: string;
    /** HTTP method */
    method: string;
    /** Upstream API key — replaces whatever the client sent */
    apiKey: string;
    /** Request body (stringified JSON from the policy-evaluated payload) */
    body: string;
    /** Original request headers (minus Authorization, which we replace) */
    headers: Record<string, string>;
    /** Whether the request wants a streaming response */
    stream: boolean;
}
export interface UpstreamResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    /** Raw body as Buffer for streaming reconstruction */
    rawChunks: string[];
    ok: boolean;
}
/**
 * Call the upstream provider and return the full response.
 *
 * For streaming requests this buffers the entire SSE response into rawChunks
 * so the proxy can evaluate the assembled content before re-emitting.
 */
export declare function callUpstream(req: UpstreamRequest): Promise<UpstreamResponse>;
//# sourceMappingURL=client.d.ts.map