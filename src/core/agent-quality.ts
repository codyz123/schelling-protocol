import type { Database } from "bun:sqlite";

/**
 * Agent quality score: computed from outcomes.
 * Formula: 0.5 × positive_rate + 0.3 × consistency + 0.2 × completion_rate
 * Requires >= 20 outcomes. Returns null otherwise.
 */
export function computeAgentQuality(
  db: Database,
  userToken: string
): number | null {
  // Get outcomes for this user's matches
  const outcomes = db.prepare(`
    SELECT o.outcome, c.combined_score
    FROM outcomes o
    JOIN candidates c ON o.candidate_id = c.id
    WHERE (c.user_a_token = ? OR c.user_b_token = ?)
  `).all(userToken, userToken) as Array<{ outcome: string; combined_score: number | null }>;

  if (outcomes.length < 20) return null;

  // Positive rate
  const positiveCount = outcomes.filter(o => o.outcome === "positive").length;
  const positiveRate = positiveCount / outcomes.length;

  // Completion rate
  const connected = (db.prepare(`
    SELECT COUNT(*) as count FROM candidates
    WHERE (user_a_token = ? OR user_b_token = ?)
      AND (stage_a >= 5 OR stage_b >= 5)
  `).get(userToken, userToken) as { count: number }).count;

  const completed = (db.prepare(`
    SELECT COUNT(*) as count FROM candidates
    WHERE (user_a_token = ? OR user_b_token = ?)
      AND (stage_a >= 6 OR stage_b >= 6)
  `).get(userToken, userToken) as { count: number }).count;

  const completionRate = connected > 0 ? completed / connected : 0.5;

  // Consistency: correlation between combined_score and outcome value
  const scores: number[] = [];
  const outcomeValues: number[] = [];
  for (const o of outcomes) {
    if (o.combined_score != null) {
      scores.push(o.combined_score);
      outcomeValues.push(o.outcome === "positive" ? 1 : o.outcome === "neutral" ? 0.5 : 0);
    }
  }

  let consistency = 0.5;
  if (scores.length >= 2) {
    const { pearsonCorrelation } = require("./learning.js");
    const r = pearsonCorrelation(scores, outcomeValues);
    consistency = r != null ? Math.max(0, r) : 0.5;
  }

  return 0.5 * positiveRate + 0.3 * consistency + 0.2 * completionRate;
}
