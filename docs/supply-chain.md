# Supply Chain Security

Every release of the runtime, CLI, and OEM package carries SLSA Level 3 provenance attestations and a CycloneDX SBOM — satisfying FedRAMP NIST SSDF SR.3, NIST SP 800-218, and the EU Cyber Resilience Act.

---

## What is attested on every release

| Artifact | Attestation | Format |
|---|---|---|
| Runtime dist tarball | SLSA Level 3 provenance | GitHub Attestations |
| CLI dist tarball | SLSA Level 3 provenance | GitHub Attestations |
| OEM package tarball | SLSA Level 3 provenance | GitHub Attestations |
| Runtime OCI image | Cosign signature | Sigstore transparency log |
| Runtime SBOM | CycloneDX 1.5 | `sbom-runtime.cdx.json` |
| CLI SBOM | CycloneDX 1.5 | `sbom-cli.cdx.json` |
| OEM SBOM | CycloneDX 1.5 | `sbom-runtime-oem.cdx.json` |

All attestations are written to the Sigstore public transparency log (Rekor) and can be independently verified offline.

---

## Verify a release artifact

```bash
# Install the GitHub CLI if you haven't already
brew install gh    # macOS
# or: https://cli.github.com

# Verify SLSA Level 3 provenance
gh attestation verify runtime-dist.tar.gz \
  --repo transparentguard/runtime \
  --format json | jq '.[] | { verified, signerWorkflow, buildTrigger }'
```

Expected output:

```json
{
  "verified": true,
  "signerWorkflow": "https://github.com/transparentguard/runtime/.github/workflows/release.yaml",
  "buildTrigger": "push"
}
```

---

## Verify the OCI image with Cosign

```bash
# Install Cosign
brew install cosign    # macOS
# or: https://docs.sigstore.dev/cosign/system_config/installation/

# Verify the image signature
cosign verify \
  ghcr.io/transparentguard/runtime:1.0.0 \
  --certificate-identity \
    "https://github.com/transparentguard/runtime/.github/workflows/release.yaml@refs/tags/v1.0.0" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

For air-gapped environments where `cosign` cannot reach the Sigstore transparency log, use the bundle file included in each release:

```bash
cosign verify-blob runtime-dist.tar.gz \
  --bundle ./runtime-dist.bundle.json \
  --certificate-identity "..." \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  --offline
```

---

## Use the SBOM

CycloneDX SBOMs are included in every GitHub release as `sbom-runtime.cdx.json`, `sbom-cli.cdx.json`, and `sbom-runtime-oem.cdx.json`.

### Import into a GRC platform

```bash
# Dependency Track (OWASP)
curl -X POST "https://dtrack.mycompany.com/api/v1/bom" \
  -H "X-Api-Key: $DTRACK_API_KEY" \
  -F "autoCreate=true" \
  -F "projectName=transparentguard-runtime" \
  -F "projectVersion=1.0.0" \
  -F "bom=@sbom-runtime.cdx.json"
```

### Scan with Grype

```bash
# Install Anchore Grype
brew install grype

# Scan the SBOM for CVEs
grype sbom:sbom-runtime.cdx.json
```

### Scan with Trivy

```bash
trivy sbom sbom-runtime.cdx.json --format table
```

---

## GitHub Actions — verify in CI before deploying

```yaml
# .github/workflows/deploy.yaml
- name: Verify TG runtime provenance before deploy
  run: |
    gh attestation verify runtime-dist.tar.gz \
      --repo transparentguard/runtime

- name: Scan SBOM for CVEs
  run: |
    grype sbom:sbom-runtime.cdx.json --fail-on high
```

---

## Pin the OCI image by digest in production

Never use `:latest` or a mutable tag in production or FedRAMP environments. Always pin to a digest:

```bash
# Resolve the current digest for a tag
crane digest ghcr.io/transparentguard/runtime:1.0.0
# => sha256:a3f8b2c1d9e0f4567890abcdef1234567890abcdef1234567890abcdef123456

# Use in Dockerfile
FROM ghcr.io/transparentguard/runtime@sha256:a3f8b2c1d9e0f456...
```

```yaml
# Kubernetes deployment
spec:
  containers:
    - name: transparentguard
      image: ghcr.io/transparentguard/runtime@sha256:a3f8b2c1d9e0f456...
      # imagePullPolicy: Never  # for air-gapped clusters with pre-loaded images
```

---

## Regulatory compliance

| Standard | How TG satisfies it |
|---|---|
| NIST SSDF SR.3 | SLSA Level 3 provenance on all release artifacts |
| NIST SP 800-218 | CycloneDX SBOM for every released package |
| FedRAMP — SA-12 | Supply chain risk management via SBOM and provenance |
| EU Cyber Resilience Act — Art. 13 | SBOM provided for all software components |

---

## Links

- [GitHub Releases & Attestations](https://github.com/transparentguard/runtime/releases)
- [Sigstore Documentation](https://docs.sigstore.dev)
- [SLSA Framework](https://slsa.dev)
- [CycloneDX Specification](https://cyclonedx.org/specification/overview/)

---

## Related

- [Air-Gapped / FedRAMP Deployment](air-gapped-fedramp.md)  
- [Offline License](offline-license.md)
