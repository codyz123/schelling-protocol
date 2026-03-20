import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";

// ─── Constants ────────────────────────────────────────────────────────

const EMBEDDING_DIM = 512;
const EMBEDDING_MIN_NORM = 0.5;
const VALID_TTL_MODES = ["fixed", "until", "recurring", "indefinite"] as const;
const VALID_STATUSES = ["active", "paused", "fulfilled", "expired", "withdrawn"] as const;
const MAX_INTENT_TEXT_BYTES = 10 * 1024;       // 10 KB
const MAX_STRUCTURED_DATA_BYTES = 50 * 1024;  // 50 KB
const MAX_TAGS = 20;
const MAX_SUBMISSIONS_PER_DAY = 10;
const MAX_REQUIRED_TOOLS = 20;
const MAX_PREFERRED_TOOLS = 20;
const MAX_MATCH_CONFIG_BYTES = 10 * 1024;  // 10 KB
const MAX_INTENT_SUMMARY_BYTES = 1024;     // 1 KB
const MAX_AGENT_CREATES_PER_DAY = 100;     // Global daily cap (all agents combined)
const MAX_TOOL_ITEM_LENGTH = 100;          // Max chars per item in required_tools/preferred_tools
const MAX_TAG_LENGTH = 100;                // Max chars per tag

// ─── Embedding Validation ─────────────────────────────────────────────

export function validateEmbedding(emb: unknown, name: string): string | null {
  if (!Array.isArray(emb)) return `${name} must be an array of numbers`;
  if (emb.length !== EMBEDDING_DIM) {
    return `${name} must have exactly ${EMBEDDING_DIM} dimensions, got ${emb.length}`;
  }
  for (let i = 0; i < emb.length; i++) {
    const v = emb[i];
    if (typeof v !== "number" || !isFinite(v)) {
      return `${name}[${i}] must be a finite number`;
    }
    if (v < -1 || v > 1) {
      return `${name}[${i}] = ${v} is out of range [-1, 1]`;
    }
  }
  const norm = Math.sqrt(emb.reduce((s: number, v: number) => s + v * v, 0));
  if (norm < EMBEDDING_MIN_NORM) {
    return `${name} L2 norm ${norm.toFixed(4)} is below minimum ${EMBEDDING_MIN_NORM}`;
  }
  return null;
}

// ─── Auth Helpers ─────────────────────────────────────────────────────

function getKeyPrefix(key: string): string {
  return key.substring(0, 16);
}

function hashApiKey(key: string): string {
  return Bun.password.hashSync(key, { algorithm: "bcrypt", cost: 10 });
}

function verifyApiKey(key: string, hash: string): boolean {
  try {
    return Bun.password.verifySync(key, hash);
  } catch {
    return false;
  }
}

export function authenticateAgent(
  db: HandlerContext["db"],
  apiKey: string | undefined,
): { id: string; reputation_score: number } | null {
  if (!apiKey) return null;
  const prefix = getKeyPrefix(apiKey);
  const agent = db
    .prepare("SELECT id, reputation_score, status, api_key_hash FROM v4_agents WHERE key_prefix = ?")
    .get(prefix) as { id: string; reputation_score: number; status: string; api_key_hash: string } | undefined;
  if (!agent || agent.status !== "active") return null;
  if (!verifyApiKey(apiKey, agent.api_key_hash)) return null;
  return { id: agent.id, reputation_score: agent.reputation_score };
}

export function extractApiKey(params: Record<string, unknown>, authHeader: string | null): { key: string | undefined; fromBody: boolean } {
  if (authHeader?.startsWith("Bearer ")) return { key: authHeader.slice(7), fromBody: false };
  if (typeof params.agent_api_key === "string") return { key: params.agent_api_key, fromBody: true };
  return { key: undefined, fromBody: false };
}

// ─── Array item validation ────────────────────────────────────────────

function validateStringArray(arr: unknown[], name: string, maxItemLen: number): string | null {
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string" || (arr[i] as string).trim().length === 0) {
      return `${name}[${i}] must be a non-empty string.`;
    }
    if ((arr[i] as string).length > maxItemLen) {
      return `${name}[${i}] exceeds maximum length of ${maxItemLen} characters.`;
    }
  }
  return null;
}

// ─── Expiry helpers ───────────────────────────────────────────────────

