# Secret Managers

Supply `TG_LICENSE_KEY`, `TG_SIGNING_SECRET`, and policy signing keys from your secret manager instead of bare environment variables. TG reads secrets at init time — fetch them before calling `TransparentGuard.init()`.

This guide covers HashiCorp Vault, AWS Secrets Manager, and GCP Secret Manager, each with both a recommended zero-code injection pattern and a direct SDK fallback.

---

## Which secrets to manage

| Secret | Description | Rotation |
|---|---|---|
| `TG_LICENSE_KEY` | Offline license key — safe to store as env var | Annually or on tier change |
| `TG_SIGNING_SECRET` | HMAC signing secret used to generate license keys | Annually (triggers key regeneration) |
| `TG_POLICY_SIGNING_KEY` | Ed25519 private key for policy file signing | Annually |

---

## HashiCorp Vault

### Recommended: Vault Agent sidecar

Vault Agent authenticates with Kubernetes ServiceAccount or AWS IAM, fetches secrets, and renders them into environment files. Secrets are hot-reloaded on rotation without restarting your application.

```hcl
# vault-agent.hcl
pid_file = "/run/vault-agent.pid"

vault { address = "https://vault.mycompany.com:8200" }

auto_auth {
  method "kubernetes" {
    config {
      role       = "transparentguard-prod"
      token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    }
  }
  sink "file" { config { path = "/run/secrets/.vault-token" } }
}

template {
  source           = "/etc/vault-templates/tg-env.tpl"
  destination      = "/run/secrets/tg-env.sh"
  error_on_missing_key = true
  # Reload TG when secrets rotate (send SIGHUP to trigger graceful reload)
  command          = "kill -HUP $(cat /run/tg.pid)"
}
```

```hcl
{{/* /etc/vault-templates/tg-env.tpl */}}
{{ with secret "secret/data/transparentguard/prod" -}}
export TG_LICENSE_KEY="{{ .Data.data.license_key }}"
export TG_SIGNING_SECRET="{{ .Data.data.signing_secret }}"
export TG_POLICY_SIGNING_KEY="{{ .Data.data.policy_signing_key }}"
{{- end }}
```

Source the file in your entrypoint:

```bash
#!/bin/bash
# entrypoint.sh
source /run/secrets/tg-env.sh
exec node dist/index.js
```

### Direct SDK — TypeScript

```typescript
import Vault from "node-vault";
import { TransparentGuard } from "@transparentguard/runtime";

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,    // https://vault.mycompany.com:8200
  // Auth option A — static token (dev/staging only)
  token: process.env.VAULT_TOKEN,
  // Auth option B — AppRole (production recommended)
  // Use node-vault's AppRole login before .read()
});

const { data } = await vault.read("secret/data/transparentguard/prod");
const { license_key, signing_secret } = data.data;

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey: license_key,
});
```

### Direct SDK — Python

```python
import hvac
import os
from transparentguard import TransparentGuard

client = hvac.Client(
    url=os.environ["VAULT_ADDR"],
    token=os.environ["VAULT_TOKEN"],  # or use AppRole / K8s auth
)

secret = client.secrets.kv.v2.read_secret_version(
    path="transparentguard/prod",
    mount_point="secret",
)
license_key = secret["data"]["data"]["license_key"]

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=license_key,
)
```

---

## AWS Secrets Manager

### Recommended: ECS task definition secrets injection

ECS / Fargate injects secrets directly into the container environment at task launch. No SDK code required in your application.

```json
{
  "family": "transparentguard",
  "containerDefinitions": [{
    "name": "transparentguard",
    "image": "ghcr.io/transparentguard/runtime@sha256:...",
    "secrets": [
      {
        "name": "TG_LICENSE_KEY",
        "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/transparentguard:licenseKey::"
      },
      {
        "name": "TG_SIGNING_SECRET",
        "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/transparentguard:signingSecret::"
      }
    ],
    "taskRoleArn": "arn:aws:iam::123456789012:role/TransparentGuardTaskRole"
  }]
}
```

The task IAM role needs `secretsmanager:GetSecretValue` on the specific secret ARNs.

### Kubernetes: AWS Secrets Store CSI Driver

```yaml
# secretproviderclass.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: tg-secrets
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "prod/transparentguard"
        objectType: "secretsmanager"
        jmesPath:
          - path: licenseKey
            objectAlias: license_key
          - path: signingSecret
            objectAlias: signing_secret
  secretObjects:
    - secretName: tg-secrets
      type: Opaque
      data:
        - objectName: license_key
          key: TG_LICENSE_KEY
        - objectName: signing_secret
          key: TG_SIGNING_SECRET
```

### Direct SDK — TypeScript

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { TransparentGuard } from "@transparentguard/runtime";

