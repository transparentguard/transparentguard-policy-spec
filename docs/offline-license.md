# Offline License

Air-gapped enterprise deployments — FedRAMP, ITAR, classified environments — use an offline license key. The runtime validates the key locally with HMAC-SHA256 and never contacts `api.transparentguard.com`. Keys are validated in under 1ms — no latency impact on request paths.

---

## Key format

```
tgk1_<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
```

**Payload fields:**

```json
{
  "v": 1,
  "tier": "enterprise",
  "features": [
    "ml_classifiers",
    "compliance_frameworks",
    "trust_chain",
    "tamper_evident_audit",
    "breach_notification",
    "oem_runtime"
  ],
  "cid": "acme-corp",
  "env": "production",
  "iat": 1752364800,
  "exp": 1783900800
}
```

The HMAC-SHA256 signature covers the base64url-encoded payload. Tampering with any field in the payload invalidates the signature and causes the runtime to reject the key at startup.

---

## Generate a key

```bash
TG_SIGNING_SECRET=<secret> tg keys create \
  --tier enterprise \
  --customer acme-corp \
  --days 365 \
  --env production
```

See [CLI — keys create](cli-keys.md) for all options.

---

## Deploy without network access

```bash
# Set in your deployment environment
export TG_LICENSE_KEY="tgk1_eyJ2IjoxLCJ0aWVyIjoiZW50..."
```

```typescript
// The runtime reads TG_LICENSE_KEY automatically — no apiKey needed
const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  // licenseKey can also be passed explicitly:
  licenseKey: process.env.TG_LICENSE_KEY,
});
```

If `TG_LICENSE_KEY` is set, the runtime:
1. Parses and verifies the HMAC-SHA256 signature locally
2. Checks the expiry timestamp
3. Enables the features listed in the payload
4. **Never contacts the license API**

---

## Key validation errors

| Error | Cause |
|---|---|
| `LicenseKeyExpiredError` | `exp` timestamp is in the past — regenerate the key |
| `LicenseKeyInvalidError` | HMAC signature mismatch — key was tampered with or generated with a different `TG_SIGNING_SECRET` |
| `LicenseKeyTierError` | Key tier does not include a feature required by the policy (e.g. `compliance_frameworks` requires Startup+) |
| `LicenseKeyFormatError` | Key does not begin with `tgk1_` or is malformed |

---

## Rotation procedure

1. Generate a new key with the same or updated parameters
2. Store the new key in your secret manager
3. Update the deployment environment variable
4. Rolling restart the runtime pods/containers (zero-downtime)
5. Verify with `tg keys verify $TG_LICENSE_KEY`

Keys can coexist during a rolling restart — the runtime validates each key independently. There is no coordination required between instances.

---

## Security notes

- `TG_SIGNING_SECRET` must never be committed to source control. Store it in your secret manager (Vault, AWS Secrets Manager, GCP Secret Manager).
- `TG_LICENSE_KEY` contains no credentials — it is safe to store as a deployment environment variable.
- Rotate `TG_SIGNING_SECRET` annually. After rotation, regenerate all issued keys.
- Key material size: the payload is approximately 300 bytes uncompressed; the full key string is approximately 500 characters.

---

## Related

- [CLI — keys create](cli-keys.md)  
- [Air-Gapped / FedRAMP Deployment](air-gapped-fedramp.md)  
- [Secret Managers](secret-managers.md)
