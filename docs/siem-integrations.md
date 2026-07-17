# SIEM Integrations

TG audit events are OCSF-formatted NDJSON. This guide covers routing them to Splunk, Datadog, and Azure Sentinel using a log forwarder or the SIEM's native cloud connector. All three patterns work identically — only the forwarder config changes.

---

## Audit destination config

Configure TG to write to a file or S3 bucket, then use a forwarder or cloud connector to ship to your SIEM.

```yaml
# policies/production.yaml
audit:
  enabled: true

  # Option A — local file (ship with Vector / Fluent Bit / Datadog Agent / Splunk UF)
  destination: "file:///var/log/tg/audit.ndjson"

  # Option B — S3 (use SIEM native S3 connector — zero forwarder needed)
  # destination: "s3://my-compliance-bucket/tg-audit/"

  format: ocsf                # Open Cybersecurity Schema Framework
  chain_integrity:
    enabled: true             # tamper-evident SHA-256 chain (FedRAMP AU-9 / SOC 2 CC7.2)
    algorithm: sha256
  batch:
    max_events: 500           # flush every 500 events...
    flush_interval_ms: 5000   # ...or every 5 seconds, whichever comes first
```

---

## Audit event fields (OCSF)

Every TG audit event includes:

| Field | Example | Description |
|---|---|---|
| `time` | `1721174400000` | Unix milliseconds |
| `event_type` | `policy_evaluation` | Event category |
| `outcome` | `blocked` \| `redacted` \| `allowed` \| `sampled_out` | Rule outcome |
| `rule_id` | `redact-phi` | Rule that triggered |
| `stage` | `pre-request` \| `post-response` | Evaluation stage |
| `provider` | `openai/gpt-4o` | LLM provider and model |
| `session_id` | `sess_abc123` | Correlation ID across a conversation |
| `detail` | `SSN pattern matched at offset 12` | Human-readable description |
| `previous_event_hash` | `sha256:...` | Chain integrity link to previous event |
| `chain_sequence` | `14832` | Monotonically increasing event counter |

---

## Splunk

### Forwarder: Vector → Splunk HTTP Event Collector (HEC)

```toml
# vector.toml
[sources.tg_audit]
type = "file"
include = ["/var/log/tg/audit.ndjson"]
read_from = "beginning"
ignore_older_secs = 86400    # ignore files older than 24h on restart

[transforms.parse_ocsf]
type = "remap"
inputs = ["tg_audit"]
source = '''
  . = parse_json!(string!(.message))
  .tg_ingested_at = now()
'''

[sinks.splunk_hec]
type = "splunk_hec_logs"
inputs = ["parse_ocsf"]
endpoint = "https://splunk.mycompany.com:8088"
token = "${SPLUNK_HEC_TOKEN}"
index = "tg_audit"
source = "transparentguard"
sourcetype = "tg:ocsf"
compression = "gzip"
batch.max_events = 500
batch.timeout_secs = 5
```

### Alternative: S3 → Splunk Add-on for AWS

```yaml
# Splunk Add-on for AWS — SQS-based S3 ingestion
# Configure in Splunk UI: Settings → Add Data → Monitor → S3
audit:
  destination: "s3://my-compliance-bucket/tg-audit/"
  format: ocsf
# Then use the Splunk Add-on for AWS to poll the S3 bucket via SQS notifications.
```

### Splunk search queries

```spl
| index=tg_audit sourcetype="tg:ocsf"
| where outcome="blocked" OR outcome="redacted"
| table _time, rule_id, stage, provider, outcome, detail, session_id
| sort -_time
```

```spl
| index=tg_audit sourcetype="tg:ocsf"
| timechart span=1h count BY outcome
| where outcome IN ("blocked", "redacted")
```

```spl
| index=tg_audit sourcetype="tg:ocsf" outcome=blocked
| stats count BY rule_id
| sort -count
| rename count AS "Block Count", rule_id AS "Rule"
```

```spl
| index=tg_audit sourcetype="tg:ocsf"
| where isnotnull(previous_event_hash)
| sort chain_sequence
| streamstats count AS seq
| eval gap = chain_sequence - seq
| where gap > 0
| table _time, chain_sequence, seq, gap
```
> This last query detects gaps in the tamper-evident chain — a non-zero `gap` indicates a deleted or missing audit event.

---

## Datadog

### Forwarder: Datadog Agent

