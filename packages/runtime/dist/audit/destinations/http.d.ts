/**
 * TransparentGuard Runtime — HTTP(S) Audit Destination
 * Posts audit events to an HTTPS webhook endpoint.
 */
import type { AuditEvent } from "../../types.js";
export declare class HttpDestination {
    private readonly url;
    constructor(url: string);
    write(events: AuditEvent[], format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=http.d.ts.map