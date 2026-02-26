import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  MessageRecord,
} from "../types.js";
import { Stage } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface MessagesInput {
  user_token: string;
  candidate_id: string;
  since?: string;
  limit?: number;
  cursor?: string;
}

export interface MessageSummary {
  message_id: string;
  sender: "you" | "them";
  content: string;
  sent_at: string;
}

export interface MessagesOutput {
  messages: MessageSummary[];
  total: number;
  next_cursor: string | null;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleMessages(
  input: MessagesInput,
  ctx: HandlerContext,
): Promise<HandlerResult<MessagesOutput>> {
  // ── Verify user exists and is active ──────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  if (caller.status === "paused") {
    return {
      ok: false,
      error: { code: "USER_PAUSED", message: "Your account is paused" },
    };
  }

  if (caller.status === "delisted") {
    return {
      ok: false,
      error: { code: "USER_SUSPENDED", message: "Your account is suspended" },
    };
  }

  // ── Verify candidate pair exists and user is a participant ─────
  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate pair not found" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not a participant in this candidate pair" },
    };
  }

  // ── Both parties must be at CONNECTED (stage 4) ────────────────
  if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Both parties must be at CONNECTED stage to view messages",
      },
    };
  }

  // ── Build query ────────────────────────────────────────────────
  const limit = Math.min(input.limit ?? 50, 200);

  // Decode cursor (if provided) — cursor is the sent_at of the last record
  let cursorSentAt: string | null = null;
  if (input.cursor) {
    try {
      cursorSentAt = Buffer.from(input.cursor, "base64").toString("utf8");
    } catch {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Invalid cursor" },
      };
    }
  }

  let sql = "SELECT * FROM messages WHERE candidate_id = ?";
  const params: unknown[] = [input.candidate_id];

  if (input.since) {
    sql += " AND sent_at > ?";
    params.push(input.since);
  }

  if (cursorSentAt) {
    sql += " AND sent_at < ?";
    params.push(cursorSentAt);
  }

  // Count total matching (without cursor/limit)
  let countSql = "SELECT COUNT(*) as count FROM messages WHERE candidate_id = ?";
  const countParams: unknown[] = [input.candidate_id];

  if (input.since) {
    countSql += " AND sent_at > ?";
    countParams.push(input.since);
  }

  sql += " ORDER BY sent_at DESC LIMIT ?";
  params.push(limit + 1); // fetch one extra to detect next page

  const rows = ctx.db.prepare(sql).all(...params) as MessageRecord[];
  const total = (ctx.db.prepare(countSql).get(...countParams) as { count: number }).count;

  // Detect next page
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // ── Map rows to output format ──────────────────────────────────
  const messages: MessageSummary[] = pageRows.map((row) => ({
    message_id: row.id,
    sender: row.sender_token === input.user_token ? "you" : "them",
    content: row.content,
    sent_at: row.sent_at,
  }));

  // ── Build next_cursor ──────────────────────────────────────────
  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(lastRow.sent_at, "utf8").toString("base64");
  }

  return {
    ok: true,
    data: {
      messages,
      total,
      next_cursor: nextCursor,
    },
  };
}
