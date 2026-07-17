# Compliance Frameworks

Activate pre-built rule sets with one line in your policy file. Each framework maps to a curated set of rules, PII classifiers, audit controls, and threshold alerts that satisfy the corresponding regulatory requirements out of the box.

---

## Usage

```yaml
compliance_frameworks:
  - hipaa
  - soc2
```

Multiple frameworks can be active simultaneously. Rules from each framework are merged and deduplicated.

---

## HIPAA — 45 CFR Part 164

**Tier:** Startup+

```yaml
compliance_frameworks: [hipaa]
```

**What it activates:**

| Control | Coverage |
|---|---|
| 164.514(b) — PHI Safe Harbor | All 18 Safe Harbor de-identification identifiers: SSN, MRN, DOB, phone, fax, email, URL, IP, device ID, biometric, photo, geographic subdivision, account/certificate/license numbers, VIN, full-face photo |
| 164.308(a)(6)(ii) — Incident Response | Breach threshold alerting — triggers on >N PHI violations per hour |
| 164.312(b) — Audit Controls | 7-year audit log retention enforcement; tamper-evident chain integrity (SHA-256) |
| 164.502(b) — Minimum Necessary | Token budget cap to limit PHI exposure volume |

**Example policy snippet:**

```yaml
compliance_frameworks: [hipaa]

thresholds:
  - id: phi-breach-alert
    rule_id: hipaa-phi-redact     # auto-created by framework
    violation_type: rule_triggered
    count: 50
    window: 1h
    action: notify
    notify_url: "https://hooks.mycompany.com/hipaa-alert"
    payload_template: hipaa-breach-v1
```

---

## GDPR — EU 2016/679

**Tier:** Startup+

```yaml
compliance_frameworks: [gdpr]
```

**What it activates:**

| Article | Coverage |
|---|---|
| Art. 9 — Special Categories | Blocks health data, biometrics, religious beliefs, political opinions, sexual orientation |
| Art. 5 — Data Minimisation | Redacts personal data not necessary for the stated purpose |
| Art. 33 — Breach Notification | 72-hour notification trigger on data breach threshold breach |
| Art. 44-46 — Cross-Border Transfers | EU member state data residency tags; cross-border transfer detection |

---

## SOC 2 — AICPA TSC 2022

**Tier:** Startup+

```yaml
compliance_frameworks: [soc2]
```

**What it activates:**

| Control | Coverage |
|---|---|
| CC6.1 — Logical Access | Provider allowlist enforcement — only approved LLM providers allowed |
| CC6.5 — Data Disposal | PII redaction on all request and response paths |
| CC7.2 — Anomaly Detection | Threshold alerting on violation spikes |
| CC9.2 — Vendor Risk | Third-party model controls — blocks unapproved providers |

---

## FedRAMP Moderate — NIST SP 800-53 Rev 5

**Tier:** Enterprise+

```yaml
compliance_frameworks: [fedramp-moderate]
```

**What it activates:**

| Control | Coverage |
|---|---|
| AC-3 — Access Enforcement | Provider allowlist; blocks requests to non-approved LLMs |
| AU-2 — Event Logging | All request/response events logged to OCSF-formatted NDJSON |
| AU-3 — Content of Audit Records | Full message content, provider, model, stage, outcome, session ID |
| AU-9 — Audit Integrity | Tamper-evident chain integrity (required control) |
| SI-3 — Malicious Code Protection | Prompt injection detection and blocking |
| SI-10 — Input Validation | Schema and structure validation on all LLM inputs |
| RA-5 — Vulnerability Scanning | Provider risk tier tagging for vulnerability management |
| NIST SSDF SR.3 | SLSA Level 3 provenance on all runtime releases |

**Air-gapped mode:** FedRAMP environments typically require zero outbound calls. See [Air-Gapped / FedRAMP Deployment](air-gapped-fedramp.md).

---

## EU AI Act — EU 2024/1689

**Tier:** Enterprise+

```yaml
compliance_frameworks: [eu-ai-act]
```

**What it activates:**

| Article | Coverage |
|---|---|
| Art. 9 — Risk Management | Risk tier classification and enforcement per provider |
| Art. 13 — Transparency | Audit trail of all AI system decisions |
| Art. 26 — Deployer Obligations | Policy-as-code evidence for deployer compliance |
| Art. 50 — Transparency for Users | Disclosure tagging on AI-generated content |

---

## Combining frameworks

```yaml
compliance_frameworks:
  - hipaa
  - soc2
  - fedramp-moderate

# All three sets of rules are active simultaneously.
# Overlapping controls (e.g. audit logging) are deduplicated.
# The most restrictive setting wins when controls conflict.
```

---

## Related

- [Policy Reference](policy-reference.md)  
- [Compliance Frameworks — SPEC.md §15](../SPEC.md#15-the-compliance_frameworks-section)  
- [Examples](../examples/)
