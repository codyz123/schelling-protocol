import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { authenticateAgent, extractApiKey, safeJsonParse } from "./submit.js";

// ─── Constants ────────────────────────────────────────────────────────

const MAX_TOOL_PUBLISHES_PER_AGENT = 100;
const MAX_SCHEMA_BYTES = 50 * 1024; // 50 KB
const MAX_TOOL_READS_PER_HOUR = 120;
const MAX_TOOL_LIST_PER_HOUR = 120;
const MAX_TOOL_DEPRECATE_PER_HOUR = 30;

// ─── Types ────────────────────────────────────────────────────────────

export interface ToolRecord {
  id: string;
  publisher_id: string | null;
  display_name: string;
  description: string | null;
  schema_json: Record<string, any>;
  schema_version: string;
  category: string | null;
  usage_count: number;
  adoption_score: number;
  status: string;
  created_at: string;
  updated_at: string | null;
  extends: string[] | null;
}

// ─── Tool Publish ─────────────────────────────────────────────────────

export interface ToolPublishInput {
  agent_api_key?: string;
  id: string;
  display_name: string;
  description?: string;
  schema: Record<string, any>;
  schema_version: string;
  category?: string;
  extends?: string[];
}

export async function handleToolPublish(
  params: ToolPublishInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<ToolRecord>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);

  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  // Validate required fields
  if (!params.id || typeof params.id !== "string" || params.id.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Tool id is required." } };
  }

  if (!/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(params.id)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: `Tool id must be lowercase alphanumeric with hyphens and slashes (e.g., "hiring/software-engineer-v3"). Got: "${params.id}"`,
      },
    };
  }

  if (!params.display_name || typeof params.display_name !== "string") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "display_name is required." } };
  }

  if (!params.schema || typeof params.schema !== "object" || Array.isArray(params.schema)) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "schema must be a JSON Schema object." } };
  }

  // Validate schema size
  const schemaStr = JSON.stringify(params.schema);
  if (Buffer.byteLength(schemaStr, "utf8") > MAX_SCHEMA_BYTES) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `schema must be under ${MAX_SCHEMA_BYTES / 1024}KB.` } };
  }

  if (!params.schema_version || typeof params.schema_version !== "string") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "schema_version is required (semver, e.g., '1.0.0')." } };
  }

  if (params.extends !== undefined && !Array.isArray(params.extends)) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "extends must be an array of tool IDs." } };
  }

  // Check if tool already exists
  const existing = ctx.db
    .prepare("SELECT id, publisher_id FROM coordination_tools WHERE id = ?")
    .get(params.id) as { id: string; publisher_id: string | null } | undefined;

  if (existing && existing.publisher_id && existing.publisher_id !== agent.id) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: `Tool "${params.id}" is already published by a different agent.`,
      },
    };
  }

  // Rate limit: max 100 tool publishes total per agent (only on new publishes, not updates)
  if (!existing) {
    const toolCount = (ctx.db
      .prepare("SELECT COUNT(*) as c FROM coordination_tools WHERE publisher_id = ?")
      .get(agent.id) as { c: number }).c;
    if (toolCount >= MAX_TOOL_PUBLISHES_PER_AGENT) {
      return {
        ok: false,
        error: { code: "RATE_LIMITED", message: `Maximum ${MAX_TOOL_PUBLISHES_PER_AGENT} tool publishes per agent.` },
      };
    }
  }

  const now = new Date().toISOString();

  try {
    if (existing) {
      ctx.db
        .prepare(
          `UPDATE coordination_tools SET
            display_name = ?, description = ?, schema_json = ?, schema_version = ?,
            category = ?, updated_at = ?,
            extends = ?, publisher_id = ?
           WHERE id = ?`,
        )
        .run(
          params.display_name,
          params.description ?? null,
          schemaStr,
          params.schema_version,
          params.category ?? null,
          now,
          params.extends ? JSON.stringify(params.extends) : null,
          agent.id,
          params.id,
        );
    } else {
      ctx.db
        .prepare(
          `INSERT INTO coordination_tools (
            id, publisher_id, display_name, description,
            schema_json, schema_version, category,
            usage_count, adoption_score, status,
            created_at, updated_at, extends
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, ?, ?)`,
        )
        .run(
          params.id,
          agent.id,
          params.display_name,
          params.description ?? null,
          schemaStr,
          params.schema_version,
          params.category ?? null,
          now,
          now,
          params.extends ? JSON.stringify(params.extends) : null,
        );
    }
  } catch (err) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) },
    };
  }

  const tool = ctx.db
    .prepare("SELECT * FROM coordination_tools WHERE id = ?")
    .get(params.id) as Record<string, any>;

  return { ok: true, data: toolRowToRecord(tool) };
}

