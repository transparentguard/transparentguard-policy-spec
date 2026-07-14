/**
 * TransparentGuard Proxy — OpenTelemetry Tracing Initialization
 *
 * Initializes the OTEL Node.js SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * If the env var is absent, tracing is a no-op — zero overhead, zero config required.
 *
 * Standard OTEL env vars are honoured automatically:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  - collector endpoint (e.g. http://localhost:4318)
 *   OTEL_SERVICE_NAME            - service name (default: transparentguard-proxy)
 *   OTEL_EXPORTER_OTLP_HEADERS   - auth/routing headers (comma-separated key=value)
 */
import { trace, context, SpanStatusCode, SpanKind, type Tracer, type Span } from "@opentelemetry/api";
export { trace, context, SpanStatusCode, SpanKind };
export type { Tracer, Span };
export declare const TRACER_NAME = "transparentguard-proxy";
/**
 * Initialize the OTEL SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Must be called before starting the HTTP server.
 */
export declare function initTelemetry(serviceName?: string): void;
/**
 * Get the singleton tracer. Returns a no-op tracer if OTEL was not initialized.
 */
export declare function getTracer(): Tracer;
/**
 * Flush all pending spans and shut down the SDK. Call before process exit.
 */
export declare function shutdownTelemetry(): Promise<void>;
//# sourceMappingURL=telemetry.d.ts.map