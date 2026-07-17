# OEM Package

`@transparentguard/runtime-oem` is the embedded distribution package for OEM partners. It re-exports the full runtime API with white-label support and usage reporting for revenue-share tracking. Use it when you are embedding TG inside your own product under your own brand name.

---

## Install

```bash
npm install @transparentguard/runtime-oem
```

All exports from `@transparentguard/runtime` are re-exported from the OEM package — it is a full drop-in for the standard runtime.

---

## White-label initialisation

```typescript
import { createOemRuntime, reportUsage } from "@transparentguard/runtime-oem";
import OpenAI from "openai";

// brandName replaces "[TransparentGuard]" in all logs and error messages
const tg = await createOemRuntime({
  policy:        "./policies/production.yaml",
  licenseKey:    process.env.TG_LICENSE_KEY,
  brandName:     "AcmeGuard",               // white-label — shown in errors + logs
  usageWebhook:  process.env.TG_OEM_WEBHOOK, // revenue-share reporting endpoint
});

const client = tg.wrap(new OpenAI());

// To the application, this is "AcmeGuard" — no TransparentGuard branding visible
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: userInput }],
});
```

---

## Usage reporting (billing reconciliation)

Call `reportUsage()` on a schedule (daily or per billing period) to report call volume to the TransparentGuard revenue-share endpoint:

```typescript
import { reportUsage } from "@transparentguard/runtime-oem";

// Call daily or at the end of each billing period
await reportUsage(process.env.TG_OEM_WEBHOOK!, {
  period_start:    "2026-07-01T00:00:00Z",
  period_end:      "2026-07-31T23:59:59Z",
  call_count:      142_000,
  by_provider: {
    "openai/gpt-4o":                      98_000,
    "anthropic/claude-3-5-sonnet-20241022": 44_000,
  },
  customer_id:     "acme-corp",
  runtime_version: "0.1.0",
});
```

The `reportUsage()` call is idempotent for the same `period_start` / `period_end` / `customer_id` combination — safe to retry on failure.

---

## Scheduled usage reporting (Node.js cron)

```typescript
import { createOemRuntime, reportUsage } from "@transparentguard/runtime-oem";
import { CronJob } from "cron";

const tg = await createOemRuntime({ ... });
let callCount = 0;

// Intercept all calls to count them
tg.on("evaluation", () => { callCount++; });

// Report at midnight UTC on the first of each month
new CronJob("0 0 1 * *", async () => {
  const now    = new Date();
  const start  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const end    = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  await reportUsage(process.env.TG_OEM_WEBHOOK!, {
    period_start:    start,
    period_end:      end,
    call_count:      callCount,
    customer_id:     "acme-corp",
    runtime_version: process.env.npm_package_version ?? "unknown",
  });

  callCount = 0;   // reset counter for next period
}).start();
```

---

## Python OEM

```python
from transparentguard_oem import create_oem_runtime, report_usage
import os

tg = create_oem_runtime(
    policy="./policies/production.yaml",
    license_key=os.environ["TG_LICENSE_KEY"],
    brand_name="AcmeGuard",
    usage_webhook=os.environ["TG_OEM_WEBHOOK"],
)

# Report usage
report_usage(
    webhook_url=os.environ["TG_OEM_WEBHOOK"],
    period_start="2026-07-01T00:00:00Z",
    period_end="2026-07-31T23:59:59Z",
    call_count=142000,
    customer_id="acme-corp",
    runtime_version="0.1.0",
)
```

---

## createOemRuntime options

```typescript
interface OemRuntimeOptions {
  policy:        string;   // Path or URL to TPS policy YAML
  licenseKey:    string;   // Offline HMAC license key (OEM tier required)
  brandName:     string;   // Brand name shown in logs and errors
  usageWebhook:  string;   // Revenue-share reporting endpoint URL
  offline?:      boolean;  // Enable air-gapped mode
  classifierPath?: string; // Local classifier bundle path (air-gapped)
  logLevel?: "debug" | "info" | "warn" | "error";
}
```

---

## White-label error messages

With `brandName: "AcmeGuard"`, all user-visible error messages use the brand name:

```
PolicyViolationError [AcmeGuard]: Request blocked by rule 'redact-phi'.
                                  ^^^^^^^^
                     (instead of: [TransparentGuard])
```

Audit logs use `brand_name` as the `product` field in OCSF events:

```json
{ "product": "AcmeGuard", "rule_id": "redact-phi", "outcome": "blocked", ... }
```

---

## Related

- [SDK — TypeScript](sdk-typescript.md)  
- [Offline License](offline-license.md)  
- [Air-Gapped / FedRAMP Deployment](air-gapped-fedramp.md)