// ─── Tool List ────────────────────────────────────────────────────────

export interface ToolListInput {
  category?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sort?: "usage" | "created" | "name";
}

export async function handleToolList(
  params: ToolListInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ tools: ToolRecord[]; total: number }>> {
  // Tool list is publicly browsable (no auth required), but rate-limited if authenticated
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  if (apiKey) {
    const agent = authenticateAgent(ctx.db, apiKey);
    if (agent) {
      const listsThisHour = (ctx.db
        .prepare("SELECT COUNT(*) as c FROM v4_rate_events WHERE agent_id = ? AND action = 'tool_list' AND created_at >= datetime('now', '-1 hour')")
        .get(agent.id) as { c: number }).c;
      if (listsThisHour >= MAX_TOOL_LIST_PER_HOUR) {
        return { ok: false, error: { code: "RATE_LIMITED", message: `Maximum ${MAX_TOOL_LIST_PER_HOUR} tool list calls per hour per agent.` } };
      }
      try {
        ctx.db.prepare("INSERT INTO v4_rate_events (agent_id, action, created_at) VALUES (?, 'tool_list', ?)").run(agent.id, new Date().toISOString());
      } catch { /* best-effort */ }
    }
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const status = params.status ?? "active";

  let query = `SELECT id, publisher_id, display_name, description, schema_json, schema_version,
    category, usage_count, adoption_score, status, created_at, updated_at, extends
    FROM coordination_tools WHERE status = ?`;
  const qParams: unknown[] = [status];

  if (params.category) {
    query += " AND category = ?";
    qParams.push(params.category);
  }

  const countQuery = `SELECT COUNT(*) as c FROM coordination_tools WHERE status = ?${params.category ? " AND category = ?" : ""}`;
  const countParams: unknown[] = params.category ? [status, params.category] : [status];
  const total = (ctx.db.prepare(countQuery).get(...countParams) as { c: number })?.c ?? 0;

  const sortCol =
    params.sort === "usage" ? "usage_count DESC" :
    params.sort === "name" ? "display_name ASC" :
    "created_at DESC";

  query += ` ORDER BY ${sortCol} LIMIT ? OFFSET ?`;
  qParams.push(limit, offset);

  const rows = ctx.db.prepare(query).all(...qParams) as Record<string, any>[];

  return {
    ok: true,
    data: {
      tools: rows.map(toolRowToRecord),
      total,
    },
  };
}

// ─── Tool Get ─────────────────────────────────────────────────────────
// NOTE: Unauthenticated tool/get requests should be rate-limited at the transport/middleware layer
// (e.g., by IP address) to prevent scraping. Handler-level rate limiting only applies to authenticated requests.

export interface ToolGetInput {
  tool_id: string;
}

export async function handleToolGet(
  params: ToolGetInput & { agent_api_key?: string },
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<ToolRecord>> {
  if (!params.tool_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "tool_id is required." } };
  }

  // Rate limit if authenticated
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  if (apiKey) {
    const agent = authenticateAgent(ctx.db, apiKey);
    if (agent) {
      const readsThisHour = (ctx.db
        .prepare("SELECT COUNT(*) as c FROM v4_rate_events WHERE agent_id = ? AND action = 'tool_read' AND created_at >= datetime('now', '-1 hour')")
        .get(agent.id) as { c: number }).c;
      if (readsThisHour >= MAX_TOOL_READS_PER_HOUR) {
        return { ok: false, error: { code: "RATE_LIMITED", message: `Maximum ${MAX_TOOL_READS_PER_HOUR} tool read calls per hour per agent.` } };
      }
      try {
        ctx.db.prepare("INSERT INTO v4_rate_events (agent_id, action, created_at) VALUES (?, 'tool_read', ?)").run(agent.id, new Date().toISOString());
      } catch { /* best-effort */ }
    }
  }

  const row = ctx.db
    .prepare("SELECT * FROM coordination_tools WHERE id = ?")
    .get(params.tool_id) as Record<string, any> | undefined;

  if (!row) {
    return { ok: false, error: { code: "NOT_FOUND", message: `Tool "${params.tool_id}" not found.` } };
  }

  return { ok: true, data: toolRowToRecord(row) };
}

