# @transparentguard/runtime-oem

OEM / embedded distribution package for TransparentGuard.

Re-exports the full `@transparentguard/runtime` API with two additions designed for embedded distribution:

- **White-label support** — rename all log prefixes and error messages from "TransparentGuard" to your product name
- **Usage reporting** — POST call volume to your billing webhook for revenue-share tracking

## Installation

```bash
npm install @transparentguard/runtime-oem
```

## Usage

```typescript
import { createOemRuntime, reportUsage } from "@transparentguard/runtime-oem";
import OpenAI from "openai";

// Initialise with your white-label config and offline license key
const tg = await createOemRuntime({
  policy: "./policies/production.yaml",
  licenseKey: process.env.TG_LICENSE_KEY,   // offline key — no network call
  brandName: "AcmeGuard",                   // replaces [TransparentGuard] in all logs
  usageWebhook: process.env.TG_OEM_WEBHOOK,
});

// Drop-in OpenAI wrapper — identical to the standard runtime
const client = tg.wrap(new OpenAI());

// Report usage for billing reconciliation (call daily or per billing period)
await reportUsage(process.env.TG_OEM_WEBHOOK!, {
  period_start: "2026-07-01T00:00:00Z",
  period_end:   "2026-07-31T23:59:59Z",
  call_count:   142_000,
  runtime_version: "0.1.0",
});
```

## Offline License Keys

Generate a key with the CLI:

```bash
TG_SIGNING_SECRET=<secret> tg keys create \
  --tier oem \
  --customer your-company \
  --days 365
```

Set `TG_LICENSE_KEY` to the generated key in your deployment — no calls to `api.transparentguard.com` are ever made.

## Full API

All exports from `@transparentguard/runtime` are re-exported here. See the [runtime README](../runtime/README.md) for the complete API reference.

### OEM-specific exports

| Symbol | Description |
|---|---|
| `createOemRuntime(options)` | Initialise with white-label and license config |
| `reportUsage(url, payload)` | POST usage data to your billing webhook |
| `OemRuntimeOptions` | Init options type |
| `UsagePayload` | Usage report payload type |
