import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  ToolRecord,
} from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── handleRegisterTool ────────────────────────────────────────────

export interface RegisterToolInput {
  user_token: string;
  tool_id: string;
  display_name: string;
  description: string;
  one_line_description: string;
  endpoint: string;
  input_schema: unknown;
  output_schema: unknown;
  cluster_scope?: string[];
  pricing?: Record<string, unknown>;
  version: string;
  health_check_endpoint?: string;
  idempotency_key?: string;
}

export interface RegisterToolOutput {
  tool_id: string;
  registered_at: string;
  status: string;
}

export async function handleRegisterTool(
  input: RegisterToolInput,
  ctx: HandlerContext,
): Promise<HandlerResult<RegisterToolOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<RegisterToolOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Validate tool_id ───────────────────────────────────────────
  if (
    !input.tool_id ||
    typeof input.tool_id !== "string" ||
    input.tool_id.length < 1 ||
    input.tool_id.length > 100
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "tool_id must be a string between 1 and 100 characters (format: {developer}.{tool_name})",
      },
    };
  }

  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(input.tool_id)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "tool_id must be namespaced as {developer}.{tool_name}",
      },
    };
  }

  // ── Validate display_name ──────────────────────────────────────
  if (!input.display_name || input.display_name.length > 200) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "display_name is required and must be 200 characters or less",
      },
    };
  }

  // ── Validate description ───────────────────────────────────────
  if (!input.description || input.description.length > 5000) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "description is required and must be 5000 characters or less",
      },
    };
  }

  // ── Validate one_line_description ──────────────────────────────
  if (!input.one_line_description || input.one_line_description.length > 200) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "one_line_description is required and must be 200 characters or less",
      },
    };
  }

  // ── Validate endpoint ──────────────────────────────────────────
  if (!input.endpoint || !input.endpoint.startsWith("https://")) {
    return {
      ok: false,
      error: {
        code: "INVALID_ENDPOINT",
        message: "endpoint must start with 'https://'",
      },
    };
  }

  // ── Validate schemas ───────────────────────────────────────────
  let inputSchemaStr: string;
  let outputSchemaStr: string;

  try {
    inputSchemaStr = typeof input.input_schema === "string"
      ? input.input_schema
      : JSON.stringify(input.input_schema);
    if (inputSchemaStr.length > 50 * 1024) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "input_schema must be 50KB or less",
        },
      };
    }
    // Verify it's valid JSON
    JSON.parse(inputSchemaStr);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "input_schema must be valid JSON",
      },
    };
  }

  try {
    outputSchemaStr = typeof input.output_schema === "string"
      ? input.output_schema
      : JSON.stringify(input.output_schema);
    if (outputSchemaStr.length > 50 * 1024) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "output_schema must be 50KB or less",
        },
      };
    }
    JSON.parse(outputSchemaStr);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "output_schema must be valid JSON",
      },
    };
  }

  // ── Validate version ───────────────────────────────────────────
  if (!input.version || typeof input.version !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "version is required",
      },
    };
  }

  // ── Check tool_id uniqueness ───────────────────────────────────
  const existingTool = ctx.db
    .prepare("SELECT tool_id FROM tools WHERE tool_id = ?")
    .get(input.tool_id) as { tool_id: string } | undefined;

  if (existingTool) {
    return {
      ok: false,
      error: {
        code: "TOOL_ID_TAKEN",
        message: `Tool with id "${input.tool_id}" already exists`,
      },
    };
  }

  // ── Validate health_check_endpoint ─────────────────────────────
  if (input.health_check_endpoint && !input.health_check_endpoint.startsWith("https://")) {
    return {
      ok: false,
      error: {
        code: "INVALID_ENDPOINT",
        message: "health_check_endpoint must start with 'https://'",
      },
    };
  }

  // ── Insert tool ────────────────────────────────────────────────
  ctx.db
    .prepare(
      `INSERT INTO tools (
        tool_id, display_name, description, one_line_description,
        type, endpoint, input_schema, output_schema,
        owner_token, version, cluster_scope, pricing,
        health_check_endpoint, reputation, usage_count, status,
        registered_at
      ) VALUES (?, ?, ?, ?, 'third_party', ?, ?, ?, ?, ?, ?, ?, ?, 0.5, 0, 'active', datetime('now'))`,
    )
    .run(
      input.tool_id,
      input.display_name,
      input.description,
      input.one_line_description,
      input.endpoint,
      inputSchemaStr,
      outputSchemaStr,
      input.user_token,
      input.version,
      input.cluster_scope ? JSON.stringify(input.cluster_scope) : null,
      input.pricing ? JSON.stringify(input.pricing) : null,
      input.health_check_endpoint ?? null,
    );

  // ── Build result ───────────────────────────────────────────────
  const registeredTool = ctx.db
    .prepare("SELECT registered_at FROM tools WHERE tool_id = ?")
    .get(input.tool_id) as { registered_at: string };

  const result: RegisterToolOutput = {
    tool_id: input.tool_id,
    registered_at: registeredTool.registered_at,
    status: "active",
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "register_tool", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── handleListTools ───────────────────────────────────────────────

export interface ListToolsInput {
  cluster_id?: string;
  query?: string;
  type?: "default" | "third_party" | "all";
  min_reputation?: number;
  limit?: number;
  cursor?: string;
}

export interface ToolDetail {
  tool_id: string;
  display_name: string;
  description: string;
  one_line_description: string;
  type: string;
  endpoint: string | null;
  input_schema: unknown;
  output_schema: unknown;
  version: string;
  cluster_scope: string[] | null;
  pricing: unknown | null;
  reputation: number;
  usage_count: number;
  status: string;
  registered_at: string;
}

export interface ListToolsOutput {
  tools: ToolDetail[];
  total: number;
  next_cursor: string | null;
}

export async function handleListTools(
  input: ListToolsInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ListToolsOutput>> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const minReputation = input.min_reputation ?? 0.0;
  const toolType = input.type ?? "all";

  // ── Build query ────────────────────────────────────────────────
  let sql = "SELECT * FROM tools WHERE status = 'active' AND reputation >= ?";
  const params: unknown[] = [minReputation];

  if (toolType !== "all") {
    sql += " AND type = ?";
    params.push(toolType);
  }

  if (input.cluster_id) {
    // Filter tools whose cluster_scope includes this cluster or is null (global)
    sql += " AND (cluster_scope IS NULL OR cluster_scope LIKE ?)";
    params.push(`%${input.cluster_id}%`);
  }

  if (input.query) {
    sql += " AND (display_name LIKE ? OR description LIKE ? OR one_line_description LIKE ?)";
    const queryPattern = `%${input.query}%`;
    params.push(queryPattern, queryPattern, queryPattern);
  }

  // Cursor pagination (keyset on registered_at)
  if (input.cursor) {
    try {
      const cursorValue = Buffer.from(input.cursor, "base64").toString("utf8");
      sql += " AND registered_at < ?";
      params.push(cursorValue);
    } catch {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Invalid cursor" },
      };
    }
  }

  // Count total (without cursor/limit)
  let countSql = "SELECT COUNT(*) as count FROM tools WHERE status = 'active' AND reputation >= ?";
  const countParams: unknown[] = [minReputation];

  if (toolType !== "all") {
    countSql += " AND type = ?";
    countParams.push(toolType);
  }

  if (input.cluster_id) {
    countSql += " AND (cluster_scope IS NULL OR cluster_scope LIKE ?)";
    countParams.push(`%${input.cluster_id}%`);
  }

  if (input.query) {
    countSql += " AND (display_name LIKE ? OR description LIKE ? OR one_line_description LIKE ?)";
    const queryPattern = `%${input.query}%`;
    countParams.push(queryPattern, queryPattern, queryPattern);
  }

  sql += " ORDER BY reputation DESC, usage_count DESC LIMIT ?";
  params.push(limit + 1);

  const rows = ctx.db.prepare(sql).all(...params) as ToolRecord[];
  const total = (ctx.db.prepare(countSql).get(...countParams) as { count: number }).count;

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const tools: ToolDetail[] = pageRows.map((row) => ({
    tool_id: row.tool_id,
    display_name: row.display_name,
    description: row.description,
    one_line_description: row.one_line_description,
    type: row.type,
    endpoint: row.endpoint,
    input_schema: JSON.parse(row.input_schema),
    output_schema: JSON.parse(row.output_schema),
    version: row.version,
    cluster_scope: row.cluster_scope ? JSON.parse(row.cluster_scope) : null,
    pricing: row.pricing ? JSON.parse(row.pricing) : null,
    reputation: row.reputation,
    usage_count: row.usage_count,
    status: row.status,
    registered_at: row.registered_at,
  }));

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(lastRow.registered_at, "utf8").toString("base64");
  }

  return {
    ok: true,
    data: {
      tools,
      total,
      next_cursor: nextCursor,
    },
  };
}

