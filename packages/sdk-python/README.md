# transparentguard

Python SDK for [TransparentGuard](https://transparentguard.com) — AI policy enforcement implementing the TransparentGuard Policy Spec (TPS) v1.0.

Drop-in wrappers for OpenAI and Anthropic. Automatic PII redaction, compliance frameworks (HIPAA, GDPR, EU AI Act, SOC 2), audit logging, and violation blocking — all declared in a single YAML policy file.

## Install

```bash
pip install transparentguard

# With OpenAI support
pip install "transparentguard[openai]"

# With Anthropic support
pip install "transparentguard[anthropic]"

# All extras
pip install "transparentguard[all]"
```

## Quick start

```python
from transparentguard import tg
from openai import OpenAI

# Policy loads on the first call — no await needed
client = tg.wrap(OpenAI(), policy="./policies/production-hipaa.yaml")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What medications treat hypertension?"}],
)

print(response.choices[0].message.content)
# PHI automatically redacted per your HIPAA policy
```

### Anthropic

```python
from transparentguard import tg
from anthropic import Anthropic

client = tg.wrap(Anthropic(), policy="./policies/prod.yaml")

response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
```

### Async

```python
import asyncio
from transparentguard import tg
from openai import AsyncOpenAI

client = tg.wrap(AsyncOpenAI(), policy="./policies/prod.yaml")

async def main() -> None:
    response = await client.chat.completions.acreate(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
    print(response.choices[0].message.content)

asyncio.run(main())
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

## Run inline policy tests

```python
from transparentguard import tg
from transparentguard.testing import format_test_results

policy = tg.load_policy("./policies/prod.yaml")
# (or use an already-loaded dict)

from transparentguard import TransparentGuard
guard = TransparentGuard.init_sync(policy=policy)
suite = guard.test()
print(format_test_results(suite))

import sys
if suite.failed > 0:
    sys.exit(1)
```

## Direct evaluate()

```python
from transparentguard import evaluate
from transparentguard.license import check_license_sync
from transparentguard.loader import load_policy_sync

policy = load_policy_sync("./policy.yaml")
license_status = check_license_sync()

result = evaluate(
    "pre-request",
    {
        "messages": [{"role": "user", "content": "My SSN is 123-45-6789"}],
        "provider": "openai/gpt-4o",
    },
    policy,
    license_status,
)

if not result["allowed"]:
    print("Blocked:", result["violations"][0]["detail"])
else:
    # Use result["payload"] — content may be redacted
    print("Allowed")
```

## Type checking

The package ships with `py.typed` and is fully typed. Run:

```bash
mypy --strict your_module.py
```

## Docs

Full documentation at [transparentguard.com/docs](https://transparentguard.com/docs).

## License

MIT
