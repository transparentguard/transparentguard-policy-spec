/**
 * TransparentGuard Runtime — File Audit Destination
 * Appends audit events to a local file in ndjson, json, or ocsf format.
 */
import type { AuditEvent } from "../../types.js";
export declare class FileDestination {
    private readonly filePath;
    private ensuredDir;
    constructor(filePath: string);
    write(events: AuditEvent[], format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=file.d.ts.map