import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  Trait,
  Preference,
  Capability,
  UserRecord,
  TraitRecord,
  PreferenceRecord,
  CandidateRecord,
} from "../types.js";
import {
  Stage,
  orderTokens,
  evaluatePreference,
  VERIFICATION_TRUST,
} from "../types.js";

// ─── Input / Output Types ────────────────────────────────────────────

export interface SearchInput {
  user_token: string;
  cluster_id?: string;
  top_k?: number;
  threshold?: number;
}

export interface PreferenceSatisfactionDetail {
  satisfied: boolean;
  score: number;
  candidate_value: unknown;
  missing: boolean;
}

export interface MatchExplanation {
  summary: string;
  strong_matches: string[];
  partial_matches: string[];
  mismatches: string[];
}

export interface VerificationSummary {
  total_traits: number;
  unverified: number;
  self_verified: number;
  cross_verified: number;
  authority_verified: number;
  overall_trust: number;
}

export interface SearchResult {
  candidate_id: string;
  advisory_score: number;
  your_fit: number;
  their_fit: number;
  intent_similarity: number | null;
  preference_satisfaction: Record<string, PreferenceSatisfactionDetail>;
  match_explanation: MatchExplanation;
  visible_traits: Trait[];
  intents: string[];
  agent_capabilities: Capability[];
  reputation_score: number;
  verification_summary: VerificationSummary;
  funnel_mode: string;
  group_size: number | null;
  group_filled: number | null;
  stale: boolean;
  computed_at: string;
}

export interface PendingAction {
  candidate_id: string;
  action_type: string;
}

export interface RankingExplanation {
  model_tier: "prior";
  adjustments: never[];
  outcome_basis: 0;
}

export interface SearchOutput {
  candidates: SearchResult[];
  total_scanned: number;
  total_matches: number;
  ranking_explanation: RankingExplanation;
  next_cursor: null;
  pending_actions: PendingAction[];
  nl_parsed: null;
}

// ─── Helper Functions ────────────────────────────────────────────────

/** Round n to dp decimal places */
function quantize(n: number, dp: number): number {
  const factor = Math.pow(10, dp);
  return Math.round(n * factor) / factor;
}

/** Cosine similarity between two equal-length vectors, returns [-1, 1] */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function formatTraitKey(key: string): string {
  return key.replace(/_/g, " ");
}

