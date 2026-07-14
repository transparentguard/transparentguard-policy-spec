# @transparentguard/sdk

Lazy-init TypeScript SDK for [TransparentGuard](https://transparentguard.com) — AI policy enforcement with zero boilerplate.

Wraps OpenAI and Anthropic clients transparently. Policy loads on the first API call. No `await init()` required.

## Install

```bash
npm install @transparentguard/sdk
```

## Usage

```typescript
import { tg } from "@transparentguard/sdk";
import OpenAI from "openai";

// Policy loads on the first call — no await needed here
const client = tg.wrap(new OpenAI(), {
  policy: "./policies/production-hipaa.yaml",
  apiKey: process.env.TG_API_KEY,
});

// Drop-in replacement — same API as the real client
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "What medications treat hypertension?" }],
});

console.log(response.choices[0].message.content);
// PHI automatically redacted per your HIPAA policy
```

### Anthropic

```typescript
import { tg } from "@transparentguard/sdk";
import Anthropic from "@anthropic-ai/sdk";

const client = tg.wrap(new Anthropic(), {
  policy: "./policies/prod.yaml",
});

const response = await client.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }],
});
```

### Streaming

```typescript
const stream = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Tell me a story" }],
  stream: true,
});

// Chunks are evaluated after full assembly, then re-streamed
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

### Run inline policy tests

```typescript
// CI — validate policy without real LLM calls
const suite = await client.test();
if (suite.failed > 0) {
  console.error(suite.results.filter(r => !r.passed));
  process.exit(1);
}
```

## Policy file

```yaml
tps_version: "1.0"
name: "production-hipaa"
compliance_frameworks: [hipaa]

rules:
  - id: block_jailbreak
    stage: pre-request
    action: classify
    classifier: built-in/prompt-injection-v2
    threshold: 0.80
    on_violation: block

audit:
  enabled: true
  destination: "file://./logs/audit.ndjson"
  format: ndjson
```

## Docs

Full documentation at [transparentguard.com/docs](https://transparentguard.com/docs).

## License

MIT