// ─── handleToolInvoke ──────────────────────────────────────────────

export interface ToolInvokeInput {
  user_token: string;
  tool_id: string;
  input: Record<string, unknown>;
}

export interface ToolInvokeOutput {
  tool_id: string;
  output: Record<string, unknown>;
  execution_ms: number;
  billing: null;
}

export async function handleToolInvoke(
  input: ToolInvokeInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ToolInvokeOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Verify tool exists ─────────────────────────────────────────
  const tool = ctx.db
    .prepare("SELECT * FROM tools WHERE tool_id = ?")
    .get(input.tool_id) as ToolRecord | undefined;

  if (!tool) {
    return {
      ok: false,
      error: { code: "TOOL_NOT_FOUND", message: "Tool not found" },
    };
  }

  if (tool.status !== "active") {
    return {
      ok: false,
      error: {
        code: "TOOL_NOT_FOUND",
        message: `Tool "${input.tool_id}" is not active (status: ${tool.status})`,
      },
    };
  }

  // ── Validate input ─────────────────────────────────────────────
  if (!input.input || typeof input.input !== "object") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "input must be an object" },
    };
  }

  // ── Execute tool ───────────────────────────────────────────────
  const startTime = Date.now();

  let output: Record<string, unknown>;

  if (tool.type === "default") {
    // Stub response for default (built-in) tools
    output = {
      status: "ok",
      message: `Default tool "${input.tool_id}" executed successfully`,
      tool_input: input.input,
    };
  } else {
    // Third-party tool: would proxy to endpoint in production
    // For now, return a stub response
    output = {
      status: "ok",
      message: `Third-party tool "${input.tool_id}" invocation stubbed`,
      endpoint: tool.endpoint,
      note: "Actual HTTP proxy not implemented in reference server",
    };
  }

  const executionMs = Date.now() - startTime;

  // ── Update usage count ─────────────────────────────────────────
  ctx.db
    .prepare("UPDATE tools SET usage_count = usage_count + 1 WHERE tool_id = ?")
    .run(input.tool_id);

  return {
    ok: true,
    data: {
      tool_id: input.tool_id,
      output,
      execution_ms: executionMs,
      billing: null,
    },
  };
}

