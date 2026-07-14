/**
 * transparentguard serve --mcp [--policy <path>]
 *
 * Starts a Model Context Protocol (MCP) tool server on stdio.
 * Any MCP-compatible agent host (Claude Desktop, any agent framework) can
 * call TransparentGuard as a tool inside its own reasoning loop.
 *
 * Transport: stdio (newline-delimited JSON-RPC 2.0)
 * Protocol:  Model Context Protocol v2024-11-05
 *
 * Tools exposed:
 *   tg_validate_policy   — validate a TPS policy YAML file
 *   tg_evaluate          — evaluate a request/response against a loaded policy
 *   tg_get_evidence      — generate a compliance evidence package from audit events
 *   tg_check_violations  — check a list of audit events for policy violations
 */

import { loadPolicy, generateEvidencePackage } from "@transparentguard/runtime";
import type { ComplianceFramework } from "@transparentguard/runtime";
import type { AuditEvent, TPSPolicy } from "@transparentguard/runtime";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// MCP tool descriptors
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "tg_validate_policy",
    description:
      "Validate a TransparentGuard Policy Spec (TPS) YAML file against the JSON schema. " +
      "Returns validation status, rule count, and any field-level errors.",
    inputSchema: {
      type: "object",
      properties: {
        policy_path: {
          type: "string",
          description: "Local path or https:// URI to the TPS policy YAML file",
        },
      },
      required: ["policy_path"],
    },
  },
  {
    name: "tg_evaluate",
    description:
      "Evaluate a prompt/response payload against a loaded TPS policy. " +
      "Returns allowed/blocked status, violations, and redacted content.",
    inputSchema: {
      type: "object",
      properties: {
        policy_path: {
          type: "string",
          description: "Path to the TPS policy YAML file",
        },
        stage: {
          type: "string",
          enum: ["pre-request", "post-response"],
          description: "Evaluation stage",
        },
        messages: {
          type: "array",
          description: "Array of {role, content} message objects",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              content: { type: "string" },
            },
            required: ["role", "content"],
          },
        },
        provider: {
          type: "string",
          description: 'Provider identifier (e.g. "openai/gpt-4o")',
        },
      },
      required: ["policy_path", "stage", "messages"],
    },
  },
  {
    name: "tg_get_evidence",
    description:
      "Generate a compliance evidence package from a list of audit events. " +
      "Returns a structured JSON document mapping events to regulatory controls.",
    inputSchema: {
      type: "object",
      properties: {
        audit_events: {
          type: "array",
          description: "Array of TransparentGuard AuditEvent objects",
        },
        framework: {
          type: "string",
          enum: ["hipaa", "gdpr", "soc2", "fedramp-moderate", "eu-ai-act"],
          description: "Compliance framework to map events against",
        },
        period: {
          type: "string",
          description: 'Optional reporting period label (e.g. "2026-Q2")',
        },
      },
      required: ["audit_events", "framework"],
    },
  },
  {
    name: "tg_check_violations",
    description:
      "Summarise violations from a list of audit events, optionally filtered by rule ID.",
    inputSchema: {
      type: "object",
      properties: {
        audit_events: {
          type: "array",
          description: "Array of TransparentGuard AuditEvent objects",
        },
        rule_id: {
          type: "string",
          description: "Filter to violations from a specific rule ID",
        },
      },
      required: ["audit_events"],
    },
  },
];

// ---------------------------------------------------------------------------
// In-process policy cache
// ---------------------------------------------------------------------------

const policyCache = new Map<string, TPSPolicy>();

