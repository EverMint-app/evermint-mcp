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

interface ListRecordsArgs {
  agent_id?: string;
  action_type?: string;
  since?: string;
  until?: string;
  limit?: number;
}

interface GetRecordArgs {
  record_id: string;
}

interface VerifyChainArgs {
  record_ids?: string[];
  start_record_id?: string;
  length?: number;
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
  found: boolean;
  record_id?: string;
  content_hash?: string;
  hash_algorithm?: string;
  submitted_at?: string;
  status?: string;
}

const VERIFY_URL =
  process.env.EVERMINT_VERIFY_URL ??
  "https://lvlngyvrpjvliczidyal.supabase.co/functions/v1/verify-record-public";

const LIST_RECORDS_URL =
  process.env.EVERMINT_LIST_URL ??
  "https://lvlngyvrpjvliczidyal.supabase.co/functions/v1/list-agent-records";

const GET_RECORD_URL =
  process.env.EVERMINT_GET_URL ??
  "https://lvlngyvrpjvliczidyal.supabase.co/functions/v1/get-agent-record";

const VERIFY_CHAIN_URL =
  process.env.EVERMINT_VERIFY_CHAIN_URL ??
  "https://lvlngyvrpjvliczidyal.supabase.co/functions/v1/verify-chain-public";

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

  const normalizedRecordId = args.record_id.trim().toUpperCase();

  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_id: normalizedRecordId }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Verification failed: ${msg}`, true);
  }

  const rawBody = await response.text();

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    if (rawBody) {
      try {
        const body = JSON.parse(rawBody);
        if (body?.error) errMsg = body.error;
        else if (body?.message) errMsg = body.message;
      } catch {
        // non-JSON error body, keep HTTP status message
      }
    }
    return textResult(`Verification failed: ${errMsg}`, true);
  }

  if (!rawBody) {
    return textResult("Record not found. Check the Record ID.", true);
  }

  let data: VerifyResponse;
  try {
    data = JSON.parse(rawBody) as VerifyResponse;
  } catch {
    return textResult(
      "Verification failed: invalid response from server.",
      true
    );
  }

  if (!data.found) {
    return textResult("Record not found. Check the Record ID.", true);
  }

  const text =
    `Record verified - not tampered\n\n` +
    `Record ID:  ${data.record_id ?? normalizedRecordId}\n` +
    `SHA-256:    ${data.content_hash ?? "n/a"}\n` +
    `Algorithm:  ${data.hash_algorithm ?? "SHA-256"}\n` +
    `Timestamp:  ${data.submitted_at ?? "n/a"}\n` +
    `Status:     ${data.status ?? "n/a"}`;

  return textResult(text);
}

async function postJson(
  url: string,
  body: unknown,
  apiKey: string | null,
): Promise<{ ok: boolean; status: number; rawBody: string; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const rawBody = await response.text();
  let data: any = null;
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, rawBody, data };
}

function authedErrorMessage(
  prefix: string,
  status: number,
  data: any,
  rawBody: string,
): string {
  if (status === 401) return `${prefix}: authentication failed. Check your EVERMINT_API_KEY.`;
  if (status === 403) return `${prefix}: forbidden. Record belongs to a different organization.`;
  if (status === 404) return `${prefix}: record not found.`;
  if (status === 429) return `${prefix}: rate limit exceeded. Try again shortly.`;
  if (data?.error) return `${prefix}: ${data.error}`;
  if (rawBody) return `${prefix}: HTTP ${status}`;
  return `${prefix}: HTTP ${status}`;
}

async function handleListRecords(args: ListRecordsArgs) {
  const apiKey = process.env.EVERMINT_API_KEY;
  if (!apiKey) {
    return textResult("EVERMINT_API_KEY environment variable not set.", true);
  }

  const requestBody: Record<string, unknown> = {};
  if (args?.agent_id) requestBody.agent_id = args.agent_id;
  if (args?.action_type) requestBody.action_type = args.action_type;
  if (args?.since) requestBody.since = args.since;
  if (args?.until) requestBody.until = args.until;
  if (typeof args?.limit === "number") requestBody.limit = args.limit;

  let result;
  try {
    result = await postJson(LIST_RECORDS_URL, requestBody, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`List failed: ${msg}`, true);
  }

  if (!result.ok) {
    return textResult(
      authedErrorMessage("List failed", result.status, result.data, result.rawBody),
      true,
    );
  }

  const records = Array.isArray(result.data?.records) ? result.data.records : [];
  if (records.length === 0) {
    return textResult("No matching records found.");
  }
  const lines = records.map(
    (r: any) =>
      `${r.record_id}  ${r.timestamp ?? "n/a"}  ${r.action_type ?? "n/a"}  agent=${r.agent_id ?? "n/a"}`,
  );
  const text = `Found ${records.length} record(s):\n\n${lines.join("\n")}`;
  return textResult(text);
}

async function handleGetRecord(args: GetRecordArgs) {
  const apiKey = process.env.EVERMINT_API_KEY;
  if (!apiKey) {
    return textResult("EVERMINT_API_KEY environment variable not set.", true);
  }
  if (!args?.record_id || typeof args.record_id !== "string") {
    return textResult("Get failed: record_id is required.", true);
  }
  const recordId = args.record_id.trim().toUpperCase();
  if (!/^EVR-[A-Z0-9]{8}$/.test(recordId)) {
    return textResult("Get failed: invalid record_id format (expected EVR-XXXXXXXX).", true);
  }

  let result;
  try {
    result = await postJson(GET_RECORD_URL, { record_id: recordId }, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Get failed: ${msg}`, true);
  }

  if (!result.ok) {
    return textResult(
      authedErrorMessage("Get failed", result.status, result.data, result.rawBody),
      true,
    );
  }

  const d = result.data ?? {};
  const payloadStr = d.payload ? JSON.stringify(d.payload, null, 2) : "n/a";
  const text =
    `Record retrieved\n\n` +
    `Record ID:   ${d.record_id ?? recordId}\n` +
    `Action:      ${d.action_type ?? "n/a"}\n` +
    `Agent:       ${d.agent_id ?? "n/a"}\n` +
    `Timestamp:   ${d.timestamp ?? "n/a"}\n` +
    `SHA-256:     ${d.content_hash ?? "n/a"}\n` +
    `Algorithm:   ${d.hash_algorithm ?? "SHA-256"}\n` +
    `Status:      ${d.status ?? "n/a"}\n` +
    `Chain link:  ${d.chain_link ?? "none"}\n\n` +
    `Payload:\n${payloadStr}`;
  return textResult(text);
}

