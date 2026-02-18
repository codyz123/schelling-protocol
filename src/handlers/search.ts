import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
} from "../types.js";
import { Stage, orderTokens } from "../types.js";
import { computeCompatibility } from "../matching/compatibility.js";

export interface SearchInput {
  user_token: string;
  top_k?: number;
  threshold?: number;
  intent_filter?: string;
  city_filter?: string;
}

export interface SearchCandidate {
  candidate_id: string;
  compatibility_score: number;
  shared_categories: string[];
  intent: string[];
  city: string;
  age_range: string;
}

export interface SearchOutput {
  candidates: SearchCandidate[];
  total_scanned: number;
}

export async function handleSearch(
  input: SearchInput,
  ctx: HandlerContext
): Promise<HandlerResult<SearchOutput>> {
  const topK = input.top_k ?? 50;
  const threshold = input.threshold ?? 0.5;

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

  // Build query with optional filters
  let sql = `
    SELECT u.* FROM users u
    WHERE u.protocol_version = ?
      AND u.user_token != ?
      AND u.user_token NOT IN (
        SELECT declined_token FROM declines WHERE decliner_token = ?
      )
  `;
  const params: unknown[] = [
    caller.protocol_version,
    input.user_token,
    input.user_token,
  ];

  if (input.intent_filter) {
    sql += ` AND EXISTS (SELECT 1 FROM json_each(u.intent) WHERE value = ?)`;
    params.push(input.intent_filter);
  }

  if (input.city_filter) {
    sql += ` AND u.city = ?`;
    params.push(input.city_filter);
  }

  const others = ctx.db.prepare(sql).all(...params) as UserRecord[];

  // Score all candidates
  const scored: {
    user: UserRecord;
    score: number;
    categories: string[];
  }[] = [];

  for (const other of others) {
    const otherEmbedding: number[] = JSON.parse(other.embedding);
    const result = computeCompatibility(callerEmbedding, otherEmbedding);

    if (result.overall_score >= threshold) {
      scored.push({
        user: other,
        score: result.overall_score,
        categories: result.shared_categories.map(
          (sc) => `${sc.direction}_${sc.dimension}`
        ),
      });
    }
  }

  // Sort by score descending, take top_k
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, topK);

  // Upsert candidate records and build response
  const upsertCandidate = ctx.db.transaction(
    (
      callerToken: string,
      otherTokenVal: string,
      score: number,
      categories: string
    ) => {
      const { a, b } = orderTokens(callerToken, otherTokenVal);
      const side = callerToken === a ? "stage_a" : "stage_b";

      ctx.db
        .prepare(
          `INSERT OR IGNORE INTO candidates (id, user_a_token, user_b_token, score, shared_categories)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), a, b, score, categories);

      ctx.db
        .prepare(
          `UPDATE candidates SET ${side} = MAX(${side}, ?), score = ?
           WHERE user_a_token = ? AND user_b_token = ?`
        )
        .run(Stage.SEARCHED, score, a, b);
    }
  );

  const candidates: SearchCandidate[] = [];

  for (const item of topCandidates) {
    const categoriesJson = JSON.stringify(item.categories);
    upsertCandidate(
      input.user_token,
      item.user.user_token,
      item.score,
      categoriesJson
    );

    // Get the candidate record to return its ID
    const { a, b } = orderTokens(input.user_token, item.user.user_token);
    const candidateRow = ctx.db
      .prepare(
        "SELECT id FROM candidates WHERE user_a_token = ? AND user_b_token = ?"
      )
      .get(a, b) as { id: string };

    candidates.push({
      candidate_id: candidateRow.id,
      compatibility_score: item.score,
      shared_categories: item.categories,
      intent: JSON.parse(item.user.intent),
      city: item.user.city,
      age_range: item.user.age_range,
    });
  }

  return {
    ok: true,
    data: {
      candidates,
      total_scanned: others.length,
    },
  };
}
