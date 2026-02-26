import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface MessageInput {
  user_token: string;
  candidate_id: string;
  content: string;
  idempotency_key?: string;
}

export interface MessageOutput {
  message_id: string;
  sent_at: string;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleMessage(
  input: MessageInput,
  ctx: HandlerContext,
): Promise<HandlerResult<MessageOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<MessageOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Validate content length ────────────────────────────────────
  if (!input.content || input.content.length > 5000) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_TOO_LONG",
        message: "Message content must be between 1 and 5000 characters",
      },
    };
  }

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
        message: "Both parties must be at CONNECTED stage to send messages",
      },
    };
  }

  // ── Check relay not blocked by the other party ─────────────────
  const otherUserToken = otherToken(input.user_token, candidate);
  const block = ctx.db
    .prepare(
      "SELECT 1 FROM relay_blocks WHERE candidate_id = ? AND blocker_token = ?",
    )
    .get(input.candidate_id, otherUserToken);

  if (block) {
    return {
      ok: false,
      error: { code: "RELAY_BLOCKED", message: "The other party has blocked relay messages" },
    };
  }

  // ── Insert message ─────────────────────────────────────────────
  const messageId = randomUUID();
  const sentAt = new Date().toISOString();

  ctx.db
    .prepare(
      `INSERT INTO messages (id, candidate_id, sender_token, content, sent_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(messageId, input.candidate_id, input.user_token, input.content, sentAt);

  // ── Build result ───────────────────────────────────────────────
  const result: MessageOutput = {
    message_id: messageId,
    sent_at: sentAt,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "message", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
