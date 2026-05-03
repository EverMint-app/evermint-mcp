#!/usr/bin/env node
/**
 * EverMint MCP Server
 *
 * Exposes EverMint's mint and verify capabilities as native tools
 * callable by Claude and other MCP-compatible AI agents.
 *
 * Transport: stdio
 * Auth: bearer token via EVERMINT_API_KEY environment variable
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE_URL =
  process.env.EVERMINT_API_URL ?? "https://api.evermint.app/v1";

interface MintArgs {
  agent_id?: string;
  action_type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

interface VerifyArgs {
  record_id: string;
}

interface MintResponse {
  record_id: string;
  sha256: string;
  timestamp: string;
  chain_link: string;
  status: string;
  credits_remaining: number;
}

interface VerifyResponse {
  record_id: string;
  sha256: string;
  timestamp: string;
  chain_link: string;
  status: string;
  verified: boolean;
}

const textResult = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

async function handleMint(args: MintArgs) {
  const apiKey = process.env.EVERMINT_API_KEY;
  if (!apiKey) {
    return textResult(
      "EVERMINT_API_KEY environment variable not set.",
      true
    );
  }

  if (!args?.action_type || typeof args.action_type !== "string") {
    return textResult("Mint failed: action_type is required.", true);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/mint`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: args.agent_id,
        action_type: args.action_type,
        payload: args.payload,
        timestamp: args.timestamp ?? "auto",
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Mint failed: ${msg}`, true);
  }

  if (response.status === 401) {
    return textResult(
      "Authentication failed. Check your EVERMINT_API_KEY.",
      true
    );
  }
  if (response.status === 402) {
    return textResult(
      "Insufficient mint credits. Add credits at evermint.app/settings.",
      true
    );
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") ?? "unknown";
    return textResult(
      `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      true
    );
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) errMsg = body.error;
      else if (body?.message) errMsg = body.message;
    } catch {
      // fall through
    }
    return textResult(`Mint failed: ${errMsg}`, true);
  }

  const data = (await response.json()) as MintResponse;

  const text =
    `Minted successfully\n\n` +
    `Record ID:    ${data.record_id}\n` +
    `SHA-256:      ${data.sha256}\n` +
    `Timestamp:    ${data.timestamp}\n` +
    `Chain link:   ${data.chain_link}\n` +
    `Status:       ${data.status}\n` +
    `Credits left: ${data.credits_remaining}\n\n` +
    `Verify at: https://evermint.app/verify?id=${data.record_id}`;

  return textResult(text);
}

async function handleVerify(args: VerifyArgs) {
  if (!args?.record_id || typeof args.record_id !== "string") {
    return textResult("Verification failed: record_id is required.", true);
  }

  const recordId = encodeURIComponent(args.record_id.trim().toUpperCase());

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/verify/${recordId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Verification failed: ${msg}`, true);
  }

  if (response.status === 404) {
    return textResult("Record not found. Check the Record ID.", true);
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) errMsg = body.error;
      else if (body?.message) errMsg = body.message;
    } catch {
      // fall through
    }
    return textResult(`Verification failed: ${errMsg}`, true);
  }

  const data = (await response.json()) as VerifyResponse;

  if (!data.verified) {
    return textResult(
      "Record found but integrity check failed. The record may have been altered.",
      true
    );
  }

  const text =
    `Record verified - not tampered\n\n` +
    `Record ID:  ${data.record_id}\n` +
    `SHA-256:    ${data.sha256}\n` +
    `Timestamp:  ${data.timestamp}\n` +
    `Chain link: ${data.chain_link}\n` +
    `Status:     ${data.status}`;

  return textResult(text);
}

const TOOLS = [
  {
    name: "evermint_mint",
    description:
      "Mint a tamper-evident, cryptographically timestamped record of an AI agent action, decision, or observation. Returns a Record ID and SHA-256 hash that can be used to prove what the agent did and when. Use this whenever an agent takes an action that may need to be audited, disputed, or verified later.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: {
          type: "string",
          description: "Identifier for this agent or system",
        },
        action_type: {
          type: "string",
          description:
            "Short label for the action being recorded (e.g. transaction_approved, decision_made, data_accessed)",
        },
        payload: {
          type: "object",
          description:
            "The state, decision, or context to preserve. Any JSON object.",
          additionalProperties: true,
        },
        timestamp: {
          type: "string",
          description:
            "ISO 8601 datetime or 'auto'. Defaults to auto.",
        },
      },
      required: ["action_type"],
    },
  },
  {
    name: "evermint_verify",
    description:
      "Verify an existing EverMint record by Record ID. Confirms the record exists, has not been altered, and returns its metadata. No API key required, verification is public.",
    inputSchema: {
      type: "object" as const,
      properties: {
        record_id: {
          type: "string",
          description:
            "The EverMint Record ID to verify (format: EVR-XXXXXXXX)",
        },
      },
      required: ["record_id"],
    },
  },
];

const server = new Server(
  { name: "evermint", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "evermint_mint":
      return handleMint((args ?? {}) as unknown as MintArgs);
    case "evermint_verify":
      return handleVerify((args ?? {}) as unknown as VerifyArgs);
    default:
      return textResult(`Unknown tool: ${name}`, true);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("EverMint MCP server failed to start:", err);
  process.exit(1);
});
