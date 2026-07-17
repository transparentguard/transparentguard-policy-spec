# CLI — test

Run the policy test suite declared inline in the TPS file or loaded from a directory of YAML test files. No real LLM calls are made — the runtime evaluates rules against the declared inputs entirely offline.

---

## Install

```bash
npm install -g @transparentguard/cli
```

## Usage

```bash
# Run tests declared inside the policy file (policy_tests block)
tg test ./policies/production.yaml

# Load additional test files from a directory
tg test ./policies/production.yaml --suite ./tests/

# Run a single named test
tg test ./policies/production.yaml --id phi-blocked

# Run with verbose output (show rule evaluation trace)
tg test ./policies/production.yaml --verbose
```

## Test file format

Tests can be declared inline in the policy file under `tests:` or in standalone YAML files:

```yaml
# tests/phi-redaction.yaml
tests:
  - id: phi-blocked
    description: SSN in prompt should be redacted before reaching the model
    stage: pre-request
    input:
      messages:
        - role: user
          content: "My SSN is 123-45-6789, help me with my claim."
    expect:
      outcome: allowed_with_modifications
      rules_triggered:
        - rule_id: redact-phi
          action_taken: redacted

  - id: clean-prompt-passes
    description: A prompt with no PII should pass through unchanged
    stage: pre-request
    input:
      messages:
        - role: user
          content: "Summarise the key points from the quarterly earnings report."
    expect:
      outcome: allowed
      rules_triggered: []
```

## Expected outcomes

| Value | Meaning |
|---|---|
| `allowed` | Request/response passes all rules unchanged |
| `allowed_with_modifications` | Passed but content was redacted or modified |
| `blocked` | Request/response was blocked by a rule |
| `sampled_out` | Rule was skipped due to sampling configuration |

## Output

```
  PASS  phi-blocked — SSN in prompt should be redacted
  PASS  clean-prompt-passes — Clean prompt passes through
  PASS  injection-blocked — Prompt injection attempt blocked
  FAIL  gdpr-check — Expected blocked but got allowed
        Expected outcome "blocked" but got "allowed"
        Rules triggered: []  Expected: [gdpr-residency]

1 failed, 3 passed. (4 total)
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All tests passed |
| `1` | One or more tests failed |

## CI usage

```yaml
# .github/workflows/policy-check.yaml
- name: Validate and test TPS policy
  run: |
    npm install -g @transparentguard/cli
    tg validate ./policies/production.yaml
    tg test ./policies/production.yaml --suite ./tests/
```

## Flags

| Flag | Description |
|---|---|
| `--suite <dir>` | Load additional test files from directory |
| `--id <test-id>` | Run only the named test |
| `--format json` | Output results as JSON |
| `--verbose` | Print rule evaluation trace for each test |
| `--timeout <ms>` | Per-test evaluation timeout (default: 5000) |

## Related

- [`tg validate`](cli-validate.md) — schema validation  
- [Policy Testing Syntax — SPEC.md §27](../SPEC.md#27-policy-testing-syntax)