function buildMatchExplanation(
  satisfaction: Record<string, PreferenceSatisfactionDetail>,
): MatchExplanation {
  const strong_matches: string[] = [];
  const partial_matches: string[] = [];
  const mismatches: string[] = [];

  for (const [traitKey, detail] of Object.entries(satisfaction)) {
    const label = formatTraitKey(traitKey);
    if (detail.missing) {
      mismatches.push(label);
      continue;
    }
    if (detail.satisfied) {
      if (detail.score >= 0.8) {
        strong_matches.push(label);
      } else if (detail.score > 0) {
        partial_matches.push(label);
      } else {
        mismatches.push(label);
      }
    } else {
      mismatches.push(label);
    }
  }

  const summaryParts: string[] = [];
  if (strong_matches.length > 0) {
    summaryParts.push(`Strong: ${strong_matches.join(", ")}.`);
  }
  if (partial_matches.length > 0) {
    summaryParts.push(`Partial: ${partial_matches.join(", ")}.`);
  }
  if (mismatches.length > 0) {
    summaryParts.push(`Mismatch: ${mismatches.join(", ")}.`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push("No preference signals.");
  }

  return {
    summary: summaryParts.join(" "),
    strong_matches,
    partial_matches,
    mismatches,
  };
}

interface FitResult {
  fit: number;
  satisfaction: Record<string, PreferenceSatisfactionDetail>;
}

/**
 * Compute how well a set of candidate traits satisfies a list of preferences.
 * Hard filters (weight=1.0) that fail return null to signal exclusion.
 * Soft preferences (weight<1.0) contribute a weighted score.
 */
function computePreferenceFit(
  preferences: Preference[],
  candidateTraits: Map<string, unknown>,
): { excluded: true } | FitResult {
  const satisfaction: Record<string, PreferenceSatisfactionDetail> = {};

  let weightedSum = 0;
  let totalWeight = 0;

  for (const pref of preferences) {
    const hasTrait = candidateTraits.has(pref.trait_key);
    const traitValue = candidateTraits.get(pref.trait_key);
    const traitMissing =
      !hasTrait || traitValue === null || traitValue === undefined;

    const { pass, score } = evaluatePreference(pref, traitValue, traitMissing);

    satisfaction[pref.trait_key] = {
      satisfied: pass,
      score,
      candidate_value: hasTrait ? traitValue : null,
      missing: traitMissing,
    };

    // Hard filter: weight === 1.0 and failed → exclude candidate
    if (pref.weight === 1.0 && !pass) {
      return { excluded: true };
    }

    // Soft preference: weight < 1.0
    if (pref.weight < 1.0) {
      if (traitMissing) {
        continue;
      }
      weightedSum += score * pref.weight;
      totalWeight += pref.weight;
    }
  }

  const fit = totalWeight > 0 ? weightedSum / totalWeight : 1.0;
  return { fit: Math.max(0, Math.min(1, fit)), satisfaction };
}

/** Parse JSON-encoded trait value; returns undefined on failure */
function parseTraitValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Convert TraitRecord rows into a Map<key, parsed-value> and an array of Trait objects */
function buildTraitMap(rows: TraitRecord[]): {
  traitMap: Map<string, unknown>;
  traits: Trait[];
} {
  const traitMap = new Map<string, unknown>();
  const traits: Trait[] = [];

  for (const row of rows) {
    const value = parseTraitValue(row.value);
    traitMap.set(row.key, value);
    traits.push({
      key: row.key,
      value: value as Trait["value"],
      value_type: row.value_type as Trait["value_type"],
      visibility: row.visibility as Trait["visibility"],
      verification: row.verification as Trait["verification"],
      display_name: row.display_name ?? undefined,
      category: row.category ?? undefined,
      enum_values: row.enum_values
        ? (JSON.parse(row.enum_values) as string[])
        : undefined,
    });
  }

  return { traitMap, traits };
}

/** Parse a JSON-encoded preference value */
function parsePreferenceValue(
  raw: string,
): string | number | boolean | string[] | number[] {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Convert PreferenceRecord rows into Preference objects */
function buildPreferences(rows: PreferenceRecord[]): Preference[] {
  return rows.map((row) => ({
    trait_key: row.trait_key,
    operator: row.operator as Preference["operator"],
    value: parsePreferenceValue(row.value),
    weight: row.weight,
    label: row.label ?? undefined,
  }));
}

/** Compute verification summary for a candidate's traits */
function buildVerificationSummary(traits: Trait[]): VerificationSummary {
  const summary: VerificationSummary = {
    total_traits: traits.length,
    unverified: 0,
    self_verified: 0,
    cross_verified: 0,
    authority_verified: 0,
    overall_trust: 0,
  };

  if (traits.length === 0) {
    return summary;
  }

  let trustSum = 0;

  for (const trait of traits) {
    const tier = trait.verification ?? "unverified";
    switch (tier) {
      case "unverified":
        summary.unverified++;
        break;
      case "self_verified":
        summary.self_verified++;
        break;
      case "cross_verified":
        summary.cross_verified++;
        break;
      case "authority_verified":
        summary.authority_verified++;
        break;
    }
    trustSum += VERIFICATION_TRUST[tier as keyof typeof VERIFICATION_TRUST] ?? 0;
  }

  summary.overall_trust = quantize(trustSum / traits.length, 4);
  return summary;
}

// ─── Main Handler ────────────────────────────────────────────────────

export async function handleSearch(
  input: SearchInput,
  ctx: HandlerContext,
): Promise<HandlerResult<SearchOutput>> {
  const { db } = ctx;

  // ── 1. Validate input ────────────────────────────────────────────

  if (!input.user_token) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "user_token is required",
        hint: "You get a user_token when you register. Easier: use POST /schelling/quick_seek with an 'intent' string — it auto-registers.",
      },
    };
  }

  const topK = Math.min(input.top_k ?? 50, 200);
  const threshold = Math.max(0.0, Math.min(1.0, input.threshold ?? 0.0));

  const caller = db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  if (caller.status !== "active") {
    return {
      ok: false,
      error: {
        code: caller.status === "paused" ? "USER_PAUSED" : "USER_SUSPENDED",
        message: `User account is ${caller.status}`,
      },
    };
  }

  const clusterId = input.cluster_id ?? caller.cluster_id;

  // ── 2. Find candidates ───────────────────────────────────────────

  // Active users in the cluster, excluding self and users caller has declined
  const candidateUsers = db
    .prepare(
      `SELECT * FROM users
       WHERE cluster_id = ?
         AND status = 'active'
         AND user_token != ?
         AND user_token NOT IN (
           SELECT declined_token FROM declines
           WHERE decliner_token = ?
             AND (permanent = 1 OR (expires_at IS NOT NULL AND expires_at > datetime('now')))
         )`,
    )
    .all(clusterId, input.user_token, input.user_token) as UserRecord[];

  const totalScanned = candidateUsers.length;

  // ── 3. Load caller's preferences and traits ──────────────────────

  const callerPrefRows = db
    .prepare("SELECT * FROM preferences WHERE user_token = ?")
    .all(input.user_token) as PreferenceRecord[];

  const callerPreferences = buildPreferences(callerPrefRows);

  const callerTraitRows = db
    .prepare("SELECT * FROM traits WHERE user_token = ?")
    .all(input.user_token) as TraitRecord[];

  const { traitMap: callerTraitMap } = buildTraitMap(callerTraitRows);

  // Parse caller intent embedding once
  const callerIntentEmbedding: number[] | null = caller.intent_embedding
    ? (JSON.parse(caller.intent_embedding) as number[])
    : null;

  // ── 4. Score each candidate ──────────────────────────────────────

  interface ScoredCandidate {
    user: UserRecord;
    advisory_score: number;
    your_fit: number;
    their_fit: number;
    intent_similarity: number | null;
    satisfaction: Record<string, PreferenceSatisfactionDetail>;
    publicTraits: Trait[];
    allTraits: Trait[];
  }

  const scored: ScoredCandidate[] = [];

  for (const candidate of candidateUsers) {
    // Load candidate traits
    const candidateTraitRows = db
      .prepare("SELECT * FROM traits WHERE user_token = ?")
      .all(candidate.user_token) as TraitRecord[];

    const { traitMap: candidateTraitMap, traits: candidateTraits } =
      buildTraitMap(candidateTraitRows);

    // ── a. Hard filter + soft scoring: your_fit ──────────────────

    const yourFitResult = computePreferenceFit(
      callerPreferences,
      candidateTraitMap,
    );

    if ("excluded" in yourFitResult) {
      // Hard filter failed — skip this candidate entirely
      continue;
    }

    const yourFit = yourFitResult.fit;
    const satisfaction = yourFitResult.satisfaction;

    // ── b. their_fit: how well caller satisfies candidate's prefs ─

    const candidatePrefRows = db
      .prepare("SELECT * FROM preferences WHERE user_token = ?")
      .all(candidate.user_token) as PreferenceRecord[];

    const candidatePreferences = buildPreferences(candidatePrefRows);

    const theirFitResult = computePreferenceFit(
      candidatePreferences,
      callerTraitMap,
    );

    // If candidate's hard filters exclude caller, we still include but note low their_fit
    const theirFit =
      "excluded" in theirFitResult ? 0.0 : theirFitResult.fit;

    // ── c. advisory_score: geometric mean ─────────────────────────

    let advisoryScore = Math.sqrt(yourFit * theirFit);

    // ── d. Intent similarity ───────────────────────────────────────

    let intentSimilarity: number | null = null;

    if (callerIntentEmbedding && candidate.intent_embedding) {
      const candidateIntentEmbedding = JSON.parse(
        candidate.intent_embedding,
      ) as number[];

      const rawSim = cosineSimilarity(
        callerIntentEmbedding,
        candidateIntentEmbedding,
      );
      // Map [-1,1] → [0,1]
      intentSimilarity = (rawSim + 1) / 2;

      // Blend into advisory score
      advisoryScore = 0.7 * advisoryScore + 0.3 * intentSimilarity;
    }

    // Apply threshold
    if (advisoryScore < threshold) {
      continue;
    }

    // Visible traits: only "public" visibility at DISCOVERED stage
    const publicTraits = candidateTraits.filter(
      (t) => t.visibility === "public",
    );

    scored.push({
      user: candidate,
      advisory_score: advisoryScore,
      your_fit: yourFit,
      their_fit: theirFit,
      intent_similarity: intentSimilarity,
      satisfaction,
      publicTraits,
      allTraits: candidateTraits,
    });
  }

  // ── 5. Rank and truncate ─────────────────────────────────────────

  scored.sort((a, b) => b.advisory_score - a.advisory_score);
  const totalMatches = scored.length;
  const topCandidates = scored.slice(0, topK);

  // ── 6. Upsert candidate records and build response ───────────────

  // Fetch existing candidate records in bulk so we can check existing stages
  // We need user_a_token, user_b_token pairs ordered correctly
  const results: SearchResult[] = [];

  const upsertStmt = db.prepare(
    `INSERT INTO candidates
       (id, user_a_token, user_b_token, cluster_id, funnel_mode,
        score, fit_a, fit_b, intent_similarity, stage_a, stage_b)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_a_token, user_b_token, cluster_id) DO UPDATE SET
       score = excluded.score,
       fit_a = excluded.fit_a,
       fit_b = excluded.fit_b,
       intent_similarity = excluded.intent_similarity,
       updated_at = datetime('now')`,
  );

  const discoverStmtA = db.prepare(
    `UPDATE candidates
     SET stage_a = MAX(stage_a, ?), updated_at = datetime('now')
     WHERE user_a_token = ? AND user_b_token = ? AND cluster_id = ?`,
  );

  const discoverStmtB = db.prepare(
    `UPDATE candidates
     SET stage_b = MAX(stage_b, ?), updated_at = datetime('now')
     WHERE user_a_token = ? AND user_b_token = ? AND cluster_id = ?`,
  );

  const fetchCandidateStmt = db.prepare(
    `SELECT * FROM candidates
     WHERE user_a_token = ? AND user_b_token = ? AND cluster_id = ?`,
  );

  // Compute group_filled counts once if needed
  const groupFilledCache = new Map<string, number>();

  function getGroupFilled(clusterId: string, callerToken: string): number | null {
    // group_filled = number of CONNECTED slots in this cluster for the caller
    // Only meaningful if funnel_mode = 'group'
    const cacheKey = `${clusterId}:${callerToken}`;
    if (groupFilledCache.has(cacheKey)) {
      return groupFilledCache.get(cacheKey)!;
    }
    const row = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM candidates
         WHERE cluster_id = ?
           AND (user_a_token = ? OR user_b_token = ?)
           AND stage_a = ? AND stage_b = ?`,
      )
      .get(clusterId, callerToken, callerToken, Stage.CONNECTED, Stage.CONNECTED) as {
      cnt: number;
    };
    const count = row?.cnt ?? 0;
    groupFilledCache.set(cacheKey, count);
    return count;
  }

  const computedAt = new Date().toISOString();

  const doUpsert = db.transaction(() => {
    for (const item of topCandidates) {
      const { a, b } = orderTokens(input.user_token, item.user.user_token);
      const callerIsA = input.user_token === a;

      // fit_a = how well B fits A's prefs, fit_b = how well A fits B's prefs
      const fitA = callerIsA ? item.your_fit : item.their_fit;
      const fitB = callerIsA ? item.their_fit : item.your_fit;

      upsertStmt.run(
        randomUUID(),
        a,
        b,
        clusterId,
        item.user.funnel_mode,
        item.advisory_score,
        fitA,
        fitB,
        item.intent_similarity,
        Stage.UNDISCOVERED,
        Stage.UNDISCOVERED,
      );

      // Advance caller's side to DISCOVERED if currently UNDISCOVERED
      if (callerIsA) {
        discoverStmtA.run(Stage.DISCOVERED, a, b, clusterId);
      } else {
        discoverStmtB.run(Stage.DISCOVERED, a, b, clusterId);
      }
    }
  });

  doUpsert();

  // Build response objects
  for (const item of topCandidates) {
    const { a, b } = orderTokens(input.user_token, item.user.user_token);

    const candidateRow = fetchCandidateStmt.get(a, b, clusterId) as
      | CandidateRecord
      | undefined;

    const candidateId = candidateRow?.id ?? randomUUID();

    // Reputation score: simple cold-start from outcomes in reputation_events
    const repRow = db
      .prepare(
        `SELECT AVG(CASE rating
                  WHEN 'positive' THEN 1.0
                  WHEN 'neutral'  THEN 0.5
                  WHEN 'negative' THEN 0.0
                  ELSE 0.5
                END) as avg_score,
                COUNT(*) as cnt
         FROM reputation_events
         WHERE identity_id = ? AND cluster_id = ?`,
      )
      .get(item.user.user_token, clusterId) as {
      avg_score: number | null;
      cnt: number;
    };

    const reputationScore =
      repRow && repRow.cnt > 0 ? quantize(repRow.avg_score ?? 0.5, 4) : 0.5;

    // Verification summary uses all of the candidate's traits
    const verificationSummary = buildVerificationSummary(item.allTraits);

    // Parse intents
    const intents: string[] = item.user.intents
      ? (JSON.parse(item.user.intents) as string[])
      : [];

    // Parse agent_capabilities
    const agentCapabilities: Capability[] = item.user.agent_capabilities
      ? (JSON.parse(item.user.agent_capabilities) as Capability[])
      : [];

    // group_filled: only relevant for group mode
    const isGroup = item.user.funnel_mode === "group";
    const groupFilled = isGroup
      ? getGroupFilled(clusterId, item.user.user_token)
      : null;

    // stale: candidate record last updated > 24h ago
    const stale = candidateRow
      ? Date.now() - new Date(candidateRow.updated_at).getTime() >
        24 * 60 * 60 * 1000
      : false;

    const matchExplanation = buildMatchExplanation(item.satisfaction);

    results.push({
      candidate_id: candidateId,
      advisory_score: quantize(item.advisory_score, 2),
      your_fit: quantize(item.your_fit, 2),
      their_fit: quantize(item.their_fit, 2),
      intent_similarity:
        item.intent_similarity !== null
          ? quantize(item.intent_similarity, 2)
          : null,
      preference_satisfaction: item.satisfaction,
      match_explanation: matchExplanation,
      visible_traits: item.publicTraits,
      intents,
      agent_capabilities: agentCapabilities,
      reputation_score: reputationScore,
      verification_summary: verificationSummary,
      funnel_mode: item.user.funnel_mode,
      group_size: item.user.group_size ?? null,
      group_filled: groupFilled,
      stale,
      computed_at: computedAt,
    });
  }

  // ── 7. Pending actions ───────────────────────────────────────────

  const pendingActionRows = db
    .prepare(
      `SELECT candidate_id, action_type FROM pending_actions
       WHERE user_token = ? AND consumed_at IS NULL`,
    )
    .all(input.user_token) as Array<{
    candidate_id: string;
    action_type: string;
  }>;

  const pendingActions: PendingAction[] = pendingActionRows.map((row) => ({
    candidate_id: row.candidate_id,
    action_type: row.action_type,
  }));

  // ── 8. Return ────────────────────────────────────────────────────

  return {
    ok: true,
    data: {
      candidates: results,
      total_scanned: totalScanned,
      total_matches: totalMatches,
      ranking_explanation: {
        model_tier: "prior",
        adjustments: [],
        outcome_basis: 0,
      },
      next_cursor: null,
      pending_actions: pendingActions,
      nl_parsed: null,
    },
  };
}
