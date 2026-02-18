import type { Database } from "bun:sqlite";

/**
 * Feedback quality scoring (4-factor model per spec §18.6):
 * - Specificity (0.20): How many dimension_scores provided
 * - Balance (0.20): Mix of positive and negative dimension scores
 * - Consistency (0.30): Pearson correlation with past feedback patterns
 * - Promptness (0.30): How quickly after interaction feedback was given
 */

export interface FeedbackQualityFactors {
  specificity: number;
  balance: number;
  consistency: number;
  promptness: number;
  overall: number;
}

/**
 * Pearson correlation with edge case handling:
 * - n < 2 → null
 * - constant data (zero variance) → 0 (not NaN)
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  if (denomX === 0 || denomY === 0) return 0;
  return num / Math.sqrt(denomX * denomY);
}

export function computeFeedbackQuality(
  db: Database,
  userToken: string,
  dimensionScores: Record<string, number> | null,
  candidateCreatedAt: string,
  feedbackCreatedAt: string
): FeedbackQualityFactors {
  // Specificity: proportion of dimensions scored (out of 50)
  const dimCount = dimensionScores ? Object.keys(dimensionScores).length : 0;
  const specificity = Math.min(1.0, dimCount / 10); // 10+ dimensions = perfect specificity
  
  // Balance: mix of positive and negative scores
  let balance = 0.5; // default if no scores
  if (dimensionScores && dimCount > 0) {
    const values = Object.values(dimensionScores);
    const positives = values.filter(v => v > 0).length;
    const negatives = values.filter(v => v < 0).length;
    if (positives + negatives > 0) {
      const ratio = Math.min(positives, negatives) / Math.max(positives, negatives);
      balance = ratio; // 1.0 = perfectly balanced, 0 = all one-sided
    }
  }
  
  // Consistency: correlation with past feedback patterns
  let consistency = 0.5;
  const pastFeedback = db.prepare(
    `SELECT dimension_scores FROM feedback WHERE user_token = ? AND dimension_scores IS NOT NULL ORDER BY created_at DESC LIMIT 10`
  ).all(userToken) as Array<{ dimension_scores: string }>;
  
  if (pastFeedback.length >= 2 && dimensionScores) {
    // Compare variance of current scores vs historical pattern
    const currentValues = Object.values(dimensionScores);
    const pastValues = pastFeedback.map(f => {
      const scores = JSON.parse(f.dimension_scores);
      const vals = Object.values(scores) as number[];
      return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    });
    const currentAvg = currentValues.reduce((a, b) => a + b, 0) / (currentValues.length || 1);
    // Simple consistency: if current avg is within range of past avgs, high consistency
    const pastAvg = pastValues.reduce((a, b) => a + b, 0) / pastValues.length;
    const diff = Math.abs(currentAvg - pastAvg);
    consistency = Math.max(0, 1.0 - diff);
  }
  
  // Promptness: how quickly feedback was given after candidate was created
  const candidateTime = new Date(candidateCreatedAt).getTime();
  const feedbackTime = new Date(feedbackCreatedAt).getTime();
  const delayHours = (feedbackTime - candidateTime) / (1000 * 60 * 60);
  // Within 24h = 1.0, decays to 0.2 at 30 days
  const promptness = Math.max(0.2, Math.exp(-delayHours / (24 * 7)));
  
  const overall = 0.20 * specificity + 0.20 * balance + 0.30 * consistency + 0.30 * promptness;
  
  return { specificity, balance, consistency, promptness, overall };
}

export function updateLearnedPreferences(
  db: Database,
  userToken: string,
  clusterId: string
): void {
  const feedbacks = db.prepare(
    `SELECT f.dimension_scores, f.rejection_reason, f.satisfaction, f.created_at 
     FROM feedback f 
     JOIN candidates c ON f.candidate_id = c.id
     WHERE f.user_token = ? AND (c.vertical_id = ? OR c.vertical_id = 'matchmaking')
     ORDER BY f.created_at DESC`
  ).all(userToken, clusterId) as Array<{
    dimension_scores: string | null;
    rejection_reason: string | null;
    satisfaction: string | null;
    created_at: string;
  }>;
  
  if (feedbacks.length === 0) return;
  
  // Compute dimension importance: dimensions with avg |deviation| > 0.5 get higher weight
  const dimSums: Record<string, { total: number; count: number }> = {};
  for (const f of feedbacks) {
    if (!f.dimension_scores) continue;
    const scores = JSON.parse(f.dimension_scores) as Record<string, number>;
    for (const [dim, val] of Object.entries(scores)) {
      if (!dimSums[dim]) dimSums[dim] = { total: 0, count: 0 };
      dimSums[dim].total += Math.abs(val);
      dimSums[dim].count++;
    }
  }
  
  const dimensionImportance: Record<string, number> = {};
  for (const [dim, { total, count }] of Object.entries(dimSums)) {
    const avgDeviation = total / count;
    dimensionImportance[dim] = Math.min(1.0, avgDeviation * 2); // Scale so 0.5 avg → 1.0 importance
  }
  
  // Compute ideal ranges from near-zero deviation matches
  const idealRanges: Record<string, { min: number; max: number; ideal: number }> = {};
  for (const f of feedbacks) {
    if (!f.dimension_scores) continue;
    const scores = JSON.parse(f.dimension_scores) as Record<string, number>;
    for (const [dim, val] of Object.entries(scores)) {
      if (Math.abs(val) < 0.3) { // near-zero = good match
        if (!idealRanges[dim]) idealRanges[dim] = { min: Infinity, max: -Infinity, ideal: 0 };
        idealRanges[dim].min = Math.min(idealRanges[dim].min, val);
        idealRanges[dim].max = Math.max(idealRanges[dim].max, val);
      }
    }
  }
  // Compute ideal as midpoint
  for (const range of Object.values(idealRanges)) {
    if (range.min === Infinity) { range.min = 0; range.max = 0; }
    range.ideal = (range.min + range.max) / 2;
  }
  
  // Rejection patterns
  const rejectionPatterns: Record<string, number> = {};
  for (const f of feedbacks) {
    if (f.rejection_reason) {
      rejectionPatterns[f.rejection_reason] = (rejectionPatterns[f.rejection_reason] || 0) + 1;
    }
  }
  
  // Compute feedback quality score (average across all feedback)
  const qualityScores: number[] = [];
  for (const f of feedbacks) {
    const dimScores = f.dimension_scores ? JSON.parse(f.dimension_scores) : null;
    const quality = computeFeedbackQuality(db, userToken, dimScores, f.created_at, f.created_at);
    qualityScores.push(quality.overall);
  }
  const avgQuality = qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;
  
  // Upsert learned_preferences
  db.prepare(`
    INSERT INTO learned_preferences (id, user_token, cluster_id, dimension_importance, ideal_ranges, rejection_patterns, feedback_count, feedback_quality_score, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_token, cluster_id) DO UPDATE SET
      dimension_importance = excluded.dimension_importance,
      ideal_ranges = excluded.ideal_ranges,
      rejection_patterns = excluded.rejection_patterns,
      feedback_count = excluded.feedback_count,
      feedback_quality_score = excluded.feedback_quality_score,
      last_updated = datetime('now')
  `).run(
    `lp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    userToken,
    clusterId,
    JSON.stringify(dimensionImportance),
    JSON.stringify(idealRanges),
    JSON.stringify(rejectionPatterns),
    feedbacks.length,
    avgQuality
  );
}
