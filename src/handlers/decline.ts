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

export interface DeclineInput {
  user_token: string;
  candidate_id: string;
  reason?: "not_interested" | "dealbreaker" | "timing" | "logistics" | "other";
  feedback?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface DeclineOutput {
  declined: true;
  decline_count: number;
  permanent: boolean;
  expires_at: string | null;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleDecline(
  input: DeclineInput,
  ctx: HandlerContext,
): Promise<HandlerResult<DeclineOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<DeclineOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Verify candidate pair exists ───────────────────────────────
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

  // ── Stage gating: allowed at DISCOVERED(1), INTERESTED(2), COMMITTED(3) ──
  // NOT at CONNECTED(4)
  const side = callerSide(input.user_token, candidate);
  const callerStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  if (callerStage >= Stage.CONNECTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Cannot decline at CONNECTED stage. Use dispute resolution instead.",
      },
    };
  }

  if (callerStage < Stage.DISCOVERED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: "Cannot decline at UNDISCOVERED stage",
      },
    };
  }

  const other = otherToken(input.user_token, candidate);

  // ── Count previous declines from this user to this other user (any cluster) ──
  const previousDeclineCount = (
    ctx.db
      .prepare(
        "SELECT COUNT(*) as count FROM declines WHERE decliner_token = ? AND declined_token = ?",
      )
      .get(input.user_token, other) as { count: number }
  ).count;

  // ── TTL escalation ─────────────────────────────────────────────
  // 1st decline: expires in 30 days
  // 2nd decline: expires in 90 days
  // 3rd+: permanent
  let permanent = false;
  let expiresAt: string | null = null;
  const now = new Date();

  if (previousDeclineCount === 0) {
    const exp = new Date(now);
    exp.setDate(exp.getDate() + 30);
    expiresAt = exp.toISOString();
  } else if (previousDeclineCount === 1) {
    const exp = new Date(now);
    exp.setDate(exp.getDate() + 90);
    expiresAt = exp.toISOString();
  } else {
    permanent = true;
    expiresAt = null;
  }

  const declineCount = previousDeclineCount + 1;

  // ── Atomic: insert decline + delete candidate record ──────────
  const doDecline = ctx.db.transaction(() => {
    ctx.db
      .prepare(
        `INSERT INTO declines (
          id, decliner_token, declined_token, cluster_id, candidate_id,
          stage_at_decline, reason, feedback, permanent, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        randomUUID(),
        input.user_token,
        other,
        candidate.cluster_id,
        input.candidate_id,
        callerStage,
        input.reason ?? null,
        input.feedback ? JSON.stringify(input.feedback) : null,
        permanent ? 1 : 0,
        expiresAt,
      );

    // Remove the candidate pair entirely
    ctx.db
      .prepare("DELETE FROM candidates WHERE id = ?")
      .run(input.candidate_id);
  });

  try {
    doDecline();
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
  const result: DeclineOutput = {
    declined: true,
    decline_count: declineCount,
    permanent,
    expires_at: expiresAt,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "decline", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
