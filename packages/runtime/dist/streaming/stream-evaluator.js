"use strict";
/**
 * TransparentGuard Runtime — Streaming Enforcement Engine
 *
 * Implements all three TPS streaming modes (Section 25):
 *   buffer      — collect all tokens, evaluate full response, re-yield (default, lowest risk)
 *   window      — evaluate rolling windows of N tokens; abort mid-stream on violation
 *   passthrough — yield every token immediately; full evaluation at completion
 *
 * Generic over chunk type C via StreamChunkAdapter<C>.
 * Used by provider wrappers; not called directly by engine.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStreamConfig = resolveStreamConfig;
exports.evaluateWindowedStream = evaluateWindowedStream;
exports.evaluatePassthroughStream = evaluatePassthroughStream;
const checker_js_1 = require("../license/checker.js");
const engine_js_1 = require("../engine.js");
const token_budget_js_1 = require("../enforcements/token-budget.js");
/** Derive the effective streaming configuration from policy defaults + per-call overrides */
function resolveStreamConfig(policy, overrides) {
    return {
        mode: overrides?.streamMode ?? policy.audit.streaming?.mode ?? "buffer",
        windowTokens: overrides?.windowTokens ?? policy.audit.streaming?.window_tokens ?? 200,
        onStreamViolation: overrides?.onStreamViolation ??
            policy.audit.streaming?.on_stream_violation ??
            "block",
    };
}
// ---------------------------------------------------------------------------
// Window mode
// ---------------------------------------------------------------------------
/**
 * Window-mode streaming evaluator.
 *
 * Accumulates chunks into windows of `config.windowTokens` tokens.
 * After each full window (and at stream end) evaluates the full accumulated
 * response so far via the post-response rule graph.
 *
 * On violation with onStreamViolation = "block":
 *   Throws TransparentGuardError — the caller's for-await loop will terminate.
 *
 * On violation with onStreamViolation = "passthrough_and_log":
 *   Logs the violation via the audit emitter and continues yielding.
 *
 * On redaction (final window only):
 *   Yields a single synthetic redacted chunk in place of the raw window chunks.
 */
async function* evaluateWindowedStream(source, adapter, policy, license, evalOptions, config, emitter) {
    // Gate 2: window mode is a Startup+ feature; buffer mode is always available
    (0, checker_js_1.assertFeature)(license, "streaming_window", "Streaming window mode");
    let accumulated = "";
    let windowTokenCount = 0;
    let windowChunks = [];
    let firstChunk;
    let model = "";
    const flushWindow = async (isFinal) => {
        if (windowChunks.length === 0)
            return [];
        const payload = adapter.makePayload(accumulated, model);
        const result = await (0, engine_js_1.evaluate)("post-response", payload, policy, license, evalOptions);
        emitter.enqueueMany(result.audit_events);
        if (!result.allowed) {
            const detail = result.violations[0]?.detail ??
                "Policy violation detected in stream window";
            if (config.onStreamViolation === "block") {
                throw new checker_js_1.TransparentGuardError(detail, "policy_violation");
            }
            // passthrough_and_log: yield original window chunks unchanged
            return windowChunks;
        }
        const finalPayload = result.payload;
        const contentWasRedacted = isFinal ? finalPayload.content !== accumulated : false;
        if (contentWasRedacted && firstChunk) {
            return [adapter.makeRedactedChunk(finalPayload.content, firstChunk)];
        }
        return windowChunks;
    };
    for await (const chunk of source) {
        if (!firstChunk)
            firstChunk = chunk;
        const chunkModel = adapter.getModel(chunk);
        if (chunkModel)
            model = chunkModel;
        const content = adapter.getContent(chunk);
        if (content) {
            accumulated += content;
            windowTokenCount += (0, token_budget_js_1.approximateTokenCount)(content);
        }
        windowChunks.push(chunk);
        const isFinalChunk = adapter.isFinish(chunk);
        if (windowTokenCount >= config.windowTokens || isFinalChunk) {
            const toYield = await flushWindow(isFinalChunk);
            for (const c of toYield)
                yield c;
            windowTokenCount = 0;
            windowChunks = [];
        }
    }
    // Flush any remaining unflushed chunks
    if (windowChunks.length > 0) {
        const toYield = await flushWindow(true);
        for (const c of toYield)
            yield c;
    }
}
// ---------------------------------------------------------------------------
// Passthrough mode
// ---------------------------------------------------------------------------
/**
 * Passthrough-mode streaming evaluator.
 *
 * Yields every chunk to the consumer immediately as it arrives.
 * Simultaneously accumulates all content. After the stream ends,
 * runs a full post-response evaluation on the complete content.
 *
 * On violation with onStreamViolation = "block":
 *   Appends a synthetic abort chunk to signal the consumer, then throws.
 *
 * On violation with onStreamViolation = "passthrough_and_log":
 *   Logs the violation via the audit emitter. Consumer already has all tokens.
 *
 * Note: passthrough mode cannot redact content already sent to the consumer.
 * For redaction guarantees use buffer or window mode.
 */
async function* evaluatePassthroughStream(source, adapter, policy, license, evalOptions, config, emitter) {
    // Gate 2: passthrough mode shares the streaming_window feature gate (Startup tier and above)
    (0, checker_js_1.assertFeature)(license, "streaming_window", "Streaming passthrough mode");
    let accumulated = "";
    let model = "";
    let firstChunk;
    for await (const chunk of source) {
        if (!firstChunk)
            firstChunk = chunk;
        const chunkModel = adapter.getModel(chunk);
        if (chunkModel)
            model = chunkModel;
        const content = adapter.getContent(chunk);
        if (content)
            accumulated += content;
        yield chunk; // passthrough — emit immediately
    }
    if (!accumulated || !firstChunk)
        return;
    // Post-stream evaluation on fully assembled content
    const payload = adapter.makePayload(accumulated, model);
    const result = await (0, engine_js_1.evaluate)("post-response", payload, policy, license, evalOptions);
    emitter.enqueueMany(result.audit_events);
    if (!result.allowed) {
        const detail = result.violations[0]?.detail ??
            "Policy violation detected after stream completion";
        if (config.onStreamViolation === "block") {
            yield adapter.makeAbortChunk(detail, firstChunk);
            throw new checker_js_1.TransparentGuardError(detail, "policy_violation");
        }
        // passthrough_and_log: already yielded all tokens; violation is in audit log
    }
}
//# sourceMappingURL=stream-evaluator.js.map