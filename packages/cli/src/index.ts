#!/usr/bin/env node
/**
 * TransparentGuard CLI (tg)
 *
 * COMMANDS
 *   validate <policy>                          Validate a TPS policy YAML against the JSON schema
 *   test     <policy> [--suite <dir>]          Run the policy test suite
 *   keys     create   [options]                Generate an offline license key
 *   report   [options]                         Generate a compliance evidence package
 *   serve    --mcp [--policy <path>]           Start MCP tool server (stdio transport)
 */

import { runValidate } from "./commands/validate";
import { runTest } from "./commands/test-cmd";
import { runKeys } from "./commands/keys";
import { runReport } from "./commands/report";
import { runServeMcp } from "./commands/serve-mcp";

const VERSION = "0.1.0";

function printHelp(): void {
  process.stdout.write(`
transparentguard v${VERSION}

USAGE
  transparentguard <command> [options]
  tg               <command> [options]

COMMANDS
  validate <policy>          Validate a TPS policy file against the JSON schema
  test     <policy>          Run the policy test suite (inline + external files)
  keys     create            Generate an offline license key (air-gapped deployments)
  report                     Generate a compliance evidence package from audit logs
  serve    --mcp             Start MCP tool server on stdio

GLOBAL OPTIONS
  --version, -v              Print version and exit
  --help,    -h              Print this help and exit

Run \`transparentguard <command> --help\` for command-level options and examples.
`.trimStart());
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    process.stdout.write(`transparentguard v${VERSION}\n`);
    process.exit(0);
  }

  const [command, ...rest] = args;

  switch (command) {
    case "validate":
      await runValidate(rest);
      break;
    case "test":
      await runTest(rest);
      break;
    case "keys":
      await runKeys(rest);
      break;
    case "report":
      await runReport(rest);
      break;
    case "serve":
      await runServeMcp(rest);
      break;
    default:
      process.stderr.write(`Error: unknown command "${command}"\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
