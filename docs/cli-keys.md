# CLI — keys create

Generate offline license keys for air-gapped enterprise deployments. Keys encode the customer's tier and feature set, signed with HMAC-SHA256. The runtime validates them locally in under 1ms — no network call is made when `TG_LICENSE_KEY` is set.

---

## Install

```bash
npm install -g @transparentguard/cli
```

## Usage

```bash
TG_SIGNING_SECRET=<secret> tg keys create \
  --tier enterprise \
  --customer acme-corp \
  --days 365
```

## Options

| Flag | Description | Required |
|---|---|---|
| `--tier, -t` | `startup` \| `growth` \| `enterprise` \| `oem` | Yes |
| `--customer, -c` | Customer ID or name (used in audit logs) | Yes |
| `--days, -d` | Validity in days (default: 365) | No |
| `--features, -f` | Comma-separated feature overrides | No |
| `--env, -e` | Environment tag (e.g. `production`, `staging`) | No |

## Environment variables

| Variable | Description |
|---|---|
| `TG_SIGNING_SECRET` | HMAC-SHA256 signing secret (min 32 bytes). **Never commit this.** Store in your secret manager. |

## Output

```
Offline License Key:

  tgk1_eyJ2IjoxLCJ0aWVyIjoiZW50ZXJwcmlzZSIsImZlYXR...

Payload:
  Tier     : enterprise
  Customer : acme-corp
  Issued   : 2026-07-17T00:00:00.000Z
  Expires  : 2027-07-17T00:00:00.000Z (365 days)
  Features : ml_classifiers, compliance_frameworks, trust_chain,
             tamper_evident_audit, breach_notification, oem_runtime

Usage:
  export TG_LICENSE_KEY="tgk1_eyJ2IjoxLCJ..."
```

## Key format

```
tgk1_<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>

Payload fields:
{
  "v": 1,                        // key format version
  "tier": "enterprise",
  "features": ["compliance_frameworks", "trust_chain", ...],
  "cid": "acme-corp",            // customer ID
  "env": "production",           // optional environment tag
  "iat": 1752364800,             // issued at (Unix seconds)
  "exp": 1783900800              // expires at (Unix seconds)
}
```

## Verify a key

```bash
TG_SIGNING_SECRET=<secret> tg keys verify tgk1_eyJ2Ijox...

# Output:
# ✓  Valid — enterprise / acme-corp
#    Issued  : 2026-07-17
#    Expires : 2027-07-17 (364 days remaining)
#    Features: ml_classifiers, compliance_frameworks, ...
```

## Deploy the key

```bash
# Set in your deployment environment — no apiKey needed
export TG_LICENSE_KEY="tgk1_eyJ2IjoxLCJ0aWVyIjoiZW50..."

# The runtime reads it automatically on init:
const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  // No apiKey — TG_LICENSE_KEY is read from the environment
});
```

## Security notes

- Store `TG_SIGNING_SECRET` in a secret manager (Vault, AWS Secrets Manager, GCP Secret Manager) — never in source code or `.env` files committed to version control.
- Rotate the signing secret and regenerate all keys at least annually.
- The `TG_LICENSE_KEY` itself is safe to store as a deployment environment variable — it contains no sensitive data, only the signed payload.

## Related

- [Air-Gapped / FedRAMP deployment](air-gapped-fedramp.md)  
- [Secret Managers](secret-managers.md)  
- [Offline License format](offline-license.md)
