import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
} from "../types.js";
import { Stage, callerSide } from "../types.js";

export interface WithdrawInput {
  user_token: string;
  candidate_id: string;
  reason?: string;
  idempotency_key?: string;
}

export interface WithdrawOutput {
  withdrawn: boolean;
  new_stage: number;
  message: string;
}

export async function handleWithdraw(
  input: WithdrawInput,
  ctx: HandlerContext
): Promise<HandlerResult<WithdrawOutput>> {
  // Check idempotency
  if (input.idempotency_key) {
    const existing = ctx.db
      .prepare("SELECT response FROM idempotency_keys WHERE key = ? AND operation = 'withdraw'")
      .get(input.idempotency_key) as { response: string } | undefined;
    if (existing) {
      return { ok: true, data: JSON.parse(existing.response) };
    }
  }

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

  const side = callerSide(input.user_token, candidate);
  const myStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  // Can only withdraw from COMMITTED stage (not after CONNECTED)
  if (myStage !== Stage.COMMITTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Can only withdraw from COMMITTED stage (${Stage.COMMITTED}). Current stage: ${myStage}`,
      },
    };
  }

  // TODO: Check rate limiting - max 3 withdrawals per vertical per 30 days
  // For now, we'll implement the basic withdrawal

  // Withdraw: reset caller's stage back to EXCHANGED
  const col = side === "a" ? "stage_a" : "stage_b";
  ctx.db
    .prepare(`UPDATE candidates SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(Stage.EXCHANGED, input.candidate_id);

  // Create a pending action for the other party
  const otherToken = side === "a" ? candidate.user_b_token : candidate.user_a_token;
  ctx.db
    .prepare(`
      INSERT OR IGNORE INTO pending_actions (id, user_token, candidate_id, action_type) 
      VALUES (?, ?, ?, ?)
    `)
    .run(
      randomUUID(),
      otherToken,
      input.candidate_id,
      "review_commitment"
    );

  const result: WithdrawOutput = {
    withdrawn: true,
    new_stage: Stage.EXCHANGED,
    message: "Withdrawn from commitment. You can still continue the conversation or re-commit later."
  };

  // Store idempotency key if provided
  if (input.idempotency_key) {
    ctx.db
      .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
      .run(input.idempotency_key, 'withdraw', input.user_token, JSON.stringify(result));
  }

  return { ok: true, data: result };
}