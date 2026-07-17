# CLI — report

Generate a structured compliance evidence package from NDJSON audit log files. The output is a self-contained JSON document that maps audit events to regulatory controls — hand it directly to your 3PAO, auditor, or compliance team.

---

## Install

```bash
npm install -g @transparentguard/cli
```

## Usage

```bash
tg report \
  --logs ./audit/2026-07.ndjson \
  --framework hipaa \
  --period 2026-Q2 \
  --output report.json
```

## Options

| Flag | Description | Required |
|---|---|---|
| `--logs <path>` | Path to NDJSON audit log file or directory | Yes |
| `--framework <id>` | Compliance framework to map against | Yes |
| `--period <label>` | Human-readable period label (e.g. `2026-Q2`) | No |
| `--output <path>` | Output file path (default: stdout) | No |
| `--format <fmt>` | `json` (default) \| `csv` \| `pdf` | No |
| `--start <date>` | Filter events from this ISO 8601 date | No |
| `--end <date>` | Filter events to this ISO 8601 date | No |

## Supported frameworks

| Framework ID | Standard |
|---|---|
| `hipaa` | 45 CFR Part 164 |
| `gdpr` | EU 2016/679 |
| `soc2` | AICPA TSC 2022 |
| `fedramp-moderate` | NIST SP 800-53 Rev 5 (Moderate baseline) |
| `eu-ai-act` | EU AI Act 2024/1689 |

## Output structure

```json
{
  "tg_evidence_version": "1.0",
  "framework": "hipaa",
  "period": { "label": "2026-Q2", "start": "2026-04-01", "end": "2026-06-30" },
  "generated_at": "2026-07-01T00:00:00.000Z",
  "total_events": 14832,
  "blocked_events": 47,
  "redacted_events": 1204,
  "controls": [
    {
      "control_id": "164.514(b)",
      "control_name": "PHI Safe Harbor De-identification",
      "status": "satisfied",
      "events_supporting": 2341,
      "violations": 0,
      "last_evaluated": "2026-06-30T23:59:59.000Z"
    },
    {
      "control_id": "164.308(a)(6)(ii)",
      "control_name": "Response and Reporting — Security Incidents",
      "status": "satisfied",
      "events_supporting": 47,
      "violations": 0,
      "thresholds_triggered": 2,
      "notifications_sent": 2
    }
  ]
}
```

## Examples

```bash
# HIPAA quarterly report
tg report \
  --logs ./audit/ \
  --framework hipaa \
  --period 2026-Q2 \
  --start 2026-04-01 \
  --end 2026-06-30 \
  --output hipaa-q2-2026.json

# GDPR report as CSV for spreadsheet import
tg report \
  --logs ./audit/2026-07.ndjson \
  --framework gdpr \
  --format csv \
  --output gdpr-july-2026.csv

# Read logs from S3 (using AWS CLI pipe)
aws s3 cp s3://my-bucket/tg-audit/2026-07.ndjson - | \
  tg report --logs /dev/stdin --framework hipaa --period 2026-07
```

## CI / scheduled reporting

```yaml
# .github/workflows/monthly-report.yaml
on:
  schedule:
    - cron: '0 0 1 * *'   # first day of each month

jobs:
  compliance-report:
    runs-on: ubuntu-latest
    steps:
      - name: Generate HIPAA evidence package
        run: |
          npm install -g @transparentguard/cli
          tg report \
            --logs s3://my-bucket/tg-audit/ \
            --framework hipaa \
            --period $(date +%Y-%m) \
            --output report.json
      - name: Upload report artifact
        uses: actions/upload-artifact@v4
        with:
          name: hipaa-evidence-${{ github.run_id }}
          path: report.json
```

## Related

- [Compliance Frameworks](compliance-frameworks.md)  
- [Audit Event Format — SPEC.md §14](../SPEC.md#14-audit-event-format)  
- [SIEM Integrations](siem-integrations.md)
