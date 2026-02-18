import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, CandidateRecord } from "../types.js";
import { Stage } from "../types.js";

export interface RelayBlockInput {
  user_token: string;
  candidate_id: string;
  block: boolean; // true to block, false to unblock
}

export interface RelayBlockOutput {
  blocked: boolean;
  candidate_id: string;
}

export async function handleRelayBlock(
  input: RelayBlockInput,
  ctx: HandlerContext
): Promise<HandlerResult<RelayBlockOutput>> {
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
    return { ok: false, error: { code: "STAGE_VIOLATION", message: "Relay block requires CONNECTED stage" } };
  }

  if (input.block) {
    ctx.db.prepare(
      "INSERT OR IGNORE INTO relay_blocks (id, candidate_id, blocker_token) VALUES (?, ?, ?)"
    ).run(randomUUID(), input.candidate_id, input.user_token);
  } else {
    ctx.db.prepare(
      "DELETE FROM relay_blocks WHERE candidate_id = ? AND blocker_token = ?"
    ).run(input.candidate_id, input.user_token);
  }

  return { ok: true, data: { blocked: input.block, candidate_id: input.candidate_id } };
}
