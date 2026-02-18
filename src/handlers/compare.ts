import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  CandidateRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import {
  computeCompatibility,
  findSharedInterests,
} from "../matching/compatibility.js";

export interface CompareInput {
  user_token: string;
  candidate_ids: string[];
}

export interface ComparisonResult {
  candidate_id: string;
  compatibility_score: number;
  breakdown: Record<string, number>;
  shared_interests: string[];
  complementary_traits: {
    dimension: string;
    you: number;
    them: number;
    label: string;
  }[];
  strongest_alignments: string[];
}

export interface CompareOutput {
  comparisons: ComparisonResult[];
}

export async function handleCompare(
  input: CompareInput,
  ctx: HandlerContext
): Promise<HandlerResult<CompareOutput>> {
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  const callerEmbedding: number[] = JSON.parse(caller.embedding);
  const callerInterests: string[] | undefined = caller.interests
    ? JSON.parse(caller.interests)
    : undefined;

  const comparisons: ComparisonResult[] = [];

  for (const candidateId of input.candidate_ids) {
    const candidate = ctx.db
      .prepare("SELECT * FROM candidates WHERE id = ?")
      .get(candidateId) as CandidateRecord | undefined;

    if (!candidate) {
      return {
        ok: false,
        error: {
          code: "CANDIDATE_NOT_FOUND",
          message: `Candidate ${candidateId} not found`,
        },
      };
    }

    // Verify the caller is part of this candidate pair
    if (
      input.user_token !== candidate.user_a_token &&
      input.user_token !== candidate.user_b_token
    ) {
      return {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: `You are not part of candidate pair ${candidateId}`,
        },
      };
    }

    // Check for existing decline
    const other = otherToken(input.user_token, candidate);
    const decline = ctx.db
      .prepare(
        "SELECT 1 FROM declines WHERE decliner_token = ? AND declined_token = ?"
      )
      .get(input.user_token, other);

    if (decline) {
      return {
        ok: false,
        error: {
          code: "ALREADY_DECLINED",
          message: `Candidate ${candidateId} was already declined`,
        },
      };
    }

    const otherUser = ctx.db
      .prepare("SELECT * FROM users WHERE user_token = ?")
      .get(other) as UserRecord;

    const otherEmbedding: number[] = JSON.parse(otherUser.embedding);
    const otherInterests: string[] | undefined = otherUser.interests
      ? JSON.parse(otherUser.interests)
      : undefined;

    const isCallerA = callerSide(input.user_token, candidate) === "a";
    const result = computeCompatibility(
      isCallerA ? callerEmbedding : otherEmbedding,
      isCallerA ? otherEmbedding : callerEmbedding,
      callerInterests,
      otherInterests,
      isCallerA
    );

    const sharedInterests = findSharedInterests(callerInterests, otherInterests);

    // Advance caller's stage
    const side = callerSide(input.user_token, candidate);
    const col = side === "a" ? "stage_a" : "stage_b";
    ctx.db
      .prepare(
        `UPDATE candidates SET ${col} = MAX(${col}, ?), updated_at = datetime('now') WHERE id = ?`
      )
      .run(Stage.EVALUATED, candidateId);

    // Top 3 shared categories as strongest alignments
    const strongestAlignments = result.shared_categories
      .slice(0, 3)
      .map((sc) => sc.dimension);

    comparisons.push({
      candidate_id: candidateId,
      compatibility_score: result.overall_score,
      breakdown: result.group_scores,
      shared_interests: sharedInterests,
      complementary_traits: result.complementary_traits,
      strongest_alignments: strongestAlignments,
    });
  }

  return { ok: true, data: { comparisons } };
}
