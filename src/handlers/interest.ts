import { randomUUID } from "node:crypto";
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

export interface InterestInput {
  user_token: string;
  candidate_id: string;
  contract_proposal?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface InterestOutput {
  candidate_id: string;
  your_stage: number;
  their_stage: number;
  mutual_interest: boolean;
  newly_visible_traits: Array<{
    key: string;
    value: unknown;
    value_type: string;
    display_name: string | null;
    category: string | null;
    verification: string;
  }>;
  contract_id: null;
  interest_expires_at: null;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleInterest(
  input: InterestInput,
  ctx: HandlerContext,
): Promise<HandlerResult<InterestOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<InterestOutput>(ctx.db, input.idempotency_key);
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

  // ── Auction mode: contract_proposal required ───────────────────
  if (candidate.funnel_mode === "auction" && !input.contract_proposal) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "contract_proposal is required for auction mode candidates",
      },
    };
  }

  // ── Advance caller from DISCOVERED → INTERESTED ────────────────
  const advanceResult = advanceStage(
    ctx.db,
    input.candidate_id,
    input.user_token,
    Stage.INTERESTED,
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

  // ── Compute mutual_interest ────────────────────────────────────
  const mutualInterest = yourStage >= Stage.INTERESTED && theirStage >= Stage.INTERESTED;

  // ── Load newly visible traits (after_interest) ─────────────────
  // Visible if both are now at INTERESTED+
  const newlyVisibleTraits: InterestOutput["newly_visible_traits"] = [];

  if (mutualInterest) {
    const otherTraits = ctx.db
      .prepare(
        "SELECT * FROM traits WHERE user_token = ? AND visibility = 'after_interest'",
      )
      .all(otherUserToken) as TraitRecord[];

    const mutualMinStage = Math.min(yourStage, theirStage);

    for (const trait of otherTraits) {
      if (isTraitVisible("after_interest", mutualMinStage)) {
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

  // ── Build result ───────────────────────────────────────────────
  const result: InterestOutput = {
    candidate_id: input.candidate_id,
    your_stage: yourStage,
    their_stage: theirStage,
    mutual_interest: mutualInterest,
    newly_visible_traits: newlyVisibleTraits,
    contract_id: null,
    interest_expires_at: null,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "interest", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
