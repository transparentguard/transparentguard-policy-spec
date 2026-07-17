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
import type { ResponsePayload, TPSPolicy, EvaluateOptions, StreamMode, OnStreamViolation } from "../types.js";
import type { LicenseStatus } from "../license/checker.js";
import type { AuditEmitter } from "../audit/emitter.js";
export type { StreamMode, OnStreamViolation } from "../types.js";
export interface StreamEvalConfig {
    mode: StreamMode;
    /** How many tokens to accumulate before evaluating a window (window mode only) */
    windowTokens: number;
    /** What to do when a violation is found mid-stream */
    onStreamViolation: OnStreamViolation;
}
/** Derive the effective streaming configuration from policy defaults + per-call overrides */
export declare function resolveStreamConfig(policy: TPSPolicy, overrides?: EvaluateOptions): StreamEvalConfig;
/**
 * Adapter callbacks that bridge provider-specific chunk types to the generic evaluator.
 * Implemented once per provider wrapper (OpenAI, Anthropic, etc.).
 */
export interface StreamChunkAdapter<C> {
    /** Extract text content from a chunk. Returns null/undefined when the chunk carries no text. */
    getContent(chunk: C): string | null | undefined;
    /** Extract model identifier from a chunk, if present. */
    getModel(chunk: C): string | undefined;
    /** Returns true when this chunk signals stream completion (finish_reason set, message_stop, etc.) */
    isFinish(chunk: C): boolean;
    /** Build a TPS ResponsePayload from the accumulated content + resolved model name. */
    makePayload(content: string, model: string): ResponsePayload;
    /**
     * Produce a synthetic "abort" chunk appended after a passthrough violation.
     * Signals to the consumer that content must be discarded.
     */
    makeAbortChunk(violationDetail: string, templateChunk: C): C;
    /**
     * Produce a synthetic chunk containing redacted window content.
     * Replaces the original window chunks when window-mode redaction fires.
     */
    makeRedactedChunk(redactedContent: string, templateChunk: C): C;
}
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
export declare function evaluateWindowedStream<C>(source: AsyncIterable<C>, adapter: StreamChunkAdapter<C>, policy: TPSPolicy, license: LicenseStatus, evalOptions: EvaluateOptions, config: StreamEvalConfig, emitter: AuditEmitter): AsyncGenerator<C>;
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
export declare function evaluatePassthroughStream<C>(source: AsyncIterable<C>, adapter: StreamChunkAdapter<C>, policy: TPSPolicy, license: LicenseStatus, evalOptions: EvaluateOptions, config: StreamEvalConfig, emitter: AuditEmitter): AsyncGenerator<C>;
//# sourceMappingURL=stream-evaluator.d.ts.map