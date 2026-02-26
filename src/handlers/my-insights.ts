import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  TraitRecord,
} from "../types.js";
import { Stage } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface MyInsightsInput {
  user_token: string;
}

export interface SuggestedTrait {
  key: string;
  description: string | null;
  importance: number;
}

export interface PreferenceInsight {
  trait_key: string;
  stated_weight: number;
  effective_weight: number;
  suggestion: string | null;
}

export interface FunnelStats {
  total_discovered: number;
  total_interested: number;
  total_committed: number;
  total_connected: number;
  conversion_rate: number;
}

export interface DeliverableStats {
  delivered: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number;
}

export interface StalenessInfo {
  profile_age_days: number;
  stale: boolean;
  refresh_due: boolean;
}

export interface EnforcementNotice {
  id: string;
  level: number;
  reason: string;
  expires_at: string | null;
  created_at: string;
}

export interface MyInsightsOutput {
  profile_completeness: number;
  suggested_traits: SuggestedTrait[];
  preference_insights: PreferenceInsight[];
  funnel_stats: FunnelStats;
  deliverable_stats: DeliverableStats;
  staleness: StalenessInfo;
  agent_quality_warning: null;
  enforcement_notices: EnforcementNotice[];
  cluster_tips: string[];
  reputation_score: number;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleMyInsights(
  input: MyInsightsInput,
  ctx: HandlerContext,
): Promise<HandlerResult<MyInsightsOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Profile completeness ──────────────────────────────────────
  const userTraits = ctx.db
    .prepare("SELECT * FROM traits WHERE user_token = ?")
    .all(input.user_token) as TraitRecord[];

  const clusterNorms = ctx.db
    .prepare(
      "SELECT trait_key, frequency, display_name, signal_strength FROM cluster_norms WHERE cluster_id = ? ORDER BY frequency DESC",
    )
    .all(caller.cluster_id) as Array<{
    trait_key: string;
    frequency: number;
    display_name: string | null;
    signal_strength: number;
  }>;

  const normCount = clusterNorms.length || 1;
  const userTraitKeys = new Set(userTraits.map((t) => t.key));
  const matchingCount = clusterNorms.filter((n) => userTraitKeys.has(n.trait_key)).length;
  const profileCompleteness = Math.min(
    Math.round((matchingCount / normCount) * 100) / 100,
    1.0,
  );

  // ── Suggested traits ──────────────────────────────────────────
  const suggestedTraits: SuggestedTrait[] = clusterNorms
    .filter((n) => !userTraitKeys.has(n.trait_key))
    .slice(0, 10)
    .map((n) => ({
      key: n.trait_key,
      description: n.display_name,
      importance: Math.round(n.frequency * 100) / 100,
    }));

  // ── Preference insights ───────────────────────────────────────
  const preferences = ctx.db
    .prepare("SELECT * FROM preferences WHERE user_token = ?")
    .all(input.user_token) as Array<{
    trait_key: string;
    weight: number;
    operator: string;
  }>;

  const preferenceInsights: PreferenceInsight[] = preferences.map((p) => ({
    trait_key: p.trait_key,
    stated_weight: p.weight,
    effective_weight: p.weight,
    suggestion: null,
  }));

  // ── Funnel stats ──────────────────────────────────────────────
  const funnelQuery = (stage: number, field: "stage_a" | "stage_b") =>
    `(user_a_token = ? AND ${field} >= ?) OR (user_b_token = ? AND ${field === "stage_a" ? "stage_b" : "stage_a"} >= ?)`;

  const countAtStage = (minStage: number): number => {
    const row = ctx.db
      .prepare(
        `SELECT COUNT(*) as count FROM candidates
         WHERE (
           (user_a_token = ? AND stage_a >= ?)
           OR (user_b_token = ? AND stage_b >= ?)
         )`,
      )
      .get(input.user_token, minStage, input.user_token, minStage) as { count: number };
    return row.count;
  };

  const totalDiscovered = countAtStage(Stage.DISCOVERED);
  const totalInterested = countAtStage(Stage.INTERESTED);
  const totalCommitted = countAtStage(Stage.COMMITTED);
  const totalConnected = countAtStage(Stage.CONNECTED);