```yaml
# /etc/datadog-agent/conf.d/tg_audit.d/conf.yaml
logs:
  - type: file
    path: /var/log/tg/audit.ndjson
    service: transparentguard
    source: transparentguard
    log_processing_rules:
      # Each JSON object is a separate event — start new record on `{`
      - type: multi_line
        name: new_json_event
        pattern: '^\{'
    tags:
      - env:production
      - compliance:hipaa
      - tg_version:1.0
```

### Alternative: S3 → Datadog Lambda Forwarder

```yaml
audit:
  destination: "s3://my-compliance-bucket/tg-audit/"
  format: ocsf
# Deploy the Datadog Lambda Forwarder subscribed to S3 PutObject events.
# https://docs.datadoghq.com/logs/guide/forwarder/
```

### Datadog Log Search queries

```
# Violations in the last hour
service:transparentguard @outcome:(blocked OR redacted)

# Violations by rule
service:transparentguard @outcome:blocked | @rule_id

# Chain integrity gaps (missing events)
service:transparentguard @chain_sequence:* | timeseries per:30s count
```

### Datadog Monitor — violation spike alert

```json
{
  "name": "TG — Policy violation spike",
  "type": "log alert",
  "query": "logs(\"service:transparentguard @outcome:blocked\").index(\"*\").rollup(\"count\").by(\"@rule_id\").last(\"5m\") > 10",
  "message": "{{@rule_id}} is blocking >10 requests in 5 minutes. @compliance-team",
  "tags": ["compliance:hipaa", "env:production"],
  "options": {
    "thresholds": { "critical": 10, "warning": 5 },
    "notify_no_data": false
  }
}
```

### Datadog Dashboard — compliance overview

Key widgets to build:

- **Violations by outcome** — timeseries, `service:transparentguard`, group by `@outcome`
- **Top violated rules** — top list, `@outcome:blocked`, group by `@rule_id`
- **Session violation rate** — query value, `@outcome:(blocked OR redacted)` / total events
- **Chain integrity events** — table, `@event_type:chain_integrity_failure`

---

## Azure Sentinel (Log Analytics)

### Forwarder: Azure Monitor Agent (AMA) + Data Collection Rule

```json
// data-collection-rule.json
{
  "properties": {
    "dataSources": {
      "logFiles": [{
        "name": "tg-audit",
        "streams": ["Custom-TGAuditLogs_CL"],
        "filePatterns": ["/var/log/tg/audit*.ndjson"],
        "format": "json",
        "settings": {
          "text": {
            "recordStartTimestampFormat": "ISO 8601"
          }
        }
      }]
    },
    "destinations": {
      "logAnalytics": [{
        "workspaceResourceId": "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.OperationalInsights/workspaces/<workspace>",
        "name": "myWorkspace"
      }]
    },
    "dataFlows": [{
      "streams": ["Custom-TGAuditLogs_CL"],
      "destinations": ["myWorkspace"],
      "transformKql": "source | project TimeGenerated=todatetime(time_t), RuleId=rule_id_s, Stage=stage_s, Provider=provider_s, Outcome=outcome_s, Detail=detail_s, SessionId=session_id_g, ChainSequence=chain_sequence_l"
    }]
  }
}
```

### Alternative: S3 → Azure Logic App

```yaml
audit:
  destination: "s3://my-compliance-bucket/tg-audit/"
  format: ocsf
# Use an Azure Logic App with the Amazon S3 connector to poll the bucket
# and forward events to Log Analytics via the HTTP Data Collector API.
```

### KQL queries

```kql
// Violations in the last 24 hours
TGAuditLogs_CL
| where TimeGenerated > ago(24h)
| where Outcome in ("blocked", "redacted")
| project TimeGenerated, RuleId, Stage, Provider, Outcome, Detail, SessionId
| order by TimeGenerated desc
```

```kql
// Violations by rule — last 7 days
TGAuditLogs_CL
| where TimeGenerated > ago(7d)
| where Outcome == "blocked"
| summarize BlockCount = count() by RuleId
| order by BlockCount desc
| render barchart
```

```kql
// Sentinel Analytics Rule — violation spike alert
TGAuditLogs_CL
| where TimeGenerated > ago(5m)
| where Outcome == "blocked"
| summarize ViolationCount = count() by RuleId, bin(TimeGenerated, 1m)
| where ViolationCount > 10
```

```kql
// Chain integrity gap detection
TGAuditLogs_CL
| where TimeGenerated > ago(24h)
| order by ChainSequence asc
| extend PrevSeq = prev(ChainSequence)
| extend Gap = ChainSequence - PrevSeq - 1
| where Gap > 0
| project TimeGenerated, ChainSequence, PrevSeq, Gap
```

---

## Related

- [CLI — report](cli-report.md) — generate compliance evidence packages from audit logs  
- [Air-Gapped / FedRAMP Deployment](air-gapped-fedramp.md) — internal SIEM routing for air-gapped environments  
- [Audit Event Format — SPEC.md §14](../SPEC.md#14-audit-event-format)  
- [Tamper-Evident Audit Log Chaining — SPEC.md §28](../SPEC.md#28-tamper-evident-audit-log-chaining)
