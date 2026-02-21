import { randomUUID } from "node:crypto";
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
import { getCluster } from "../clusters/registry.js";

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

  // Must be at EXCHANGED or higher
  if (myStage < Stage.EXCHANGED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Must be at stage EXCHANGED (${Stage.EXCHANGED}) or higher to propose. Current stage: ${myStage}`,
      },
    };
  }

  // Check exclusive commitment: use BEGIN IMMEDIATE for serialization
  const cluster = getCluster(candidate.vertical_id);
  if (cluster?.exclusive_commitment) {
    // Use BEGIN IMMEDIATE for exclusive write lock
    ctx.db.exec("BEGIN IMMEDIATE");
    try {
      const commitments = ctx.db
        .prepare(`SELECT COUNT(*) as count FROM candidates WHERE (user_a_token = ? OR user_b_token = ?) AND (stage_a >= 4 OR stage_b >= 4) AND id != ?`)
        .get(input.user_token, input.user_token, input.candidate_id) as { count: number };
      if (commitments.count > 0) {
        ctx.db.exec("ROLLBACK");
        return {
          ok: false,
          error: { code: "ACTIVE_COMMITMENT", message: "Cannot commit — you have an active commitment in this exclusive cluster" },
        };
      }
      ctx.db.exec("COMMIT");
    } catch (e) {
      try { ctx.db.exec("ROLLBACK"); } catch (_) {}
      throw e;
    }
  }

  // Atomic advance + mutual detection
  const advanceToCommitted = ctx.db.transaction(() => {
    const col = side === "a" ? "stage_a" : "stage_b";
    ctx.db
      .prepare(`UPDATE candidates SET ${col} = MAX(${col}, ?), updated_at = datetime('now') WHERE id = ?`)
      .run(Stage.COMMITTED, input.candidate_id);

    const row = ctx.db
      .prepare("SELECT * FROM candidates WHERE id = ?")
      .get(input.candidate_id) as CandidateRecord;

    if (row.stage_a >= Stage.COMMITTED && row.stage_b >= Stage.COMMITTED) {
      ctx.db
        .prepare(
          "UPDATE candidates SET stage_a = ?, stage_b = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(Stage.CONNECTED, Stage.CONNECTED, input.candidate_id);

      // Auto-decline other candidates in exclusive-commitment clusters
      if (cluster?.exclusive_commitment) {
        const otherCandidates = ctx.db
          .prepare(`SELECT id, user_a_token, user_b_token FROM candidates WHERE (user_a_token = ? OR user_b_token = ?) AND id != ? AND vertical_id = ?`)
          .all(input.user_token, input.user_token, input.candidate_id, candidate.vertical_id) as Array<{ id: string; user_a_token: string; user_b_token: string }>;
        for (const oc of otherCandidates) {
          const declinedToken = oc.user_a_token === input.user_token ? oc.user_b_token : oc.user_a_token;
          ctx.db.prepare(`INSERT OR IGNORE INTO declines (id, decliner_token, declined_token, vertical_id, stage_at_decline, reason) VALUES (?, ?, ?, ?, 0, 'exclusive_commitment')`).run(randomUUID(), input.user_token, declinedToken, candidate.vertical_id);
          ctx.db.prepare("DELETE FROM candidates WHERE id = ?").run(oc.id);
        }
      }

      return { mutual: true };
    }
    return { mutual: false };
  });

  const result = advanceToCommitted();

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