  const conversionRate =
    totalDiscovered > 0
      ? Math.round((totalConnected / totalDiscovered) * 100) / 100
      : 0;

  const funnelStats: FunnelStats = {
    total_discovered: totalDiscovered,
    total_interested: totalInterested,
    total_committed: totalCommitted,
    total_connected: totalConnected,
    conversion_rate: conversionRate,
  };

  // ── Deliverable stats ─────────────────────────────────────────
  const deliverableRows = ctx.db
    .prepare(
      `SELECT status, COUNT(*) as count FROM deliverables
       WHERE deliverer_token = ?
       GROUP BY status`,
    )
    .all(input.user_token) as Array<{ status: string; count: number }>;

  let delivered = 0;
  let accepted = 0;
  let rejected = 0;

  for (const row of deliverableRows) {
    delivered += row.count;
    if (row.status === "accepted") accepted = row.count;
    if (row.status === "rejected") rejected = row.count;
  }

  const acceptanceRate =
    delivered > 0
      ? Math.round((accepted / delivered) * 100) / 100
      : 0;

  const deliverableStats: DeliverableStats = {
    delivered,
    accepted,
    rejected,
    acceptance_rate: acceptanceRate,
  };

  // ── Staleness ─────────────────────────────────────────────────
  const createdAt = new Date(caller.created_at);
  const now = new Date();
  const profileAgeDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  const staleness: StalenessInfo = {
    profile_age_days: profileAgeDays,
    stale: profileAgeDays > 180,
    refresh_due: profileAgeDays > 90,
  };

  // ── Enforcement notices ───────────────────────────────────────
  const enforcementRows = ctx.db
    .prepare(
      `SELECT id, level, reason, expires_at, created_at FROM enforcement_actions
       WHERE user_token = ?
       ORDER BY created_at DESC`,
    )
    .all(input.user_token) as EnforcementNotice[];

  const enforcementNotices: EnforcementNotice[] = enforcementRows.map((r) => ({
    id: r.id,
    level: r.level,
    reason: r.reason,
    expires_at: r.expires_at,
    created_at: r.created_at,
  }));

  // ── Cluster tips ──────────────────────────────────────────────
  const clusterTips: string[] = [];

  if (suggestedTraits.length > 0) {
    clusterTips.push(
      `Consider adding these common traits in your cluster: ${suggestedTraits
        .slice(0, 3)
        .map((t) => t.key)
        .join(", ")}`,
    );
  }

  if (staleness.refresh_due) {
    clusterTips.push("Your profile is over 90 days old. Consider refreshing it.");
  }

  if (preferences.length === 0) {
    clusterTips.push("Adding preferences will improve your match quality.");
  }

  if (!caller.intent_embedding) {
    clusterTips.push("Adding an intent embedding improves search relevance.");
  }

  // ── Reputation score ──────────────────────────────────────────
  const repRow = ctx.db
    .prepare(
      `SELECT AVG(CASE rating
                WHEN 'positive' THEN 1.0
                WHEN 'neutral'  THEN 0.5
                WHEN 'negative' THEN 0.0
                ELSE 0.5
              END) as avg_score,
              COUNT(*) as cnt
       FROM reputation_events
       WHERE identity_id = ?`,
    )
    .get(input.user_token) as { avg_score: number | null; cnt: number };

  const reputationScore =
    repRow && repRow.cnt > 0
      ? Math.round((repRow.avg_score ?? 0.5) * 10000) / 10000
      : 0.5;

  // ── Build result ──────────────────────────────────────────────
  return {
    ok: true,
    data: {
      profile_completeness: profileCompleteness,
      suggested_traits: suggestedTraits,
      preference_insights: preferenceInsights,
      funnel_stats: funnelStats,
      deliverable_stats: deliverableStats,
      staleness,
      agent_quality_warning: null,
      enforcement_notices: enforcementNotices,
      cluster_tips: clusterTips,
      reputation_score: reputationScore,
    },
  };
}
