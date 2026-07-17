# Air-Gapped / FedRAMP Deployment

TransparentGuard runs in fully air-gapped mode — zero outbound network calls — for FedRAMP High/Moderate, FedRAMP In Process, ITAR, and classified environments. This guide covers all three required components: offline license key, locally-bundled ML classifiers, and egress-blocking network policy.

---

## Architecture overview

In normal operation, the TG runtime makes three categories of outbound calls:

| Call type | Destination | Air-gap replacement |
|---|---|---|
| License validation | `api.transparentguard.dev` | Offline HMAC key — no call made |
| Classifier model download | `cdn.transparentguard.dev` | Pre-bundled classifiers in OCI image |
| Audit log delivery | Configurable destination | File or internal S3-compatible endpoint |

With all three replaced, the runtime makes **zero outbound calls** after startup.

---

## Step 1 — Offline license key

Generate an offline key in your build pipeline or secrets rotation workflow. Store it in your secret manager — never in source code.

```bash
# Generate (run in your admin environment, not in the air-gapped cluster)
TG_SIGNING_SECRET=<secret> tg keys create \
  --tier enterprise \
  --customer acme-corp \
  --days 365 \
  --env production

# Verify before deploying
TG_SIGNING_SECRET=<secret> tg keys verify "$TG_LICENSE_KEY"
# => ✓  Valid — enterprise / acme-corp
#       Expires : 2027-07-17 (364 days remaining)
```

See [Offline License](offline-license.md) for key format details.

---

## Step 2 — Pull and verify the classifier bundle

ML classifiers are normally downloaded at runtime from the TG CDN. In air-gapped mode, pull them once during your build pipeline, verify the Cosign attestation, and copy them into your OCI image.

```bash
# Pull the classifier bundle for your licensed tier
tg classifiers pull --tier enterprise --output ./classifiers/

# Verify Cosign attestation against the Sigstore transparency log
cosign verify-blob ./classifiers/bundle.tar.gz \
  --certificate ./classifiers/bundle.pem \
  --signature ./classifiers/bundle.sig \
  --certificate-identity \
    "https://github.com/transparentguard/runtime/.github/workflows/release.yaml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

The classifier bundle is versioned and tied to a specific runtime version. Pin both the bundle and the OCI image to the same release.

---

## Step 3 — Initialise in offline mode

```typescript
import { TransparentGuard } from "@transparentguard/runtime";

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey: process.env.TG_LICENSE_KEY,   // HMAC-verified locally — no API call
  classifierPath: "./classifiers/",          // local bundle — no CDN download
  offline: true,                             // throws TransparentGuardOfflineError
                                             // on any outbound network attempt
});
```

```python
from transparentguard import TransparentGuard
import os

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=os.environ["TG_LICENSE_KEY"],
    classifier_path="./classifiers/",
    offline=True,
)
```

When `offline: true`, any code path that attempts an outbound call throws immediately — this is a hard guard against accidental network egress introduced by dependency updates.

---

## Step 4 — OCI image pinning

Pin to a specific digest. Never use `:latest` in FedRAMP environments.

```dockerfile
# Dockerfile
# Pin to a specific digest — never resolves :latest at runtime
FROM ghcr.io/transparentguard/runtime@sha256:a3f8b2c1d9e0f4567890abcdef1234567890abcdef1234567890abcdef123456

# Copy pre-verified classifier bundle into the image
COPY --chown=tg:tg classifiers/ /app/classifiers/

# Copy policy files
COPY --chown=tg:tg policies/ /app/policies/

# All configuration via environment — no runtime file writes needed
ENV TG_OFFLINE=true \
    TG_CLASSIFIER_PATH=/app/classifiers/ \
    NODE_ENV=production

