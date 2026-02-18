import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, CandidateRecord } from "../types.js";
import { Stage, otherToken } from "../types.js";

export interface MessageInput {
  user_token: string;
  candidate_id: string;
  content: string;
  content_type?: "text" | "markdown";
}

export interface MessageOutput {
  message_id: string;
  sent_at: string;
  candidate_id: string;
}

export async function handleMessage(
  input: MessageInput,
  ctx: HandlerContext
): Promise<HandlerResult<MessageOutput>> {
  if (!input.content || input.content.length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Message content is required" } };
  }
  if (input.content.length > 5000) {
    return { ok: false, error: { code: "MESSAGE_TOO_LONG", message: "Message content must be ≤ 5000 characters" } };
  }

  const caller = ctx.db
    .prepare("SELECT 1 FROM users WHERE user_token = ?")
    .get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as CandidateRecord | undefined;
  if (!candidate) {
    return { ok: false, error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" } };
  }

  if (input.user_token !== candidate.user_a_token && input.user_token !== candidate.user_b_token) {
    return { ok: false, error: { code: "NOT_PARTICIPANT", message: "You are not part of this candidate pair" } };
  }

  // Must be CONNECTED or higher
  if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
    return { ok: false, error: { code: "STAGE_VIOLATION", message: "Message relay requires both parties at CONNECTED stage" } };
  }

  // Check relay block
  const other = otherToken(input.user_token, candidate);
  const block = ctx.db
    .prepare("SELECT 1 FROM relay_blocks WHERE candidate_id = ? AND blocker_token = ?")
    .get(input.candidate_id, other);
  
  // If blocked, silently succeed but don't deliver (per spec)
  const messageId = randomUUID();
  const sentAt = new Date().toISOString();

  if (!block) {
    // Per-candidate rate limit: 10 unanswered messages
    const unanswered = ctx.db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE candidate_id = ? AND sender_token = ? AND sent_at > COALESCE((SELECT MAX(sent_at) FROM messages WHERE candidate_id = ? AND sender_token = ?), '1970-01-01')`)
      .get(input.candidate_id, input.user_token, input.candidate_id, other) as { count: number };
    if (unanswered.count >= 10) {
      return { ok: false, error: { code: "RATE_LIMITED", message: "10 consecutive unanswered messages. Wait for a reply." } };
    }

    ctx.db.prepare(
      "INSERT INTO messages (id, candidate_id, sender_token, content, content_type, sent_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(messageId, input.candidate_id, input.user_token, input.content, input.content_type ?? "text", sentAt);

    // Create pending action for recipient
    ctx.db.prepare(
      "INSERT INTO pending_actions (id, user_token, candidate_id, action_type) VALUES (?, ?, ?, 'new_message')"
    ).run(randomUUID(), other, input.candidate_id);
  }

  return { ok: true, data: { message_id: messageId, sent_at: sentAt, candidate_id: input.candidate_id } };
}
