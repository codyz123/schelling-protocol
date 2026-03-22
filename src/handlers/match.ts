import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { authenticateAgent, extractApiKey, safeJsonParse } from "./submit.js";

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_ALPHA = 0.6;  // weight for cross-embedding score
const DEFAULT_BETA = 0.3;   // weight for tool satisfaction score
const DEFAULT_GAMMA = 0.1;  // weight for reputation factor
const DEFAULT_W_AB = 0.5;   // directional weight: A.ask vs B.offer
const DEFAULT_W_BA = 0.5;   // directional weight: B.ask vs A.offer
const DEFAULT_MIN_SCORE = 0.3;
const DEFAULT_TOP_K = 50;
const MAX_TOP_K = 200;
const MAX_MATCHES_PER_HOUR = 60;

// ─── Math Utilities ───────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Tool Satisfaction Scoring ────────────────────────────────────────

/**
 * Compute tool satisfaction between two submissions' structured data.
 * For each tool both submissions have filled, computes field-level similarity.
 * Returns 0 if no shared tools.
 */
function computeToolSatisfaction(
  structuredA: Record<string, any> | null,
  structuredB: Record<string, any> | null,
): number {
  if (!structuredA || !structuredB) return 0;

  const toolsA = Object.keys(structuredA);
  const toolsB = new Set(Object.keys(structuredB));
  const sharedTools = toolsA.filter((t) => toolsB.has(t));

  if (sharedTools.length === 0) return 0;

  let totalScore = 0;
  for (const toolId of sharedTools) {
    const dataA = structuredA[toolId];
    const dataB = structuredB[toolId];
    if (typeof dataA !== "object" || typeof dataB !== "object") continue;
    totalScore += computeFieldSatisfaction(dataA, dataB);
  }

  return totalScore / sharedTools.length;
}

/**
 * Compare two filled tool records field by field.
 * Returns a satisfaction score in [0, 1].
 */
export function computeFieldSatisfaction(
  a: Record<string, any>,
  b: Record<string, any>,
): number {
  const keysA = Object.keys(a);
  const keysB = new Set(Object.keys(b));
  const sharedKeys = keysA.filter((k) => keysB.has(k));

  if (sharedKeys.length === 0) {
    return 0.1;
  }

  let totalFieldScore = 0;
  for (const key of sharedKeys) {
    totalFieldScore += fieldScore(a[key], b[key]);
  }

  return totalFieldScore / sharedKeys.length;
}

/**
 * Score how well two field values match.
 * Handles numbers, strings, booleans, and arrays.
 */
