/**
 * TransparentGuard Runtime — OTLP Logs Audit Destination
 *
 * Sends audit events as OpenTelemetry Log Records via OTLP HTTP/JSON.
 * Works with any OTEL-compatible collector: Grafana Loki, Datadog, Elastic,
 * Honeycomb, AWS CloudWatch, GCP Cloud Logging, Azure Monitor.
 *
 * No additional npm packages required — uses Node's built-in fetch.
 *
 * URI formats:
 *   otlp://host:4318       → http://host:4318/v1/logs
 *   otlps://host:4317      → https://host:4317/v1/logs
 *
 * Standard OTEL env vars are also honoured:
 *   OTEL_EXPORTER_OTLP_ENDPOINT   (e.g. http://localhost:4318)
 *   OTEL_EXPORTER_OTLP_HEADERS    (comma-separated key=value pairs)
 */
import type { AuditEvent } from "../../types.js";
export declare class OtlpDestination {
    private readonly endpoint;
    private readonly headers;
    constructor(uri: string);
    write(events: AuditEvent[], _format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=otlp.d.ts.map