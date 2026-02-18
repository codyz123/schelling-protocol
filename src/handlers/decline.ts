import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
} from "../types.js";
import { callerSide, otherToken } from "../types.js";

export interface DeclineInput {
  user_token: string;
  candidate_id: string;
  reason?: string;
}

export interface DeclineOutput {
  declined: true;
}

export async function handleDecline(
  input: DeclineInput,
  ctx: HandlerContext
): Promise<HandlerResult<DeclineOutput>> {
  // Verify user exists
  const caller = ctx.db
    .prepare("SELECT 1 FROM users WHERE user_token = ?")
    .get(input.user_token);

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not part of this candidate pair" },
    };
  }

  const other = otherToken(input.user_token, candidate);

  // Check for existing decline
  const existingDecline = ctx.db
    .prepare(
      "SELECT 1 FROM declines WHERE decliner_token = ? AND declined_token = ?"
    )
    .get(input.user_token, other);

  if (existingDecline) {
    return {
      ok: false,
      error: { code: "ALREADY_DECLINED", message: "Candidate was already declined" },
    };
  }

  const side = callerSide(input.user_token, candidate);
  const stageAtDecline =
    side === "a" ? candidate.stage_a : candidate.stage_b;

  const declineCandidate = ctx.db.transaction(() => {
    ctx.db
      .prepare(
        `INSERT INTO declines (id, decliner_token, declined_token, stage_at_decline, reason)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.user_token,
        other,
        stageAtDecline,
        input.reason ?? null
      );

    ctx.db
      .prepare("DELETE FROM candidates WHERE id = ?")
      .run(input.candidate_id);
  });

  declineCandidate();

  return { ok: true, data: { declined: true } };
}
