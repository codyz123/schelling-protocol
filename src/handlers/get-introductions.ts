import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
} from "../types.js";
import { otherToken } from "../types.js";
import {
  findSharedInterests,
  generateOpener,
} from "../matching/compatibility.js";
import type { SharedCategory } from "../matching/compatibility.js";

export interface GetIntroductionsInput {
  user_token: string;
}

export interface Introduction {
  candidate_id: string;
  name: string;
  contact: string;
  compatibility_score: number;
  shared_interests: string[];
  suggested_opener: string;
}

export interface GetIntroductionsOutput {
  introductions: Introduction[];
  pending_proposals: number;
}

export async function handleGetIntroductions(
  input: GetIntroductionsInput,
  ctx: HandlerContext
): Promise<HandlerResult<GetIntroductionsOutput>> {
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token);

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // Find all mutual connections (both sides at stage 5 - CONNECTED)
  const introRows = ctx.db
    .prepare(
      `SELECT c.id, c.score, c.shared_categories, c.user_a_token, c.user_b_token,
              u.identity, u.interests
       FROM candidates c
       JOIN users u ON u.user_token = (
         CASE WHEN c.user_a_token = ?1 THEN c.user_b_token ELSE c.user_a_token END
       )
       WHERE (c.user_a_token = ?1 OR c.user_b_token = ?1)
         AND c.stage_a >= 5 AND c.stage_b >= 5
         AND u.identity IS NOT NULL`
    )
    .all(input.user_token) as (CandidateRecord & {
    identity: string;
    interests: string | null;
  })[];

  const callerUser = ctx.db
    .prepare("SELECT interests FROM users WHERE user_token = ?")
    .get(input.user_token) as { interests: string | null };
  const callerInterests: string[] | undefined = callerUser.interests
    ? JSON.parse(callerUser.interests)
    : undefined;

  const introductions: Introduction[] = introRows.map((row) => {
    const identity = JSON.parse(row.identity) as {
      name: string;
      contact: string;
    };
    const otherInterests: string[] | undefined = row.interests
      ? JSON.parse(row.interests)
      : undefined;
    const sharedInterests = findSharedInterests(callerInterests, otherInterests);
    const sharedCategories: SharedCategory[] = JSON.parse(
      row.shared_categories
    ).map((cat: string) => {
      const parts = cat.split("_");
      const direction = parts[0] as "high" | "low";
      const dimension = parts.slice(1).join("_");
      return { dimension, direction, strength: 0.5 };
    });

    return {
      candidate_id: row.id,
      name: identity.name,
      contact: identity.contact,
      compatibility_score: row.score,
      shared_interests: sharedInterests,
      suggested_opener: generateOpener(sharedInterests, sharedCategories),
    };
  });

  // Count pending commitments (I committed, they haven't)
  const pendingRow = ctx.db
    .prepare(
      `SELECT COUNT(*) as count FROM candidates
       WHERE (
         (user_a_token = ?1 AND stage_a >= 4 AND stage_b < 4)
         OR (user_b_token = ?1 AND stage_b >= 4 AND stage_a < 4)
       )`
    )
    .get(input.user_token) as { count: number };

  return {
    ok: true,
    data: {
      introductions,
      pending_proposals: pendingRow.count,
    },
  };
}
