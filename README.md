# evermint-mcp

MCP server for [EverMint](https://evermint.app) — the notary layer for AI agents.

When your agent acts, EverMint mints a tamper-evident, cryptographically timestamped record. This package exposes EverMint's mint and verify capabilities as native MCP tools, callable by Claude Desktop and any MCP-compatible AI agent.

## Quick start

Get an API key at [evermint.app/api-keys](https://evermint.app/api-keys). Free tier includes 500 mints/month.

## Use with Claude Desktop

Add to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop. The `evermint_mint` and `evermint_verify` tools will be available.

## Tools

### `evermint_mint`

Mint a tamper-evident record of an agent action, decision, or observation.

**Parameters:**

- `action_type` *(required)* — Short label for the action (e.g. `transaction_approved`, `decision_made`, `data_accessed`)
- `agent_id` — Identifier for the agent or system
- `payload` — Any JSON object capturing the state, decision, or context
- `timestamp` — ISO 8601 datetime, or `auto` (default)

**Returns:** Record ID, SHA-256 hash, timestamp, chain link, and remaining credits.

### `evermint_verify`

Verify an existing EverMint record by Record ID. Public, no API key required.

**Parameters:**

- `record_id` *(required)* — The EverMint Record ID to verify (format: `EVR-XXXXXXXX`)

**Returns:** Confirmation of integrity plus record metadata.

## Pricing

- **Free** — 500 mints/month
- **Pro** — $49/month, 50,000 mints + MCP access
- **Top-ups** — From $0.001/mint

See [evermint.app/developers](https://evermint.app/developers) for details.

## Verify any record

Every record minted through this MCP can be publicly verified at [evermint.app/verify](https://evermint.app/verify) — no account required.

## Links

- Site: [evermint.app](https://evermint.app)
- Docs: [evermint.app/docs](https://evermint.app/docs)
- Developers: [evermint.app/developers](https://evermint.app/developers)

## License

MIT
