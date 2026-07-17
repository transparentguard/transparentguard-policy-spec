"use strict";
/**
 * TransparentGuard Runtime — Audit Event Emitter
 * Builds structured audit events and routes them to configured destinations.
 * Supports ndjson, json, and OCSF output formats.
 * Implements RFC 8785-compatible canonical form for tamper-evident chain integrity.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEmitter = void 0;
exports.makeId = makeId;
exports.buildAuditEvent = buildAuditEvent;
exports.buildSystemAuditEvent = buildSystemAuditEvent;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ocsf_js_1 = require("./ocsf.js");
const file_js_1 = require("./destinations/file.js");
const stdout_js_1 = require("./destinations/stdout.js");
const http_js_1 = require("./destinations/http.js");
const s3_js_1 = require("./destinations/s3.js");
const postgres_js_1 = require("./destinations/postgres.js");
const otlp_js_1 = require("./destinations/otlp.js");
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
function makeId() {
    return `tge_${crypto_1.default.randomBytes(12).toString("hex")}`;
}
// ---------------------------------------------------------------------------
// RFC 8785 canonical JSON — sort keys recursively, no extra whitespace
// ---------------------------------------------------------------------------
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== "object")
        return obj;
    if (Array.isArray(obj))
        return obj.map(sortObjectKeys);
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
}
function canonicalize(obj) {
    return JSON.stringify(sortObjectKeys(obj));
}
// ---------------------------------------------------------------------------
// Chain integrity helpers
// ---------------------------------------------------------------------------
function computeEventHash(event, algorithm = "sha256") {
    // Exclude prev_event_hash from the hashed content per spec Section 28.3
    const { prev_event_hash: _prevHash, chain_sequence: _seq, ...rest } = event;
    void _prevHash;
    void _seq;
    const canonical = canonicalize(rest);
    const hash = algorithm === "sha3-256"
        ? crypto_1.default.createHash("sha3-256").update(canonical, "utf8").digest("hex")
        : crypto_1.default.createHash("sha256").update(canonical, "utf8").digest("hex");
    return `${algorithm}:${hash}`;
}
function writeSidecarAtomic(sidecarPath, data) {
    try {
        const dir = path_1.default.dirname(sidecarPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        const tmp = `${sidecarPath}.tmp.${process.pid}`;
        fs_1.default.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs_1.default.renameSync(tmp, sidecarPath);
    }
    catch (err) {
        console.error(`[TransparentGuard] Failed to write chain sidecar: ${String(err)}`);
    }
}
function readSidecar(sidecarPath) {
    try {
        if (!fs_1.default.existsSync(sidecarPath))
            return null;
        const raw = fs_1.default.readFileSync(sidecarPath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function buildAuditEvent(params) {
    const { policy, rule, eventType, stage, payload, tags, requestId, detail } = params;
    const provider = "provider" in payload ? payload.provider : undefined;
    const model = "model" in payload ? payload.model : undefined;
    const apiKeyId = "api_key_id" in payload ? payload.api_key_id : undefined;
    const event = {
        id: makeId(),
        timestamp: new Date().toISOString(),
        policy_name: policy.name,
        policy_version: policy.tps_version,
        rule_id: rule.id,
        event_type: eventType,
        stage,
        provider,
        model,
        api_key_id: apiKeyId,
        violation: detail
            ? {
                rule_id: rule.id,
                rule_description: rule.description,
                outcome: eventType,
                detail,
            }
            : undefined,
        tags: { ...tags },
        metadata: rule.metadata
            ? rule.metadata
            : undefined,
        // prev_event_hash and chain_sequence are set by AuditEmitter.enqueue()
        request_id: requestId,
    };
    return event;
}
function buildSystemAuditEvent(params) {
    const { policy, eventType, detail, tags, requestId } = params;
    const event = {
        id: makeId(),
        timestamp: new Date().toISOString(),
        policy_name: policy.name,
        policy_version: policy.tps_version,
        event_type: eventType,
        stage: "system",
        tags: { ...tags },
        violation: {
            rule_id: "system",
            outcome: eventType,
            detail,
        },
        request_id: requestId,
    };
    return event;
}
const destinations = new Map();
function getDestination(uri) {
    const cached = destinations.get(uri);
    if (cached)
        return cached;
    let dest;
    if (uri === "stdout://" || uri === "stdout:///") {
        dest = new stdout_js_1.StdoutDestination();
    }
    else if (uri.startsWith("file://")) {
        const filePath = uri.slice("file://".length);
        dest = new file_js_1.FileDestination(filePath);
    }
    else if (uri.startsWith("https://") || uri.startsWith("http://")) {
        dest = new http_js_1.HttpDestination(uri);
    }
    else if (uri.startsWith("s3://")) {
        dest = new s3_js_1.S3Destination(uri);
    }
    else if (uri.startsWith("postgres://") || uri.startsWith("postgresql://")) {
        dest = new postgres_js_1.PostgresDestination(uri);
    }
    else if (uri.startsWith("otlp://") || uri.startsWith("otlps://")) {
        dest = new otlp_js_1.OtlpDestination(uri);
    }
    else {
        console.warn(`[TransparentGuard] Unrecognised audit destination scheme: "${uri}". Falling back to stdout. ` +
            `Supported schemes: stdout://, file://, http://, https://, s3://, postgres://, otlp://, otlps://`);
        dest = new stdout_js_1.StdoutDestination();
    }
    destinations.set(uri, dest);
    return dest;
}
// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------
class AuditEmitter {
    audit;
    licenseFeatures;
    buffer = [];
    flushTimer = null;
    // Per-instance chain integrity state (fixes the module-level shared state bug)
    lastEventHash;
    chainSequence = 0;
    chainRootNonce;
    chainInitialized = false;
    constructor(audit, licenseFeatures = []) {
        this.audit = audit;
        this.licenseFeatures = licenseFeatures;
        this.validateDestinationLicense(); // Gate 2: audit destination feature check
        this.initChain();
    }
    /**
     * Gate 2: throws immediately if the configured audit destination requires a
     * license feature the current key does not include. Runs at construction time
     * so misconfigured policies are rejected before any evaluation begins.
     */
    validateDestinationLicense() {
        const dest = this.audit.destination;
        if (!dest)
            return;
        const checks = [
            ["s3://", "audit_s3", "S3 audit destinations"],
            ["postgres://", "audit_postgres", "PostgreSQL audit destinations"],
            ["postgresql://", "audit_postgres", "PostgreSQL audit destinations"],
            ["gcs://", "audit_gcs", "GCS audit destinations"],
            ["azure://", "audit_azure", "Azure audit destinations"],
        ];
        for (const [scheme, feature, label] of checks) {
            if (dest.startsWith(scheme) && !this.licenseFeatures.includes(feature)) {
                throw new Error(`[TransparentGuard] ${label} require the ${feature} license feature ` +
                    `(Startup tier or above). Upgrade at transparentguard.dev.`);
            }
        }
    }
    initChain() {
        const ci = this.audit.chain_integrity;
        if (!ci?.enabled)
            return;
        // Chain integrity requires audit_chain_integrity license feature (Startup tier and above)
        if (!this.licenseFeatures.includes("audit_chain_integrity")) {
            // Gate 2 (hard): chain integrity silently disabled is exploitable — throw instead
            throw new Error("[TransparentGuard] audit.chain_integrity requires the audit_chain_integrity license feature " +
                "(Startup tier or above). Upgrade at transparentguard.dev.");
        }
        if (ci.sidecar_path) {
            const existing = readSidecar(ci.sidecar_path);
            if (existing) {
                this.chainRootNonce = existing.chain_root_nonce;
                this.lastEventHash = existing.last_event_hash;
                this.chainSequence = existing.last_sequence + 1;
                this.chainInitialized = true;
                return;
            }
        }
        // Fresh chain — generate root nonce
        this.chainRootNonce = crypto_1.default.randomBytes(32).toString("base64url");
        const algorithm = ci.algorithm ?? "sha256";
        const nonceHash = algorithm === "sha3-256"
            ? crypto_1.default.createHash("sha3-256").update(this.chainRootNonce, "utf8").digest("hex")
            : crypto_1.default.createHash("sha256").update(this.chainRootNonce, "utf8").digest("hex");
        this.lastEventHash = `${algorithm}:${nonceHash}`;
        this.chainSequence = 0;
        this.chainInitialized = true;
    }
    /** Enqueue an audit event. Flushes when buffer hits batch_size. */
    enqueue(event) {
        if (!this.audit.enabled)
            return;
        const allowedTypes = this.audit.events ?? [
            "allowed", "blocked", "redacted", "warned", "error",
        ];
        if (!allowedTypes.includes(event.event_type))
            return;
        // Apply chain integrity fields before buffering
        const ci = this.audit.chain_integrity;
        if (ci?.enabled && this.chainInitialized) {
            event.chain_sequence = this.chainSequence;
            event.prev_event_hash = this.lastEventHash;
            this.lastEventHash = computeEventHash(event, ci.algorithm ?? "sha256");
            this.chainSequence++;
        }
        this.buffer.push(event);
        const batchSize = this.audit.batch_size ?? 100;
        if (this.buffer.length >= batchSize) {
            void this.flush();
        }
        else {
            this.scheduleFlush();
        }
    }
    enqueueMany(events) {
        for (const e of events)
            this.enqueue(e);
    }
    scheduleFlush() {
        if (this.flushTimer)
            return;
        const intervalMs = this.audit.flush_interval_ms ?? 5000;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, intervalMs);
    }
    async flush() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.buffer.length === 0)
            return;
        const events = this.buffer.splice(0);
        if (!this.audit.destination)
            return;
        const format = this.audit.format ?? "ndjson";
        const dest = getDestination(this.audit.destination);
        try {
            await dest.write(events, format);
        }
        catch (err) {
            // Audit failures must never crash the application
            console.error(`[TransparentGuard] Audit write failed: ${String(err)}`);
        }
        // Update chain sidecar after writing events
        const ci = this.audit.chain_integrity;
        if (ci?.enabled && ci.sidecar_path && this.chainRootNonce && events.length > 0) {
            const lastEvent = events[events.length - 1];
            if (lastEvent) {
                writeSidecarAtomic(ci.sidecar_path, {
                    tg_sidecar_version: "1.0",
                    chain_root_nonce: this.chainRootNonce,
                    algorithm: ci.algorithm ?? "sha256",
                    last_event_id: lastEvent.id,
                    last_event_hash: this.lastEventHash ?? "",
                    last_sequence: lastEvent.chain_sequence ?? this.chainSequence - 1,
                    last_updated: new Date().toISOString(),
                    destination: this.audit.destination ?? "",
                });
            }
        }
        // Webhook notifications (fire-and-forget, non-blocking)
        if (this.audit.notify?.length) {
            void this.sendNotifications(events);
        }
    }
    async sendNotifications(events) {
        const violationEvents = events.filter((e) => e.event_type === "blocked" || e.event_type === "redacted" || e.event_type === "warned");
        if (violationEvents.length === 0)
            return;
        for (const notify of this.audit.notify ?? []) {
            const filteredEvents = violationEvents.filter((e) => notify.events.includes(e.event_type));
            if (filteredEvents.length === 0)
                continue;
            const maxAttempts = notify.retry?.max_attempts ?? 3;
            const backoffMs = notify.retry?.backoff_ms ?? 500;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), notify.timeout_ms ?? 5000);
                    const response = await fetch(notify.url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(notify.headers ?? {}),
                        },
                        body: JSON.stringify({
                            notification_type: "violation_alert",
                            events: filteredEvents,
                        }),
                        signal: controller.signal,
                    });
                    clearTimeout(timeout);
                    if (response.ok)
                        break;
                    // Non-2xx — retry
                }
                catch {
                    // Network error — retry with backoff
                }
                if (attempt < maxAttempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
                }
            }
        }
    }
    /** Serialize events in the requested format */
    static serialize(events, format) {
        if (format === "ndjson") {
            return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
        }
        if (format === "json") {
            return JSON.stringify(events, null, 2) + "\n";
        }
        if (format === "ocsf") {
            return events.map((e) => JSON.stringify((0, ocsf_js_1.toOcsfEvent)(e))).join("\n") + "\n";
        }
        return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    }
}
exports.AuditEmitter = AuditEmitter;
//# sourceMappingURL=emitter.js.map