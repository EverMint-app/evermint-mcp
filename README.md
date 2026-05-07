# EverMint MCP Server

Tamper-evident proof of agent actions, callable as a native MCP tool.

## What it does

Exposes five tools to any MCP-compatible agent:

| Tool | Auth | Purpose |
|------|------|---------|
| `evermint_mint` | API key | Mint a tamper-evident record of an agent action |
| `evermint_verify` | Public | Verify a single record by Record ID |
| `evermint_list_records` | API key | List records for the authenticated org, with filters |
| `evermint_get_record` | API key | Fetch a single record including its original payload |
| `evermint_verify_chain` | Public | Verify the integrity of a sequence of chained records |

## Setup

1. Get an API key at evermint.app/api-keys

2. Add to your Claude desktop config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "evermint": {
      "command": "npx",
      "args": ["-y", "evermint-mcp"],
      "env": {
        "EVERMINT_API_KEY": "EVR-sk_your_key_here"
      }
    }
  }
}
```

3. Restart Claude. The tools appear automatically.

## Tools

### `evermint_mint` (API key required)

Mint a tamper-evident, cryptographically timestamped record of an action.

```js
evermint_mint({
  agent_id: "billing-agent-1",
  action_type: "decision_made",
  payload: { decision: "approved", confidence: 0.97 }
})
```

### `evermint_verify` (public)

Verify a single record by Record ID.

```js
evermint_verify({ record_id: "EVR-12C5N1A2" })
```

### `evermint_list_records` (API key required)

List records for the authenticated org with optional filters. Returns metadata only (no payloads).

```js
evermint_list_records({
  agent_id: "billing-agent-1",
  action_type: "decision_made",
  since: "2026-01-01T00:00:00Z",
  until: "2026-05-01T00:00:00Z",
  limit: 50
})
```

All filters are optional. `limit` defaults to 50 (max 200).

### `evermint_get_record` (API key required)

Fetch the full contents of a single record, including its original payload. Returns `403` if the record exists but belongs to a different organization.

```js
evermint_get_record({ record_id: "EVR-12C5N1A2" })
```

### `evermint_verify_chain` (public)

Verify a sequence of hash-chained records. Confirms each hash matches its content, and each `chain_link` correctly references the prior record.

```js
// Explicit list, oldest first
evermint_verify_chain({
  record_ids: ["EVR-AAAAAAAA", "EVR-BBBBBBBB", "EVR-CCCCCCCC"]
})

// Or walk forward from a starting point
evermint_verify_chain({
  start_record_id: "EVR-AAAAAAAA",
  length: 10
})
```

Returns per-record `hash_valid`, `chain_link_valid`, plus an overall `chain_intact: true|false`.

## Verify any record

```
evermint.app/verify?id=EVR-XXXXXXXX
```

## Publishing

To publish to npm as `evermint-mcp`:

- `package.json` name: `"evermint-mcp"`
- `bin` entry: `{ "evermint-mcp": "./dist/server.js" }`
- Add to Anthropic MCP registry at modelcontextprotocol.io/registry

## Contact

info@evermint.app
