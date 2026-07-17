/**
 * TransparentGuard Runtime — Evaluation Engine
 * The core rule graph builder and evaluate() function.
 * Implements all TPS v1.0 rule types.
 */
import type { EvaluateOptions, EvaluateResult, RequestPayload, ResponsePayload, RuleStage, TPSPolicy } from "./types.js";
import { expandCategories } from "./evaluators/pii.js";
import { type LicenseStatus } from "./license/checker.js";
/**
 * Public evaluate() entry point.
 *
 * Wraps coreEvaluate() with fail_mode handling (Section 3a — Phase 10):
 *   fail_mode: "closed" (default) — rethrow any unexpected engine error (safest)
 *   fail_mode: "open"             — on error, return allowed: true with audit event
 *
 * Precedence: environment.fail_mode > policy.fail_mode > "closed"
 */
export declare function evaluate(stage: RuleStage, payload: RequestPayload | ResponsePayload, policy: TPSPolicy, licenseStatus: LicenseStatus, options?: EvaluateOptions): Promise<EvaluateResult>;
export { expandCategories };
//# sourceMappingURL=engine.d.ts.map