/**
 * TransparentGuard Runtime — S3 Audit Destination
 *
 * Uploads audit events to Amazon S3 (or any S3-compatible endpoint).
 * Uses batched PutObject calls keyed by timestamp for Athena/Glue compatibility.
 *
 * On first write, enforces a lifecycle policy on the bucket:
 *   - Transition to STANDARD_IA at 90 days
 *   - Transition to GLACIER at 365 days
 *   - Expire (delete) at 2555 days (7 years — HIPAA 164.530(j) compliant)
 *
 * The retention_days option overrides the default 2555-day expiry.
 *
 * Requirements:
 *   npm install @aws-sdk/client-s3 @aws-sdk/client-s3-control
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (standard AWS SDK env vars)
 *
 * URI format: s3://bucket-name/optional/prefix/
 */
import type { AuditEvent } from "../../types.js";
export declare class S3Destination {
    private readonly bucket;
    private readonly prefix;
    private readonly region;
    private readonly endpoint;
    private readonly retentionDays;
    private sdk;
    private lifecycleApplied;
    private lifecyclePending;
    constructor(s3Uri: string, retentionDays?: number);
    private getSdk;
    private getClient;
    /**
     * Ensures lifecycle policy is applied before the first write.
     * Subsequent writes skip this check (lifecycleApplied flag).
     */
    private ensureLifecycle;
    write(events: AuditEvent[], format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=s3.d.ts.map