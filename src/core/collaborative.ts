import type { Database } from "bun:sqlite";

/**
 * Collaborative filtering: find similar users by feedback patterns.
 * Uses pre-computed similar_users table (NOT O(N) scan).
 * Minimum 3 similar users for signal, otherwise fall back to trait similarity.
 */

export interface CollaborativeSuggestions {
  similar_users_count: number;
  preferred_dimensions: Record<string, number>; // dimension → avg positive score
  avoided_dimensions: Record<string, number>; // dimension → avg negative score
  confidence: number; // 0-1 based on similar user count
}

/**
 * Compute user similarity based on feedback dimension_scores patterns
 * and store in similar_users table. Called periodically or after feedback submission.
 */
export function computeUserSimilarity(
  db: Database,
  userToken: string
): void {
  // Get this user's feedback pattern (dimension score averages)
  const userFeedback = db.prepare(`
    SELECT dimension_scores FROM feedback
    WHERE user_token = ? AND dimension_scores IS NOT NULL
    ORDER BY created_at DESC LIMIT 20
  `).all(userToken) as Array<{ dimension_scores: string }>;
  
  if (userFeedback.length < 2) return; // Need at least 2 feedbacks to compute pattern
  
  const userPattern = aggregateDimensionScores(userFeedback.map(f => JSON.parse(f.dimension_scores)));
  if (Object.keys(userPattern).length === 0) return;
  
  // Get other users who have submitted feedback with dimension scores
  // Use pre-computed similar_users to find candidates, or if fresh, scan users with feedback
  const otherUsers = db.prepare(`
    SELECT DISTINCT f.user_token
    FROM feedback f
    WHERE f.user_token != ? AND f.dimension_scores IS NOT NULL
    GROUP BY f.user_token
    HAVING COUNT(*) >= 2
    LIMIT 100
  `).all(userToken) as Array<{ user_token: string }>;
  
  // Delete old similarities for this user
  db.prepare(`DELETE FROM similar_users WHERE user_token = ?`).run(userToken);
  
  for (const other of otherUsers) {
    const otherFeedback = db.prepare(`
      SELECT dimension_scores FROM feedback
      WHERE user_token = ? AND dimension_scores IS NOT NULL
      ORDER BY created_at DESC LIMIT 20
    `).all(other.user_token) as Array<{ dimension_scores: string }>;
    
    const otherPattern = aggregateDimensionScores(otherFeedback.map(f => JSON.parse(f.dimension_scores)));
    
    const similarity = computePatternSimilarity(userPattern, otherPattern);
    
    if (similarity > 0.5) {
      db.prepare(`
        INSERT OR REPLACE INTO similar_users (user_token, similar_token, similarity, computed_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(userToken, other.user_token, similarity);
    }
  }
}

function aggregateDimensionScores(
  feedbacks: Record<string, number>[]
): Record<string, number> {
  const sums: Record<string, { total: number; count: number }> = {};
  for (const fb of feedbacks) {
    for (const [dim, val] of Object.entries(fb)) {
      if (!sums[dim]) sums[dim] = { total: 0, count: 0 };
      sums[dim].total += val;
      sums[dim].count++;
    }
  }
  const result: Record<string, number> = {};
  for (const [dim, { total, count }] of Object.entries(sums)) {
    result[dim] = total / count;
  }
  return result;
}

function computePatternSimilarity(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const commonDims = Object.keys(a).filter(k => k in b);
  if (commonDims.length < 3) return 0;
  
  // Cosine similarity on common dimensions
  let dot = 0, magA = 0, magB = 0;
  for (const dim of commonDims) {
    dot += a[dim] * b[dim];
    magA += a[dim] * a[dim];
    magB += b[dim] * b[dim];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return (dot / denom + 1) / 2; // Map [-1,1] → [0,1]
}

/**
 * Get collaborative suggestions from pre-computed similar_users.
 * Requires minimum 3 similar users, otherwise returns low-confidence empty result.
 */
export function getCollaborativeSuggestions(
  db: Database,
  userToken: string,
  _clusterId: string
): CollaborativeSuggestions {
  const similarUsers = db.prepare(`
    SELECT similar_token, similarity FROM similar_users
    WHERE user_token = ?
    ORDER BY similarity DESC
    LIMIT 20
  `).all(userToken) as Array<{ similar_token: string; similarity: number }>;
  
  if (similarUsers.length < 3) {
    return {
      similar_users_count: similarUsers.length,
      preferred_dimensions: {},
      avoided_dimensions: {},
      confidence: 0,
    };
  }
  
  // Aggregate feedback from similar users
  const preferred: Record<string, { total: number; count: number }> = {};
  const avoided: Record<string, { total: number; count: number }> = {};
  
  for (const su of similarUsers) {
    const feedbacks = db.prepare(`
      SELECT dimension_scores FROM feedback
      WHERE user_token = ? AND dimension_scores IS NOT NULL
      ORDER BY created_at DESC LIMIT 10
    `).all(su.similar_token) as Array<{ dimension_scores: string }>;
    
    for (const fb of feedbacks) {
      const scores = JSON.parse(fb.dimension_scores) as Record<string, number>;
      for (const [dim, val] of Object.entries(scores)) {
        if (val > 0.3) {
          if (!preferred[dim]) preferred[dim] = { total: 0, count: 0 };
          preferred[dim].total += val * su.similarity;
          preferred[dim].count++;
        } else if (val < -0.3) {
          if (!avoided[dim]) avoided[dim] = { total: 0, count: 0 };
          avoided[dim].total += val * su.similarity;
          avoided[dim].count++;
        }
      }
    }
  }
  
  const preferredDimensions: Record<string, number> = {};
  for (const [dim, { total, count }] of Object.entries(preferred)) {
    preferredDimensions[dim] = total / count;
  }
  
  const avoidedDimensions: Record<string, number> = {};
  for (const [dim, { total, count }] of Object.entries(avoided)) {
    avoidedDimensions[dim] = total / count;
  }
  
  const confidence = Math.min(1.0, similarUsers.length / 10);
  
  return {
    similar_users_count: similarUsers.length,
    preferred_dimensions: preferredDimensions,
    avoided_dimensions: avoidedDimensions,
    confidence,
  };
}
