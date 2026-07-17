# CLI — validate

Validate a TPS policy YAML file against the full JSON Schema before deploying. Catches field-level errors, unknown keys, mutual-exclusion violations, and AJV constraint failures without making any LLM calls.

---

## Install

```bash
npm install -g @transparentguard/cli
```

## Usage

```bash
# Validate a local file
transparentguard validate ./policies/production.yaml

# Short alias
tg validate ./policies/production.yaml

# Validate a remote policy URL (HTTPS)
tg validate https://policies.mycompany.com/hipaa.yaml

# Validate all YAML files in a directory
tg validate ./policies/
```

## Output — success

```
Validating ./policies/production.yaml ...

✓  Valid — "production" (tps_version: 1.0)
   Frameworks : hipaa, soc2
   Rules      : 6
   Inline tests: 3
```

## Output — failure

```
Validating ./policies/production.yaml ...

✗  Invalid — "production" (tps_version: 1.0)

   Error 1: /rules/0/streaming/mode
     Must be one of: buffer, window, passthrough
     Got: "stream"

   Error 2: /environments/1
     active_rules and disabled_rules are mutually exclusive
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Valid |
| `1` | Validation failure or I/O error |

## CI/CD usage

```yaml
# .github/workflows/policy-check.yaml
- name: Validate TPS policy
  run: |
    npm install -g @transparentguard/cli
    tg validate ./policies/production.yaml
```

Exits `1` on failure — blocks the CI pipeline automatically.

## Flags

| Flag | Description |
|---|---|
| `--format json` | Output validation result as JSON |
| `--schema <path>` | Use a local JSON Schema file instead of the bundled one |
| `--quiet` | Suppress output; use exit code only |
| `--verbose` | Print every validated field path |

## Related

- [`tg test`](cli-test.md) — run inline policy tests  
- [`tg validate` + `tg test` together](cli-test.md#ci-usage) — full CI pipeline
