import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  DeclineRecord,
} from "../types.js";
import { Stage, orderTokens } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface ReconsiderInput {
  user_token: string;
  candidate_id: string;
  idempotency_key?: string;
}

export interface ReconsiderOutput {
  candidate_id: string;
  stage: "DISCOVERED";
  reconsidered_at: string;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleReconsider(
  input: ReconsiderInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ReconsiderOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<ReconsiderOutput>(ctx.db, input.idempotency_key);
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

  // ── Find the decline record for this candidate_id ──────────────
  // The candidate_id on the decline is the original candidate pair that was removed
  const decline = ctx.db
    .prepare(
      `SELECT * FROM declines
       WHERE decliner_token = ? AND candidate_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(input.user_token, input.candidate_id) as DeclineRecord | undefined;

  if (!decline) {
    return {
      ok: false,
      error: {
        code: "NO_ACTIVE_DECLINE",
        message: "No active decline found for this candidate",
      },
    };
  }

  // ── Check if permanent ─────────────────────────────────────────
  if (decline.permanent) {
    return {
      ok: false,
      error: {
        code: "PERMANENT_DECLINE",
        message: "This decline is permanent and cannot be reconsidered",
      },
    };
  }

  // ── Check if expired (no longer active) ────────────────────────
  if (decline.expires_at) {
    const expiresAt = new Date(decline.expires_at);
    if (expiresAt <= new Date()) {
      return {
        ok: false,
        error: {
          code: "NO_ACTIVE_DECLINE",
          message: "Decline has already expired",
        },
      };
    }
  }

  // ── Verify the declined user still exists ──────────────────────
  const declinedUser = ctx.db
    .prepare("SELECT user_token FROM users WHERE user_token = ?")
    .get(decline.declined_token) as { user_token: string } | undefined;

  if (!declinedUser) {
    return {
      ok: false,
      error: {
        code: "CANDIDATE_NOT_FOUND",
        message: "The previously declined user no longer exists",
      },
    };
  }

  // ── Atomic: delete decline + recreate candidate pair ───────────
  const { a, b } = orderTokens(input.user_token, decline.declined_token);
  const callerIsA = input.user_token === a;
  const newCandidateId = randomUUID();

  const doReconsider = ctx.db.transaction(() => {
    // Delete the decline record
    ctx.db
      .prepare("DELETE FROM declines WHERE id = ?")
      .run(decline.id);

    // Check if candidate pair already exists (shouldn't, but be safe)
    const existing = ctx.db
      .prepare(
        "SELECT id FROM candidates WHERE user_a_token = ? AND user_b_token = ? AND cluster_id = ?",
      )
      .get(a, b, decline.cluster_id) as { id: string } | undefined;

    if (!existing) {
      // Recreate at DISCOVERED stage
      ctx.db
        .prepare(
          `INSERT INTO candidates (
            id, user_a_token, user_b_token, cluster_id, funnel_mode,
            score, fit_a, fit_b, stage_a, stage_b,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'bilateral', 0, 0, 0, ?, ?, datetime('now'), datetime('now'))`,
        )
        .run(
          newCandidateId,
          a,
          b,
          decline.cluster_id,
          callerIsA ? Stage.DISCOVERED : Stage.UNDISCOVERED,
          callerIsA ? Stage.UNDISCOVERED : Stage.DISCOVERED,
        );
    }
  });

  try {
    doReconsider();
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
  const result: ReconsiderOutput = {
    candidate_id: newCandidateId,
    stage: "DISCOVERED",
    reconsidered_at: new Date().toISOString(),
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "reconsider", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
