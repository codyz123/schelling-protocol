import type { HandlerContext, HandlerResult, CandidateRecord } from "../types.js";
import { Stage, otherToken } from "../types.js";

export interface MessagesInput {
  user_token: string;
  candidate_id: string;
  limit?: number;
  before?: string;
  after?: string;
}

export interface MessageRecord {
  message_id: string;
  sender: "you" | "them";
  content: string;
  content_type: string;
  sent_at: string;
  read: boolean;
}

export interface MessagesOutput {
  messages: MessageRecord[];
  total_messages: number;
  has_more: boolean;
}

export async function handleMessages(
  input: MessagesInput,
  ctx: HandlerContext
): Promise<HandlerResult<MessagesOutput>> {
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

  if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
    return { ok: false, error: { code: "STAGE_VIOLATION", message: "Message relay requires CONNECTED stage" } };
  }

  const limit = Math.min(input.limit ?? 50, 100);
  const other = otherToken(input.user_token, candidate);

  let sql = "SELECT id, sender_token, content, content_type, sent_at, read FROM messages WHERE candidate_id = ?";
  const params: unknown[] = [input.candidate_id];

  if (input.before) {
    sql += " AND sent_at < ?";
    params.push(input.before);
  }
  if (input.after) {
    sql += " AND sent_at > ?";
    params.push(input.after);
  }

  sql += " ORDER BY sent_at DESC LIMIT ?";
  params.push(limit + 1);

  const rows = ctx.db.prepare(sql).all(...params) as Array<{
    id: string; sender_token: string; content: string; content_type: string; sent_at: string; read: number;
  }>;

  const hasMore = rows.length > limit;
  const messages: MessageRecord[] = rows.slice(0, limit).map(r => ({
    message_id: r.id,
    sender: r.sender_token === input.user_token ? "you" : "them",
    content: r.content,
    content_type: r.content_type,
    sent_at: r.sent_at,
    read: !!r.read,
  }));

  // Mark messages from other party as read
  ctx.db.prepare(
    "UPDATE messages SET read = 1 WHERE candidate_id = ? AND sender_token = ? AND read = 0"
  ).run(input.candidate_id, other);

  const totalRow = ctx.db
    .prepare("SELECT COUNT(*) as count FROM messages WHERE candidate_id = ?")
    .get(input.candidate_id) as { count: number };

  return {
    ok: true,
    data: {
      messages,
      total_messages: totalRow.count,
      has_more: hasMore,
    },
  };
}
