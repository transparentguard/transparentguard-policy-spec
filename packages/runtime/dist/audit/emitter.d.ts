/**
 * TransparentGuard Runtime — Audit Event Emitter
 * Builds structured audit events and routes them to configured destinations.
 * Supports ndjson, json, and OCSF output formats.
 * Implements RFC 8785-compatible canonical form for tamper-evident chain integrity.
 */
import type { AuditEvent, AuditEventType, RuleStage, TPSAudit, TPSPolicy, TPSRule, RequestPayload, ResponsePayload } from "../types.js";
export declare function makeId(): string;
export interface BuildAuditEventParams {
    policy: TPSPolicy;
    rule: TPSRule;
    eventType: AuditEventType;
    stage: RuleStage;
    payload: RequestPayload | ResponsePayload;
    tags: Record<string, string>;
    requestId?: string;
    detail?: string;
}
export declare function buildAuditEvent(params: BuildAuditEventParams): AuditEvent;
export declare function buildSystemAuditEvent(params: {
    policy: TPSPolicy;
    eventType: AuditEventType;
    detail: string;
    tags: Record<string, string>;
    requestId?: string;
}): AuditEvent;
export type AuditDestination = {
    write(events: AuditEvent[], format: "ndjson" | "json" | "ocsf"): Promise<void>;
    flush(): Promise<void>;
};
export declare class AuditEmitter {
    private readonly audit;
    private readonly licenseFeatures;
    private readonly buffer;
    private flushTimer;
    private lastEventHash;
    private chainSequence;
    private chainRootNonce;
    private chainInitialized;
    constructor(audit: TPSAudit, licenseFeatures?: string[]);
    /**
     * Gate 2: throws immediately if the configured audit destination requires a
     * license feature the current key does not include. Runs at construction time
     * so misconfigured policies are rejected before any evaluation begins.
     */
    private validateDestinationLicense;
    private initChain;
    /** Enqueue an audit event. Flushes when buffer hits batch_size. */
    enqueue(event: AuditEvent): void;
    enqueueMany(events: AuditEvent[]): void;
    private scheduleFlush;
    flush(): Promise<void>;
    private sendNotifications;
    /** Serialize events in the requested format */
    static serialize(events: AuditEvent[], format: "ndjson" | "json" | "ocsf"): string;
}
//# sourceMappingURL=emitter.d.ts.map