import type { HandlerContext, HandlerResult } from "../types.js";
import { twoProportionZTest, wilsonConfidenceInterval } from "../core/statistics.js";
import { getVariantStats } from "../core/ab-testing.js";

export interface AnalyticsInput {
  user_token: string;
  cluster_id?: string;
  time_range?: { start?: string; end?: string };
}

export interface AnalyticsOutput {
  funnel_metrics: {
    total_users: number;
    discovered: number;
    evaluated: number;
    exchanged: number;
    committed: number;
    connected: number;
    completed: number;
  };
  outcome_metrics: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    positive_rate: number;
    confidence_interval: { lower: number; upper: number };
  };
  match_rate: number;
  response_rate: number;
  average_score: number;
  ab_test_results: Record<string, {
    user_count: number;
    positive_outcomes: number;
    total_outcomes: number;
    avg_score: number;
  }>;
  ab_test_significance?: { z: number; p_value: number; significant: boolean };
}

export async function handleAnalytics(
  input: AnalyticsInput,
  ctx: HandlerContext
): Promise<HandlerResult<AnalyticsOutput>> {
  const { db } = ctx;

  // Validate user exists
  const user = db.prepare("SELECT user_token FROM users WHERE user_token = ?")
    .get(input.user_token) as { user_token: string } | undefined;
  if (!user) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Funnel metrics
  const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get() as any).c;

  const funnelQuery = (minStage: number, col: string) => {
    return (db.prepare(`SELECT COUNT(DISTINCT ${col === 'a' ? 'user_a_token' : 'user_b_token'}) as c FROM candidates WHERE ${col === 'a' ? 'stage_a' : 'stage_b'} >= ?`).get(minStage) as any).c;
  };

  // Approximate funnel by counting unique users at each stage
  const stageCountQuery = (stage: number) => {
    return (db.prepare(`
      SELECT COUNT(*) as c FROM candidates
      WHERE stage_a >= ? OR stage_b >= ?
    `).get(stage, stage) as any).c;
  };

  const discovered = stageCountQuery(1);
  const evaluated = stageCountQuery(2);
  const exchanged = stageCountQuery(3);
  const committed = stageCountQuery(4);
  const connected = stageCountQuery(5);
  const completed = stageCountQuery(6);

  // Outcome metrics
  const outcomeRows = db.prepare(`
    SELECT outcome, COUNT(*) as count FROM outcomes GROUP BY outcome
  `).all() as Array<{ outcome: string; count: number }>;
  
  const outcomeCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  let totalOutcomes = 0;
  for (const row of outcomeRows) {
    outcomeCounts[row.outcome] = row.count;
    totalOutcomes += row.count;
  }
  
  const positiveRate = totalOutcomes > 0 ? outcomeCounts.positive / totalOutcomes : 0;
  const ci = wilsonConfidenceInterval(outcomeCounts.positive, totalOutcomes);

  // Match rate: connected / discovered
  const matchRate = discovered > 0 ? connected / discovered : 0;

  // Response rate: evaluated / discovered
  const responseRate = discovered > 0 ? evaluated / discovered : 0;

  // Average score
  const avgScore = (db.prepare("SELECT AVG(combined_score) as avg FROM candidates WHERE combined_score IS NOT NULL").get() as any)?.avg ?? 0;

  // A/B test results
  const controlStats = getVariantStats(db, "control");
  const variantStats = getVariantStats(db, "variant_a");

  let abSignificance;
  if (controlStats.total_outcomes > 0 && variantStats.total_outcomes > 0) {
    abSignificance = twoProportionZTest(
      controlStats.positive_outcomes, controlStats.total_outcomes,
      variantStats.positive_outcomes, variantStats.total_outcomes
    );
  }

  return {
    ok: true,
    data: {
      funnel_metrics: {
        total_users: totalUsers,
        discovered,
        evaluated,
        exchanged,
        committed,
        connected,
        completed,
      },
      outcome_metrics: {
        total: totalOutcomes,
        positive: outcomeCounts.positive,
        neutral: outcomeCounts.neutral,
        negative: outcomeCounts.negative,
        positive_rate: positiveRate,
        confidence_interval: ci,
      },
      match_rate: matchRate,
      response_rate: responseRate,
      average_score: avgScore,
      ab_test_results: {
        control: controlStats,
        variant_a: variantStats,
      },
      ab_test_significance: abSignificance,
    },
  };
}
