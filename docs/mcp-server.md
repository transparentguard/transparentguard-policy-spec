# MCP Server

`tg serve --mcp` starts a Model Context Protocol server on stdio. Claude Desktop, Cursor, Windsurf, and any MCP-compatible agent host can call TransparentGuard as a native tool inside its own reasoning loop — enabling agents to validate policies, evaluate messages, and query audit evidence without leaving the conversation.

---

## Start the server

```bash
tg serve --mcp
```

The server communicates over stdio using the MCP protocol. It does not open a TCP port.

## Claude Desktop configuration

```json
// ~/.config/claude/claude_desktop_config.json
{
  "mcpServers": {
    "transparentguard": {
      "command": "transparentguard",
      "args": ["serve", "--mcp"],
      "env": {
        "TG_LICENSE_KEY": "tgk1_eyJ2IjoxLCJ...",
        "TG_DEFAULT_POLICY": "./policies/production.yaml"
      }
    }
  }
}
```

## Cursor / Windsurf configuration

```json
// .cursor/mcp.json  or  .windsurf/mcp.json
{
  "mcpServers": {
    "transparentguard": {
      "command": "tg",
      "args": ["serve", "--mcp"]
    }
  }
}
```

## Available tools

### `tg_validate_policy`

Validate a TPS YAML file against the full JSON Schema.

```typescript
const result = await callTool("tg_validate_policy", {
  policy_path: "./policies/production.yaml",
  // or: policy_url: "https://..."
});
// => {
//   valid: true,
//   name: "production",
//   tps_version: "1.0",
//   rule_count: 6,
//   framework_count: 2,
//   inline_test_count: 3,
//   errors: []
// }
```

### `tg_evaluate`

Evaluate a set of messages against a policy and return which rules apply, their outcomes, and any modifications.

```typescript
const result = await callTool("tg_evaluate", {
  policy_path: "./policies/production.yaml",
  stage: "pre-request",
  messages: [
    { role: "user", content: "My SSN is 123-45-6789, help with my claim." }
  ],
  provider: "openai/gpt-4o",
});
// => {
//   allowed: true,
//   modified: true,
//   violations: [{
//     rule_id: "redact-phi",
//     outcome: "redacted",
//     detail: "SSN pattern redacted from user message"
//   }],
//   modified_messages: [
//     { role: "user", content: "My SSN is [REDACTED], help with my claim." }
//   ]
// }
```

### `tg_check_violations`

Summarise violations from an audit event array, with optional rule_id filter.

```typescript
const result = await callTool("tg_check_violations", {
  events: [...],           // array of TG audit event objects
  rule_id: "redact-phi",  // optional filter
  since: "2026-07-01T00:00:00Z",
});
// => {
//   total_violations: 47,
//   by_rule: { "redact-phi": 44, "provider-allowlist": 3 },
//   by_outcome: { "blocked": 3, "redacted": 44 }
// }
```

### `tg_get_evidence`

Generate a compliance evidence package from an audit event array.

```typescript
const result = await callTool("tg_get_evidence", {
  events: [...],
  framework: "hipaa",
  period: "2026-Q2",
});
// => { tg_evidence_version: "1.0", framework: "hipaa", controls: [...] }
```

## Environment variables

| Variable | Description |
|---|---|
| `TG_LICENSE_KEY` | Offline license key — required for enterprise features |
| `TG_DEFAULT_POLICY` | Default policy path when none specified in tool calls |
| `TG_MCP_LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (default: `info`) |

## Related

- [SDK — TypeScript](sdk-typescript.md)  
- [CLI — validate](cli-validate.md)  
- [MCP specification](https://modelcontextprotocol.io)
