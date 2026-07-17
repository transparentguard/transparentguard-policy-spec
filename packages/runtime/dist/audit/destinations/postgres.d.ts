/**
 * TransparentGuard Runtime — PostgreSQL Audit Destination
 *
 * Inserts audit events into a PostgreSQL table.
 * Auto-creates the `tg_audit_events` table and indexes on first write.
 *
 * Requirements:
 *   npm install pg
 *
 * URI format: postgres://user:password@host:5432/database
 */
import type { AuditEvent } from "../../types.js";
export declare class PostgresDestination {
    private readonly connectionString;
    private pool;
    private ddlApplied;
    constructor(postgresUri: string);
    private getPool;
    private ensureDdl;
    write(events: AuditEvent[], _format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=postgres.d.ts.map