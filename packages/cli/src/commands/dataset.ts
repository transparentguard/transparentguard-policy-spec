/**
 * transparentguard dataset <subcommand> [options]
 *
 * SUBCOMMANDS
 *   add      <name>   Add a labeled example to a dataset
 *   import   <name>   Bulk-import from a JSONL file
 *   list              List all datasets
 *   validate <name>   Validate dataset quality before training
 *   version  <name>   Create an immutable snapshot of the current HEAD
 *   versions <name>   List all immutable snapshots
 *   export   <name>   Export dataset as JSONL
 *   review   <name>   Show active learning queue (uncertain predictions)
 */

import {
  addExample,
  importJsonl,
  readExamples,
  listDatasets,
  exportJsonl,
  validateDataset,
  formatValidationReport,
  createSnapshot,
  listVersions,
  formatVersionList,
  readActiveLearningQueue,
  clearActiveLearningQueue,
} from "@transparentguard/runtime";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface DatasetArgs {
  subcommand?: string;
  name?: string;
  text?: string;
  label?: string;
  confidence?: number;
  rationale?: string;
  file?: string;
  output?: string;
  source?: string;
  clear?: boolean;
  help: boolean;
}

function parseArgs(args: string[]): DatasetArgs {
  const result: DatasetArgs = { help: false };
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { result.help = true; }
    else if ((arg === "--text" || arg === "-t") && args[i + 1]) { result.text = args[++i]; }
    else if ((arg === "--label" || arg === "-l") && args[i + 1]) { result.label = args[++i]; }
    else if ((arg === "--confidence" || arg === "-c") && args[i + 1]) { result.confidence = parseFloat(args[++i]); }
    else if ((arg === "--rationale" || arg === "-r") && args[i + 1]) { result.rationale = args[++i]; }
    else if ((arg === "--file" || arg === "-f") && args[i + 1]) { result.file = args[++i]; }
    else if ((arg === "--output" || arg === "-o") && args[i + 1]) { result.output = args[++i]; }
    else if ((arg === "--source") && args[i + 1]) { result.source = args[++i]; }
    else if (arg === "--clear") { result.clear = true; }
    else if (!arg.startsWith("-")) { positionals.push(arg); }
  }
  result.subcommand = positionals[0];
  result.name = positionals[1];
  return result;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(exit = 0): never {
  process.stdout.write(`
transparentguard dataset <subcommand> [options]

SUBCOMMANDS
  add <name>               Add a single labeled example
    --text,       -t       Input text to label                          [required]
    --label,      -l       Label string (e.g. "positive", "harmful")   [required]
    --confidence, -c       Soft label confidence [0.0-1.0]              [default: 1.0]
    --rationale,  -r       Chain-of-thought rationale for this label
    --source               Label source: human|auto|active-learning     [default: human]

  import <name>            Bulk-import from a JSONL file (text + label per line)
    --file,       -f       Path to JSONL file                           [required]
    --source               Label source override                        [default: human]

  list                     List all datasets with example counts

  validate <name>          Validate dataset quality (balance, size, duplicates)

  version <name>           Create an immutable content-addressed snapshot

  versions <name>          List all immutable snapshots for a dataset

  export <name>            Export HEAD dataset as JSONL
    --output,     -o       Output file path                             [required]

  review <name>            Show active learning queue (uncertain predictions)
    --clear                Clear the queue after display

EXAMPLES
  tg dataset add my-classifier --text "Inject this prompt" --label harmful
  tg dataset import my-classifier --file ./raw-data.jsonl
  tg dataset validate my-classifier
  tg dataset version my-classifier
  tg dataset export my-classifier --output ./dataset-export.jsonl
  tg dataset review my-classifier
`.trimStart());
  process.exit(exit);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function cmdAdd(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  if (!opts.text) { process.stderr.write("Error: --text is required.\n"); process.exit(1); }
  if (!opts.label) { process.stderr.write("Error: --label is required.\n"); process.exit(1); }

  const result = addExample(opts.name, opts.text, {
    label: opts.label,
    confidence: opts.confidence,
    rationale: opts.rationale,
    source: (opts.source as "human" | "auto" | "active-learning") ?? "human",
  });

  if (result === null) {
    process.stdout.write(`Skipped: duplicate text+label combination already exists.\n`);
  } else {
    process.stdout.write(`Added: id=${result.id.slice(0, 12)}… label="${result.label}" conf=${result.confidence}\n`);
  }
}

async function cmdImport(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  if (!opts.file) { process.stderr.write("Error: --file is required.\n"); process.exit(1); }

  const { added, skipped } = importJsonl(
    opts.name,
    opts.file,
    (opts.source as "human" | "auto" | "active-learning") ?? "human",
  );
  process.stdout.write(`Imported: ${added} added, ${skipped} skipped.\n`);
}

async function cmdList(_opts: DatasetArgs): Promise<void> {
  const datasets = listDatasets();
  if (datasets.length === 0) {
    process.stdout.write("No datasets found. Add examples with `tg dataset add`.\n");
    return;
  }
  process.stdout.write("\nDatasets\n\n");
  for (const name of datasets) {
    const examples = readExamples(name);
    const labels = [...new Set(examples.map((e) => e.label))].sort();
    process.stdout.write(`  ${name.padEnd(32)} ${examples.length} examples  [${labels.join(", ")}]\n`);
  }
  process.stdout.write("\n");
}

async function cmdValidate(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const examples = readExamples(opts.name);
  const report = validateDataset(opts.name, examples);
  process.stdout.write(formatValidationReport(report));
  process.exit(report.passed ? 0 : 1);
}

async function cmdVersion(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const { version } = createSnapshot(opts.name);
  process.stdout.write(
    `Snapshot created: ${version.version}  hash=${version.hash.slice(0, 16)}…  examples=${version.example_count}\n`,
  );
}

async function cmdVersions(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const versions = listVersions(opts.name);
  process.stdout.write(formatVersionList(opts.name, versions));
}

async function cmdExport(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  if (!opts.output) { process.stderr.write("Error: --output is required.\n"); process.exit(1); }
  const count = exportJsonl(opts.name, opts.output);
  process.stdout.write(`Exported ${count} examples to ${opts.output}\n`);
}

async function cmdReview(opts: DatasetArgs): Promise<void> {
  if (!opts.name) { process.stderr.write("Error: classifier name is required.\n"); process.exit(1); }
  const queue = readActiveLearningQueue(opts.name);
  if (queue.length === 0) {
    process.stdout.write(`No uncertain predictions queued for "${opts.name}".\n`);
    return;
  }
  process.stdout.write(`\nActive learning queue — ${opts.name} (${queue.length} entries)\n\n`);
  for (const entry of queue.slice(0, 50)) {
    const excerpt = entry.text.slice(0, 80).replace(/\n/g, " ");
    process.stdout.write(`  [${entry.score.toFixed(3)}] predicted="${entry.predicted_label}"  "${excerpt}…"\n`);
    process.stdout.write(`         id=${entry.id.slice(0, 12)}…  flagged=${entry.flagged_at}\n`);
  }
  if (queue.length > 50) {
    process.stdout.write(`  … and ${queue.length - 50} more.\n`);
  }
  process.stdout.write("\n");
  process.stdout.write(`Use \`tg dataset add ${opts.name} --text "..." --label <label>\` to label these.\n`);

  if (opts.clear) {
    const cleared = clearActiveLearningQueue(opts.name);
    process.stdout.write(`Cleared ${cleared} entries from the active learning queue.\n`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runDataset(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.help && !opts.subcommand) printHelp(0);

  switch (opts.subcommand) {
    case "add":      return cmdAdd(opts);
    case "import":   return cmdImport(opts);
    case "list":     return cmdList(opts);
    case "validate": return cmdValidate(opts);
    case "version":  return cmdVersion(opts);
    case "versions": return cmdVersions(opts);
    case "export":   return cmdExport(opts);
    case "review":   return cmdReview(opts);
    default:
      process.stderr.write(`Error: unknown dataset subcommand "${opts.subcommand ?? ""}"\n`);
      printHelp(1);
  }
}
