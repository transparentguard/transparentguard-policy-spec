/**
 * transparentguard test <policy> [--suite <dir>]
 * Runs the policy test suite (TPS Section 27).
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { loadPolicy, testPolicy, formatTestResults } from "@transparentguard/runtime";
import yaml from "js-yaml";
import type { TPSPolicy, TPSPolicyTest } from "@transparentguard/runtime";

function parseArgs(args: string[]): { policy?: string; suite?: string; help: boolean } {
  const result: { policy?: string; suite?: string; help: boolean } = { help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if ((arg === "--suite" || arg === "-s") && args[i + 1]) {
      result.suite = args[++i];
    } else if (!result.policy && !arg.startsWith("-")) {
      result.policy = arg;
    }
  }
  return result;
}

export async function runTest(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.help || !opts.policy) {
    process.stdout.write(`
transparentguard test <policy> [--suite <dir>]

  Run the policy test suite against a TPS policy file.
  Uses inline tests (policy.tests[]) by default.
  Use --suite to load additional YAML test files from a directory.
  Exits 0 if all tests pass, 1 if any fail.

ARGUMENTS
  <policy>        Path to the policy YAML file

OPTIONS
  --suite, -s     Directory containing additional YAML test files

EXAMPLES
  transparentguard test ./policies/production.yaml
  transparentguard test ./policies/production.yaml --suite ./tests/
  tg test ./policies/production.yaml -s ./tests/
`.trimStart());
    process.exit(opts.help ? 0 : 1);
  }

  process.stdout.write(`Loading policy from ${opts.policy} ...\n`);
  const policy: TPSPolicy = await loadPolicy(opts.policy);

  if (opts.suite) {
    try {
      const files = readdirSync(opts.suite).filter(
        (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
      );
      let loaded = 0;
      for (const file of files) {
        const raw = readFileSync(join(opts.suite, file), "utf8");
        const parsed = yaml.load(raw) as { tests?: unknown[] } | null;
        if (parsed?.tests && Array.isArray(parsed.tests)) {
          policy.tests = [
            ...(policy.tests ?? []),
            ...(parsed.tests as TPSPolicyTest[]),
          ];
          loaded += parsed.tests.length;
        }
      }
      process.stdout.write(
        `Loaded ${files.length} suite file(s) — ${loaded} additional test(s).\n`,
      );
    } catch (err: unknown) {
      process.stderr.write(
        `Warning: could not read suite directory "${opts.suite}": ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }

  if (!policy.tests?.length) {
    process.stdout.write("No tests found. Add a tests: [] section to your policy or use --suite.\n");
    process.exit(0);
  }

  const suite = await testPolicy(policy);
  process.stdout.write(formatTestResults(suite));
  process.exit(suite.failed > 0 ? 1 : 0);
}