// ─── Tool Recommend ───────────────────────────────────────────────────
// NOTE: Unauthenticated tool/recommend requests should be rate-limited at the transport/middleware layer
// (e.g., by IP address) to prevent abuse. Handler-level rate limiting only applies to authenticated requests.

export interface ToolRecommendInput {
  agent_api_key?: string;
  submission_id?: string;
  tags?: string[];
  intent_hint?: string;
  limit?: number;
}

export interface ToolRecommendation {
  tool: ToolRecord;
  reason: string;
  adoption_rate_in_pool: number;
}

export async function handleToolRecommend(
  params: ToolRecommendInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ recommendations: ToolRecommendation[] }>> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

  // Rate limit if authenticated
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  if (apiKey) {
    const authAgent = authenticateAgent(ctx.db, apiKey);
    if (authAgent) {
      const readsThisHour = (ctx.db
        .prepare("SELECT COUNT(*) as c FROM v4_rate_events WHERE agent_id = ? AND action = 'tool_recommend' AND created_at >= datetime('now', '-1 hour')")
        .get(authAgent.id) as { c: number }).c;
      if (readsThisHour >= MAX_TOOL_READS_PER_HOUR) {
        return { ok: false, error: { code: "RATE_LIMITED", message: `Maximum ${MAX_TOOL_READS_PER_HOUR} tool recommend calls per hour per agent.` } };
      }
      try {
        ctx.db.prepare("INSERT INTO v4_rate_events (agent_id, action, created_at) VALUES (?, 'tool_recommend', ?)").run(authAgent.id, new Date().toISOString());
      } catch { /* best-effort */ }
    }
  }

  let submissionTags: string[] = params.tags ?? [];
  let submissionStructuredToolIds: string[] = [];

  if (params.submission_id) {
    const agent = authenticateAgent(ctx.db, apiKey);

    if (agent) {
      const sub = ctx.db
        .prepare("SELECT tags, structured_data FROM submissions WHERE id = ? AND agent_id = ?")
        .get(params.submission_id, agent.id) as Record<string, any> | undefined;

      if (sub) {
        const subTags: string[] = sub.tags ? safeJsonParse(sub.tags, []) : [];
        submissionTags = [...new Set([...submissionTags, ...subTags])];
        if (sub.structured_data) {
          const sd = safeJsonParse<Record<string, any>>(sub.structured_data, {});
          submissionStructuredToolIds = Object.keys(sd);
        }
      }
    }
  }

  const popularTools = ctx.db
    .prepare(
      `SELECT id, publisher_id, display_name, description, schema_json, schema_version,
              category, usage_count, adoption_score, status, created_at, updated_at, extends
       FROM coordination_tools
       WHERE status = 'active'
       ORDER BY usage_count DESC, adoption_score DESC
       LIMIT 100`,
    )
    .all() as Record<string, any>[];

  if (popularTools.length === 0) {
    return { ok: true, data: { recommendations: [] } };
  }

  const tagSet = new Set(submissionTags.map((t) => t.toLowerCase()));
  const alreadyUsed = new Set(submissionStructuredToolIds);

  const totalSubmissions = (ctx.db
    .prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'active'")
    .get() as { c: number })?.c || 1;

  interface ScoredTool {
    tool: Record<string, any>;
    relevanceScore: number;
    reason: string;
    adoptionRate: number;
  }

  const scoredTools: ScoredTool[] = [];

  for (const t of popularTools) {
    if (alreadyUsed.has(t.id)) continue;

    const adoptionRate = totalSubmissions > 0 ? Math.min(t.usage_count / totalSubmissions, 1) : 0;

    let relevanceScore = adoptionRate;
    let reason = `Used by ${t.usage_count} active submissions`;

    if (tagSet.size > 0) {
      const toolCategory = (t.category || "").toLowerCase();
      const toolIdParts = t.id.toLowerCase().split(/[/-]/);
      let tagMatch = false;
      for (const tag of tagSet) {
        if (toolCategory.includes(tag) || toolIdParts.some((part: string) => part.includes(tag))) {
          tagMatch = true;
          break;
        }
      }
      if (tagMatch) {
        relevanceScore += 0.3;
        reason = `Popular in your tag space (${t.usage_count} uses)`;
      }
    }

    scoredTools.push({ tool: t, relevanceScore, reason, adoptionRate });
  }

  scoredTools.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topTools = scoredTools.slice(0, limit);

  return {
    ok: true,
    data: {
      recommendations: topTools.map((st) => ({
        tool: toolRowToRecord(st.tool),
        reason: st.reason,
        adoption_rate_in_pool: Math.round(st.adoptionRate * 1000) / 1000,
      })),
    },
  };
}

