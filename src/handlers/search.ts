import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
} from "../types.js";
import { Stage, orderTokens } from "../types.js";
import { computeCompatibility } from "../matching/compatibility.js";
import { getVertical } from "../verticals/registry.js";
import { computeReputation } from "../core/reputation.js";
import { computeMarketplaceMatch } from "../verticals/marketplace/scoring.js";

export interface SearchInput {
  user_token: string;
  vertical_id?: string; // Default to 'matchmaking' for backward compatibility
  top_k?: number;
  threshold?: number;
  intent_filter?: string;
  city_filter?: string;
  min_reputation?: number; // Filter candidates by minimum reputation score
  cursor?: string; // For pagination
  idempotency_key?: string;
}

export interface SearchCandidate {
  candidate_id: string;
  compatibility_score: number;
  shared_categories: string[];
  intent: string[];
  city: string;
  age_range: string;
  reputation_score: number;
  verification_level: "anonymous" | "verified" | "attested";
  interaction_count: number;
}

export interface SearchOutput {
  candidates: SearchCandidate[];
  total_scanned: number;
  next_cursor?: string;
  pending_actions?: Array<{
    candidate_id: string;
    action_type: string;
  }>;
}

export async function handleSearch(
  input: SearchInput,
  ctx: HandlerContext
): Promise<HandlerResult<SearchOutput>> {
  const topK = input.top_k ?? 50;
  const threshold = input.threshold ?? 0.5;
  const verticalId = input.vertical_id ?? 'matchmaking';
  
  // Check idempotency
  if (input.idempotency_key) {
    const existing = ctx.db
      .prepare("SELECT response FROM idempotency_keys WHERE key = ? AND operation = 'search'")
      .get(input.idempotency_key) as { response: string } | undefined;
    if (existing) {
      return { ok: true, data: JSON.parse(existing.response) };
    }
  }

  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // Get vertical configuration - use defaults for matchmaking if not found
  const vertical = getVertical(verticalId);
  if (!vertical && verticalId !== "matchmaking") {
    return {
      ok: false,
      error: { code: "INVALID_VERTICAL", message: `Vertical ${verticalId} not found` }
    };
  }

  const callerEmbedding: number[] = caller.embedding ? JSON.parse(caller.embedding) : [];
  const callerDealBreakers = caller.deal_breakers ? JSON.parse(caller.deal_breakers) : {};
  const callerRole = caller.role ?? "seeker";
  const callerMarketplaceData = caller.marketplace_data ? JSON.parse(caller.marketplace_data) : {};

  // For asymmetric verticals, search for the opposite role
  let targetRole = callerRole; // Default for symmetric verticals
  if (vertical && !vertical.symmetric) {
    if (verticalId === "marketplace") {
      targetRole = callerRole === "seller" ? "buyer" : "seller";
    }
  }

  // Two-pass filtering: hard filters first (deal-breakers), then soft scoring
  
  // Pass 1: Hard filters (deal-breakers)
  let sql = `
    SELECT u.* FROM users u
    WHERE u.protocol_version = ?
      AND u.vertical_id = ?
      AND u.user_token != ?
      AND u.status = 'active'
      AND u.user_token NOT IN (
        SELECT declined_token FROM declines 
        WHERE decliner_token = ? AND vertical_id = ?
      )
  `;
  const params: unknown[] = [
    caller.protocol_version,
    verticalId,
    input.user_token,
    input.user_token,
    verticalId,
  ];

  // For asymmetric verticals, filter by target role
  if (vertical && !vertical.symmetric) {
    sql += ` AND u.role = ?`;
    params.push(targetRole);
  }

  // Apply hard filters based on vertical configuration
  if (vertical?.deal_breakers?.enabled && vertical.deal_breakers.hard_filters.includes("intent")) {
    if (input.intent_filter) {
      sql += ` AND EXISTS (SELECT 1 FROM json_each(u.intent) WHERE value = ?)`;
      params.push(input.intent_filter);
    }
  }

  if (vertical?.deal_breakers?.enabled && vertical.deal_breakers.hard_filters.includes("city")) {
    if (input.city_filter) {
      sql += ` AND u.city = ?`;
      params.push(input.city_filter);
    }
  }

  // Apply caller's deal-breakers
  if (callerDealBreakers.no_smoking) {
    sql += ` AND (u.deal_breakers IS NULL OR json_extract(u.deal_breakers, '$.smoking') != 1)`;
  }
  
  if (callerDealBreakers.no_pets) {
    sql += ` AND (u.deal_breakers IS NULL OR json_extract(u.deal_breakers, '$.pets') != 1)`;
  }

  const others = ctx.db.prepare(sql).all(...params) as UserRecord[];

  // Pass 2: Score candidates that passed hard filters and apply reputation filter
  const scored: {
    user: UserRecord;
    score: number;
    categories: string[];
    reputation: {
      score: number;
      verification_level: "anonymous" | "verified" | "attested";
      interaction_count: number;
    };
    explanation?: string;
  }[] = [];

  for (const other of others) {
    let matchResult: any;
    let score: number;
    let categories: string[] = [];
    let explanation: string | undefined;

    if (verticalId === "marketplace") {
      // Use marketplace-specific scoring
      const otherMarketplaceData = other.marketplace_data ? JSON.parse(other.marketplace_data) : {};
      
      // For marketplace, scoring depends on roles
      if (callerRole === "buyer" && other.role === "seller") {
        // Buyer searching sellers - buyer preference vs seller listing
        matchResult = computeMarketplaceMatch(otherMarketplaceData, callerMarketplaceData);
      } else if (callerRole === "seller" && other.role === "buyer") {
        // Seller searching buyers - seller listing vs buyer preference  
        matchResult = computeMarketplaceMatch(callerMarketplaceData, otherMarketplaceData);
      } else {
        continue; // Skip incompatible roles
      }
      
      score = matchResult.overall_score;
      categories = [
        `price_overlap_${matchResult.price_overlap_score.toFixed(2)}`,
        `category_match_${matchResult.category_match_score.toFixed(2)}`,
        `location_${matchResult.location_proximity_score.toFixed(2)}`
      ];
      explanation = matchResult.match_explanation;
    } else {
      // Use matchmaking compatibility scoring for other verticals
      const otherEmbedding: number[] = other.embedding ? JSON.parse(other.embedding) : [];
      matchResult = computeCompatibility(callerEmbedding, otherEmbedding);
      score = matchResult.overall_score;
      categories = matchResult.shared_categories.map(
        (sc) => `${sc.direction}_${sc.dimension}`
      );
    }

    if (score >= threshold) {
      // Get reputation for this candidate
      const reputation = computeReputation(ctx.db, other.user_token, verticalId);
      
      // Apply minimum reputation filter
      if (input.min_reputation && reputation.score < input.min_reputation) {
        continue; // Skip this candidate
      }

      // Handle exclusive commitment for marketplace
      if (verticalId === "marketplace" && vertical?.exclusive_commitment) {
        // Check if this user is already committed to someone else
        const existingCommitments = ctx.db
          .prepare(`
            SELECT COUNT(*) as count FROM candidates 
            WHERE (user_a_token = ? OR user_b_token = ?) 
              AND vertical_id = ? 
              AND (stage_a >= 4 OR stage_b >= 4)
          `)
          .get(other.user_token, other.user_token, verticalId) as { count: number };
        
        if (existingCommitments.count > 0) {
          continue; // Skip users with existing commitments in exclusive verticals
        }
      }

      scored.push({
        user: other,
        score,
        categories,
        reputation: {
          score: reputation.score,
          verification_level: reputation.verification_level,
          interaction_count: reputation.interaction_count,
        },
        explanation,
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
      categories: string,
      verticalId: string
    ) => {
      const { a, b } = orderTokens(callerToken, otherTokenVal);
      const side = callerToken === a ? "stage_a" : "stage_b";

      ctx.db
        .prepare(
          `INSERT OR IGNORE INTO candidates (id, user_a_token, user_b_token, vertical_id, score, shared_categories)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), a, b, verticalId, score, categories);

      ctx.db
        .prepare(
          `UPDATE candidates SET ${side} = MAX(${side}, ?), score = ?, updated_at = datetime('now')
           WHERE user_a_token = ? AND user_b_token = ? AND vertical_id = ?`
        )
        .run(Stage.DISCOVERED, score, a, b, verticalId);
    }
  );

  const candidates: SearchCandidate[] = [];

  for (const item of topCandidates) {
    const categoriesJson = JSON.stringify(item.categories);
    upsertCandidate(
      input.user_token,
      item.user.user_token,
      item.score,
      categoriesJson,
      verticalId
    );

    // Get the candidate record to return its ID
    const { a, b } = orderTokens(input.user_token, item.user.user_token);
    const candidateRow = ctx.db
      .prepare(
        "SELECT id FROM candidates WHERE user_a_token = ? AND user_b_token = ? AND vertical_id = ?"
      )
      .get(a, b, verticalId) as { id: string };

    candidates.push({
      candidate_id: candidateRow.id,
      compatibility_score: item.score,
      shared_categories: item.categories,
      intent: JSON.parse(item.user.intent),
      city: item.user.city,
      age_range: item.user.age_range,
      reputation_score: item.reputation.score,
      verification_level: item.reputation.verification_level,
      interaction_count: item.reputation.interaction_count,
    });
  }

  // Get pending actions for this user
  const pendingActions = ctx.db
    .prepare("SELECT candidate_id, action_type FROM pending_actions WHERE user_token = ? AND consumed_at IS NULL")
    .all(input.user_token) as Array<{ candidate_id: string; action_type: string }>;

  const result: SearchOutput = {
    candidates,
    total_scanned: others.length,
    pending_actions: pendingActions.length > 0 ? pendingActions : undefined,
  };

  // Store idempotency key if provided
  if (input.idempotency_key) {
    ctx.db
      .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
      .run(input.idempotency_key, 'search', input.user_token, JSON.stringify(result));
  }

  return {
    ok: true,
    data: result,
  };
}
