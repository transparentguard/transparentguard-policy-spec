---
name: Phase 4 proxy architecture
description: What was built in Phase 4 and key decisions for future work
---

## What was built

**Runtime additions (packages/runtime, tagged v0.2.0 on GitHub):**
- `src/audit/destinations/s3.ts` — S3 dest, dynamic `require('@aws-sdk/client-s3')`, URI: `s3://bucket/prefix/`
- `src/audit/destinations/postgres.ts` — Postgres dest, dynamic `require('pg')`, auto-DDL, URI: `postgres://...`
- `src/audit/destinations/otlp.ts` — OTLP Logs over HTTP/fetch (no extra package), URI: `otlp://host:4318` or `otlps://...`
- `src/audit/emitter.ts` — `getDestination()` now routes s3://, postgres://, otlp://, otlps:// to real impls
- `src/loader.ts` — `loadPolicy()` accepts `oci://registry/repo:tag`; full OCI Distribution Spec pull, Bearer auth, Cosign ECDSA-P256 verification

**Proxy package (packages/proxy, new repo transparentguard/proxy, tagged v0.1.0):**
- Plain Node http server, no framework
- Routes: OpenAI `/v1/chat/completions`, Anthropic `/v1/messages`, `/health`, `/ready`
- OTEL tracing via NodeTracerProvider (sdk-trace-node + exporter-trace-otlp-http)
- Buffer-mode streaming: buffers all SSE chunks, evaluates assembled content, re-emits
- CLI entry: parseArgs with --policy, --upstream, --port, --upstream-api-key, --tg-api-key

**Helm chart:** `charts/transparentguard-proxy/` — deployment, service, configmap, HPA, _helpers

**GitHub Actions:** `packages/proxy/.github/workflows/docker-publish.yml` — Cosign keyless signing, Trivy scan, SBOM. NOTE: PAT lacks `workflow` scope, workflow file was not pushed to GitHub (must be added via UI or with a PAT with workflow scope).

## Key decisions

**Why dynamic require() for S3/Postgres:** Runtime is a library; heavy cloud SDKs are optional peer deps. No `@aws-sdk/client-s3` or `pg` in runtime devDeps — inline type assertions used.

**Why sdk-trace-node not sdk-node:** Only sdk-trace-node was installed; NodeTracerProvider + BatchSpanProcessor is the correct lower-level API.

**OCI auth:** Parses WWW-Authenticate header from 401, fetches Bearer token from token endpoint. Supports `OCI_REGISTRY_USERNAME`/`OCI_REGISTRY_PASSWORD` for private registries.

**Cosign verification:** ECDSA-P256 signature over SHA256 of payload. Requires `TG_COSIGN_VERIFY=true` and `TG_COSIGN_PUBLIC_KEY_PATH`. Keyless (Rekor) planned for future.

**Message role narrowing:** Incoming HTTP bodies have `role: string`; must cast with `VALID_ROLES.has(m.role) ? m.role : "user"` pattern to satisfy `"system" | "user" | "assistant" | "tool"`.