async function handleVerifyChain(args: VerifyChainArgs) {
  const hasIds = Array.isArray(args?.record_ids) && args.record_ids.length > 0;
  const hasStart =
    typeof args?.start_record_id === "string" && args.start_record_id.length > 0;
  if (!hasIds && !hasStart) {
    return textResult(
      "Verification failed: provide either record_ids[] or start_record_id.",
      true,
    );
  }
  if (hasIds && hasStart) {
    return textResult(
      "Verification failed: provide only one of record_ids[] or start_record_id.",
      true,
    );
  }

  const requestBody: Record<string, unknown> = {};
  if (hasIds) {
    requestBody.record_ids = args.record_ids!.map((s) => s.trim().toUpperCase());
  } else {
    requestBody.start_record_id = args.start_record_id!.trim().toUpperCase();
    if (typeof args?.length === "number") requestBody.length = args.length;
  }

  let result;
  try {
    result = await postJson(VERIFY_CHAIN_URL, requestBody, null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Verification failed: ${msg}`, true);
  }

  if (!result.ok) {
    if (result.status === 404) {
      return textResult(
        `Verification failed: ${result.data?.error ?? "record not found"}`,
        true,
      );
    }
    if (result.status === 429) {
      return textResult(
        "Verification failed: rate limit exceeded. Try again shortly.",
        true,
      );
    }
    if (result.status === 400) {
      return textResult(
        `Verification failed: ${result.data?.error ?? "malformed request"}`,
        true,
      );
    }
    return textResult(`Verification failed: HTTP ${result.status}`, true);
  }

  const d = result.data ?? {};
  const results = Array.isArray(d.results) ? d.results : [];
  const triState = (v: unknown) =>
    v === true ? "ok" : v === false ? "FAIL" : "n/a";
  const lines = results.map((r: any, i: number) => {
    const hashMark = triState(r.hash_valid);
    const linkMark = triState(r.chain_link_valid);
    return `${i + 1}. ${r.record_id}  hash=${hashMark}  chain=${linkMark}  prev=${r.actual_prior ?? "none"}`;
  });
  const verdict = d.chain_intact
    ? "Chain intact: all hashes and links verified."
    : "Chain integrity FAILED: one or more records did not verify.";
  const text =
    `${verdict}\n\n` +
    `Length: ${d.length ?? results.length}\n` +
    `chain_intact: ${d.chain_intact === true}\n\n` +
    lines.join("\n");
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
  {
    name: "evermint_list_records",
    description:
      "List EverMint records belonging to the authenticated account. Supports filtering by agent_id, action_type, and date range. Returns record IDs, action types, timestamps, and agent IDs, not full payloads. Use this when an agent needs to audit its own past actions or build context from prior decisions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Filter to records minted by a specific agent" },
        action_type: { type: "string", description: "Filter to a specific action type" },
        since: { type: "string", description: "ISO 8601: only return records on or after this time" },
        until: { type: "string", description: "ISO 8601: only return records on or before this time" },
        limit: {
          type: "number",
          description: "Max records to return (1-200, default 50)",
        },
      },
    },
  },
  {
    name: "evermint_get_record",
    description:
      "Fetch the full contents of a single EverMint record by Record ID, including the original payload that was minted. Requires authentication and the record must belong to the authenticated org. Use this when an agent needs to retrieve the actual content of a prior decision or action it recorded.",
    inputSchema: {
      type: "object" as const,
      properties: {
        record_id: {
          type: "string",
          description: "The EverMint Record ID to fetch (format: EVR-XXXXXXXX)",
        },
      },
      required: ["record_id"],
    },
  },
  {
    name: "evermint_verify_chain",
    description:
      "Verify the integrity of a sequence of hash-chained EverMint records. Confirms each record's hash matches its content, and that each record correctly references the prior record in the chain with no gaps or tampering. Use this to prove an entire sequence of agent decisions is intact, not just a single record. This is public, no API key required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        record_ids: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of Record IDs to verify as a chain, oldest first",
        },
        start_record_id: {
          type: "string",
          description: "Verify the chain starting from this record forward",
        },
        length: {
          type: "number",
          description: "Used with start_record_id. Max records to walk (1-100, default 10)",
        },
      },
    },
  },
];

const server = new Server(
  { name: "evermint", version: "1.1.2" },
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
    case "evermint_list_records":
      return handleListRecords((args ?? {}) as unknown as ListRecordsArgs);
    case "evermint_get_record":
      return handleGetRecord((args ?? {}) as unknown as GetRecordArgs);
    case "evermint_verify_chain":
      return handleVerifyChain((args ?? {}) as unknown as VerifyChainArgs);
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