function computeExpiresAt(
  ttlMode: string,
  ttlHours: number,
  untilDatetime?: string,
): { expiresAt: string; error?: string } {
  if (ttlMode === "indefinite" || ttlMode === "recurring") {
    return { expiresAt: "9999-12-31T23:59:59Z" };
  }
  if (ttlMode === "until") {
    if (!untilDatetime) {
      return { expiresAt: "", error: "until_datetime is required when ttl_mode is 'until'." };
    }
    const parsed = new Date(untilDatetime);
    if (isNaN(parsed.getTime())) {
      return { expiresAt: "", error: "until_datetime must be a valid ISO 8601 datetime string." };
    }
    if (parsed <= new Date()) {
      return { expiresAt: "", error: "until_datetime must be in the future." };
    }
    return { expiresAt: parsed.toISOString() };
  }
  // fixed: now + ttl_hours
  const ms = Date.now() + ttlHours * 60 * 60 * 1000;
  return { expiresAt: new Date(ms).toISOString() };
}

// ─── Agent Create ─────────────────────────────────────────────────────

export interface AgentCreateInput {
  display_name?: string;
  metadata?: unknown;
}

export interface AgentCreateOutput {
  agent_id: string;
  agent_api_key: string;
  protocol_version: "4.0";
  display_name: string | null;
  created_at: string;
}

// NOTE: IP-based rate limiting for agent creation should be handled at the transport/middleware layer.
// The handler has no access to client IP. The global daily cap below is an application-level safeguard.
export async function handleAgentCreate(
  params: AgentCreateInput,
  ctx: HandlerContext,
): Promise<HandlerResult<AgentCreateOutput>> {
  // Global daily cap: max 100 agent creations per day (across all agents)
  const agentsToday = (ctx.db
    .prepare("SELECT COUNT(*) as c FROM v4_agents WHERE created_at >= datetime('now', '-1 day')")
    .get() as { c: number }).c;
  if (agentsToday >= MAX_AGENT_CREATES_PER_DAY) {
    return {
      ok: false,
      error: { code: "RATE_LIMITED", message: `Maximum ${MAX_AGENT_CREATES_PER_DAY} agent registrations per day.` },
    };
  }

  const agentId = randomUUID();
  const rawKey = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const keyPrefix = getKeyPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);
  const now = new Date().toISOString();

  try {
    ctx.db
      .prepare(
        `INSERT INTO v4_agents (id, key_prefix, api_key_hash, protocol_version, display_name, created_at, last_active_at, status, reputation_score, metadata)
         VALUES (?, ?, ?, '4.0', ?, ?, ?, 'active', 0.5, ?)`,
      )
      .run(
        agentId,
        keyPrefix,
        keyHash,
        params.display_name ?? null,
        now,
        now,
        params.metadata ? JSON.stringify(params.metadata) : null,
      );
  } catch (err) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) },
    };
  }

  return {
    ok: true,
    data: {
      agent_id: agentId,
      agent_api_key: rawKey,
      protocol_version: "4.0",
      display_name: params.display_name ?? null,
      created_at: now,
    },
  };
}

// ─── Submit ───────────────────────────────────────────────────────────

const VALID_SEARCH_MODES = ["active", "passive", "hybrid"] as const;
const VALID_SEARCH_SOURCES = ["user_directed", "agent_inferred"] as const;

export interface SubmitInput {
  agent_api_key?: string;
  intent_text: string;
  intent_summary?: string;
  ask_embedding: number[];
  offer_embedding?: number[];
  structured_data?: Record<string, unknown>;
  required_tools?: string[];
  preferred_tools?: string[];
  match_config?: Record<string, unknown>;
  ttl_mode?: string;
  ttl_hours?: number;
  until_datetime?: string;
  tags?: string[];
  // Search behavior
  search_mode?: string;
  search_source?: string;
  hybrid_active_hours?: number;
  alert_webhook?: string;
  alert_threshold?: number;
}

