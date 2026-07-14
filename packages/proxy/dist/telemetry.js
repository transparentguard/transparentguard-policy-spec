"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRACER_NAME = exports.SpanKind = exports.SpanStatusCode = exports.context = exports.trace = void 0;
exports.initTelemetry = initTelemetry;
exports.getTracer = getTracer;
exports.shutdownTelemetry = shutdownTelemetry;
const sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const resources_1 = require("@opentelemetry/resources");
const api_1 = require("@opentelemetry/api");
Object.defineProperty(exports, "trace", { enumerable: true, get: function () { return api_1.trace; } });
Object.defineProperty(exports, "context", { enumerable: true, get: function () { return api_1.context; } });
Object.defineProperty(exports, "SpanStatusCode", { enumerable: true, get: function () { return api_1.SpanStatusCode; } });
Object.defineProperty(exports, "SpanKind", { enumerable: true, get: function () { return api_1.SpanKind; } });
exports.TRACER_NAME = "transparentguard-proxy";
let provider = null;
let tracer = null;
/**
 * Initialize the OTEL SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Must be called before starting the HTTP server.
 */
function initTelemetry(serviceName = "transparentguard-proxy") {
    const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    if (!endpoint)
        return; // No collector configured — stay in no-op mode.
    if (provider)
        return; // Already initialized.
    provider = new sdk_trace_node_1.NodeTracerProvider({
        resource: new resources_1.Resource({
            "service.name": serviceName,
            "service.version": "0.1.0",
        }),
    });
    provider.addSpanProcessor(new sdk_trace_node_1.BatchSpanProcessor(new exporter_trace_otlp_http_1.OTLPTraceExporter({
        url: endpoint.replace(/\/$/, "") + "/v1/traces",
    })));
    provider.register(); // Registers as the global TracerProvider
    console.log(`[TransparentGuard] OTEL tracing enabled — exporting to ${endpoint}`);
}
/**
 * Get the singleton tracer. Returns a no-op tracer if OTEL was not initialized.
 */
function getTracer() {
    if (!tracer) {
        tracer = api_1.trace.getTracer(exports.TRACER_NAME, "0.1.0");
    }
    return tracer;
}
/**
 * Flush all pending spans and shut down the SDK. Call before process exit.
 */
async function shutdownTelemetry() {
    if (provider) {
        await provider.shutdown();
        provider = null;
        tracer = null;
    }
}
//# sourceMappingURL=telemetry.js.map