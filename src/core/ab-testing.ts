import type { Database } from "bun:sqlite";

const VARIANTS = ["control", "variant_a"];

export function assignVariant(db: Database, userToken: string): string {
  // Check existing assignment
  const existing = db.prepare("SELECT variant_id FROM algorithm_variants WHERE user_token = ?")
    .get(userToken) as { variant_id: string } | undefined;
  if (existing) return existing.variant_id;

  const variant = VARIANTS[Math.random() < 0.5 ? 0 : 1];
  const id = `av_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  db.prepare(`
    INSERT OR IGNORE INTO algorithm_variants (id, variant_id, user_token)
    VALUES (?, ?, ?)
  `).run(id, variant, userToken);

  return variant;
}

export function getVariantStats(
  db: Database,
  variantId: string
): {
  user_count: number;
  positive_outcomes: number;
  total_outcomes: number;
  avg_score: number;
} {
  const userCount = (db.prepare(`
    SELECT COUNT(*) as count FROM algorithm_variants WHERE variant_id = ?
  `).get(variantId) as { count: number }).count;

  const outcomeStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN o.outcome = 'positive' THEN 1 ELSE 0 END) as positive,
      AVG(c.combined_score) as avg_score
    FROM outcomes o
    JOIN candidates c ON o.candidate_id = c.id
    JOIN algorithm_variants av ON o.reporter_token = av.user_token
    WHERE av.variant_id = ?
  `).get(variantId) as { total: number; positive: number; avg_score: number | null };

  return {
    user_count: userCount,
    positive_outcomes: outcomeStats.positive || 0,
    total_outcomes: outcomeStats.total || 0,
    avg_score: outcomeStats.avg_score ?? 0,
  };
}