// ─── handleToolFeedback ────────────────────────────────────────────

export interface ToolFeedbackInput {
  user_token: string;
  tool_id: string;
  rating: "positive" | "negative";
  comment?: string;
  invocation_id?: string;
}

export interface ToolFeedbackOutput {
  submitted: true;
  tool_reputation: number;
}

export async function handleToolFeedback(
  input: ToolFeedbackInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ToolFeedbackOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Verify tool exists ─────────────────────────────────────────
  const tool = ctx.db
    .prepare("SELECT * FROM tools WHERE tool_id = ?")
    .get(input.tool_id) as ToolRecord | undefined;

  if (!tool) {
    return {
      ok: false,
      error: { code: "TOOL_NOT_FOUND", message: "Tool not found" },
    };
  }

  // ── Validate rating ────────────────────────────────────────────
  if (input.rating !== "positive" && input.rating !== "negative") {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "rating must be 'positive' or 'negative'",
      },
    };
  }

  // ── Validate comment ───────────────────────────────────────────
  if (input.comment !== undefined && input.comment.length > 500) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "comment must be 500 characters or less",
      },
    };
  }

  // ── Insert feedback ────────────────────────────────────────────
  ctx.db
    .prepare(
      `INSERT INTO tool_feedback (
        id, tool_id, user_token, rating, comment, invocation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      randomUUID(),
      input.tool_id,
      input.user_token,
      input.rating,
      input.comment ?? null,
      input.invocation_id ?? null,
    );

  // ── Update tool reputation ─────────────────────────────────────
  const delta = input.rating === "positive" ? 0.03 : -0.05;
  const newReputation = Math.max(0, Math.min(1, tool.reputation + delta));

  ctx.db
    .prepare("UPDATE tools SET reputation = ? WHERE tool_id = ?")
    .run(newReputation, input.tool_id);

  return {
    ok: true,
    data: {
      submitted: true,
      tool_reputation: Math.round(newReputation * 10000) / 10000,
    },
  };
}
