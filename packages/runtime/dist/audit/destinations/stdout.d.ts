/**
 * TransparentGuard Runtime — Stdout Audit Destination
 * Writes audit events to stdout. Useful for development and log aggregators.
 */
import type { AuditEvent } from "../../types.js";
export declare class StdoutDestination {
    write(events: AuditEvent[], format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=stdout.d.ts.map