/**
 * transparentguard validate <policy>
 * Validates a TPS policy YAML file against the JSON schema.
 */

import { loadPolicy } from "@transparentguard/runtime";

function parseArgs(args: string[]): { policy?: string; help: boolean } {
  const result: { policy?: string; help: boolean } = { help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (!result.policy && !arg.startsWith("-")) {
      result.policy = arg;
    }
  }
  return result;
}

export async function runValidate(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.help || !opts.policy) {
    process.stdout.write(`
transparentguard validate <policy>

  Validate a TPS policy YAML file against the JSON schema.
  Prints field-level errors and exits 1 if any are found.
  Exits 0 on success.

ARGUMENTS
  <policy>    Local path or https:// URI to the policy YAML file

EXAMPLES
  transparentguard validate ./policies/production.yaml
  transparentguard validate https://policies.mycompany.com/hipaa.yaml
  tg validate ./policies/production.yaml
`.trimStart());
    process.exit(opts.help ? 0 : 1);
  }

  process.stdout.write(`Validating ${opts.policy} ...\n`);

  try {
    const policy = await loadPolicy(opts.policy);
    process.stdout.write(`\n✓  Valid — "${policy.name}" (tps_version: ${policy.tps_version})\n`);
    if (policy.compliance_frameworks?.length) {
      process.stdout.write(`   Frameworks : ${policy.compliance_frameworks.join(", ")}\n`);
    }
    process.stdout.write(`   Rules      : ${policy.rules.length}\n`);
    if (policy.tests?.length) {
      process.stdout.write(`   Inline tests: ${policy.tests.length}\n`);
    }
    if (policy.thresholds?.length) {
      process.stdout.write(`   Thresholds : ${policy.thresholds.length}\n`);
    }
    process.stdout.write("\n");
    process.exit(0);
  } catch (err: unknown) {
    process.stderr.write(`\n✗  Validation failed:\n`);
    if (err instanceof Error) {
      for (const line of err.message.split("\n")) {
        process.stderr.write(`   ${line}\n`);
      }
    } else {
      process.stderr.write(`   ${String(err)}\n`);
    }
    process.stderr.write("\n");
    process.exit(1);
  }
}
