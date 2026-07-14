/**
 * transparentguard report --logs <path> --framework <fw> [options]
 * Generates a compliance evidence package from audit log files.
 */

import { readFileSync, writeFileSync } from "fs";
import { generateEvidencePackage } from "@transparentguard/runtime";
import type { ComplianceFramework } from "@transparentguard/runtime";
import type { AuditEvent } from "@transparentguard/runtime";

interface ParsedReportArgs {
  logs?: string;
  framework?: string;
  period?: string;
  output?: string;
  help: boolean;
}

function parseArgs(args: string[]): ParsedReportArgs {
  const result: ParsedReportArgs = { help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if ((arg === "--logs" || arg === "-l") && args[i + 1]) {
      result.logs = args[++i];
    } else if ((arg === "--framework" || arg === "-f") && args[i + 1]) {
      result.framework = args[++i];
    } else if ((arg === "--period" || arg === "-p") && args[i + 1]) {
      result.period = args[++i];
    } else if ((arg === "--output" || arg === "-o") && args[i + 1]) {
      result.output = args[++i];
    }
  }
  return result;
}

export async function runReport(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.help || !opts.logs || !opts.framework) {
    process.stdout.write(`
transparentguard report --logs <path> --framework <fw> [options]

  Generate a structured compliance evidence package from NDJSON audit log files.
  Output is a JSON document consumable by audit tools, GRC platforms, and auditors.

OPTIONS
  --logs, -l       Path to NDJSON audit log file                                [required]
  --framework, -f  Framework: hipaa | gdpr | soc2 | fedramp-moderate | eu-ai-act [required]
  --period, -p     Reporting period label (e.g. "2026-Q2", "2026-07")
  --output, -o     Output file path (default: stdout)

EXAMPLES
  tg report --logs ./audit/2026-07.ndjson --framework hipaa --period 2026-Q2
  tg report --logs ./audit/prod.ndjson --framework soc2 --output report.json
  tg report --logs ./audit/fedramp.ndjson --framework fedramp-moderate -p 2026-Q3 -o fedramp.json
`.trimStart());
    process.exit(opts.help ? 0 : 1);
  }

  process.stderr.write(`Loading audit log from ${opts.logs} ...\n`);

  let events: AuditEvent[];
  try {
    const raw = readFileSync(opts.logs, "utf8");
    events = raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((line, idx) => {
        try {
          return JSON.parse(line) as AuditEvent;
        } catch {
          throw new Error(`Line ${idx + 1}: invalid JSON — ${line.slice(0, 80)}`);
        }
      });
  } catch (err: unknown) {
    process.stderr.write(
      `Error reading audit log: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  process.stderr.write(
    `Loaded ${events.length} audit event(s). Generating ${opts.framework} evidence package...\n`,
  );

  const pkg = generateEvidencePackage(
    events,
    opts.framework as Parameters<typeof generateEvidencePackage>[1],
    { policy_name: opts.period },
  );
  const json = JSON.stringify(pkg, null, 2);

  if (opts.output) {
    writeFileSync(opts.output, json, "utf8");
    process.stderr.write(`\nEvidence package written to ${opts.output}\n`);
    process.stderr.write(`  Framework : ${pkg.framework}\n`);
    process.stderr.write(`  Controls  : ${pkg.controls?.length ?? 0}\n`);
    process.stderr.write(`  Events    : ${pkg.total_events}\n`);
    process.stderr.write(`  Blocked   : ${pkg.blocked_events}\n`);
    process.stderr.write(`  Period    : ${pkg.period.start} → ${pkg.period.end}\n`);
  } else {
    process.stdout.write(json + "\n");
  }
}