function fieldScore(va: unknown, vb: unknown): number {
  if (va === null || vb === null || va === undefined || vb === undefined) return 0;

  // Arrays: Jaccard similarity
  if (Array.isArray(va) && Array.isArray(vb)) {
    const setA = new Set(va.map(String));
    const setB = new Set(vb.map(String));
    const intersection = [...setA].filter((x) => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  // Numeric range objects: { min, max } overlap scoring
  if (
    typeof va === "object" && typeof vb === "object" &&
    !Array.isArray(va) && !Array.isArray(vb)
  ) {
    const objA = va as Record<string, any>;
    const objB = vb as Record<string, any>;
    if (
      typeof objA.min === "number" && typeof objA.max === "number" &&
      typeof objB.min === "number" && typeof objB.max === "number"
    ) {
      const overlapMin = Math.max(objA.min, objB.min);
      const overlapMax = Math.min(objA.max, objB.max);
      if (overlapMin > overlapMax) return 0;
      const overlapSize = overlapMax - overlapMin;
      const unionSize = Math.max(objA.max, objB.max) - Math.min(objA.min, objB.min);
      return unionSize === 0 ? 1 : overlapSize / unionSize;
    }
    return computeFieldSatisfaction(objA, objB);
  }

  if (typeof va === "string" && typeof vb === "string") {
    if (va === vb) return 1;
    if (va.toLowerCase() === vb.toLowerCase()) return 0.9;
    return 0;
  }

  if (typeof va === "number" && typeof vb === "number") {
    if (va === vb) return 1;
    const diff = Math.abs(va - vb);
    const avg = (Math.abs(va) + Math.abs(vb)) / 2;
    if (avg === 0) return 0;
    return Math.max(0, 1 - diff / avg);
  }

  if (typeof va === "boolean" && typeof vb === "boolean") {
    return va === vb ? 1 : 0;
  }

  return String(va) === String(vb) ? 1 : 0;
}

// ─── Cross-Match Scoring ──────────────────────────────────────────────

interface CrossMatchResult {
  submission_id: string;
  agent_id: string;
  intent_text: string;
  score: number;
  ask_offer_sim_ab: number;
  ask_offer_sim_ba: number;
  tool_satisfaction: number;
  score_breakdown: {
    cross_score: number;
    tool_score: number;
    reputation_factor: number;
    alpha: number;
    beta: number;
    gamma: number;
  };
}

// ─── Match Handler ────────────────────────────────────────────────────

export interface MatchInput {
  agent_api_key?: string;
  submission_id: string;
  top_k?: number;
  min_score?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export interface MatchOutput {
  submission_id: string;
  candidates: CrossMatchResult[];
  total_evaluated: number;
  threshold_used: number;
  weights: { alpha: number; beta: number; gamma: number };
}

export async function handleMatch(
  params: MatchInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<MatchOutput>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);

  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.submission_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "submission_id is required." } };
  }

  // Rate limit: max 60 match calls per hour
  const matchesThisHour = (ctx.db
    .prepare("SELECT COUNT(*) as c FROM v4_rate_events WHERE agent_id = ? AND action = 'match' AND created_at >= datetime('now', '-1 hour')")
    .get(agent.id) as { c: number }).c;
  if (matchesThisHour >= MAX_MATCHES_PER_HOUR) {
    return {
      ok: false,
      error: { code: "RATE_LIMITED", message: `Maximum ${MAX_MATCHES_PER_HOUR} match calls per hour per agent.` },
    };
  }

  // Fetch the requesting submission
  const sub = ctx.db
    .prepare(
      `SELECT id, agent_id, intent_embedding, identity_embedding, structured_data, required_tools
       FROM submissions WHERE id = ? AND agent_id = ? AND status = 'active'`,
    )
    .get(params.submission_id, agent.id) as Record<string, any> | undefined;

  if (!sub) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Submission not found, not owned by this agent, or not active." },
    };
  }

  const intentA: number[] = safeJsonParse(sub.intent_embedding, []);
  const identityA: number[] | null = sub.identity_embedding ? safeJsonParse(sub.identity_embedding, null) : null;
  const structuredA: Record<string, any> | null = sub.structured_data ? safeJsonParse(sub.structured_data, null) : null;
  const requiredToolsA: string[] = sub.required_tools ? safeJsonParse(sub.required_tools, []) : [];

  // Resolve weights (request params > defaults)
  const rawAlpha = params.alpha ?? DEFAULT_ALPHA;
  const rawBeta = params.beta ?? DEFAULT_BETA;
  const rawGamma = params.gamma ?? DEFAULT_GAMMA;

  // Reject negative weights; clamp each to [0.0, 1.0]
  if (rawAlpha < 0 || rawBeta < 0 || rawGamma < 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "alpha, beta, and gamma must each be >= 0." } };
  }
  const clampedAlpha = Math.min(rawAlpha, 1.0);
  const clampedBeta = Math.min(rawBeta, 1.0);
  const clampedGamma = Math.min(rawGamma, 1.0);

  const minScore = params.min_score ?? DEFAULT_MIN_SCORE;
  const topK = Math.max(1, Math.min(params.top_k ?? DEFAULT_TOP_K, MAX_TOP_K));

  // Directional weights for cross-score formula
  const wAb: number = DEFAULT_W_AB;
  const wBa: number = DEFAULT_W_BA;
  const wDirectionalSum = wAb + wBa;

  // Normalize composite weights — guard against zero sum
  const weightSum = clampedAlpha + clampedBeta + clampedGamma;
  const safeWeightSum = weightSum > 0 ? weightSum : DEFAULT_ALPHA + DEFAULT_BETA + DEFAULT_GAMMA;
  const effectiveAlpha = weightSum > 0 ? clampedAlpha : DEFAULT_ALPHA;
  const effectiveBeta = weightSum > 0 ? clampedBeta : DEFAULT_BETA;
  const effectiveGamma = weightSum > 0 ? clampedGamma : DEFAULT_GAMMA;
  const wAlpha = effectiveAlpha / safeWeightSum;
  const wBeta = effectiveBeta / safeWeightSum;
  const wGamma = effectiveGamma / safeWeightSum;

  // Fetch all active submissions from other agents (specific columns only)
  const now = new Date().toISOString();
  const candidates = ctx.db
    .prepare(
      `SELECT s.id, s.agent_id, s.intent_text, s.intent_embedding, s.identity_embedding,
              s.structured_data, s.required_tools, a.reputation_score
       FROM submissions s
       JOIN v4_agents a ON s.agent_id = a.id
       WHERE s.status = 'active'
         AND s.expires_at > ?
         AND s.agent_id != ?`,
    )
    .all(now, agent.id) as Record<string, any>[];

  const results: CrossMatchResult[] = [];

  for (const candSub of candidates) {
    // Parse candidate embeddings with safe JSON parsing
    const intentB: number[] | null = safeJsonParse(candSub.intent_embedding, null);
    const identityB: number[] | null = candSub.identity_embedding ? safeJsonParse(candSub.identity_embedding, null) : null;
    if (!intentB) continue; // malformed row — skip

    const structuredB: Record<string, any> | null = candSub.structured_data
      ? safeJsonParse(candSub.structured_data, null)
      : null;

    // ── Required-tools gate ──────────────────────────────────────────
    // A requires certain tools to be filled by B, and vice versa.
    const requiredToolsB: string[] = candSub.required_tools ? safeJsonParse(candSub.required_tools, []) : [];
    let requiredToolsMet = true;

    for (const toolId of requiredToolsA) {
      if (!structuredB || !structuredB[toolId]) {
        requiredToolsMet = false;
        break;
      }
    }
    if (requiredToolsMet) {
      for (const toolId of requiredToolsB) {
        if (!structuredA || !structuredA[toolId]) {
          requiredToolsMet = false;
          break;
        }
      }
    }

    // Skip candidates that don't satisfy required-tool disclosure gates
    if (!requiredToolsMet) continue;

    // ── Cross-match scoring (spec formula) ───────────────────────────
    // simAB = cosine(A.intent, B.identity) — does B's identity match A's intent?
    // simBA = cosine(B.intent, A.identity) — does A's identity match B's intent?
    // cross_score = (w_ab * max(0, simAB) + w_ba * max(0, simBA)) / (w_ab + w_ba)
    const simAB = identityB ? Math.max(0, cosine(intentA, identityB)) : 0;
    const simBA = identityA ? Math.max(0, cosine(intentB, identityA)) : 0;

    let crossScore: number;
    if (identityA || identityB) {
      crossScore = (wAb * simAB + wBa * simBA) / wDirectionalSum;
    } else {
      // Serendipity fallback: neither submission has an identity embedding
      crossScore = Math.max(0, cosine(intentA, intentB));
    }

    // ── Cross-score threshold filter (spec step 2) ───────────────────
    // Filter first on cross_score >= threshold before computing composite
    if (crossScore < minScore) continue;

    // ── Tool satisfaction score ───────────────────────────────────────
    const toolScore = computeToolSatisfaction(structuredA, structuredB);

    // ── Reputation factor ─────────────────────────────────────────────
    const reputationFactor = candSub.reputation_score ?? 0.5;

    // ── Composite score (for ranking) ────────────────────────────────
    const composite = wAlpha * crossScore + wBeta * toolScore + wGamma * reputationFactor;

    results.push({
      submission_id: candSub.id,
      agent_id: candSub.agent_id,
      intent_text: candSub.intent_text,
      score: Math.round(composite * 10000) / 10000,
      ask_offer_sim_ab: Math.round(simAB * 10000) / 10000,
      ask_offer_sim_ba: Math.round(simBA * 10000) / 10000,
      tool_satisfaction: Math.round(toolScore * 10000) / 10000,
      score_breakdown: {
        cross_score: Math.round(crossScore * 10000) / 10000,
        tool_score: Math.round(toolScore * 10000) / 10000,
        reputation_factor: Math.round(reputationFactor * 10000) / 10000,
        alpha: wAlpha,
        beta: wBeta,
        gamma: wGamma,
      },
    });
  }

  // Sort by composite score descending and take top-K
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, topK);

  // Persist candidate records for surfaced pairs
  const runTx = ctx.db.transaction(() => {
    const insertCandidate = ctx.db.prepare(
      `INSERT INTO submission_candidates (
        id, submission_a_id, submission_b_id,
        score, ask_offer_sim_ab, ask_offer_sim_ba, tool_satisfaction,
        stage_a, stage_b, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
      ON CONFLICT(submission_a_id, submission_b_id) DO UPDATE SET
        score = excluded.score,
        ask_offer_sim_ab = excluded.ask_offer_sim_ab,
        ask_offer_sim_ba = excluded.ask_offer_sim_ba,
        tool_satisfaction = excluded.tool_satisfaction,
        updated_at = excluded.updated_at`,
    );

    const now2 = new Date().toISOString();
    for (const r of topResults) {
      const [idA, idB] =
        params.submission_id < r.submission_id
          ? [params.submission_id, r.submission_id]
          : [r.submission_id, params.submission_id];

      insertCandidate.run(
        randomUUID(),
        idA, idB,
        r.score, r.ask_offer_sim_ab, r.ask_offer_sim_ba, r.tool_satisfaction,
        now2, now2,
      );
    }
  });

  try {
    runTx();
  } catch {
    // Candidate persistence is best-effort — don't fail the match
  }

  // Record rate event
  try {
    ctx.db
      .prepare("INSERT INTO v4_rate_events (agent_id, action, created_at) VALUES (?, 'match', ?)")
      .run(agent.id, now);
  } catch {
    // Rate event recording is best-effort
  }

  return {
    ok: true,
    data: {
      submission_id: params.submission_id,
      candidates: topResults,
      total_evaluated: candidates.length,
      threshold_used: minScore,
      weights: { alpha: wAlpha, beta: wBeta, gamma: wGamma },
    },
  };
}
