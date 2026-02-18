import type { HandlerContext, HandlerResult } from "../types.js";
import { updateLearnedPreferences } from "../core/learning.js";
import { computeUserSimilarity } from "../core/collaborative.js";

export interface FeedbackInput {
  user_token: string;
  candidate_id: string;
  dimension_scores?: Record<string, number>; // dimension → [-1, 1] deviation from ideal
  satisfaction?: "very_satisfied" | "satisfied" | "neutral" | "dissatisfied" | "very_dissatisfied";
  would_recommend?: boolean;
  rejection_reason?: string;
  rejection_freeform?: string;
  what_i_wanted?: string;
}

export interface FeedbackOutput {
  recorded: true;
  feedback_id: string;
  insights_available: boolean;
}

export async function handleFeedback(
  input: FeedbackInput,
  ctx: HandlerContext
): Promise<HandlerResult<FeedbackOutput>> {
  const { db } = ctx;

  // Validate user exists
  const user = db.prepare("SELECT user_token, vertical_id FROM users WHERE user_token = ?")
    .get(input.user_token) as { user_token: string; vertical_id: string } | undefined;
  if (!user) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Validate candidate exists and user is part of it
  const candidate = db.prepare("SELECT id, user_a_token, user_b_token, vertical_id FROM candidates WHERE id = ?")
    .get(input.candidate_id) as { id: string; user_a_token: string; user_b_token: string; vertical_id: string } | undefined;
  if (!candidate) {
    return { ok: false, error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" } };
  }
  if (input.user_token !== candidate.user_a_token && input.user_token !== candidate.user_b_token) {
    return { ok: false, error: { code: "NOT_PARTICIPANT", message: "User is not part of this candidate pair" } };
  }

  // Validate dimension scores are in [-1, 1]
  if (input.dimension_scores) {
    for (const [dim, val] of Object.entries(input.dimension_scores)) {
      if (val < -1 || val > 1) {
        return { ok: false, error: { code: "INVALID_INPUT", message: `Dimension score for '${dim}' must be between -1 and 1` } };
      }
    }
  }

  // Upsert feedback (one per user per candidate)
  const existing = db.prepare("SELECT id FROM feedback WHERE user_token = ? AND candidate_id = ?")
    .get(input.user_token, input.candidate_id) as { id: string } | undefined;

  const feedbackId = existing?.id ?? `fb_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (existing) {
    db.prepare(`
      UPDATE feedback SET
        dimension_scores = ?,
        satisfaction = ?,
        would_recommend = ?,
        rejection_reason = ?,
        rejection_freeform = ?,
        what_i_wanted = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      input.dimension_scores ? JSON.stringify(input.dimension_scores) : null,
      input.satisfaction ?? null,
      input.would_recommend != null ? (input.would_recommend ? 1 : 0) : null,
      input.rejection_reason ?? null,
      input.rejection_freeform ?? null,
      input.what_i_wanted ?? null,
      feedbackId
    );
  } else {
    db.prepare(`
      INSERT INTO feedback (id, user_token, candidate_id, dimension_scores, satisfaction, would_recommend, rejection_reason, rejection_freeform, what_i_wanted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      feedbackId,
      input.user_token,
      input.candidate_id,
      input.dimension_scores ? JSON.stringify(input.dimension_scores) : null,
      input.satisfaction ?? null,
      input.would_recommend != null ? (input.would_recommend ? 1 : 0) : null,
      input.rejection_reason ?? null,
      input.rejection_freeform ?? null,
      input.what_i_wanted ?? null
    );
  }

  // Update learned preferences
  const clusterId = candidate.vertical_id || user.vertical_id;
  updateLearnedPreferences(db, input.user_token, clusterId);

  // Update collaborative filtering (compute similarities)
  computeUserSimilarity(db, input.user_token);

  // Check if insights are available (need at least 1 feedback)
  const feedbackCount = (db.prepare("SELECT COUNT(*) as count FROM feedback WHERE user_token = ?")
    .get(input.user_token) as { count: number }).count;

  return {
    ok: true,
    data: {
      recorded: true,
      feedback_id: feedbackId,
      insights_available: feedbackCount >= 1,
    },
  };
}
