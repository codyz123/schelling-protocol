import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  TraitRecord,
} from "../types.js";
import {
  Stage,
  callerSide,
  otherToken,
  isTraitVisible,
} from "../types.js";
import {
  advanceStage,
  checkIdempotency,
  recordIdempotency,
} from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface CommitInput {
  user_token: string;
  candidate_id: string;
  idempotency_key?: string;
}

export interface CommitOutput {
  candidate_id: string;
  your_stage: number;
  their_stage: number;
  connected: boolean;
  newly_visible_traits: Array<{
    key: string;
    value: unknown;
    value_type: string;
    display_name: string | null;
    category: string | null;
    verification: string;
  }>;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleCommit(
  input: CommitInput,
  ctx: HandlerContext,
): Promise<HandlerResult<CommitOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<CommitOutput>(ctx.db, input.idempotency_key);
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

  // ── Advance caller from INTERESTED → COMMITTED ────────────────
  // advanceStage auto-elevates to CONNECTED if both hit COMMITTED
  const advanceResult = advanceStage(
    ctx.db,
    input.candidate_id,
    input.user_token,
    Stage.COMMITTED,
  );

  if (!advanceResult.ok) {
    return {
      ok: false,
      error: advanceResult.error,
    };
  }

  const { stage_a, stage_b } = advanceResult.data;
  const side = callerSide(input.user_token, candidate);
  const yourStage = side === "a" ? stage_a : stage_b;
  const theirStage = side === "a" ? stage_b : stage_a;
  const otherUserToken = otherToken(input.user_token, candidate);

  const connected = yourStage >= Stage.CONNECTED && theirStage >= Stage.CONNECTED;

  // ── Load newly visible traits based on new stage ───────────────
  const newlyVisibleTraits: CommitOutput["newly_visible_traits"] = [];
  const mutualMinStage = Math.min(yourStage, theirStage);

  // Show after_commit traits if both are at COMMITTED+
  if (mutualMinStage >= Stage.COMMITTED) {
    const visibilityLevel = connected ? "after_connect" : "after_commit";

    // Collect traits visible at the new mutual stage
    const visibilityLevels: string[] = [];
    if (mutualMinStage >= Stage.COMMITTED) visibilityLevels.push("after_commit");
    if (mutualMinStage >= Stage.CONNECTED) visibilityLevels.push("after_connect");

    for (const vis of visibilityLevels) {
      const otherTraits = ctx.db
        .prepare(
          "SELECT * FROM traits WHERE user_token = ? AND visibility = ?",
        )
        .all(otherUserToken, vis) as TraitRecord[];

      for (const trait of otherTraits) {
        if (isTraitVisible(trait.visibility as any, mutualMinStage)) {
          newlyVisibleTraits.push({
            key: trait.key,
            value: JSON.parse(trait.value),
            value_type: trait.value_type,
            display_name: trait.display_name,
            category: trait.category,
            verification: trait.verification,
          });
        }
      }
    }
  }

  // ── Build result ───────────────────────────────────────────────
  const result: CommitOutput = {
    candidate_id: input.candidate_id,
    your_stage: yourStage,
    their_stage: theirStage,
    connected,
    newly_visible_traits: newlyVisibleTraits,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "commit", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
