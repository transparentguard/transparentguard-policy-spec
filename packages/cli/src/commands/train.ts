/**
 * transparentguard train <subcommand> [options]
 *
 * SUBCOMMANDS
 *   start  <name>   Submit a training job for a classifier
 *   status <job-id> Poll status of a training job
 *   cancel <job-id> Cancel a running or queued job
 *   list            List all training jobs
 */

import {
  submitJob,
  listJobs,
  refreshJobStatus,
  cancelTrainingJob,
  formatJobList,
  resolveDatasetVersion,
  datasetDir,
  validateDataset,
  readExamples,
} from "@transparentguard/runtime";
import { join } from "path";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface TrainArgs {
  subcommand?: string;
  name?: string;
  jobId?: string;
  backend?: string;
  datasetVersion?: string;
  architecture?: string;
  skipValidation?: boolean;
  help: boolean;
}

function parseArgs(args: string[]): TrainArgs {
  const result: TrainArgs = { help: false };
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { result.help = true; }
    else if ((arg === "--backend" || arg === "-b") && args[i + 1]) { result.backend = args[++i]; }
    else if ((arg === "--dataset-version" || arg === "-d") && args[i + 1]) { result.datasetVersion = args[++i]; }
    else if ((arg === "--architecture" || arg === "-a") && args[i + 1]) { result.architecture = args[++i]; }
    else if (arg === "--skip-validation") { result.skipValidation = true; }
    else if (!arg.startsWith("-")) { positionals.push(arg); }
  }
  result.subcommand = positionals[0];
  // For start: positionals[1] is the classifier name
  // For status/cancel: positionals[1] is the job ID
  result.name = positionals[1];
  result.jobId = positionals[1];
  return result;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(exit = 0): never {
  process.stdout.write(`
transparentguard train <subcommand> [options]

SUBCOMMANDS
  start <name>             Submit a training job
    --backend,         -b  Compute backend: local|modal|sagemaker|replicate  [default: local]
    --dataset-version, -d  Dataset version to train on: HEAD or vN            [default: HEAD]
    --architecture,    -a  Model architecture                                  [default: distilbert-classifier]
    --skip-validation      Skip pre-flight dataset validation

  status <job-id>          Poll and display current job status

  cancel <job-id>          Cancel a running or queued job

  list                     List all training jobs

EXAMPLES
  tg train start my-classifier --backend local
  tg train start my-classifier --backend modal --dataset-version v2
  tg train status tg-job-a1b2c3d4
  tg train cancel tg-job-a1b2c3d4
  tg train list
`.trimStart());
  process.exit(exit);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function cmdStart(opts: TrainArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }

  const backend = opts.backend ?? "local";
  const datasetVersionArg = opts.datasetVersion ?? "HEAD";

  // Pre-flight: dataset validation
  if (!opts.skipValidation) {
    const examples = readExamples(opts.name);
    const report = validateDataset(opts.name, examples);
    if (!report.passed) {
      process.stderr.write(
        `Dataset validation failed for "${opts.name}". Fix errors before training.\n` +
        `Run \`tg dataset validate ${opts.name}\` for details.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`✓ Dataset validation passed (${examples.length} examples)\n`);
  }

  // Resolve dataset version to an immutable snapshot
  const resolved = resolveDatasetVersion(opts.name, datasetVersionArg);
  if (!resolved) {
    process.stderr.write(
      `No dataset snapshot found for "${opts.name}" version "${datasetVersionArg}".\n` +
      `Run \`tg dataset version ${opts.name}\` to create a snapshot first.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `Submitting training job…\n` +
    `  Classifier  : ${opts.name}\n` +
    `  Dataset     : ${resolved.version}  (hash: ${resolved.hash.slice(0, 16)}…)\n` +
    `  Backend     : ${backend}\n` +
    `  Architecture: ${opts.architecture ?? "distilbert-classifier"}\n\n`,
  );

  const dataPath = join(datasetDir(opts.name), `${resolved.version}.jsonl`);

  const job = await submitJob(
    {
      classifier_name: opts.name,
      dataset_version: resolved.hash,
      backend,
      architecture: opts.architecture ?? "distilbert-classifier",
    },
    dataPath,
  );

  process.stdout.write(`Job submitted: ${job.job_id}\n`);
  process.stdout.write(`Status       : ${job.status}\n`);
  if (job.error) process.stdout.write(`Note         : ${job.error}\n`);
  process.stdout.write(`\nTrack status with: tg train status ${job.job_id}\n`);
}

async function cmdStatus(opts: TrainArgs): Promise<void> {
  if (!opts.jobId) { process.stderr.write("Error: job-id is required.\n"); process.exit(1); }
  const job = await refreshJobStatus(opts.jobId);
  if (!job) {
    process.stderr.write(`Job not found: ${opts.jobId}\n`);
    process.exit(1);
  }
  process.stdout.write(`\nJob: ${job.job_id}\n`);
  process.stdout.write(`  Classifier : ${job.classifier_name}\n`);
  process.stdout.write(`  Status     : ${job.status}\n`);
  process.stdout.write(`  Backend    : ${job.backend}\n`);
  process.stdout.write(`  Dataset    : ${job.dataset_version.slice(0, 16)}…\n`);
  process.stdout.write(`  Created    : ${job.created_at}\n`);
  if (job.started_at) process.stdout.write(`  Started    : ${job.started_at}\n`);
  if (job.completed_at) process.stdout.write(`  Completed  : ${job.completed_at}\n`);
  if (job.error) process.stdout.write(`  Error      : ${job.error}\n`);
  if (job.artifact_path) process.stdout.write(`  Artifact   : ${job.artifact_path}\n`);
  process.stdout.write("\n");
}

async function cmdCancel(opts: TrainArgs): Promise<void> {
  if (!opts.jobId) { process.stderr.write("Error: job-id is required.\n"); process.exit(1); }
  await cancelTrainingJob(opts.jobId);
  process.stdout.write(`Job ${opts.jobId} cancelled.\n`);
}

async function cmdList(_opts: TrainArgs): Promise<void> {
  const jobs = listJobs();
  process.stdout.write(formatJobList(jobs));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runTrain(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  if (opts.help && !opts.subcommand) printHelp(0);

  switch (opts.subcommand) {
    case "start":  return cmdStart(opts);
    case "status": return cmdStatus(opts);
    case "cancel": return cmdCancel(opts);
    case "list":   return cmdList(opts);
    default:
      process.stderr.write(`Error: unknown train subcommand "${opts.subcommand ?? ""}"\n`);
      printHelp(1);
  }
}
