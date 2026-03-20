import type { HandlerContext, HandlerResult } from "../types.js";
import { authenticateAgent, extractApiKey, safeJsonParse } from "./submit.js";
import { computeFieldSatisfaction } from "./match.js";

// ─── Constants ────────────────────────────────────────────────────────

const MAX_INSIGHTS_PER_HOUR = 60;
const DEFAULT_W_AB = 0.5;
const DEFAULT_W_BA = 0.5;

// ─── Helpers ──────────────────────────────────────────────────────────

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

// ─── Market Insights Handler ──────────────────────────────────────────

export interface MarketInsightsInput {
  agent_api_key?: string;
  submission_id: string;
  threshold?: number;
  alt_threshold?: number;
  alt_required_tool?: string;
}

export interface ToolCoverageEntry {
  adoption_rate: number;
  avg_satisfaction_boost: number;
}

export interface MarketInsightsOutput {
  submission_id: string;
  pool_size: number;
  estimated_matches: number;
  avg_cross_score: number;
  tool_coverage: Record<string, ToolCoverageEntry>;
  selectivity_analysis: {
    current_pool: number;
    if_required_tool_added: number | null;
    if_threshold_raised_to: number;
    alt_threshold_used: number;
  };
  generated_at: string;
}

export async function handleMarketInsights(
  params: MarketInsightsInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<MarketInsightsOutput>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);

  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.submission_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "submission_id is required." } };
  }

  // Rate limit: max 60 insights calls per hour
  const insightsThisHour = (ctx.db
    .prepare("SELECT COUNT(*) as c FROM v4_rate_events WHERE agent_id = ? AND action = 'market_insights' AND created_at >= datetime('now', '-1 hour')")
    .get(agent.id) as { c: number }).c;
  if (insightsThisHour >= MAX_INSIGHTS_PER_HOUR) {
    return {
      ok: false,
      error: { code: "RATE_LIMITED", message: `Maximum ${MAX_INSIGHTS_PER_HOUR} market_insights calls per hour per agent.` },
    };
  }

  const sub = ctx.db
    .prepare(
      `SELECT id, ask_embedding, offer_embedding, structured_data, required_tools, match_config
       FROM submissions WHERE id = ? AND agent_id = ?`,
    )
    .get(params.submission_id, agent.id) as Record<string, any> | undefined;

  if (!sub) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Submission not found or not owned by this agent." },
    };
  }

  const threshold = params.threshold ?? 0.3;
  const altThreshold = params.alt_threshold ?? 0.5;

  const askA: number[] = safeJsonParse(sub.ask_embedding, []);
  const offerA: number[] | null = sub.offer_embedding ? safeJsonParse(sub.offer_embedding, null) : null;
  const structuredA: Record<string, any> | null = sub.structured_data ? safeJsonParse(sub.structured_data, null) : null;

  // Load match_config for directional weights (same as match.ts)
  const matchConfig: Record<string, any> = sub.match_config ? safeJsonParse(sub.match_config, {}) : {};
  const wAb: number = (typeof matchConfig.w_ab === "number" && matchConfig.w_ab > 0) ? matchConfig.w_ab : DEFAULT_W_AB;
  const wBa: number = (typeof matchConfig.w_ba === "number" && matchConfig.w_ba > 0) ? matchConfig.w_ba : DEFAULT_W_BA;
  const wDirectionalSum = wAb + wBa;

  const now = new Date().toISOString();

  // Fetch all active submissions from other agents (specific columns only)
  const pool = ctx.db
    .prepare(
      `SELECT s.id, s.ask_embedding, s.offer_embedding, s.structured_data, s.required_tools
       FROM submissions s
       WHERE s.status = 'active' AND s.expires_at > ? AND s.agent_id != ?`,
    )
    .all(now, agent.id) as Record<string, any>[];

  const poolSize = pool.length;

  interface ScoredEntry {
    submissionId: string;
    crossScore: number;
    structuredData: Record<string, any> | null;
    requiredTools: string[];
  }

  const scored: ScoredEntry[] = [];

  for (const candSub of pool) {
    const askB: number[] | null = safeJsonParse(candSub.ask_embedding, null);
    if (!askB) continue; // malformed row — skip
    const offerB: number[] | null = candSub.offer_embedding ? safeJsonParse(candSub.offer_embedding, null) : null;

    const simAB = offerB ? Math.max(0, cosine(askA, offerB)) : 0;
    const simBA = offerA ? Math.max(0, cosine(askB, offerA)) : 0;
    const crossScore = (offerA || offerB)
      ? (wAb * simAB + wBa * simBA) / wDirectionalSum
      : Math.max(0, cosine(askA, askB));

    scored.push({
      submissionId: candSub.id,
      crossScore,
      structuredData: candSub.structured_data ? safeJsonParse(candSub.structured_data, null) : null,
      requiredTools: candSub.required_tools ? safeJsonParse(candSub.required_tools, []) : [],
    });
  }

  // Matches above threshold
  const aboveThreshold = scored.filter((s) => s.crossScore >= threshold);
  const estimatedMatches = aboveThreshold.length;
  const avgCrossScore =
    aboveThreshold.length > 0
      ? aboveThreshold.reduce((sum, s) => sum + s.crossScore, 0) / aboveThreshold.length
      : 0;

  // Tool coverage: for each tool seen in the matching pool
  const toolCoverage: Record<string, ToolCoverageEntry> = {};

  if (aboveThreshold.length > 0) {
    const allToolIds = new Set<string>();
    for (const entry of aboveThreshold) {
      if (entry.structuredData) {
        for (const toolId of Object.keys(entry.structuredData)) {
          allToolIds.add(toolId);
        }
      }
    }

    for (const toolId of allToolIds) {
      const withTool = aboveThreshold.filter((e) => e.structuredData && e.structuredData[toolId] !== undefined);
      const adoptionRate = withTool.length / aboveThreshold.length;

      // avg_satisfaction_boost: how much tool satisfaction improves when both sides use this tool.
      // If submission A has this tool filled, compute actual field satisfaction against each B that has it.
      // If A doesn't have it, show adoption_rate as an informational proxy.
      let avgSatisfactionBoost = 0;
      const subAToolData = structuredA?.[toolId];
      if (withTool.length > 0 && subAToolData && typeof subAToolData === "object") {
        let totalSatisfaction = 0;
        let count = 0;
        for (const e of withTool) {
          const bToolData = e.structuredData![toolId];
          if (bToolData && typeof bToolData === "object") {
            totalSatisfaction += computeFieldSatisfaction(subAToolData, bToolData);
            count++;
          }
        }
        avgSatisfactionBoost = count > 0 ? totalSatisfaction / count : adoptionRate;
      } else if (withTool.length > 0) {
        // A doesn't have this tool — show adoption rate as proxy
        avgSatisfactionBoost = adoptionRate;
      }

      toolCoverage[toolId] = {
        adoption_rate: Math.round(adoptionRate * 1000) / 1000,
        avg_satisfaction_boost: Math.round(avgSatisfactionBoost * 1000) / 1000,
      };
    }
  }

  // Selectivity analysis
  const ifThresholdRaised = scored.filter((s) => s.crossScore >= altThreshold).length;

  let ifRequiredToolAdded: number | null = null;
  if (params.alt_required_tool) {
    ifRequiredToolAdded = aboveThreshold.filter(
      (e) => e.structuredData && e.structuredData[params.alt_required_tool!] !== undefined,
    ).length;
  }

  // Record rate event
  try {
    ctx.db
      .prepare("INSERT INTO v4_rate_events (agent_id, action, created_at) VALUES (?, 'market_insights', ?)")
      .run(agent.id, now);
  } catch {
    // Rate event recording is best-effort
  }

  return {
    ok: true,
    data: {
      submission_id: params.submission_id,
      pool_size: poolSize,
      estimated_matches: estimatedMatches,
      avg_cross_score: Math.round(avgCrossScore * 10000) / 10000,
      tool_coverage: toolCoverage,
      selectivity_analysis: {
        current_pool: estimatedMatches,
        if_required_tool_added: ifRequiredToolAdded,
        if_threshold_raised_to: ifThresholdRaised,
        alt_threshold_used: altThreshold,
      },
      generated_at: now,
    },
  };
}
