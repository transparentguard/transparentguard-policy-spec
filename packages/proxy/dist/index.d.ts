#!/usr/bin/env node
/**
 * TransparentGuard Proxy Server — CLI Entry Point
 *
 * Usage:
 *   tg-proxy --policy ./policy.yaml --upstream https://api.openai.com [options]
 *
 * Options:
 *   --policy, -p          <path|oci://ref>  TPS policy file or OCI artifact reference (required)
 *   --upstream, -u        <url>             Upstream LLM API base URL (required)
 *   --port                <number>          Port to listen on (default: $PORT or 8080)
 *   --upstream-api-key    <key>             Override upstream API key (default: from client Authorization header)
 *   --tg-api-key          <key>             TransparentGuard API key for paid-tier features
 *   --log-level           debug|info|error  Log verbosity (default: info)
 *   --offline-mode                          Skip license check (free tier only)
 *
 * Environment variables:
 *   PORT                            Overrides --port
 *   UPSTREAM_API_KEY                Overrides --upstream-api-key
 *   TG_API_KEY                      Overrides --tg-api-key
 *   OTEL_EXPORTER_OTLP_ENDPOINT     Enables OTEL tracing (no-op if absent)
 *   OTEL_SERVICE_NAME               OTEL service name (default: transparentguard-proxy)
 *   TG_COSIGN_VERIFY                Set to "true" to require Cosign verification on OCI policies
 *   TG_COSIGN_PUBLIC_KEY_PATH       Path to PEM public key for Cosign verification
 */
export {};
//# sourceMappingURL=index.d.ts.map