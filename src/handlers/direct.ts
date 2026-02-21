import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, CandidateRecord, UserRecord } from "../types.js";
import { Stage, otherToken } from "../types.js";

export interface DirectInput {
  user_token: string;
  candidate_id: string;
}

export type DirectOutput =
  | { status: "mutual"; contact: string; name: string }
  | { status: "pending"; message: string };

export async function handleDirect(
  input: DirectInput,
  ctx: HandlerContext
): Promise<HandlerResult<DirectOutput>> {
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;
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
    return { ok: false, error: { code: "STAGE_VIOLATION", message: "Direct contact requires CONNECTED stage" } };
  }

  // Check caller has identity
  if (!caller.identity) {
    return { ok: false, error: { code: "IDENTITY_NOT_PROVIDED", message: "You must have identity data to opt into direct contact" } };
  }

  const other = otherToken(input.user_token, candidate);

  // Insert opt-in (idempotent)
  ctx.db.prepare(
    "INSERT OR IGNORE INTO direct_optins (id, candidate_id, user_token) VALUES (?, ?, ?)"
  ).run(randomUUID(), input.candidate_id, input.user_token);

  // Check if other side also opted in
  const otherOptin = ctx.db
    .prepare("SELECT 1 FROM direct_optins WHERE candidate_id = ? AND user_token = ?")
    .get(input.candidate_id, other);

  if (otherOptin) {
    // Mutual — share contact info
    const otherUser = ctx.db
      .prepare("SELECT identity FROM users WHERE user_token = ?")
      .get(other) as { identity: string | null };

    if (!otherUser.identity) {
      return { ok: true, data: { status: "pending", message: "Other party has not provided identity information" } };
    }

    const identity = JSON.parse(otherUser.identity) as { name: string; contact: string };
    return { ok: true, data: { status: "mutual", contact: identity.contact, name: identity.name } };
  }

  // Create pending action for other party
  ctx.db.prepare(
    "INSERT INTO pending_actions (id, user_token, candidate_id, action_type) VALUES (?, ?, ?, 'direct_request')"
  ).run(randomUUID(), other, input.candidate_id);

  return { ok: true, data: { status: "pending", message: "Your direct contact opt-in has been recorded. Waiting for the other party." } };
}
