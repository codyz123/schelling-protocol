import type { HandlerContext, HandlerResult } from "../types.js";
import { getCollaborativeSuggestions } from "../core/collaborative.js";

export interface MyInsightsInput {
  user_token: string;
  cluster_id?: string;
}

export interface MyInsightsOutput {
  feedback_count: number;
  feedback_quality_score: number;
  rejection_patterns: Record<string, number>;
  dimension_importance: Record<string, number>;
  ideal_ranges: Record<string, { min: number; max: number; ideal: number }>;
  satisfaction_distribution: Record<string, number>;
  collaborative_suggestions: {
    similar_users_count: number;
    preferred_dimensions: Record<string, number>;
    avoided_dimensions: Record<string, number>;
    confidence: number;
  };
}

export async function handleMyInsights(
  input: MyInsightsInput,
  ctx: HandlerContext
): Promise<HandlerResult<MyInsightsOutput>> {
  const { db } = ctx;

  const user = db.prepare("SELECT user_token, vertical_id FROM users WHERE user_token = ?")
    .get(input.user_token) as { user_token: string; vertical_id: string } | undefined;
  if (!user) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const clusterId = input.cluster_id ?? user.vertical_id;

  // Get learned preferences
  const learned = db.prepare(
    "SELECT * FROM learned_preferences WHERE user_token = ? AND cluster_id = ?"
  ).get(input.user_token, clusterId) as {
    dimension_importance: string;
    ideal_ranges: string;
    rejection_patterns: string;
    feedback_count: number;
    feedback_quality_score: number;
  } | undefined;

  // Get satisfaction distribution from feedback
  const satisfactionRows = db.prepare(`
    SELECT satisfaction, COUNT(*) as count FROM feedback
    WHERE user_token = ? AND satisfaction IS NOT NULL
    GROUP BY satisfaction
  `).all(input.user_token) as Array<{ satisfaction: string; count: number }>;
  
  const satisfactionDistribution: Record<string, number> = {};
  for (const row of satisfactionRows) {
    satisfactionDistribution[row.satisfaction] = row.count;
  }

  // Get collaborative suggestions
  const collaborative = getCollaborativeSuggestions(db, input.user_token, clusterId);

  // Total feedback count
  const totalCount = (db.prepare("SELECT COUNT(*) as count FROM feedback WHERE user_token = ?")
    .get(input.user_token) as { count: number }).count;

  return {
    ok: true,
    data: {
      feedback_count: totalCount,
      feedback_quality_score: learned?.feedback_quality_score ?? 0,
      rejection_patterns: learned ? JSON.parse(learned.rejection_patterns) : {},
      dimension_importance: learned ? JSON.parse(learned.dimension_importance) : {},
      ideal_ranges: learned ? JSON.parse(learned.ideal_ranges) : {},
      satisfaction_distribution: satisfactionDistribution,
      collaborative_suggestions: collaborative,
    },
  };
}
