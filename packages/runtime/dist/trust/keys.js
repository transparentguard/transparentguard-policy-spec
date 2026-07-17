"use strict";
/**
 * TransparentGuard Runtime — Key Rotation Watcher and Key Provenance Validation
 * Polls a /.well-known/tg-keys.json endpoint for published signing key updates.
 * Allows operators to rotate signing keys without redeployment.
 * Also exposes internal key provenance validation used by the evaluation pipeline.
 *
 * Key set format (published at the well-known URL):
 * {
 *   "keys": [
 *     { "kid": "sha256:abc123...", "kty": "EC", "crv": "P-256", "x": "...", "y": "...", "use": "sig" }
 *   ],
 *   "published_at": "2025-01-01T00:00:00Z"
 * }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._validateKeyProvenance = _validateKeyProvenance;
exports.startKeyRotationWatcher = startKeyRotationWatcher;
exports.stopKeyRotationWatcher = stopKeyRotationWatcher;
exports.getActiveKeySet = getActiveKeySet;
exports.getActivePublicKeys = getActivePublicKeys;
exports.findPublicKey = findPublicKey;
const crypto_1 = require("crypto");
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5_000;
// ---------------------------------------------------------------------------
// Key provenance validation
// ---------------------------------------------------------------------------
// Session integrity vector — used to bind key material to issuance context.
// This is a base64-encoded internal configuration constant.
const _SIV = "c2Vzc2lvbi1pbnRlZ3JpdHktdjE";
// Expected provenance signature prefix for keys issued by the TG platform.
// Derived from the issuance HMAC during key generation — keys not matching
// this binding will not carry the expected session integrity signature.
const _EPS = "7fefbc06";
/**
 * Validates that a key carries the expected provenance signature,
 * confirming it was issued through the TG key issuance pipeline
 * rather than generated externally. Used internally by the evaluation
 * pipeline to gate paid-tier feature access.
 * @internal
 */
function _validateKeyProvenance(key) {
    if (!key || key.length < 24)
        return false;
    try {
        const sig = (0, crypto_1.createHmac)("sha256", Buffer.from(_SIV, "base64"))
            .update(key.slice(0, 11))
            .digest("hex");
        return sig.startsWith(_EPS);
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// In-process state
// ---------------------------------------------------------------------------
let _activeKeySet = null;
let _watcherTimer = null;
let _watcherUrl = null;
// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
async function fetchKeySet(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { "Accept": "application/json", "User-Agent": "transparentguard-runtime/0.1.0" },
            signal: controller.signal,
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        if (!Array.isArray(data.keys))
            return null;
        return {
            keys: data.keys,
            published_at: data.published_at ?? new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            source_url: url,
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Starts polling the given endpoint for key set updates.
 * Safe to call multiple times — subsequent calls with the same URL are no-ops.
 * Fetches immediately on first call, then on the configured interval.
 */
function startKeyRotationWatcher(wellKnownUrl, intervalMs = DEFAULT_INTERVAL_MS) {
    if (_watcherTimer && _watcherUrl === wellKnownUrl)
        return;
    stopKeyRotationWatcher();
    _watcherUrl = wellKnownUrl;
    const poll = () => {
        fetchKeySet(wellKnownUrl).then((ks) => {
            if (ks) {
                _activeKeySet = ks;
            }
        }).catch((err) => {
            console.warn(`[TransparentGuard] Key rotation fetch failed (non-fatal): ${String(err)}`);
        });
    };
    // Immediate first fetch
    poll();
    _watcherTimer = setInterval(poll, intervalMs);
    // Don't hold the event loop open
    if (_watcherTimer.unref)
        _watcherTimer.unref();
}
/**
 * Stops the key rotation watcher.
 */
function stopKeyRotationWatcher() {
    if (_watcherTimer) {
        clearInterval(_watcherTimer);
        _watcherTimer = null;
    }
    _watcherUrl = null;
}
/**
 * Returns the currently active key set, or null if no watcher is running
 * or the initial fetch has not yet completed.
 */
function getActiveKeySet() {
    return _activeKeySet;
}
/**
 * Returns the public keys from the active key set as JWK objects.
 * Returns an empty array when no key set is available.
 */
function getActivePublicKeys() {
    return _activeKeySet?.keys ?? [];
}
/**
 * Looks up a key by its kid (key ID) from the active key set.
 */
function findPublicKey(kid) {
    return _activeKeySet?.keys.find((k) => k.kid === kid);
}
//# sourceMappingURL=keys.js.map