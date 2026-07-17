/**
 * transparentguard model <subcommand> [options]
 *
 * SUBCOMMANDS
 *   list                  List all trained model artifacts
 *   inspect <name>        Show manifest, model card, and provenance
 *   sign    <name>        Sign a model artifact with ECDSA-P256 (Cosign-compatible)
 *   verify  <name>        Verify a model artifact's signature
 *   rollback <name> <ver> Pin HEAD to a previous artifact version
 */

import { readFileSync, existsSync } from "fs";
import {
  loadArtifact,
  listArtifactVersions,
  resolveModelVersion,
  updateManifest,
  setHead,
  formatModelList,
  signArtifact,
  verifyArtifact,
  formatModelCard,
  formatProvenance,
} from "@transparentguard/runtime";
import type { ModelCard, SLSAProvenance } from "@transparentguard/runtime";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ModelArgs {
  subcommand?: string;
  name?: string;
  version?: string;
  help: boolean;
}

function parseArgs(args: string[]): ModelArgs {
  const result: ModelArgs = { help: false };
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { result.help = true; }
    else if (!arg.startsWith("-")) { positionals.push(arg); }
  }
  result.subcommand = positionals[0];
  result.name = positionals[1];
  result.version = positionals[2];
  return result;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(exit = 0): never {
  process.stdout.write(`
transparentguard model <subcommand> [options]

SUBCOMMANDS
  list                     List all trained model artifacts

  inspect <name> [version] Show manifest, model card, and provenance
                           version: artifact version (v1, v2, …) or HEAD  [default: HEAD]

  sign <name> [version]    Sign artifact with ECDSA-P256 (Cosign-compatible)
                           Reads TG_SIGNING_KEY env var for the private key.
                           Falls back to dev key pair (testing only).

  verify <name> [version]  Verify artifact signature

  rollback <name> <ver>    Pin HEAD to a previous artifact version

EXAMPLES
  tg model list
  tg model inspect my-classifier
  tg model inspect my-classifier v2
  tg model sign my-classifier
  tg model verify my-classifier
  tg model rollback my-classifier v1
`.trimStart());
  process.exit(exit);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function cmdList(_opts: ModelArgs): Promise<void> {
  process.stdout.write(formatModelList());
}

async function cmdInspect(opts: ModelArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const version = opts.version ?? "HEAD";
  const artifact = loadArtifact(opts.name, version);
  if (!artifact) {
    process.stderr.write(`No model artifact found for "${opts.name}" version "${version}".\n`);
    process.exit(1);
  }

  const m = artifact.manifest;
  process.stdout.write(`\nModel Artifact — ${opts.name}@${m.version}\n`);
  process.stdout.write(`  Hash      : ${m.hash}\n`);
  process.stdout.write(`  Arch      : ${m.architecture}\n`);
  process.stdout.write(`  Backend   : ${m.backend}\n`);
  process.stdout.write(`  Job       : ${m.training_job_id}\n`);
  process.stdout.write(`  Dataset   : ${m.dataset_hash.slice(0, 16)}… (${m.dataset_version})\n`);
  process.stdout.write(`  Weights   : ${artifact.weights_path ? "present" : "pending"}\n`);
  process.stdout.write(`  Signed    : ${m.signed ? "yes" : "no"}\n`);
  process.stdout.write(`  Created   : ${m.created_at}\n`);

  if (m.metrics && Object.keys(m.metrics).length > 0) {
    process.stdout.write("\n  Metrics\n");
    for (const [k, v] of Object.entries(m.metrics)) {
      process.stdout.write(`    ${k.padEnd(16)} : ${v}\n`);
    }
  }

  if (existsSync(artifact.card_path)) {
    const card = JSON.parse(readFileSync(artifact.card_path, "utf8")) as ModelCard;
    process.stdout.write(formatModelCard(card));
  }

  if (m.provenance) {
    process.stdout.write(formatProvenance(m.provenance as SLSAProvenance));
  }
}

async function cmdSign(opts: ModelArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const version = opts.version ?? "HEAD";
  const artifact = loadArtifact(opts.name, version);
  if (!artifact) {
    process.stderr.write(`No model artifact found for "${opts.name}" version "${version}".\n`);
    process.exit(1);
  }

  const sigPath = signArtifact(artifact.manifest, artifact.artifact_dir);
  updateManifest(opts.name, artifact.manifest.version, {
    signed: true,
    signature_path: "signature.json",
  });

  process.stdout.write(`✓ Signed: ${sigPath}\n`);
  process.stdout.write(`  Artifact : ${opts.name}@${artifact.manifest.version}\n`);
  process.stdout.write(`  Hash     : ${artifact.manifest.hash.slice(0, 16)}…\n`);
  if (!process.env["TG_SIGNING_KEY"]) {
    process.stdout.write(`\nWarning: signed with dev key pair (TG_SIGNING_KEY not set). Testing only.\n`);
  }
}

async function cmdVerify(opts: ModelArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const version = opts.version ?? "HEAD";
  const artifact = loadArtifact(opts.name, version);
  if (!artifact) {
    process.stderr.write(`No model artifact found for "${opts.name}" version "${version}".\n`);
    process.exit(1);
  }

  const result = verifyArtifact(artifact.manifest, artifact.artifact_dir);
  if (result.valid) {
    process.stdout.write(`✓ Signature valid: ${opts.name}@${artifact.manifest.version}\n`);
  } else {
    process.stderr.write(`✗ Signature invalid: ${result.reason}\n`);
    process.exit(1);
  }
}

async function cmdRollback(opts: ModelArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  if (!opts.version) { process.stderr.write("Error: target version is required (e.g. v1).\n"); process.exit(1); }

  const resolved = resolveModelVersion(opts.name, opts.version);
  if (!resolved) {
    process.stderr.write(`Version "${opts.version}" not found for classifier "${opts.name}".\n`);
    const available = listArtifactVersions(opts.name);
    if (available.length > 0) {
      process.stderr.write(`Available versions: ${available.join(", ")}\n`);
    }
    process.exit(1);
  }

  setHead(opts.name, resolved);
  process.stdout.write(`✓ HEAD rolled back to ${resolved} for "${opts.name}".\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runModel(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  if (opts.help && !opts.subcommand) printHelp(0);

  switch (opts.subcommand) {
    case "list":     return cmdList(opts);
    case "inspect":  return cmdInspect(opts);
    case "sign":     return cmdSign(opts);
    case "verify":   return cmdVerify(opts);
    case "rollback": return cmdRollback(opts);
    default:
      process.stderr.write(`Error: unknown model subcommand "${opts.subcommand ?? ""}"\n`);
      printHelp(1);
  }
}
