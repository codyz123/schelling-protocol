import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
} from "../types.js";
import { Stage, callerSide } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface WithdrawInput {
  user_token: string;
  candidate_id: string;
  reason?: string;
  idempotency_key?: string;
}

export interface WithdrawOutput {
  withdrawn: true;
  your_stage: number;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleWithdraw(
  input: WithdrawInput,
  ctx: HandlerContext,
): Promise<HandlerResult<WithdrawOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<WithdrawOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
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

  // ── Stage gating: valid at COMMITTED(3) or CONNECTED(4) ───────
  const side = callerSide(input.user_token, candidate);
  const callerStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  if (callerStage < Stage.COMMITTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Withdraw is only valid at COMMITTED or CONNECTED stage. Current stage: ${callerStage}`,
      },
    };
  }

  const wasConnected = callerStage >= Stage.CONNECTED;
  const otherToken = side === "a" ? candidate.user_b_token : candidate.user_a_token;
  const callerCol = side === "a" ? "stage_a" : "stage_b";
  const otherCol = side === "a" ? "stage_b" : "stage_a";

  // ── Atomic: reset stages + create pending action ───────────────
  const doWithdraw = ctx.db.transaction(() => {
    // Caller resets to INTERESTED(2)
    ctx.db
      .prepare(
        `UPDATE candidates SET ${callerCol} = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(Stage.INTERESTED, input.candidate_id);

    // If was CONNECTED: other party goes back to COMMITTED(3)
    if (wasConnected) {
      ctx.db
        .prepare(
          `UPDATE candidates SET ${otherCol} = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(Stage.COMMITTED, input.candidate_id);
    }

    // Create pending_action for other party
    ctx.db
      .prepare(
        `INSERT INTO pending_actions (id, user_token, candidate_id, action_type, details, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        randomUUID(),
        otherToken,
        input.candidate_id,
        "commitment_withdrawn",
        JSON.stringify({
          reason: input.reason ?? null,
          was_connected: wasConnected,
          their_new_stage: wasConnected ? Stage.COMMITTED : undefined,
        }),
      );
  });

  try {
    doWithdraw();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // ── Build result ───────────────────────────────────────────────
  const result: WithdrawOutput = {
    withdrawn: true,
    your_stage: Stage.INTERESTED,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "withdraw", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
