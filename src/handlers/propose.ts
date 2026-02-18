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
  generateOpener,
} from "../matching/compatibility.js";

export interface ProposeInput {
  user_token: string;
  candidate_id: string;
}

export type ProposeOutput =
  | {
      status: "mutual";
      candidate_id: string;
      introduction: {
        name: string;
        contact: string;
        shared_interests: string[];
        compatibility_score: number;
        suggested_opener: string;
      };
    }
  | {
      status: "pending";
      candidate_id: string;
      message: string;
    }
  | {
      status: "mutual_no_identity";
      candidate_id: string;
      message: string;
    };

export async function handlePropose(
  input: ProposeInput,
  ctx: HandlerContext
): Promise<HandlerResult<ProposeOutput>> {
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
      error: { code: "UNAUTHORIZED", message: "You are not part of this candidate pair" },
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
  const myStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  // Must be at PROFILED or higher
  if (myStage < Stage.PROFILED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Must be at stage PROFILED (${Stage.PROFILED}) or higher to propose. Current stage: ${myStage}`,
      },
    };
  }

  // Atomic advance + mutual detection
  const advanceToProposed = ctx.db.transaction(() => {
    const col = side === "a" ? "stage_a" : "stage_b";
    ctx.db
      .prepare(`UPDATE candidates SET ${col} = MAX(${col}, ?) WHERE id = ?`)
      .run(Stage.PROPOSED, input.candidate_id);

    const row = ctx.db
      .prepare("SELECT * FROM candidates WHERE id = ?")
      .get(input.candidate_id) as CandidateRecord;

    if (row.stage_a >= Stage.PROPOSED && row.stage_b >= Stage.PROPOSED) {
      ctx.db
        .prepare(
          "UPDATE candidates SET stage_a = ?, stage_b = ? WHERE id = ?"
        )
        .run(Stage.INTRODUCED, Stage.INTRODUCED, input.candidate_id);
      return { mutual: true };
    }
    return { mutual: false };
  });

  const result = advanceToProposed();

  if (!result.mutual) {
    return {
      ok: true,
      data: {
        status: "pending",
        candidate_id: input.candidate_id,
        message:
          "Your interest has been recorded. Waiting for the other party.",
      },
    };
  }

  // Mutual — build introduction
  const otherUser = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(other) as UserRecord;

  if (!otherUser.identity) {
    return {
      ok: true,
      data: {
        status: "mutual_no_identity",
        candidate_id: input.candidate_id,
        message:
          "Both parties are interested, but the other party has not provided identity information. They will need to re-register with identity data.",
      },
    };
  }

  const identity = JSON.parse(otherUser.identity) as {
    name: string;
    contact: string;
  };

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
      status: "mutual",
      candidate_id: input.candidate_id,
      introduction: {
        name: identity.name,
        contact: identity.contact,
        shared_interests: sharedInterests,
        compatibility_score: compat.overall_score,
        suggested_opener: generateOpener(
          sharedInterests,
          compat.shared_categories
        ),
      },
    },
  };
}