const sm = new SecretsManagerClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  // Uses IAM role attached to ECS task / EC2 instance / Lambda function
  // No access key needed when running on AWS infrastructure
});

const { SecretString } = await sm.send(
  new GetSecretValueCommand({ SecretId: "prod/transparentguard" })
);

// Store as JSON: { "licenseKey": "tgk1_...", "signingSecret": "..." }
const { licenseKey } = JSON.parse(SecretString!);

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey,
});
```

### Direct SDK — Python

```python
import boto3
import json
import os
from transparentguard import TransparentGuard

sm = boto3.client("secretsmanager", region_name=os.environ.get("AWS_REGION", "us-east-1"))
response = sm.get_secret_value(SecretId="prod/transparentguard")
secret = json.loads(response["SecretString"])

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=secret["licenseKey"],
)
```

### Lambda: AWS Parameters and Secrets Lambda Extension

```typescript
// No SDK needed — the Lambda extension exposes secrets via localhost HTTP
const response = await fetch(
  "http://localhost:2773/secretsmanager/get?secretId=prod/transparentguard",
  { headers: { "X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN! } }
);
const { SecretString } = await response.json();
const { licenseKey } = JSON.parse(SecretString);
```

---

## GCP Secret Manager

### Recommended: Cloud Run secret volume (zero SDK)

Mount secrets as files using Cloud Run's native secret volume support. No SDK calls — the runtime reads a file at startup. Secrets rotate without redeployment.

```yaml
# service.yaml (Cloud Run)
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: transparentguard-proxy
spec:
  template:
    metadata:
      annotations:
        # Allow Cloud Run to access Secret Manager
        run.googleapis.com/execution-environment: gen2
    spec:
      serviceAccountName: transparentguard@my-project.iam.gserviceaccount.com
      volumes:
        - name: tg-secrets
          secret:
            secretName: tg-license-key
            items:
              - key: latest
                path: license_key
        - name: tg-signing
          secret:
            secretName: tg-signing-secret
            items:
              - key: latest
                path: signing_secret
      containers:
        - image: ghcr.io/transparentguard/runtime@sha256:...
          volumeMounts:
            - name: tg-secrets
              mountPath: /run/secrets/tg
              readOnly: true
            - name: tg-signing
              mountPath: /run/secrets/tg-signing
              readOnly: true
```

```typescript
import { readFileSync } from "fs";
import { TransparentGuard } from "@transparentguard/runtime";

// Secrets mounted as files — zero SDK calls at startup
const licenseKey    = readFileSync("/run/secrets/tg/license_key",             "utf8").trim();
const signingSecret = readFileSync("/run/secrets/tg-signing/signing_secret",  "utf8").trim();

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey,
});
```

### GKE: Secret Manager + Workload Identity

```yaml
# secretproviderclass.yaml (GKE with Secrets Store CSI Driver)
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: tg-secrets
spec:
  provider: gcp
  parameters:
    secrets: |
      - resourceName: "projects/my-project/secrets/tg-license-key/versions/latest"
        fileName: "license_key"
      - resourceName: "projects/my-project/secrets/tg-signing-secret/versions/latest"
        fileName: "signing_secret"
```

### Direct SDK — TypeScript

```typescript
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { TransparentGuard } from "@transparentguard/runtime";

const sm = new SecretManagerServiceClient();
// Uses Application Default Credentials — no key file on Cloud Run / GKE with Workload Identity

async function getSecret(secretId: string): Promise<string> {
  const name = `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretId}/versions/latest`;
  const [version] = await sm.accessSecretVersion({ name });
  return version.payload!.data!.toString();
}

const licenseKey = await getSecret("tg-license-key");

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey,
});
```

### Direct SDK — Python

```python
from google.cloud import secretmanager
from transparentguard import TransparentGuard
import os

sm = secretmanager.SecretManagerServiceClient()
# Uses Application Default Credentials

def get_secret(secret_id: str) -> str:
    name = f"projects/{os.environ['GCP_PROJECT_ID']}/secrets/{secret_id}/versions/latest"
    response = sm.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

license_key = get_secret("tg-license-key")

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=license_key,
)
```

---

## IAM permissions summary

### AWS

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": [
    "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/transparentguard*"
  ]
}
```

### GCP

```bash
gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:transparentguard@my-project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --condition="expression=resource.name.startsWith('projects/my-project/secrets/tg-'),title=TG secrets only"
```

### Vault (Kubernetes)

```hcl
# vault policy: transparentguard-prod
path "secret/data/transparentguard/prod" {
  capabilities = ["read"]
}
path "secret/metadata/transparentguard/prod" {
  capabilities = ["read"]
}
```

---

## Related

- [Offline License](offline-license.md)  
- [CLI — keys create](cli-keys.md)  
- [Air-Gapped / FedRAMP Deployment](air-gapped-fedramp.md)
