import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";

// ─── Constants ────────────────────────────────────────────────────────

const EMBEDDING_DIM = 512;
const EMBEDDING_MIN_NORM = 0.5;
const VALID_STATUSES = ["active", "paused", "fulfilled", "expired", "withdrawn"] as const;
const MAX_INTENT_TEXT_CHARS = 1000;          // chars (keep short for indexing)
const MAX_CRITERIA_TEXT_BYTES = 10 * 1024;  // 10 KB
const MAX_IDENTITY_TEXT_BYTES = 10 * 1024;  // 10 KB
const MAX_STRUCTURED_DATA_BYTES = 50 * 1024; // 50 KB
const MAX_PUBLIC_DATA_BYTES = 50 * 1024;    // 50 KB
const MAX_PRIVATE_DATA_BYTES = 50 * 1024;   // 50 KB
const MAX_METADATA_BYTES = 10 * 1024;       // 10 KB
const MAX_TAGS = 20;
const MAX_SUBMISSIONS_PER_DAY = 100; // temp for seeding
const MAX_REQUIRED_TOOLS = 20;
const MAX_PREFERRED_TOOLS = 20;
const MAX_AGENT_CREATES_PER_DAY = 100;
const MAX_TOOL_ITEM_LENGTH = 100;
const MAX_TAG_LENGTH = 100;

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

