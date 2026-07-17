# SDK — Python

The `transparentguard` Python package wraps any OpenAI-compatible or Anthropic client with transparent policy enforcement. Supports Python 3.9+.

---

## Install

```bash
pip install "transparentguard[openai]"
# or:
pip install "transparentguard[anthropic]"
# or: both
pip install "transparentguard[openai,anthropic]"
```

## Drop-in OpenAI wrapper

```python
import os
from transparentguard import TransparentGuard
from openai import OpenAI

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    api_key=os.environ["TG_API_KEY"],       # online license
    # license_key=os.environ["TG_LICENSE_KEY"]  # offline / air-gapped
)

client = tg.wrap(OpenAI())

# Identical to the standard OpenAI client
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": user_input}],
)
```

## Drop-in Anthropic wrapper

```python
import os
from transparentguard import TransparentGuard
import anthropic

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=os.environ["TG_LICENSE_KEY"],
)

client = tg.wrap(anthropic.Anthropic())

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": user_input}],
)
```

## Direct evaluate()

```python
result = tg.evaluate(
    stage="pre-request",
    messages=[{"role": "user", "content": user_input}],
    provider="openai/gpt-4o",
)

if not result.allowed:
    raise ValueError(result.violations[0].detail)

# result.modified is True if any redaction occurred
for v in result.violations:
    print(v.rule_id, v.outcome, v.detail)
```

## Streaming — window mode

```python
with client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    stream=True,
    tg_stream_mode="window",
    tg_window_tokens=100,
    tg_on_stream_violation="block",
) as stream:
    for chunk in stream:
        print(chunk.choices[0].delta.content or "", end="", flush=True)
```

## Run policy tests in CI

```python
from transparentguard import load_policy, run_policy_tests, format_test_results
import sys

policy = load_policy("./policies/production.yaml")
suite  = run_policy_tests(policy)

print(format_test_results(suite))
sys.exit(1 if suite.failed > 0 else 0)
```

## Error handling

```python
from transparentguard import TransparentGuardError, PolicyViolationError

try:
    response = client.chat.completions.create(model="gpt-4o", messages=messages)
except PolicyViolationError as e:
    # A rule blocked the request — do not retry
    print(f"Blocked by rule {e.rule_id}: {e.detail}")
except TransparentGuardError as e:
    # TG engine error — check fail_mode config
    print(f"TG engine error: {e}")
```

## FastAPI integration

```python
from fastapi import FastAPI, HTTPException
from transparentguard import TransparentGuard, PolicyViolationError
from openai import AsyncOpenAI

app = FastAPI()

@app.on_event("startup")
async def startup():
    global tg, client
    tg = await TransparentGuard.init_async(
        policy="./policies/production.yaml",
        license_key=os.environ["TG_LICENSE_KEY"],
    )
    client = tg.wrap(AsyncOpenAI())

@app.post("/chat")
async def chat(user_input: str):
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": user_input}],
        )
        return {"content": response.choices[0].message.content}
    except PolicyViolationError as e:
        raise HTTPException(status_code=400, detail=e.detail)
```

## Init options

```python
TransparentGuard.init(
    policy: str,              # Path or URL to TPS policy YAML
    api_key: str = None,      # Online license key
    license_key: str = None,  # Offline HMAC license key
    classifier_path: str = None,  # Local classifier bundle (air-gapped)
    offline: bool = False,    # Raise on any outbound network call
    environment: str = None,  # Override TG_ENV
    log_level: str = "info",  # debug | info | warn | error
)
```

## Related

- [SDK — TypeScript](sdk-typescript.md)  
- [Policy Reference](policy-reference.md)  
- [Air-Gapped Deployment](air-gapped-fedramp.md)
