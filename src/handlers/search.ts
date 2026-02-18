import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, UserRecord } from "../types.js";
import { Stage, orderTokens } from "../types.js";
import { cosineSimilarity, cosineSimilarity16 } from "../matching/intent.js";
import { computeCompatibility } from "../matching/compatibility.js";
import { getCluster } from "../clusters/registry.js";
import { computeReputation } from "../core/reputation.js";
import { computeMarketplaceMatch } from "../verticals/marketplace/scoring.js";

export interface SearchInput {
  user_token: string;
  vertical_id?: string;
  cluster_id?: string; // v2 alias for vertical_id
  top_k?: number;
  threshold?: number;
  intent_filter?: string;
  city_filter?: string;
  min_reputation?: number;
  hard_filters?: Record<string, string | string[]>;
  cursor?: string;
  idempotency_key?: string;
}

export interface SearchCandidate {
  candidate_id: string;
  compatibility_score: number;
  your_fit?: number;
  their_fit?: number;
  combined_score?: number;
  intent_similarity?: number;
  shared_categories: string[];
  intent: string[];
  city: string | null;
  age_range: string | null;
  reputation_score: number;
  verification_level: "anonymous" | "verified" | "attested";
  interaction_count: number;
  stale: boolean;
  computed_at: string;
}

export interface SearchOutput {
  candidates: SearchCandidate[];
  total_scanned: number;
  total_matches: number;
  next_cursor?: string;
  pending_actions?: Array<{ candidate_id: string; action_type: string }>;
}

