/**
 * @transparentguard/runtime-oem
 *
 * OEM / embedded distribution package for TransparentGuard.
 * Re-exports the full runtime API with two additions:
 *
 *   1. White-label support — pass `brandName` to rename all log prefixes
 *      and error messages from "TransparentGuard" to your product name.
 *
 *   2. Usage reporting — call `reportUsage()` to POST call volume to
 *      your billing webhook so TransparentGuard can track revenue share.
 *
 * @example
 * ```typescript
 * import { createOemRuntime, reportUsage } from "@transparentguard/runtime-oem";
 *
 * const tg = await createOemRuntime({
 *   policy: "./policies/production.yaml",
 *   licenseKey: process.env.TG_LICENSE_KEY,
 *   brandName: "AcmeGuard",               // white-label — replaces [TransparentGuard] in logs
 *   usageWebhook: process.env.TG_OEM_WEBHOOK,
 * });
 *
 * // Wrap your OpenAI client as normal
 * const client = tg.wrap(new OpenAI());
 * ```
 */

// ---------------------------------------------------------------------------
// Re-export the full runtime public API
// ---------------------------------------------------------------------------

export * from "@transparentguard/runtime";
export {
  TransparentGuard,
  TransparentGuardError,
} from "@transparentguard/runtime";

// ---------------------------------------------------------------------------
// OEM types
// ---------------------------------------------------------------------------

export interface OemRuntimeOptions {
  /** Path or URI to the TPS policy file */
  policy: string;
  /** Offline license key (TG_LICENSE_KEY env var — no network call) */
  licenseKey?: string;
  /** Replace "TransparentGuard" in log prefixes and error messages */
  brandName?: string;
  /** HTTPS URL to POST usage data to for billing reconciliation */
  usageWebhook?: string;
  /** Additional runtime options forwarded to TransparentGuard.init() */
  [key: string]: unknown;
}

export interface UsagePayload {
  /** ISO 8601 period start */
  period_start: string;
  /** ISO 8601 period end */
  period_end: string;
  /** Total calls routed through this OEM deployment */
  call_count: number;
  /** Breakdown by provider if available */
  by_provider?: Record<string, number>;
  /** Your customer identifier (from license key payload) */
  customer_id?: string;
  /** Runtime version */
  runtime_version: string;
}

// ---------------------------------------------------------------------------
// White-label wrapper
// ---------------------------------------------------------------------------

import { TransparentGuard } from "@transparentguard/runtime";
import type { TransparentGuardOptions } from "@transparentguard/runtime";

/**
 * Create an OEM-configured TransparentGuard instance.
 * Sets TG_LICENSE_KEY from options.licenseKey if provided.
 * Patches console output to use brandName instead of "TransparentGuard".
 */
export async function createOemRuntime(
  options: OemRuntimeOptions,
): Promise<TransparentGuard> {
  const { licenseKey, brandName, usageWebhook: _usageWebhook, policy, ...rest } = options;

  // Set offline license key so the runtime picks it up
  if (licenseKey) {
    process.env["TG_LICENSE_KEY"] = licenseKey;
  }

  // Patch console.warn / console.error to apply white-label substitution
  if (brandName) {
    const original = { warn: console.warn, error: console.error };
    const patch =
      (fn: typeof console.warn) =>
      (...args: unknown[]) => {
        const patched = args.map((a) =>
          typeof a === "string" ? a.replace(/TransparentGuard/g, brandName) : a,
        );
        fn.apply(console, patched);
      };
    console.warn = patch(original.warn);
    console.error = patch(original.error);
  }

  const initOptions: TransparentGuardOptions = {
    policy,
    ...(rest as Partial<TransparentGuardOptions>),
  };

  return TransparentGuard.init(initOptions);
}

// ---------------------------------------------------------------------------
// Usage reporting
// ---------------------------------------------------------------------------

/**
 * POST usage data to the OEM billing webhook.
 * Call this on a schedule (e.g. daily or per billing period).
 * Failures are logged but do not throw — usage reporting is non-critical.
 */
export async function reportUsage(
  webhookUrl: string,
  payload: UsagePayload,
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "transparentguard-oem/0.1.0",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(
        `[TransparentGuard OEM] Usage report returned HTTP ${res.status}. ` +
          `Verify your webhook URL and credentials.`,
      );
    }
  } catch (err: unknown) {
    console.warn(
      `[TransparentGuard OEM] Usage report failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