// ─── Tool Deprecate ───────────────────────────────────────────────────

export interface ToolDeprecateInput {
  agent_api_key?: string;
  tool_id: string;
}

export async function handleToolDeprecate(
  params: ToolDeprecateInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ tool_id: string; status: string }>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);

  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  // Rate limit: max 30 deprecations per hour per agent
  const deprecatesThisHour = (ctx.db
    .prepare("SELECT COUNT(*) as c FROM v4_rate_events WHERE agent_id = ? AND action = 'tool_deprecate' AND created_at >= datetime('now', '-1 hour')")
    .get(agent.id) as { c: number }).c;
  if (deprecatesThisHour >= MAX_TOOL_DEPRECATE_PER_HOUR) {
    return { ok: false, error: { code: "RATE_LIMITED", message: `Maximum ${MAX_TOOL_DEPRECATE_PER_HOUR} tool deprecations per hour per agent.` } };
  }

  if (!params.tool_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "tool_id is required." } };
  }

  const tool = ctx.db
    .prepare("SELECT id, publisher_id FROM coordination_tools WHERE id = ?")
    .get(params.tool_id) as { id: string; publisher_id: string | null } | undefined;

  if (!tool) {
    return { ok: false, error: { code: "NOT_FOUND", message: `Tool "${params.tool_id}" not found.` } };
  }

  if (tool.publisher_id && tool.publisher_id !== agent.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only the publisher can deprecate this tool." } };
  }

  const now = new Date().toISOString();
  ctx.db
    .prepare("UPDATE coordination_tools SET status = 'deprecated', updated_at = ? WHERE id = ?")
    .run(now, params.tool_id);

  // Record rate event
  try {
    ctx.db.prepare("INSERT INTO v4_rate_events (agent_id, action, created_at) VALUES (?, 'tool_deprecate', ?)").run(agent.id, now);
  } catch { /* best-effort */ }

  return { ok: true, data: { tool_id: params.tool_id, status: "deprecated" } };
}

// ─── Row → Record helper ──────────────────────────────────────────────

function toolRowToRecord(row: Record<string, any>): ToolRecord {
  return {
    id: row.id,
    publisher_id: row.publisher_id,
    display_name: row.display_name,
    description: row.description,
    schema_json:
      typeof row.schema_json === "string" ? safeJsonParse(row.schema_json, {}) : row.schema_json,
    schema_version: row.schema_version,
    category: row.category,
    usage_count: row.usage_count ?? 0,
    adoption_score: row.adoption_score ?? 0,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    extends: row.extends ? safeJsonParse(row.extends, null) : null,
  };
}
