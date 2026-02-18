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

export interface RequestProfileInput {
  user_token: string;
  candidate_id: string;
}

export type RequestProfileOutput =
  | {
      status: "available";
      candidate_id: string;
      profile: {
        description: string | null;
        seeking: string | null;
        interests: string[] | null;
        values_text: string | null;
        compatibility_score: number;
        breakdown: Record<string, number>;
        shared_interests: string[];
        complementary_traits: {
          dimension: string;
          you: number;
          them: number;
          label: string;
        }[];
      };
    }
  | {
      status: "pending_mutual";
      candidate_id: string;
      your_stage: number;
      their_stage: number;
      message: string;
    };

export async function handleRequestProfile(
  input: RequestProfileInput,
  ctx: HandlerContext
): Promise<HandlerResult<RequestProfileOutput>> {
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

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
      error: {
        code: "UNAUTHORIZED",
        message: "You are not part of this candidate pair",
      },
    };
  }

  const other = otherToken(input.user_token, candidate);

  // Check for existing decline
  const decline = ctx.db
    .prepare(
      "SELECT 1 FROM declines WHERE decliner_token = ? AND declined_token = ?"
    )
    .get(input.user_token, other);

  if (decline) {
    return {
      ok: false,
      error: { code: "ALREADY_DECLINED", message: "Candidate was already declined" },
    };
  }

  const side = callerSide(input.user_token, candidate);
  const otherSide = side === "a" ? "b" : "a";
  const myStage = side === "a" ? candidate.stage_a : candidate.stage_b;
  const theirStage = otherSide === "a" ? candidate.stage_a : candidate.stage_b;

  // Mutual tier-2 gate: both must be at EVALUATED or higher
  if (theirStage < Stage.EVALUATED) {
    return {
      ok: true,
      data: {
        status: "pending_mutual",
        candidate_id: input.candidate_id,
        your_stage: myStage,
        their_stage: theirStage,
        message:
          "The other party has not yet evaluated you. Profile available once mutual tier-2 interest is established.",
      },
    };
  }

  // Advance caller's stage to EXCHANGED
  const col = side === "a" ? "stage_a" : "stage_b";
  ctx.db
    .prepare(`UPDATE candidates SET ${col} = MAX(${col}, ?), updated_at = datetime('now') WHERE id = ?`)
    .run(Stage.EXCHANGED, input.candidate_id);

  // Fetch the other user's full profile
  const otherUser = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(other) as UserRecord;

  const callerEmbedding: number[] = JSON.parse(caller.embedding);
  const otherEmbedding: number[] = JSON.parse(otherUser.embedding);
  const callerInterests: string[] | undefined = caller.interests
    ? JSON.parse(caller.interests)
    : undefined;
  const otherInterests: string[] | undefined = otherUser.interests
    ? JSON.parse(otherUser.interests)
    : undefined;

  const isCallerA = side === "a";
  const compat = computeCompatibility(
    isCallerA ? callerEmbedding : otherEmbedding,
    isCallerA ? otherEmbedding : callerEmbedding,
    callerInterests,
    otherInterests,
    isCallerA
  );

  const sharedInterests = findSharedInterests(callerInterests, otherInterests);

  return {
    ok: true,
    data: {
      status: "available",
      candidate_id: input.candidate_id,
      profile: {
        description: otherUser.description,
        seeking: otherUser.seeking,
        interests: otherInterests ?? null,
        values_text: otherUser.values_text,
        compatibility_score: compat.overall_score,
        breakdown: compat.group_scores,
        shared_interests: sharedInterests,
        complementary_traits: compat.complementary_traits,
      },
    },
  };
}