export interface SubmitInput {
  agent_api_key?: string;
  intent_text: string;
  // Agents SHOULD provide a real embedding for quality matching.
  // If omitted, the submission is created and browseable but won't participate in embedding-based matching.
  intent_embedding?: number[] | null;
  identity_embedding?: number[];
  criteria_text?: string;
  criteria_data?: Record<string, unknown>;
  identity_text?: string;
  identity_data?: Record<string, unknown>;
  public_data?: Record<string, unknown>;
  private_data?: Record<string, unknown>;
  structured_data?: Record<string, unknown>;
  required_tools?: string[];
  preferred_tools?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  expires_at: string;
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
  if (params.intent_text.length > MAX_INTENT_TEXT_CHARS) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `intent_text must be ${MAX_INTENT_TEXT_CHARS} characters or fewer.` } };
  }

  // Validate intent_embedding (optional — if provided must be valid; if omitted, submission won't match via embeddings)
  if (params.intent_embedding !== undefined && params.intent_embedding !== null) {
    const intentErr = validateEmbedding(params.intent_embedding, "intent_embedding");
    if (intentErr) {
      return { ok: false, error: { code: "INVALID_INPUT", message: intentErr } };
    }
  }

  // Validate identity_embedding (optional)
  if (params.identity_embedding !== undefined && params.identity_embedding !== null) {
    const identityErr = validateEmbedding(params.identity_embedding, "identity_embedding");
    if (identityErr) {
      return { ok: false, error: { code: "INVALID_INPUT", message: identityErr } };
    }
  }

  // Validate expires_at (required, must be future ISO datetime)
  if (!params.expires_at || typeof params.expires_at !== "string") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "expires_at is required and must be a valid ISO 8601 datetime string." } };
  }
  const expiresAtDate = new Date(params.expires_at);
  if (isNaN(expiresAtDate.getTime())) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "expires_at must be a valid ISO 8601 datetime string." } };
  }
  if (expiresAtDate <= new Date()) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "expires_at must be in the future." } };
  }
  const expiresAt = expiresAtDate.toISOString();

  // Validate criteria_text
  if (params.criteria_text !== undefined && params.criteria_text !== null) {
    if (typeof params.criteria_text !== "string") {
      return { ok: false, error: { code: "INVALID_INPUT", message: "criteria_text must be a string." } };
    }
    if (Buffer.byteLength(params.criteria_text, "utf8") > MAX_CRITERIA_TEXT_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `criteria_text must be under ${MAX_CRITERIA_TEXT_BYTES / 1024}KB.` } };
    }
  }

  // Validate identity_text
  if (params.identity_text !== undefined && params.identity_text !== null) {
    if (typeof params.identity_text !== "string") {
      return { ok: false, error: { code: "INVALID_INPUT", message: "identity_text must be a string." } };
    }
    if (Buffer.byteLength(params.identity_text, "utf8") > MAX_IDENTITY_TEXT_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `identity_text must be under ${MAX_IDENTITY_TEXT_BYTES / 1024}KB.` } };
    }
  }

  // Validate public_data size
  if (params.public_data !== undefined) {
    const pdStr = JSON.stringify(params.public_data);
    if (Buffer.byteLength(pdStr, "utf8") > MAX_PUBLIC_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `public_data must be under ${MAX_PUBLIC_DATA_BYTES / 1024}KB.` } };
    }
  }

  // Validate private_data size
  if (params.private_data !== undefined) {
    const pdStr = JSON.stringify(params.private_data);
    if (Buffer.byteLength(pdStr, "utf8") > MAX_PRIVATE_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `private_data must be under ${MAX_PRIVATE_DATA_BYTES / 1024}KB.` } };
    }
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

  // Validate metadata size
  if (params.metadata !== undefined) {
    const mStr = JSON.stringify(params.metadata);
    if (Buffer.byteLength(mStr, "utf8") > MAX_METADATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `metadata must be under ${MAX_METADATA_BYTES / 1024}KB.` } };
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

  try {
    ctx.db
      .prepare(
        `INSERT INTO submissions (
          id, agent_id, intent_text, intent_embedding,
          identity_embedding, criteria_text, criteria_data,
          identity_text, identity_data, public_data, private_data,
          structured_data, required_tools, preferred_tools,
          tags, metadata, status,
          created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(
        submissionId,
        agent.id,
        params.intent_text.trim(),
        params.intent_embedding != null ? JSON.stringify(params.intent_embedding) : null,
        params.identity_embedding ? JSON.stringify(params.identity_embedding) : null,
        params.criteria_text ?? null,
        params.criteria_data ? JSON.stringify(params.criteria_data) : null,
        params.identity_text ?? null,
        params.identity_data ? JSON.stringify(params.identity_data) : null,
        params.public_data ? JSON.stringify(params.public_data) : null,
        params.private_data ? JSON.stringify(params.private_data) : null,
        params.structured_data ? JSON.stringify(params.structured_data) : null,
        params.required_tools ? JSON.stringify(params.required_tools) : null,
        params.preferred_tools ? JSON.stringify(params.preferred_tools) : null,
        params.tags ? JSON.stringify(params.tags) : null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        now,
        now,
        expiresAt,
      );

    // Update last_active_at
    ctx.db.prepare("UPDATE v4_agents SET last_active_at = ? WHERE id = ?").run(now, agent.id);
  } catch (err) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) },
    };
  }

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
  intent_embedding?: number[];
  identity_embedding?: number[];
  criteria_text?: string;
  criteria_data?: Record<string, unknown>;
  identity_text?: string;
  identity_data?: Record<string, unknown>;
  public_data?: Record<string, unknown>;
  private_data?: Record<string, unknown>;
  structured_data?: Record<string, unknown>;
  required_tools?: string[];
  preferred_tools?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: string;
  expires_at?: string;
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

  // Validate intent_text if provided
  if (params.intent_text !== undefined) {
    if (typeof params.intent_text !== "string" || params.intent_text.trim().length === 0) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "intent_text must be non-empty." } };
    }
    if (params.intent_text.length > MAX_INTENT_TEXT_CHARS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `intent_text must be ${MAX_INTENT_TEXT_CHARS} characters or fewer.` } };
    }
  }

  // Validate new embeddings if provided
  if (params.intent_embedding !== undefined) {
    const err = validateEmbedding(params.intent_embedding, "intent_embedding");
    if (err) return { ok: false, error: { code: "INVALID_INPUT", message: err } };
  }
  if (params.identity_embedding !== undefined && params.identity_embedding !== null) {
    const err = validateEmbedding(params.identity_embedding, "identity_embedding");
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

  // Validate expires_at if provided
  if (params.expires_at !== undefined) {
    const expiresAtDate = new Date(params.expires_at);
    if (isNaN(expiresAtDate.getTime())) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "expires_at must be a valid ISO 8601 datetime string." } };
    }
    if (expiresAtDate <= new Date()) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "expires_at must be in the future." } };
    }
  }

  // Validate text fields
  if (params.criteria_text !== undefined && params.criteria_text !== null) {
    if (typeof params.criteria_text !== "string") {
      return { ok: false, error: { code: "INVALID_INPUT", message: "criteria_text must be a string." } };
    }
    if (Buffer.byteLength(params.criteria_text, "utf8") > MAX_CRITERIA_TEXT_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `criteria_text must be under ${MAX_CRITERIA_TEXT_BYTES / 1024}KB.` } };
    }
  }
  if (params.identity_text !== undefined && params.identity_text !== null) {
    if (typeof params.identity_text !== "string") {
      return { ok: false, error: { code: "INVALID_INPUT", message: "identity_text must be a string." } };
    }
    if (Buffer.byteLength(params.identity_text, "utf8") > MAX_IDENTITY_TEXT_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `identity_text must be under ${MAX_IDENTITY_TEXT_BYTES / 1024}KB.` } };
    }
  }

  // Validate structured_data size
  if (params.structured_data !== undefined) {
    const sdStr = JSON.stringify(params.structured_data);
    if (Buffer.byteLength(sdStr, "utf8") > MAX_STRUCTURED_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `structured_data must be under ${MAX_STRUCTURED_DATA_BYTES / 1024}KB.` } };
    }
  }

  // Validate public_data / private_data size
  if (params.public_data !== undefined) {
    const pdStr = JSON.stringify(params.public_data);
    if (Buffer.byteLength(pdStr, "utf8") > MAX_PUBLIC_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `public_data must be under ${MAX_PUBLIC_DATA_BYTES / 1024}KB.` } };
    }
  }
  if (params.private_data !== undefined) {
    const pdStr = JSON.stringify(params.private_data);
    if (Buffer.byteLength(pdStr, "utf8") > MAX_PRIVATE_DATA_BYTES) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `private_data must be under ${MAX_PRIVATE_DATA_BYTES / 1024}KB.` } };
    }
  }

  // Validate required_tools / preferred_tools
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

  // Validate tags
  if (params.tags !== undefined) {
    if (!Array.isArray(params.tags) || params.tags.length > MAX_TAGS) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `tags must be an array with at most ${MAX_TAGS} items.` } };
    }
    const itemErr = validateStringArray(params.tags, "tags", MAX_TAG_LENGTH);
    if (itemErr) return { ok: false, error: { code: "INVALID_INPUT", message: itemErr } };
  }

  const now = new Date().toISOString();

  // Build update
  const updates: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (params.intent_text !== undefined) { updates.push("intent_text = ?"); values.push(params.intent_text.trim()); }
  if (params.intent_embedding !== undefined) { updates.push("intent_embedding = ?"); values.push(JSON.stringify(params.intent_embedding)); }
  if (params.identity_embedding !== undefined) { updates.push("identity_embedding = ?"); values.push(params.identity_embedding ? JSON.stringify(params.identity_embedding) : null); }
  if (params.criteria_text !== undefined) { updates.push("criteria_text = ?"); values.push(params.criteria_text ?? null); }
  if (params.criteria_data !== undefined) { updates.push("criteria_data = ?"); values.push(params.criteria_data ? JSON.stringify(params.criteria_data) : null); }
  if (params.identity_text !== undefined) { updates.push("identity_text = ?"); values.push(params.identity_text ?? null); }
  if (params.identity_data !== undefined) { updates.push("identity_data = ?"); values.push(params.identity_data ? JSON.stringify(params.identity_data) : null); }
  if (params.public_data !== undefined) { updates.push("public_data = ?"); values.push(params.public_data ? JSON.stringify(params.public_data) : null); }
  if (params.private_data !== undefined) { updates.push("private_data = ?"); values.push(params.private_data ? JSON.stringify(params.private_data) : null); }
  if (params.structured_data !== undefined) { updates.push("structured_data = ?"); values.push(JSON.stringify(params.structured_data)); }
  if (params.required_tools !== undefined) { updates.push("required_tools = ?"); values.push(JSON.stringify(params.required_tools)); }
  if (params.preferred_tools !== undefined) { updates.push("preferred_tools = ?"); values.push(JSON.stringify(params.preferred_tools)); }
  if (params.tags !== undefined) { updates.push("tags = ?"); values.push(JSON.stringify(params.tags)); }
  if (params.metadata !== undefined) { updates.push("metadata = ?"); values.push(params.metadata ? JSON.stringify(params.metadata) : null); }
  if (params.status !== undefined) { updates.push("status = ?"); values.push(params.status); }
  if (params.expires_at !== undefined) { updates.push("expires_at = ?"); values.push(new Date(params.expires_at).toISOString()); }

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
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string | null;
  tags: string[] | null;
  required_tools: string[] | null;
  preferred_tools: string[] | null;
  has_identity_embedding: boolean;
  has_structured_data: boolean;
  has_public_data: boolean;
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

  let query = `SELECT id, agent_id, intent_text, status,
    expires_at, created_at, updated_at, tags, required_tools, preferred_tools,
    (identity_embedding IS NOT NULL) as has_identity,
    (structured_data IS NOT NULL) as has_sd,
    (public_data IS NOT NULL) as has_pub
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
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: row.tags ? safeJsonParse(row.tags, null) : null,
    required_tools: row.required_tools ? safeJsonParse(row.required_tools, null) : null,
    preferred_tools: row.preferred_tools ? safeJsonParse(row.preferred_tools, null) : null,
    has_identity_embedding: !!row.has_identity,
    has_structured_data: !!row.has_sd,
    has_public_data: !!row.has_pub,
  }));

  return { ok: true, data: { submissions, total } };
}

