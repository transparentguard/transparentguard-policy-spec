/**
 * transparentguard keys create [options]
 * Generates an offline license key for air-gapped enterprise deployments.
 *
 * Key format: tgk1_<base64url(JSON payload)>.<base64url(ECDSA-P256 signature)>
 *
 * Set TG_SIGNING_KEY in the environment to a PEM-encoded EC P-256 private key.
 * The runtime verifies keys using the matching public key embedded in checker.ts.
 *
 * The embedded DEV key pair is published in source and is NOT secret — it exists
 * only for local testing. Never distribute keys signed with the dev key.
 */

import { createSign } from "crypto";
import type { LicenseFeature, LicenseTier } from "@transparentguard/runtime";

// Dev private key — the matching public key is embedded in packages/runtime/src/license/checker.ts.
// Both halves of this pair are published in open source. It is NOT secret.
// For production key issuance, set TG_SIGNING_KEY to your own EC P-256 private key PEM.
const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgLg74pCqq48Dt7jbT
UwR6PmePSHAON3nlj3aR1u9W1HehRANCAATswPEaWwIc7tDh5By2CDAQgdtRaOiy
S2LLdoP06XzuEDJ+rffSOY0RHxEtfVtN3hMZ0vWK5zBk1IBYGv0jTTow
-----END PRIVATE KEY-----`;

const TIER_DEFAULT_FEATURES: Record<LicenseTier, LicenseFeature[]> = {
  free: [],
  startup: [
    "ml_classifiers",
    "semantic_targets",
    "confidentiality_check",
    "compliance_frameworks",
    "audit_s3",
    "audit_postgres",
    "audit_gcs",
    "audit_azure",
    "audit_chain_integrity",
    "threshold_notifications",
  ],
  growth: [
    "ml_classifiers",
    "semantic_targets",
    "confidentiality_check",
    "compliance_frameworks",
    "audit_s3",
    "audit_postgres",
    "audit_gcs",
    "audit_azure",
    "audit_chain_integrity",
    "threshold_notifications",
    "pie",
    "policy_registry",
  ],
  enterprise: [
    "ml_classifiers",
    "semantic_targets",
    "confidentiality_check",
    "compliance_frameworks",
    "audit_s3",
    "audit_postgres",
    "audit_gcs",
    "audit_azure",
    "audit_chain_integrity",
    "threshold_notifications",
    "pie",
    "policy_registry",
    "fedramp",
    "trust_chain",
    "custom_classifier_training",
  ],
  oem: [
    "ml_classifiers",
    "semantic_targets",
    "confidentiality_check",
    "compliance_frameworks",
    "audit_s3",
    "audit_postgres",
    "audit_gcs",
    "audit_azure",
    "audit_chain_integrity",
    "threshold_notifications",
    "pie",
    "policy_registry",
    "fedramp",
    "trust_chain",
    "oem_embed",
    "custom_classifier_training",
  ],
};

interface ParsedKeysArgs {
  subcommand?: string;
  tier?: string;
  customer?: string;
  days?: number;
  features?: string;
  env?: string;
  help: boolean;
}

function parseArgs(args: string[]): ParsedKeysArgs {
  const result: ParsedKeysArgs = { help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if ((arg === "--tier" || arg === "-t") && args[i + 1]) {
      result.tier = args[++i];
    } else if ((arg === "--customer" || arg === "-c") && args[i + 1]) {
      result.customer = args[++i];
    } else if ((arg === "--days" || arg === "-d") && args[i + 1]) {
      result.days = parseInt(args[++i], 10);
    } else if ((arg === "--features" || arg === "-f") && args[i + 1]) {
      result.features = args[++i];
    } else if ((arg === "--env" || arg === "-e") && args[i + 1]) {
      result.env = args[++i];
    } else if (!result.subcommand && !arg.startsWith("-")) {
      result.subcommand = arg;
    }
  }
  return result;
}

export async function runKeys(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.help || opts.subcommand !== "create") {
    process.stdout.write(`
transparentguard keys create [options]

  Generate an offline license key for air-gapped enterprise deployments.
  The key encodes the customer's tier and feature set, signed with ECDSA-P256.
  Distribute the key as the TG_LICENSE_KEY environment variable — no network
  calls are made at runtime when this variable is set.

  Requires TG_SIGNING_KEY env var (PEM-encoded EC P-256 private key).
  Falls back to the published dev key pair if not set (testing only).

OPTIONS
  --tier, -t       License tier: startup | growth | enterprise | oem   [required]
  --customer, -c   Customer ID or name                                   [required]
  --days, -d       Key validity in days                                  [default: 365]
  --features, -f   Comma-separated feature overrides (uses tier defaults if omitted)
  --env, -e        Optional environment tag (e.g. production, staging)

EXAMPLES
  TG_SIGNING_KEY="$(cat signing.pem)" tg keys create --tier enterprise --customer acme-corp
  TG_SIGNING_KEY="$(cat signing.pem)" tg keys create --tier oem --customer contoso --days 730
  tg keys create --tier startup --customer dev-test    # uses dev key pair (testing only)
`.trimStart());
    process.exit(opts.help ? 0 : 1);
  }

  const validTiers: LicenseTier[] = ["free", "startup", "growth", "enterprise", "oem"];
  const tier = opts.tier as LicenseTier | undefined;
  if (!tier || !validTiers.includes(tier)) {
    process.stderr.write(
      `Error: --tier must be one of: ${validTiers.join(", ")}\n`,
    );
    process.exit(1);
  }

  if (!opts.customer) {
    process.stderr.write("Error: --customer is required\n");
    process.exit(1);
  }

  const privateKeyPem = process.env["TG_SIGNING_KEY"] ?? DEV_PRIVATE_KEY_PEM;
  if (!process.env["TG_SIGNING_KEY"]) {
    process.stderr.write(
      "Warning: TG_SIGNING_KEY not set — using the published dev key pair.\n" +
        "Keys signed with the dev key are safe for local testing ONLY.\n" +
        "The dev private key is published in source and provides no security.\n",
    );
  }

  const features: LicenseFeature[] = opts.features
    ? (opts.features.split(",").map((f) => f.trim()) as LicenseFeature[])
    : TIER_DEFAULT_FEATURES[tier];

  const days = opts.days ?? 365;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + days * 86_400;

  const payload: Record<string, unknown> = {
    v: 1,
    tier,
    features,
    cid: opts.customer,
    iat: now,
    exp,
  };
  if (opts.env) payload["env"] = opts.env;

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // Sign with ECDSA-P256 — runtime verifies with the embedded public key
  const signer = createSign("SHA256");
  signer.update(payloadB64, "utf8");
  const sig = signer.sign(privateKeyPem, "base64url");
  const licenseKey = `tgk1_${payloadB64}.${sig}`;

  process.stdout.write("\nOffline License Key:\n\n");
  process.stdout.write(`  ${licenseKey}\n\n`);
  process.stdout.write("Payload:\n");
  process.stdout.write(`  Tier     : ${tier}\n`);
  process.stdout.write(`  Customer : ${opts.customer}\n`);
  process.stdout.write(`  Issued   : ${new Date(now * 1000).toISOString()}\n`);
  process.stdout.write(`  Expires  : ${new Date(exp * 1000).toISOString()} (${days} days)\n`);
  process.stdout.write(`  Features : ${features.join(", ")}\n`);
  if (opts.env) process.stdout.write(`  Env      : ${opts.env}\n`);
  process.stdout.write("\nUsage:\n");
  process.stdout.write(`  export TG_LICENSE_KEY="${licenseKey}"\n\n`);
}