# Run as non-root — satisfies FedRAMP AC-3 / Kubernetes restricted PSS
USER tg
ENTRYPOINT ["node", "dist/index.js"]
```

The `TG_LICENSE_KEY` should be injected at runtime from your secret manager — not baked into the image. See [Secret Managers](secret-managers.md).

---

## Step 5 — Kubernetes NetworkPolicy

Enable the bundled NetworkPolicy with `networkPolicy.enabled: true` in Helm values. It restricts egress to DNS and HTTPS only, and ingress to same-namespace pods by default.

```yaml
# values.yaml
networkPolicy:
  enabled: true

# Kubernetes "restricted" Pod Security Standard
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  capabilities:
    drop: [ALL]
  seccompProfile:
    type: RuntimeDefault
```

The generated NetworkPolicy:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: transparentguard-proxy
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: transparentguard-proxy
  policyTypes: [Egress, Ingress]
  egress:
    - ports:           # DNS resolution only
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - ports:           # HTTPS to LLM provider endpoints
        - protocol: TCP
          port: 443    # restrict to known provider IPs in FedRAMP High
  ingress:
    - from:
        - podSelector: {}    # same namespace only
      ports:
        - protocol: TCP
          port: 8080
```

For FedRAMP High, add `ipBlock` selectors to the egress HTTPS rule to restrict to specific approved provider IP ranges.

---

## Step 6 — Audit log destination (air-gapped)

Route audit logs to an internal destination — no external SIEM connectivity required:

```yaml
audit:
  enabled: true
  # Internal file — ship to internal Splunk/ELK with Fluent Bit sidecar
  destination: "file:///var/log/tg/audit.ndjson"
  # Or internal S3-compatible endpoint (MinIO, Ceph, AWS GovCloud S3)
  # destination: "s3://internal-bucket/tg-audit/"
  format: ocsf
  chain_integrity:
    enabled: true     # tamper-evident chain (FedRAMP AU-9)
    algorithm: sha256
  batch:
    max_events: 500
    flush_interval_ms: 5000
```

---

## Verify zero outbound calls

Run a smoke test in a fully network-isolated container before deploying to production:

```bash
docker run --network=none \
  -e TG_OFFLINE=true \
  -e TG_LICENSE_KEY="$TG_LICENSE_KEY" \
  -e TG_CLASSIFIER_PATH=/app/classifiers \
  -v $(pwd)/classifiers:/app/classifiers:ro \
  -v $(pwd)/policies:/app/policies:ro \
  ghcr.io/transparentguard/runtime@sha256:... \
  node -e "
    const { TransparentGuard } = require('@transparentguard/runtime');
    TransparentGuard.init({
      policy: '/app/policies/production.yaml',
      licenseKey: process.env.TG_LICENSE_KEY,
      classifierPath: process.env.TG_CLASSIFIER_PATH,
      offline: true,
    }).then(() => {
      console.log('✓ Zero outbound calls — air-gap verified');
      process.exit(0);
    }).catch(err => {
      console.error('✗ Outbound call detected:', err.message);
      process.exit(1);
    });
  "
```

A `--network=none` container has no network interfaces. Any outbound call attempt throws immediately, failing the smoke test.

---

## FedRAMP controls satisfied

| Control | How TG satisfies it |
|---|---|
| AC-3 — Access Enforcement | Provider allowlist; non-approved LLMs blocked |
| AU-2 — Event Logging | All request/response events logged |
| AU-3 — Content of Audit Records | Full message content, provider, model, stage, outcome, session ID |
| AU-9 — Audit Integrity | Tamper-evident SHA-256 chain |
| SI-3 — Malicious Code Protection | Prompt injection detection and blocking |
| SI-10 — Input Validation | Schema and content validation on all LLM inputs |
| CM-3 — Configuration Change Control | Policy-as-code; all changes in Git with signed commits |
| NIST SSDF SR.3 | SLSA Level 3 provenance on all runtime releases |

---

## Related

- [Offline License](offline-license.md)  
- [CLI — keys create](cli-keys.md)  
- [Secret Managers](secret-managers.md)  
- [Supply Chain Security](supply-chain.md)  
- [Compliance Frameworks](compliance-frameworks.md)