export interface SubmissionOutput {
  submission_id: string;
  agent_id: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export async function handleSubmit(
  params: SubmitInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<SubmissionOutput>> {
  const { key: apiKey, fromBody } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  // Validate intent_text
  if (!params.intent_text || typeof params.intent_text !== "string" || params.intent_text.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "intent_text is required and must be non-empty." } };
  }
  if (Buffer.byteLength(params.intent_text, "utf8") > MAX_INTENT_TEXT_BYTES) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `intent_text must be under ${MAX_INTENT_TEXT_BYTES / 1024}KB.` } };
  }

  // Validate intent_summary size
  if (params.intent_summary !== undefined && typeof params.intent_summary === "string") {
    if (Buffer.byteLength(params.intent_summary, "utf8") > MAX_INTENT_SUMMARY_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `intent_summary must be under ${MAX_INTENT_SUMMARY_BYTES / 1024}KB.` } };
    }
  }

  // Validate ask_embedding
  const askErr = validateEmbedding(params.ask_embedding, "ask_embedding");
  if (askErr) {
    return { ok: false, error: { code: "INVALID_INPUT", message: askErr } };
  }

  // Validate offer_embedding (optional)
  if (params.offer_embedding !== undefined && params.offer_embedding !== null) {
    const offerErr = validateEmbedding(params.offer_embedding, "offer_embedding");
    if (offerErr) {
      return { ok: false, error: { code: "INVALID_INPUT", message: offerErr } };
    }
  }

  // Validate ttl_mode
  const ttlMode = params.ttl_mode ?? "fixed";
  if (!VALID_TTL_MODES.includes(ttlMode as any)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: `ttl_mode must be one of: ${VALID_TTL_MODES.join(", ")}`,
      },
    };
  }

  // Validate ttl_hours
  const ttlHours = params.ttl_hours ?? 720;
  if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > 8760) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "ttl_hours must be an integer between 1 and 8760." },
    };
  }

  // Validate until_datetime for ttl_mode='until'
  const expiryResult = computeExpiresAt(ttlMode, ttlHours, params.until_datetime);
  if (expiryResult.error) {
    return { ok: false, error: { code: "INVALID_INPUT", message: expiryResult.error } };
  }

  // Validate required_tools / preferred_tools
  if (params.required_tools !== undefined) {
    if (!Array.isArray(params.required_tools)) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "required_tools must be an array of strings." } };
    }
    if (params.required_tools.length > MAX_REQUIRED_TOOLS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `required_tools must have at most ${MAX_REQUIRED_TOOLS} items.` } };
    }
    const itemErr = validateStringArray(params.required_tools, "required_tools", MAX_TOOL_ITEM_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }
  if (params.preferred_tools !== undefined) {
    if (!Array.isArray(params.preferred_tools)) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "preferred_tools must be an array of strings." } };
    }
    if (params.preferred_tools.length > MAX_PREFERRED_TOOLS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `preferred_tools must have at most ${MAX_PREFERRED_TOOLS} items.` } };
    }
    const itemErr = validateStringArray(params.preferred_tools, "preferred_tools", MAX_TOOL_ITEM_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }

  // Validate match_config size
  if (params.match_config !== undefined) {
    const mcStr = JSON.stringify(params.match_config);
    if (Buffer.byteLength(mcStr, "utf8") > MAX_MATCH_CONFIG_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `match_config must be under ${MAX_MATCH_CONFIG_BYTES / 1024}KB.` } };
    }
  }

  // Validate tags
  if (params.tags !== undefined) {
    if (!Array.isArray(params.tags)) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "tags must be an array of strings." } };
    }
    if (params.tags.length > MAX_TAGS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `tags must have at most ${MAX_TAGS} items.` } };
    }
    const itemErr = validateStringArray(params.tags, "tags", MAX_TAG_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }

  // Validate structured_data size
  if (params.structured_data !== undefined) {
    const sdStr = JSON.stringify(params.structured_data);
    if (Buffer.byteLength(sdStr, "utf8") > MAX_STRUCTURED_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `structured_data must be under ${MAX_STRUCTURED_DATA_BYTES / 1024}KB.` } };
    }
  }

  // Validate search_mode
  if (params.search_mode !== undefined && !VALID_SEARCH_MODES.includes(params.search_mode as any)) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `search_mode must be one of: ${VALID_SEARCH_MODES.join(", ")}` },
    };
  }

  // Validate search_source
  if (params.search_source !== undefined && !VALID_SEARCH_SOURCES.includes(params.search_source as any)) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `search_source must be one of: ${VALID_SEARCH_SOURCES.join(", ")}` },
    };
  }

  // Validate hybrid_active_hours
  if (params.hybrid_active_hours !== undefined) {
    if (!Number.isInteger(params.hybrid_active_hours) || params.hybrid_active_hours < 1 || params.hybrid_active_hours > 8760) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "hybrid_active_hours must be an integer between 1 and 8760." } };
    }
  }

  // Validate alert_threshold
  if (params.alert_threshold !== undefined) {
    if (typeof params.alert_threshold !== "number" || params.alert_threshold < 0 || params.alert_threshold > 1) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "alert_threshold must be a number between 0 and 1." } };
    }
  }

  // Validate alert_webhook
  if (params.alert_webhook !== undefined && params.alert_webhook !== null) {
    if (typeof params.alert_webhook !== "string" || params.alert_webhook.length > 2048) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "alert_webhook must be a string of 2048 characters or less." } };
    }
  }

  // Rate limit: max 10 submissions per day
  const submissionsToday = (ctx.db
    .prepare("SELECT COUNT(*) as c FROM submissions WHERE agent_id = ? AND created_at >= datetime('now', '-1 day')")
    .get(agent.id) as { c: number }).c;
  if (submissionsToday >= MAX_SUBMISSIONS_PER_DAY) {
    return {
      ok: false,
      error: { code: "RATE_LIMITED", message: `Maximum ${MAX_SUBMISSIONS_PER_DAY} submissions per day per agent.` },
    };
  }

  const submissionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = expiryResult.expiresAt;

  try {
    ctx.db
      .prepare(
        `INSERT INTO submissions (
          id, agent_id, intent_text, intent_summary,
          ask_embedding, offer_embedding,
          structured_data, required_tools, preferred_tools,
          match_config, status, ttl_mode, ttl_hours,
          created_at, updated_at, expires_at, tags,
          search_mode, search_source, hybrid_active_hours, alert_webhook, alert_threshold
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        submissionId,
        agent.id,
        params.intent_text.trim(),
        params.intent_summary ?? null,
        JSON.stringify(params.ask_embedding),
        params.offer_embedding ? JSON.stringify(params.offer_embedding) : null,
        params.structured_data ? JSON.stringify(params.structured_data) : null,
        params.required_tools ? JSON.stringify(params.required_tools) : null,
        params.preferred_tools ? JSON.stringify(params.preferred_tools) : null,
        params.match_config ? JSON.stringify(params.match_config) : null,
        ttlMode,
        ttlHours,
        now,
        now,
        expiresAt,
        params.tags ? JSON.stringify(params.tags) : null,
        params.search_mode ?? "active",
        params.search_source ?? "user_directed",
        params.hybrid_active_hours ?? 168,
        params.alert_webhook ?? null,
        params.alert_threshold ?? 0.5,
      );

    // Update last_active_at
    ctx.db.prepare("UPDATE v4_agents SET last_active_at = ? WHERE id = ?").run(now, agent.id);
  } catch (err) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Trigger passive background matching for any existing active submissions
  const alertThreshold = (params as any).alert_threshold ?? 0.5;
  triggerPassiveAlerts(
    ctx,
    submissionId,
    agent.id,
    params.ask_embedding,
    params.offer_embedding ?? null,
    alertThreshold,
  );

  const result: HandlerResult<SubmissionOutput> = {
    ok: true,
    data: {
      submission_id: submissionId,
      agent_id: agent.id,
      status: "active",
      expires_at: expiresAt,
      created_at: now,
    },
  };
  if (fromBody) {
    (result as any).auth_deprecation_warning = "agent_api_key in request body is deprecated. Use Authorization: Bearer header instead.";
  }
  return result;
}

// ─── Submission Update ────────────────────────────────────────────────

export interface SubmissionUpdateInput {
  agent_api_key?: string;
  submission_id: string;
  intent_text?: string;
  intent_summary?: string;
  ask_embedding?: number[];
  offer_embedding?: number[];
  structured_data?: Record<string, unknown>;
  required_tools?: string[];
  preferred_tools?: string[];
  match_config?: Record<string, unknown>;
  tags?: string[];
  status?: string;
  search_mode?: string;
  search_source?: string;
  hybrid_active_hours?: number;
  alert_webhook?: string;
  alert_threshold?: number;
}

export async function handleSubmissionUpdate(
  params: SubmissionUpdateInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<SubmissionOutput>> {
  const { key: apiKey, fromBody } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.submission_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "submission_id is required." } };
  }

  const existing = ctx.db
    .prepare("SELECT id, status FROM submissions WHERE id = ? AND agent_id = ?")
    .get(params.submission_id, agent.id) as { id: string; status: string } | undefined;

  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: `Submission not found or not owned by this agent.` },
    };
  }

  if (existing.status === "withdrawn") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Cannot update a withdrawn submission." } };
  }

  // Validate intent_text if provided — must be non-empty
  if (params.intent_text !== undefined) {
    if (typeof params.intent_text !== "string" || params.intent_text.trim().length === 0) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "intent_text must be non-empty." } };
    }
    if (Buffer.byteLength(params.intent_text, "utf8") > MAX_INTENT_TEXT_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `intent_text must be under ${MAX_INTENT_TEXT_BYTES / 1024}KB.` } };
    }
  }

  // Validate new embeddings if provided
  if (params.ask_embedding !== undefined) {
    const err = validateEmbedding(params.ask_embedding, "ask_embedding");
    if (err) return { ok: false, error: { code: "INVALID_INPUT", message: err } };
  }
  if (params.offer_embedding !== undefined && params.offer_embedding !== null) {
    const err = validateEmbedding(params.offer_embedding, "offer_embedding");
    if (err) return { ok: false, error: { code: "INVALID_INPUT", message: err } };
  }

  // Validate status if provided
  if (params.status !== undefined && !VALID_STATUSES.includes(params.status as any)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
      },
    };
  }

  // Validate intent_summary size
  if (params.intent_summary !== undefined && typeof params.intent_summary === "string") {
    if (Buffer.byteLength(params.intent_summary, "utf8") > MAX_INTENT_SUMMARY_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `intent_summary must be under ${MAX_INTENT_SUMMARY_BYTES / 1024}KB.` } };
    }
  }

  // Validate structured_data size
  if (params.structured_data !== undefined) {
    const sdStr = JSON.stringify(params.structured_data);
    if (Buffer.byteLength(sdStr, "utf8") > MAX_STRUCTURED_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `structured_data must be under ${MAX_STRUCTURED_DATA_BYTES / 1024}KB.` } };
    }
  }

  // Validate required_tools / preferred_tools size + items
  if (params.required_tools !== undefined) {
    if (!Array.isArray(params.required_tools) || params.required_tools.length > MAX_REQUIRED_TOOLS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `required_tools must be an array with at most ${MAX_REQUIRED_TOOLS} items.` } };
    }
    const itemErr = validateStringArray(params.required_tools, "required_tools", MAX_TOOL_ITEM_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }
  if (params.preferred_tools !== undefined) {
    if (!Array.isArray(params.preferred_tools) || params.preferred_tools.length > MAX_PREFERRED_TOOLS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `preferred_tools must be an array with at most ${MAX_PREFERRED_TOOLS} items.` } };
    }
    const itemErr = validateStringArray(params.preferred_tools, "preferred_tools", MAX_TOOL_ITEM_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }

  // Validate match_config size
  if (params.match_config !== undefined) {
    const mcStr = JSON.stringify(params.match_config);
    if (Buffer.byteLength(mcStr, "utf8") > MAX_MATCH_CONFIG_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `match_config must be under ${MAX_MATCH_CONFIG_BYTES / 1024}KB.` } };
    }
  }

  // Validate tags
  if (params.tags !== undefined) {
    if (!Array.isArray(params.tags) || params.tags.length > MAX_TAGS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `tags must be an array with at most ${MAX_TAGS} items.` } };
    }
    const itemErr = validateStringArray(params.tags, "tags", MAX_TAG_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }

  // Validate new search behavior fields
  if (params.search_mode !== undefined && !VALID_SEARCH_MODES.includes(params.search_mode as any)) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `search_mode must be one of: ${VALID_SEARCH_MODES.join(", ")}` } };
  }
  if (params.search_source !== undefined && !VALID_SEARCH_SOURCES.includes(params.search_source as any)) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `search_source must be one of: ${VALID_SEARCH_SOURCES.join(", ")}` } };
  }
  if (params.hybrid_active_hours !== undefined) {
    if (!Number.isInteger(params.hybrid_active_hours) || params.hybrid_active_hours < 1 || params.hybrid_active_hours > 8760) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "hybrid_active_hours must be an integer between 1 and 8760." } };
    }
  }
  if (params.alert_threshold !== undefined) {
    if (typeof params.alert_threshold !== "number" || params.alert_threshold < 0 || params.alert_threshold > 1) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "alert_threshold must be a number between 0 and 1." } };
    }
  }

  const now = new Date().toISOString();

  // Build update
  const updates: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (params.intent_text !== undefined) { updates.push("intent_text = ?"); values.push(params.intent_text.trim()); }
  if (params.intent_summary !== undefined) { updates.push("intent_summary = ?"); values.push(params.intent_summary); }
  if (params.ask_embedding !== undefined) { updates.push("ask_embedding = ?"); values.push(JSON.stringify(params.ask_embedding)); }
  if (params.offer_embedding !== undefined) { updates.push("offer_embedding = ?"); values.push(params.offer_embedding ? JSON.stringify(params.offer_embedding) : null); }
  if (params.structured_data !== undefined) { updates.push("structured_data = ?"); values.push(JSON.stringify(params.structured_data)); }
  if (params.required_tools !== undefined) { updates.push("required_tools = ?"); values.push(JSON.stringify(params.required_tools)); }
  if (params.preferred_tools !== undefined) { updates.push("preferred_tools = ?"); values.push(JSON.stringify(params.preferred_tools)); }
  if (params.match_config !== undefined) { updates.push("match_config = ?"); values.push(JSON.stringify(params.match_config)); }
  if (params.tags !== undefined) { updates.push("tags = ?"); values.push(JSON.stringify(params.tags)); }
  if (params.status !== undefined) { updates.push("status = ?"); values.push(params.status); }
  if (params.search_mode !== undefined) { updates.push("search_mode = ?"); values.push(params.search_mode); }
  if (params.search_source !== undefined) { updates.push("search_source = ?"); values.push(params.search_source); }
  if (params.hybrid_active_hours !== undefined) { updates.push("hybrid_active_hours = ?"); values.push(params.hybrid_active_hours); }
  if (params.alert_webhook !== undefined) { updates.push("alert_webhook = ?"); values.push(params.alert_webhook ?? null); }
  if (params.alert_threshold !== undefined) { updates.push("alert_threshold = ?"); values.push(params.alert_threshold); }

  values.push(params.submission_id, agent.id);

  ctx.db
    .prepare(`UPDATE submissions SET ${updates.join(", ")} WHERE id = ? AND agent_id = ?`)
    .run(...values);

  const updated = ctx.db
    .prepare("SELECT id, agent_id, status, expires_at, created_at FROM submissions WHERE id = ?")
    .get(params.submission_id) as Record<string, any>;

  const result: HandlerResult<SubmissionOutput> = {
    ok: true,
    data: {
      submission_id: updated.id,
      agent_id: updated.agent_id,
      status: updated.status,
      expires_at: updated.expires_at,
      created_at: updated.created_at,
    },
  };
  if (fromBody) {
    (result as any).auth_deprecation_warning = "agent_api_key in request body is deprecated. Use Authorization: Bearer header instead.";
  }
  return result;
}

// ─── Submission Withdraw ──────────────────────────────────────────────

export interface SubmissionWithdrawInput {
  agent_api_key?: string;
  submission_id: string;
}

export async function handleSubmissionWithdraw(
  params: SubmissionWithdrawInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ submission_id: string; status: "withdrawn" }>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.submission_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "submission_id is required." } };
  }

  const existing = ctx.db
    .prepare("SELECT id, status FROM submissions WHERE id = ? AND agent_id = ?")
    .get(params.submission_id, agent.id) as { id: string; status: string } | undefined;

  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Submission not found or not owned by this agent." },
    };
  }

  if (existing.status === "withdrawn") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Submission is already withdrawn." } };
  }

  ctx.db
    .prepare("UPDATE submissions SET status = 'withdrawn', updated_at = ? WHERE id = ? AND agent_id = ?")
    .run(new Date().toISOString(), params.submission_id, agent.id);

  return { ok: true, data: { submission_id: params.submission_id, status: "withdrawn" } };
}

// ─── List Submissions ─────────────────────────────────────────────────

export interface SubmissionsListInput {
  agent_api_key?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SubmissionRecord {
  submission_id: string;
  agent_id: string;
  intent_text: string;
  intent_summary: string | null;
  status: string;
  ttl_mode: string;
  ttl_hours: number;
  expires_at: string;
  created_at: string;
  updated_at: string | null;
  tags: string[] | null;
  required_tools: string[] | null;
  preferred_tools: string[] | null;
  has_offer_embedding: boolean;
  has_structured_data: boolean;
}

export async function handleSubmissionsList(
  params: SubmissionsListInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ submissions: SubmissionRecord[]; total: number }>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const statusFilter = params.status ?? null;

  let query = `SELECT id, agent_id, intent_text, intent_summary, status, ttl_mode, ttl_hours,
    expires_at, created_at, updated_at, tags, required_tools, preferred_tools,
    (offer_embedding IS NOT NULL) as has_offer, (structured_data IS NOT NULL) as has_sd
    FROM submissions WHERE agent_id = ?`;
  const qParams: unknown[] = [agent.id];

  if (statusFilter) {
    query += " AND status = ?";
    qParams.push(statusFilter);
  }

  const countQuery = `SELECT COUNT(*) as c FROM submissions WHERE agent_id = ?${statusFilter ? " AND status = ?" : ""}`;
  const countParams: unknown[] = statusFilter ? [agent.id, statusFilter] : [agent.id];
  const total = (ctx.db.prepare(countQuery).get(...countParams) as { c: number })?.c ?? 0;

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  qParams.push(limit, offset);

  const rows = ctx.db.prepare(query).all(...qParams) as Record<string, any>[];

  const submissions: SubmissionRecord[] = rows.map((row) => ({
    submission_id: row.id,
    agent_id: row.agent_id,
    intent_text: row.intent_text,
    intent_summary: row.intent_summary,
    status: row.status,
    ttl_mode: row.ttl_mode,
    ttl_hours: row.ttl_hours,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: row.tags ? safeJsonParse(row.tags, null) : null,
    required_tools: row.required_tools ? safeJsonParse(row.required_tools, null) : null,
    preferred_tools: row.preferred_tools ? safeJsonParse(row.preferred_tools, null) : null,
    has_offer_embedding: !!row.has_offer,
    has_structured_data: !!row.has_sd,
  }));

  return { ok: true, data: { submissions, total } };
}

// ─── Safe JSON Parse ──────────────────────────────────────────────────

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ─── Passive Alert Trigger ────────────────────────────────────────────
// Called after a new submission is inserted. Scores all existing active
// submissions from other agents and creates v4_alerts for any matches
// above the threshold. Runs synchronously, best-effort (never throws).

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function triggerPassiveAlerts(
  ctx: HandlerContext,
  submissionId: string,
  agentId: string,
  askEmbedding: number[],
  offerEmbedding: number[] | null,
  threshold: number,
): void {
  try {
    const now = new Date().toISOString();

    const candidates = ctx.db
      .prepare(
        `SELECT s.id, s.agent_id, s.ask_embedding, s.offer_embedding, a.reputation_score
         FROM submissions s
         JOIN v4_agents a ON s.agent_id = a.id
         WHERE s.status = 'active'
           AND s.expires_at > ?
           AND s.agent_id != ?`,
      )
      .all(now, agentId) as Record<string, any>[];

    for (const cand of candidates) {
      const askB: number[] | null = safeJsonParse(cand.ask_embedding, null);
      if (!askB) continue;
      const offerB: number[] | null = cand.offer_embedding
        ? safeJsonParse(cand.offer_embedding, null)
        : null;

      // Cross-match score: directional cosine similarity
      const simAB = offerB ? Math.max(0, cosineSim(askEmbedding, offerB)) : 0;
      const simBA = offerEmbedding ? Math.max(0, cosineSim(askB, offerEmbedding)) : 0;

      let crossScore: number;
      if (offerEmbedding || offerB) {
        crossScore = (simAB + simBA) / 2;
      } else {
        crossScore = Math.max(0, cosineSim(askEmbedding, askB));
      }

      if (crossScore < threshold) continue;

      // Skip if alert already exists for this pair
      const existing = ctx.db
        .prepare("SELECT id FROM v4_alerts WHERE submission_id = ? AND matched_submission_id = ?")
        .get(submissionId, cand.id);
      if (existing) continue;

      const breakdown = JSON.stringify({
        cross_score: Math.round(crossScore * 10000) / 10000,
        ask_offer_sim_ab: Math.round(simAB * 10000) / 10000,
        ask_offer_sim_ba: Math.round(simBA * 10000) / 10000,
      });

      ctx.db
        .prepare(
          `INSERT INTO v4_alerts (id, submission_id, matched_submission_id, score, score_breakdown, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .run(randomUUID(), submissionId, cand.id, crossScore, breakdown, now);
    }
  } catch {
    // Best-effort: never block the submit response
  }
}