/** Quantize score to 2 decimal places for DISCOVERED stage. */
function quantize(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Check if a candidate passes a user's deal-breakers. Returns 1.0 if pass, 0.0 if fail. */
function checkDealBreakerPass(
  _candidateEmbedding: number[],
  dealBreakers: Record<string, unknown>,
  candidateUser: UserRecord
): number {
  if (!dealBreakers || Object.keys(dealBreakers).length === 0) return 1.0;
  const candidateDB = candidateUser.deal_breakers ? JSON.parse(candidateUser.deal_breakers) : {};
  if (dealBreakers.no_smoking && candidateDB.smoking) return 0.0;
  if (dealBreakers.no_pets && candidateDB.pets) return 0.0;
  return 1.0;
}

export async function handleSearch(
  input: SearchInput,
  ctx: HandlerContext
): Promise<HandlerResult<SearchOutput>> {
  const topK = input.top_k ?? 50;
  const threshold = input.threshold ?? 0.5;
  const verticalId = input.cluster_id ?? input.vertical_id ?? "matchmaking";

  // Check idempotency
  if (input.idempotency_key) {
    const existing = ctx.db
      .prepare("SELECT response FROM idempotency_keys WHERE key = ? AND operation = 'search'")
      .get(input.idempotency_key) as { response: string } | undefined;
    if (existing) return { ok: true, data: JSON.parse(existing.response) };
  }

  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  if (caller.status === "paused") {
    return { ok: false, error: { code: "USER_PAUSED", message: "Your status is paused. Resume with schelling.update" } };
  }

  const cluster = getCluster(verticalId);
  if (!cluster) {
    return { ok: false, error: { code: "INVALID_VERTICAL", message: `Unknown vertical/cluster: ${verticalId}` } };
  }
  const callerEmbedding: number[] = caller.embedding ? JSON.parse(caller.embedding) : [];
  const callerIntentEmbedding: number[] = caller.intent_embedding ? JSON.parse(caller.intent_embedding) : [];
  const callerDealBreakers = caller.deal_breakers ? JSON.parse(caller.deal_breakers) : {};
  const callerRole = caller.role ?? "seeker";
  const callerMarketplaceData = caller.marketplace_data ? JSON.parse(caller.marketplace_data) : {};

  // For asymmetric clusters, search for opposite role (unless peer role)
  let targetRole = callerRole;
  const isPeerRole = cluster?.peer_roles?.includes(callerRole);
  if (cluster && !cluster.symmetric && !isPeerRole) {
    if (verticalId === "marketplace") {
      targetRole = callerRole === "seller" ? "buyer" : "seller";
    } else {
      // Generic asymmetric: find the other role
      const clusterRoles = Object.keys(cluster.roles);
      const otherRoles = clusterRoles.filter(r => r !== callerRole && !cluster.peer_roles?.includes(r));
      if (otherRoles.length > 0) targetRole = otherRoles[0];
    }
  }

  // Build SQL with hard filters
  let sql = `
    SELECT u.* FROM users u
    WHERE u.protocol_version = ?
      AND u.user_token != ?
      AND u.status = 'active'
      AND u.user_token NOT IN (
        SELECT declined_token FROM declines
        WHERE decliner_token = ?
          AND (expiry_at IS NULL OR expiry_at > datetime('now'))
          AND reconsidered = 0
      )
  `;
  const params: unknown[] = [caller.protocol_version, input.user_token, input.user_token];

  // Cluster/vertical filter: match either vertical_id or primary_cluster
  sql += ` AND (u.vertical_id = ? OR u.primary_cluster = ?)`;
  params.push(verticalId, verticalId);

  if (cluster && !cluster.symmetric && !isPeerRole) {
    sql += ` AND u.role = ?`;
    params.push(targetRole);
  } else if (isPeerRole) {
    // Peer roles match same role
    sql += ` AND u.role = ?`;
    params.push(callerRole);
  }

  if (input.intent_filter) {
    sql += ` AND EXISTS (SELECT 1 FROM json_each(u.intent) WHERE value = ?)`;
    params.push(input.intent_filter);
  }
  if (input.city_filter) {
    sql += ` AND u.city = ?`;
    params.push(input.city_filter);
  }

  // Hard filters on structured attributes via user_attributes table
  if (input.hard_filters) {
    for (const [key, values] of Object.entries(input.hard_filters)) {
      const valArr = Array.isArray(values) ? values : [values];
      const placeholders = valArr.map(() => "?").join(",");
      sql += ` AND EXISTS (SELECT 1 FROM user_attributes ua WHERE ua.user_token = u.user_token AND ua.attr_key = ? AND ua.attr_value IN (${placeholders}))`;
      params.push(key, ...valArr);
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

  // Score candidates
  const scored: {
    user: UserRecord;
    score: number;
    yourFit: number;
    theirFit: number;
    intentSim: number;
    categories: string[];
    reputation: { score: number; verification_level: "anonymous" | "verified" | "attested"; interaction_count: number };
    stale: boolean;
  }[] = [];

  const now = Date.now();
  const STALE_DAYS = 180;

  for (const other of others) {
    let score: number;
    let categories: string[] = [];
    let intentSim = 0;

    const otherIntentEmbedding: number[] = other.intent_embedding ? JSON.parse(other.intent_embedding) : [];

    // Compute intent similarity if both have intent embeddings
    if (callerIntentEmbedding.length === 16 && otherIntentEmbedding.length === 16) {
      intentSim = cosineSimilarity16(callerIntentEmbedding, otherIntentEmbedding);
    }

    let yourFit = 0;
    let theirFit = 0;

    if (verticalId === "marketplace") {
      const otherMarketplaceData = other.marketplace_data ? JSON.parse(other.marketplace_data) : {};
      let matchResult;
      if (callerRole === "buyer" && other.role === "seller") {
        matchResult = computeMarketplaceMatch(otherMarketplaceData, callerMarketplaceData);
      } else if (callerRole === "seller" && other.role === "buyer") {
        matchResult = computeMarketplaceMatch(callerMarketplaceData, otherMarketplaceData);
      } else {
        continue;
      }
      score = matchResult.overall_score;
      yourFit = score;
      theirFit = score;
      categories = [`price_${matchResult.price_overlap_score.toFixed(2)}`, `category_${matchResult.category_match_score.toFixed(2)}`];
    } else {
      // Bidirectional scoring per spec §17.2
      const otherEmbedding: number[] = other.embedding ? JSON.parse(other.embedding) : [];
      const otherDealBreakers = other.deal_breakers ? JSON.parse(other.deal_breakers) : {};
      const traitResult = computeCompatibility(callerEmbedding, otherEmbedding);
      const traitSim = traitResult.overall_score; // already [0,1]
      const intentScore = (intentSim + 1) / 2; // Map [-1,1] → [0,1]

      // Directional fit: 40% trait + 20% intent + 20% pref (default=trait) + 10% deal-breaker + 10% collab (default=0.5)
      // A→B (your_fit): how well B fits what A is looking for
      const dealBreakerPassAB = checkDealBreakerPass(otherEmbedding, callerDealBreakers, other);
      yourFit = 0.40 * traitSim + 0.20 * intentScore + 0.20 * traitSim + 0.10 * dealBreakerPassAB + 0.10 * 0.5;

      // B→A (their_fit): how well A fits what B is looking for
      const dealBreakerPassBA = checkDealBreakerPass(callerEmbedding, otherDealBreakers, caller as UserRecord);
      theirFit = 0.40 * traitSim + 0.20 * intentScore + 0.20 * traitSim + 0.10 * dealBreakerPassBA + 0.10 * 0.5;

      // Combined = geometric mean
      score = Math.sqrt(yourFit * theirFit);

      categories = traitResult.shared_categories.map(sc => `${sc.direction}_${sc.dimension}`);
    }

    // Staleness penalty
    const lastReg = other.last_registered_at ? new Date(other.last_registered_at).getTime() : new Date(other.created_at).getTime();
    const ageDays = (now - lastReg) / (1000 * 60 * 60 * 24);
    const stale = ageDays > STALE_DAYS;
    if (ageDays > 90) {
      const penalty = Math.max(0.7, 1.0 - (ageDays - 90) / 300);
      score *= penalty;
    }

    if (score >= threshold) {
      const reputation = computeReputation(ctx.db, other.user_token, verticalId);
      if (input.min_reputation && reputation.score < input.min_reputation) continue;

      // Skip users with exclusive commitments
      if (cluster?.exclusive_commitment) {
        const commitments = ctx.db
          .prepare(`SELECT COUNT(*) as count FROM candidates WHERE (user_a_token = ? OR user_b_token = ?) AND (stage_a >= 4 OR stage_b >= 4)`)
          .get(other.user_token, other.user_token) as { count: number };
        if (commitments.count > 0) continue;
      }

      scored.push({
        user: other,
        score,
        yourFit,
        theirFit,
        intentSim,
        categories,
        reputation: { score: reputation.score, verification_level: reputation.verification_level, interaction_count: reputation.interaction_count },
        stale,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, topK);

  // Upsert candidate records with bidirectional scores
  const upsertCandidate = ctx.db.transaction(
    (callerToken: string, otherTokenVal: string, score: number, yourFit: number, theirFit: number, intentSim: number, categories: string, vertId: string) => {
      const { a, b } = orderTokens(callerToken, otherTokenVal);
      const side = callerToken === a ? "stage_a" : "stage_b";
      ctx.db
        .prepare(`INSERT OR IGNORE INTO candidates (id, user_a_token, user_b_token, vertical_id, score, shared_categories, intent_similarity, score_your_fit, score_their_fit, combined_score, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
        .run(randomUUID(), a, b, vertId, score, categories, intentSim, yourFit, theirFit, score);
      ctx.db
        .prepare(`UPDATE candidates SET ${side} = MAX(${side}, ?), score = ?, intent_similarity = ?, score_your_fit = ?, score_their_fit = ?, combined_score = ?, computed_at = datetime('now'), updated_at = datetime('now') WHERE user_a_token = ? AND user_b_token = ? AND vertical_id = ?`)
        .run(Stage.DISCOVERED, score, intentSim, yourFit, theirFit, score, a, b, vertId);
    }
  );

  const candidates: SearchCandidate[] = [];

  for (const item of topCandidates) {
    const categoriesJson = JSON.stringify(item.categories);
    upsertCandidate(input.user_token, item.user.user_token, item.score, item.yourFit, item.theirFit, item.intentSim, categoriesJson, verticalId);

    const { a, b } = orderTokens(input.user_token, item.user.user_token);
    const candidateRow = ctx.db
      .prepare("SELECT id, computed_at FROM candidates WHERE user_a_token = ? AND user_b_token = ? AND vertical_id = ?")
      .get(a, b, verticalId) as { id: string; computed_at: string };

    candidates.push({
      candidate_id: candidateRow.id,
      compatibility_score: quantize(item.score),
      your_fit: quantize(item.yourFit),
      their_fit: quantize(item.theirFit),
      combined_score: quantize(item.score),
      intent_similarity: quantize(item.intentSim),
      shared_categories: item.categories,
      intent: item.user.intent ? JSON.parse(item.user.intent) : [],
      city: item.user.city,
      age_range: item.user.age_range,
      reputation_score: quantize(item.reputation.score),
      verification_level: item.reputation.verification_level,
      interaction_count: item.reputation.interaction_count,
      stale: item.stale,
      computed_at: candidateRow.computed_at,
    });
  }

  const pendingActions = ctx.db
    .prepare("SELECT candidate_id, action_type FROM pending_actions WHERE user_token = ? AND consumed_at IS NULL")
    .all(input.user_token) as Array<{ candidate_id: string; action_type: string }>;

  const result: SearchOutput = {
    candidates,
    total_scanned: others.length,
    total_matches: scored.length,
    pending_actions: pendingActions.length > 0 ? pendingActions : undefined,
  };

  if (input.idempotency_key) {
    ctx.db
      .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
      .run(input.idempotency_key, "search", input.user_token, JSON.stringify(result));
  }

  return { ok: true, data: result };
}