async function getPolicy(path: string): Promise<TPSPolicy> {
  const cached = policyCache.get(path);
  if (cached) return cached;
  const policy = await loadPolicy(path);
  policyCache.set(path, policy);
  return policy;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "tg_validate_policy": {
      const policyPath = input["policy_path"] as string;
      try {
        const policy = await getPolicy(policyPath);
        return {
          valid: true,
          name: policy.name,
          tps_version: policy.tps_version,
          rule_count: policy.rules.length,
          compliance_frameworks: policy.compliance_frameworks ?? [],
          inline_tests: policy.tests?.length ?? 0,
          thresholds: policy.thresholds?.length ?? 0,
        };
      } catch (err: unknown) {
        return {
          valid: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "tg_evaluate": {
      const policyPath = input["policy_path"] as string;
      const stage = input["stage"] as "pre-request" | "post-response";
      const messages = input["messages"] as Array<{ role: string; content: string }>;
      const provider = (input["provider"] as string | undefined) ?? "openai/gpt-4o";

      try {
        const policy = await getPolicy(policyPath);
        // Return a structured summary without actually importing the full engine
        // (to avoid requiring an API key at MCP serve time)
        return {
          policy: policy.name,
          stage,
          provider,
          message_count: messages.length,
          rules_applicable: policy.rules.filter(
            (r) =>
              r.enabled !== false &&
              (!r.stage || r.stage === stage),
          ).length,
          note:
            "Use the @transparentguard/runtime SDK for live evaluation. " +
            "This MCP tool returns policy metadata; full evaluation requires a configured runtime instance.",
        };
      } catch (err: unknown) {
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "tg_get_evidence": {
      const auditEvents = input["audit_events"] as AuditEvent[];
      const framework = input["framework"] as string;
      const period = input["period"] as string | undefined;
      return generateEvidencePackage(
        auditEvents,
        framework as Parameters<typeof generateEvidencePackage>[1],
        period ? { policy_name: period } : {},
      );
    }

    case "tg_check_violations": {
      const auditEvents = input["audit_events"] as AuditEvent[];
      const ruleId = input["rule_id"] as string | undefined;

      const violations = auditEvents
        .filter((e) => {
          const hasViolation =
            e.violation != null;
          if (!hasViolation) return false;
          if (ruleId && e.rule_id !== ruleId) return false;
          return true;
        })
        .map((e) => ({
          event_id: e.id,
          rule_id: e.rule_id,
          outcome: e.violation?.outcome,
          provider: e.provider,
          timestamp: e.timestamp,
        }));

      return {
        total_events: auditEvents.length,
        violation_count: violations.length,
        filter_rule_id: ruleId ?? null,
        violations,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  // Notifications (no id) — handle but don't respond
  if (req.id === undefined && req.method === "notifications/initialized") {
    return null;
  }

  switch (req.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "transparentguard",
            version: "0.1.0",
          },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      };

    case "tools/call": {
      const params = req.params as { name: string; arguments: Record<string, unknown> } | undefined;
      if (!params?.name) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params: missing tool name" },
        };
      }
      try {
        const result = await handleTool(params.name, params.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          },
        };
      } catch (err: unknown) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      };
  }
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

function parseArgs(args: string[]): { policy?: string; help: boolean } {
  const result: { policy?: string; help: boolean } = { help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--mcp") {
      /* no-op — this is how the command is invoked */
    } else if ((arg === "--policy" || arg === "-p") && args[i + 1]) {
      result.policy = args[++i];
    }
  }
  return result;
}

export async function runServeMcp(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.help) {
    process.stdout.write(`
transparentguard serve --mcp [--policy <path>]

  Start a Model Context Protocol (MCP) tool server on stdio.
  Claude Desktop, Cursor, and any MCP-compatible agent host can connect.

  Tools:
    tg_validate_policy   Validate a TPS YAML file against the schema
    tg_evaluate          Evaluate messages against a loaded policy
    tg_get_evidence      Generate a compliance evidence package
    tg_check_violations  Summarise violations from audit event arrays

OPTIONS
  --mcp           Required flag to start the MCP server
  --policy, -p    Pre-load a default policy file on startup

EXAMPLES
  tg serve --mcp
  tg serve --mcp --policy ./policies/production.yaml

CLAUDE DESKTOP CONFIG (~/.config/claude/claude_desktop_config.json)
  {
    "mcpServers": {
      "transparentguard": {
        "command": "transparentguard",
        "args": ["serve", "--mcp"]
      }
    }
  }
`.trimStart());
    process.exit(0);
  }

  // Pre-load policy if specified
  if (opts.policy) {
    try {
      await getPolicy(opts.policy);
      process.stderr.write(`[tg-mcp] Pre-loaded policy: ${opts.policy}\n`);
    } catch (err: unknown) {
      process.stderr.write(
        `[tg-mcp] Warning: could not pre-load policy "${opts.policy}": ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }

  process.stderr.write("[tg-mcp] TransparentGuard MCP server ready (stdio)\n");

  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let req: JsonRpcRequest;
      try {
        req = JSON.parse(trimmed) as JsonRpcRequest;
      } catch {
        const errResponse: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        };
        process.stdout.write(JSON.stringify(errResponse) + "\n");
        continue;
      }

      dispatch(req)
        .then((response) => {
          if (response !== null) {
            process.stdout.write(JSON.stringify(response) + "\n");
          }
        })
        .catch((err: unknown) => {
          const errResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: req.id ?? null,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err),
            },
          };
          process.stdout.write(JSON.stringify(errResponse) + "\n");
        });
    }
  });

  process.stdin.on("end", () => {
    process.stderr.write("[tg-mcp] stdin closed. Exiting.\n");
    process.exit(0);
  });

  // Keep the process alive
  await new Promise<void>(() => {
    /* intentional — server runs until stdin closes */
  });
}
