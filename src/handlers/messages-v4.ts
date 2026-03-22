import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { authenticateAgent, extractApiKey, safeJsonParse } from "./submit.js";

// ─── Constants ────────────────────────────────────────────────────────

const MAX_MESSAGE_TEXT_CHARS = 5000;
const MAX_RESPONSE_TEXT_CHARS = 5000;

// ─── Send Message ─────────────────────────────────────────────────────

export interface MessageSendInput {
  agent_api_key?: string;
  target_submission_id: string;
  from_submission_id?: string;
  message_text: string;
}

export interface MessageSendOutput {
  message_id: string;
  target_submission_id: string;
  from_agent_id: string;
  status: "pending";
  created_at: string;
}

export async function handleMessageSend(
  params: MessageSendInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<MessageSendOutput>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.target_submission_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "target_submission_id is required." } };
  }

  if (!params.message_text || typeof params.message_text !== "string" || params.message_text.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "message_text is required and must be non-empty." } };
  }
  if (params.message_text.length > MAX_MESSAGE_TEXT_CHARS) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `message_text must be ${MAX_MESSAGE_TEXT_CHARS} characters or fewer.` } };
  }

  // Target submission must exist
  const targetSub = ctx.db
    .prepare("SELECT id, agent_id FROM submissions WHERE id = ?")
    .get(params.target_submission_id) as { id: string; agent_id: string } | undefined;

  if (!targetSub) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Target submission not found." } };
  }

  // Cannot message your own submission
  if (targetSub.agent_id === agent.id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Cannot send a message to your own submission." } };
  }

  // Validate from_submission_id if provided (must be owned by sender)
  if (params.from_submission_id) {
    const fromSub = ctx.db
      .prepare("SELECT id FROM submissions WHERE id = ? AND agent_id = ?")
      .get(params.from_submission_id, agent.id) as { id: string } | undefined;
    if (!fromSub) {
      return { ok: false, error: { code: "NOT_FOUND", message: "from_submission_id not found or not owned by this agent." } };
    }
  }

  const messageId = randomUUID();
  const now = new Date().toISOString();

  try {
    ctx.db
      .prepare(
        `INSERT INTO v4_messages (id, target_submission_id, from_agent_id, from_submission_id, message_text, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        messageId,
        params.target_submission_id,
        agent.id,
        params.from_submission_id ?? null,
        params.message_text.trim(),
        now,
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
      message_id: messageId,
      target_submission_id: params.target_submission_id,
      from_agent_id: agent.id,
      status: "pending",
      created_at: now,
    },
  };
}

// ─── Message Inbox ────────────────────────────────────────────────────

export interface MessageInboxInput {
  agent_api_key?: string;
  submission_id?: string;
  limit?: number;
  offset?: number;
}

export interface MessageRecord {
  message_id: string;
  target_submission_id: string;
  from_agent_id: string;
  from_submission_id: string | null;
  message_text: string;
  response_text: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
  sender_public_data: Record<string, unknown> | null;
  sender_intent_text: string | null;
}

export async function handleMessageInbox(
  params: MessageInboxInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ messages: MessageRecord[]; total: number }>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  // Build query: all messages targeting submissions owned by this agent
  let query = `
    SELECT m.id, m.target_submission_id, m.from_agent_id, m.from_submission_id,
           m.message_text, m.response_text, m.status, m.created_at, m.responded_at,
           fs.public_data as sender_public_data,
           fs.intent_text as sender_intent_text
    FROM v4_messages m
    JOIN submissions s ON m.target_submission_id = s.id
    LEFT JOIN submissions fs ON m.from_submission_id = fs.id
    WHERE s.agent_id = ?`;
  const qParams: unknown[] = [agent.id];

  if (params.submission_id) {
    query += " AND m.target_submission_id = ?";
    qParams.push(params.submission_id);
  }

  const countQuery = `
    SELECT COUNT(*) as c FROM v4_messages m
    JOIN submissions s ON m.target_submission_id = s.id
    WHERE s.agent_id = ?${params.submission_id ? " AND m.target_submission_id = ?" : ""}`;
  const countParams: unknown[] = params.submission_id ? [agent.id, params.submission_id] : [agent.id];
  const total = (ctx.db.prepare(countQuery).get(...countParams) as { c: number })?.c ?? 0;

  query += " ORDER BY m.created_at DESC LIMIT ? OFFSET ?";
  qParams.push(limit, offset);

  const rows = ctx.db.prepare(query).all(...qParams) as Record<string, any>[];

  const messages: MessageRecord[] = rows.map((row) => ({
    message_id: row.id,
    target_submission_id: row.target_submission_id,
    from_agent_id: row.from_agent_id,
    from_submission_id: row.from_submission_id,
    message_text: row.message_text,
    response_text: row.response_text,
    status: row.status,
    created_at: row.created_at,
    responded_at: row.responded_at,
    sender_public_data: row.sender_public_data ? safeJsonParse(row.sender_public_data, null) : null,
    sender_intent_text: row.sender_intent_text ?? null,
  }));

  return { ok: true, data: { messages, total } };
}

// ─── Respond to Message ───────────────────────────────────────────────

export interface MessageRespondInput {
  agent_api_key?: string;
  message_id: string;
  response_text: string;
}

export interface MessageRespondOutput {
  message_id: string;
  status: "responded";
  responded_at: string;
}

export async function handleMessageRespond(
  params: MessageRespondInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<MessageRespondOutput>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.message_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "message_id is required." } };
  }

  if (!params.response_text || typeof params.response_text !== "string" || params.response_text.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "response_text is required and must be non-empty." } };
  }
  if (params.response_text.length > MAX_RESPONSE_TEXT_CHARS) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `response_text must be ${MAX_RESPONSE_TEXT_CHARS} characters or fewer.` } };
  }

  // Verify the message targets a submission owned by this agent
  const message = ctx.db
    .prepare(
      `SELECT m.id, m.status FROM v4_messages m
       JOIN submissions s ON m.target_submission_id = s.id
       WHERE m.id = ? AND s.agent_id = ?`,
    )
    .get(params.message_id, agent.id) as { id: string; status: string } | undefined;

  if (!message) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Message not found or not addressed to this agent." } };
  }

  if (message.status === "responded") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Message has already been responded to." } };
  }

  const now = new Date().toISOString();

  ctx.db
    .prepare(
      `UPDATE v4_messages SET response_text = ?, status = 'responded', responded_at = ? WHERE id = ?`,
    )
    .run(params.response_text.trim(), now, params.message_id);

  return {
    ok: true,
    data: {
      message_id: params.message_id,
      status: "responded",
      responded_at: now,
    },
  };
}