// ─── Public Index ──────────────────────────────────────────────────────
// No auth required. Returns only public-safe fields.

export interface IndexInput {
  limit?: number;
  offset?: number;
  tags_filter?: string[];
  include_embeddings?: boolean;
}

export interface PublicSubmission {
  id: string;
  agent_id: string;
  intent_text: string;
  intent_embedding?: number[];
  has_embedding: boolean;
  public_data: Record<string, unknown> | null;
  tags: string[] | null;
  status: string;
  created_at: string;
  expires_at: string;
}

export async function handleIndex(
  params: IndexInput,
  ctx: HandlerContext,
): Promise<HandlerResult<{ submissions: PublicSubmission[]; total: number }>> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const includeEmbeddings = params.include_embeddings === true;

  const now = new Date().toISOString();

  let query = `SELECT id, agent_id, intent_text, ${includeEmbeddings ? "intent_embedding," : "(intent_embedding IS NOT NULL) as has_emb,"} public_data, tags, status, created_at, expires_at
    FROM submissions
    WHERE status = 'active' AND expires_at > ?`;
  const qParams: unknown[] = [now];

  const countQuery = `SELECT COUNT(*) as c FROM submissions WHERE status = 'active' AND expires_at > ?`;
  const countParams: unknown[] = [now];

  // Optional tag filter
  if (params.tags_filter && Array.isArray(params.tags_filter) && params.tags_filter.length > 0) {
    // Filter by any matching tag using JSON contains
    const tagConditions = params.tags_filter.map(() => "tags LIKE ?").join(" OR ");
    query += ` AND (${tagConditions})`;
    for (const tag of params.tags_filter) {
      qParams.push(`%${tag.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      countParams.push(`%${tag.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    }
  }

  const total = (ctx.db.prepare(countQuery).get(...countParams) as { c: number })?.c ?? 0;

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  qParams.push(limit, offset);

  const rows = ctx.db.prepare(query).all(...qParams) as Record<string, any>[];

  const submissions: PublicSubmission[] = rows.map((row) => {
    const entry: PublicSubmission = {
      id: row.id,
      agent_id: row.agent_id,
      intent_text: row.intent_text,
      has_embedding: includeEmbeddings ? row.intent_embedding != null : !!row.has_emb,
      public_data: row.public_data ? safeJsonParse(row.public_data, null) : null,
      tags: row.tags ? safeJsonParse(row.tags, null) : null,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
    };
    if (includeEmbeddings) {
      entry.intent_embedding = safeJsonParse(row.intent_embedding, []);
    }
    return entry;
  });

  return { ok: true, data: { submissions, total } };
}

export interface IndexGetInput {
  submission_id: string;
}

export async function handleIndexGet(
  params: IndexGetInput,
  ctx: HandlerContext,
): Promise<HandlerResult<PublicSubmission>> {
  if (!params.submission_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "submission_id is required." } };
  }

  const row = ctx.db
    .prepare(
      `SELECT id, agent_id, intent_text, intent_embedding, public_data, tags, status, created_at, expires_at
       FROM submissions WHERE id = ?`,
    )
    .get(params.submission_id) as Record<string, any> | undefined;

  if (!row) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Submission not found." } };
  }

  return {
    ok: true,
    data: {
      id: row.id,
      agent_id: row.agent_id,
      intent_text: row.intent_text,
      intent_embedding: safeJsonParse(row.intent_embedding, []),
      has_embedding: row.intent_embedding != null,
      public_data: row.public_data ? safeJsonParse(row.public_data, null) : null,
      tags: row.tags ? safeJsonParse(row.tags, null) : null,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
    },
  };
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
