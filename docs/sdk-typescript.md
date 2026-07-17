# SDK — TypeScript

The `@transparentguard/runtime` package is a zero-dependency TypeScript library that wraps any OpenAI-compatible or Anthropic client with transparent policy enforcement. Drop it into an existing codebase with a two-line change.

---

## Install

```bash
npm install @transparentguard/runtime
```

## Drop-in OpenAI wrapper

```typescript
import { TransparentGuard } from "@transparentguard/runtime";
import OpenAI from "openai";

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  apiKey: process.env.TG_API_KEY,         // online license check
  // licenseKey: process.env.TG_LICENSE_KEY  // air-gapped offline key
});

const client = tg.wrap(new OpenAI());

// Identical to the standard OpenAI client — enforcement is invisible
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: userInput }],
});
```

## Drop-in Anthropic wrapper

```typescript
import { TransparentGuard } from "@transparentguard/runtime";
import Anthropic from "@anthropic-ai/sdk";

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey: process.env.TG_LICENSE_KEY,
});

const client = tg.wrap(new Anthropic());

const message = await client.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{ role: "user", content: userInput }],
});
```

## Direct evaluate() API

Use `evaluate()` when you want explicit control over the enforcement decision:

```typescript
const result = await tg.evaluate("pre-request", {
  messages: [{ role: "user", content: userInput }],
  provider: "openai/gpt-4o",
});

if (!result.allowed) {
  throw new Error(result.violations[0]?.detail ?? "Blocked by policy");
}

// result.modified is true if any redaction occurred
// result.modified_messages has the redacted content
for (const v of result.violations) {
  console.log(v.rule_id, v.outcome, v.detail);
}
```

## Streaming — window mode

Evaluate a rolling window of tokens mid-stream and abort on violation:

```typescript
const stream = await client.chat.completions.create(
  {
    model: "gpt-4o",
    messages,
    stream: true,
  },
  {
    streamMode: "window",
    windowTokens: 100,
    onStreamViolation: "block",  // terminates stream immediately
  }
);

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## Streaming — passthrough mode

Yield chunks immediately; evaluate the full assembled content after the stream completes:

```typescript
const stream = await client.chat.completions.create(
  { model: "gpt-4o", messages, stream: true },
  {
    streamMode: "passthrough",
    onStreamViolation: "passthrough_and_log",  // log violation, keep tokens
  }
);
```

## Run policy tests in CI

```typescript
import { loadPolicy, runPolicyTests, formatTestResults } from "@transparentguard/runtime";

const policy = await loadPolicy("./policies/production.yaml");
const suite  = await runPolicyTests(policy);

process.stdout.write(formatTestResults(suite));
process.exit(suite.failed > 0 ? 1 : 0);
```

## Provider adapters

```typescript
import { resolveAdapter, registerAdapter, listAdapters } from "@transparentguard/runtime";

// Resolve a built-in adapter
const adapter = resolveAdapter("openai/gpt-4o");
// adapter.region.jurisdiction → "US"
// adapter.capabilities → ["chat", "streaming", "function-calling", ...]

// List all registered adapters
const adapters = listAdapters();

// Register a custom adapter for an unsupported provider
registerAdapter({
  providerId: "myco",
  displayName: "MyCo LLM",
  isOpenAICompat: true,
  auth: { headerName: "x-myco-key", headerFormat: "{key}" },
  region: { regions: ["us-west-2"], jurisdiction: "US", trainingJurisdiction: "US" },
  capabilities: ["chat", "streaming"],
  normalizeRequest(raw) { return /* ... */ raw as any; },
  denormalizeRequest(payload, original) { return original; },
  normalizeResponse(raw, model) { return /* ... */ raw as any; },
  denormalizeResponse(payload, original) { return original; },
});
```

## Error handling

```typescript
import { TransparentGuardError, PolicyViolationError } from "@transparentguard/runtime";

try {
  const response = await client.chat.completions.create({ model: "gpt-4o", messages });
} catch (err) {
  if (err instanceof PolicyViolationError) {
    // A rule blocked the request — do not retry
    console.error("Blocked:", err.rule_id, err.detail);
  } else if (err instanceof TransparentGuardError) {
    // TG engine error — check fail_mode config
    console.error("TG engine error:", err.message);
  } else {
    throw err;  // Re-throw upstream API errors
  }
}
```

## Init options

```typescript
interface InitOptions {
  policy: string;                  // Path or URL to TPS policy YAML
  apiKey?: string;                 // Online license key
  licenseKey?: string;             // Offline HMAC license key
  classifierPath?: string;         // Local classifier bundle path (air-gapped)
  offline?: boolean;               // Throw on any outbound network call
  environment?: string;            // Override TG_ENV
  logLevel?: "debug"|"info"|"warn"|"error";
}
```

## Related

- [SDK — Python](sdk-python.md)  
- [Policy Reference](policy-reference.md)  
- [Air-Gapped Deployment](air-gapped-fedramp.md)  
- [Provider Adapter Interface — SPEC.md §32](../SPEC.md#32-provider-adapter-interface)
