import type {
  HandlerContext,
  HandlerResult,
} from "../types.js";
import { Stage } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface AnalyticsInput {
  admin_token: string;
  cluster_id?: string;
  time_range?: {
    start: string;
    end: string;
  };
}

export interface ClusterStats {
  total_clusters: number;
  active_clusters: number;
  total_participants: number;
  new_registrations: number;
}

export interface FunnelConversion {
  discovered_to_interested: number;
  interested_to_committed: number;
  committed_to_connected: number;
}

export interface AgentQualityStat {
  agent_model: string;
  user_count: number;
  avg_reputation: number;
}

export interface RejectionPattern {
  reason: string;
  count: number;
  stage_at_decline: number;
}

export interface VerificationStats {
  total_traits: number;
  unverified: number;
  self_verified: number;
  cross_verified: number;
  authority_verified: number;
}

export interface EnforcementStats {
  total_actions: number;
  active_disputes: number;
  resolved_disputes: number;
}

export interface ToolUsageStat {
  tool_id: string;
  display_name: string;
  usage_count: number;
  status: string;
}

export interface DeliverableStats {
  total_delivered: number;
  accepted: number;
  rejected: number;
  expired: number;
}

export interface AnalyticsOutput {
  cluster_stats: ClusterStats;
  funnel_conversion: FunnelConversion;
  agent_quality: AgentQualityStat[];
  trait_importance: never[];
  rejection_patterns: RejectionPattern[];
  verification_stats: VerificationStats;
  enforcement_stats: EnforcementStats;
  tool_usage_stats: ToolUsageStat[];
  deliverable_stats: DeliverableStats;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleAnalytics(
  input: AnalyticsInput,
  ctx: HandlerContext,
): Promise<HandlerResult<AnalyticsOutput>> {
  // ── Verify admin token ────────────────────────────────────────
  const envAdminToken = process.env.ADMIN_TOKEN;

  if (!input.admin_token) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED_ADMIN", message: "admin_token is required" },
    };
  }

  if (envAdminToken && input.admin_token !== envAdminToken) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED_ADMIN", message: "Invalid admin token" },
    };
  }

  // ── Time range defaults ───────────────────────────────────────
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 30);

  const timeStart = input.time_range?.start ?? defaultStart.toISOString();
  const timeEnd = input.time_range?.end ?? now.toISOString();

  // ── Cluster stats ─────────────────────────────────────────────
  let clusterCountSql = "SELECT COUNT(*) as count FROM clusters";
  let activeClusterSql = `SELECT COUNT(*) as count FROM clusters WHERE last_activity > ?`;
  let participantSql = "SELECT COUNT(*) as count FROM users WHERE status = 'active'";
  let newRegSql = `SELECT COUNT(*) as count FROM users WHERE created_at >= ? AND created_at <= ?`;
  const clusterParams: unknown[] = [];

  if (input.cluster_id) {
    clusterCountSql = "SELECT COUNT(*) as count FROM clusters WHERE cluster_id = ?";
    clusterParams.push(input.cluster_id);
    activeClusterSql = `SELECT COUNT(*) as count FROM clusters WHERE cluster_id = ? AND last_activity > ?`;
    participantSql = "SELECT COUNT(*) as count FROM users WHERE status = 'active' AND cluster_id = ?";
    newRegSql = `SELECT COUNT(*) as count FROM users WHERE cluster_id = ? AND created_at >= ? AND created_at <= ?`;
  }

  const totalClusters = input.cluster_id
    ? (ctx.db.prepare(clusterCountSql).get(input.cluster_id) as { count: number }).count
    : (ctx.db.prepare(clusterCountSql).get() as { count: number }).count;

  const activeClusters = input.cluster_id
    ? (ctx.db.prepare(activeClusterSql).get(input.cluster_id, timeStart) as { count: number }).count
    : (ctx.db.prepare(activeClusterSql).get(timeStart) as { count: number }).count;

  const totalParticipants = input.cluster_id
    ? (ctx.db.prepare(participantSql).get(input.cluster_id) as { count: number }).count
    : (ctx.db.prepare(participantSql).get() as { count: number }).count;

  const newRegistrations = input.cluster_id
    ? (ctx.db.prepare(newRegSql).get(input.cluster_id, timeStart, timeEnd) as { count: number }).count
    : (ctx.db.prepare(newRegSql).get(timeStart, timeEnd) as { count: number }).count;

  const clusterStats: ClusterStats = {
    total_clusters: totalClusters,
    active_clusters: activeClusters,
    total_participants: totalParticipants,
    new_registrations: newRegistrations,
  };

  // ── Funnel conversion ─────────────────────────────────────────
  const countCandidatesAtStage = (minStageA: number, minStageB: number): number => {
    let sql = `SELECT COUNT(*) as count FROM candidates WHERE stage_a >= ? AND stage_b >= ?`;
    const params: unknown[] = [minStageA, minStageB];
    if (input.cluster_id) {
      sql += " AND cluster_id = ?";
      params.push(input.cluster_id);
    }
    return (ctx.db.prepare(sql).get(...params) as { count: number }).count;
  };

  // Count pairs where at least one side reached a stage
  const countAnySideAtStage = (minStage: number): number => {
    let sql = `SELECT COUNT(*) as count FROM candidates WHERE stage_a >= ? OR stage_b >= ?`;
    const params: unknown[] = [minStage, minStage];
    if (input.cluster_id) {
      sql += " AND cluster_id = ?";
      params.push(input.cluster_id);
    }
    return (ctx.db.prepare(sql).get(...params) as { count: number }).count;
  };

  const discoveredCount = countAnySideAtStage(Stage.DISCOVERED);
  const interestedCount = countAnySideAtStage(Stage.INTERESTED);
  const committedCount = countAnySideAtStage(Stage.COMMITTED);
  const connectedCount = countCandidatesAtStage(Stage.CONNECTED, Stage.CONNECTED);

  const funnel_conversion: FunnelConversion = {
    discovered_to_interested: discoveredCount > 0
      ? Math.round((interestedCount / discoveredCount) * 100) / 100
      : 0,
    interested_to_committed: interestedCount > 0
      ? Math.round((committedCount / interestedCount) * 100) / 100
      : 0,
    committed_to_connected: committedCount > 0
      ? Math.round((connectedCount / committedCount) * 100) / 100
      : 0,
  };

  // ── Agent quality ─────────────────────────────────────────────
  let agentSql = `
    SELECT u.agent_model, COUNT(*) as user_count,
           COALESCE(AVG(CASE r.rating
             WHEN 'positive' THEN 1.0
             WHEN 'neutral' THEN 0.5
             WHEN 'negative' THEN 0.0
             ELSE 0.5
           END), 0.5) as avg_reputation
    FROM users u
    LEFT JOIN reputation_events r ON r.identity_id = u.user_token
    WHERE u.agent_model IS NOT NULL AND u.status = 'active'
  `;
  const agentParams: unknown[] = [];

  if (input.cluster_id) {
    agentSql += " AND u.cluster_id = ?";
    agentParams.push(input.cluster_id);
  }

  agentSql += " GROUP BY u.agent_model ORDER BY user_count DESC LIMIT 20";

  const agentRows = ctx.db.prepare(agentSql).all(...agentParams) as Array<{
    agent_model: string;
    user_count: number;
    avg_reputation: number;
  }>;

  const agentQuality: AgentQualityStat[] = agentRows.map((r) => ({
    agent_model: r.agent_model,
    user_count: r.user_count,
    avg_reputation: Math.round(r.avg_reputation * 10000) / 10000,
  }));

  // ── Rejection patterns ────────────────────────────────────────
  let declineSql = `
    SELECT reason, COUNT(*) as count, stage_at_decline
    FROM declines
    WHERE created_at >= ? AND created_at <= ?
  `;
  const declineParams: unknown[] = [timeStart, timeEnd];

  if (input.cluster_id) {
    declineSql += " AND cluster_id = ?";
    declineParams.push(input.cluster_id);
  }

  declineSql += " GROUP BY reason, stage_at_decline ORDER BY count DESC LIMIT 20";

  const declineRows = ctx.db.prepare(declineSql).all(...declineParams) as Array<{
    reason: string | null;
    count: number;
    stage_at_decline: number;
  }>;

  const rejectionPatterns: RejectionPattern[] = declineRows.map((r) => ({
    reason: r.reason ?? "unspecified",
    count: r.count,
    stage_at_decline: r.stage_at_decline,
  }));

  // ── Verification stats ────────────────────────────────────────
  let verifSql = `
    SELECT verification, COUNT(*) as count
    FROM traits
  `;
  const verifParams: unknown[] = [];

  if (input.cluster_id) {
    verifSql += `
      WHERE user_token IN (SELECT user_token FROM users WHERE cluster_id = ?)
    `;
    verifParams.push(input.cluster_id);
  }

  verifSql += " GROUP BY verification";

  const verifRows = ctx.db.prepare(verifSql).all(...verifParams) as Array<{
    verification: string;
    count: number;
  }>;

  const verificationStats: VerificationStats = {
    total_traits: 0,
    unverified: 0,
    self_verified: 0,
    cross_verified: 0,
    authority_verified: 0,
  };

  for (const row of verifRows) {
    verificationStats.total_traits += row.count;
    switch (row.verification) {
      case "unverified":
        verificationStats.unverified = row.count;
        break;
      case "self_verified":
        verificationStats.self_verified = row.count;
        break;
      case "cross_verified":
        verificationStats.cross_verified = row.count;
        break;
      case "authority_verified":
        verificationStats.authority_verified = row.count;
        break;
    }
  }

  // ── Enforcement stats ─────────────────────────────────────────
  let enforcementActionSql = "SELECT COUNT(*) as count FROM enforcement_actions";
  const enforcementParams: unknown[] = [];

  if (input.cluster_id) {
    enforcementActionSql += " WHERE user_token IN (SELECT user_token FROM users WHERE cluster_id = ?)";
    enforcementParams.push(input.cluster_id);
  }

  const totalActions = (ctx.db.prepare(enforcementActionSql).get(...enforcementParams) as { count: number }).count;

  let activeDisputeSql = `SELECT COUNT(*) as count FROM disputes WHERE status NOT IN ('resolved','resolved_for_filer','resolved_for_defendant','dismissed')`;
  const activeDisputeParams: unknown[] = [];

  if (input.cluster_id) {
    activeDisputeSql += " AND cluster_id = ?";
    activeDisputeParams.push(input.cluster_id);
  }

  const activeDisputes = (ctx.db.prepare(activeDisputeSql).get(...activeDisputeParams) as { count: number }).count;

  let resolvedDisputeSql = `SELECT COUNT(*) as count FROM disputes WHERE status IN ('resolved','resolved_for_filer','resolved_for_defendant','dismissed')`;
  const resolvedDisputeParams: unknown[] = [];

  if (input.cluster_id) {
    resolvedDisputeSql += " AND cluster_id = ?";
    resolvedDisputeParams.push(input.cluster_id);
  }

  const resolvedDisputes = (ctx.db.prepare(resolvedDisputeSql).get(...resolvedDisputeParams) as { count: number }).count;

  const enforcementStats: EnforcementStats = {
    total_actions: totalActions,
    active_disputes: activeDisputes,
    resolved_disputes: resolvedDisputes,
  };

  // ── Tool usage stats ──────────────────────────────────────────
  let toolSql = `
    SELECT tool_id, display_name, usage_count, status
    FROM tools
    WHERE usage_count > 0
  `;
  const toolParams: unknown[] = [];

  if (input.cluster_id) {
    toolSql += ` AND (cluster_scope IS NULL OR cluster_scope LIKE ?)`;
    toolParams.push(`%${input.cluster_id}%`);
  }

  toolSql += " ORDER BY usage_count DESC LIMIT 20";

  const toolRows = ctx.db.prepare(toolSql).all(...toolParams) as Array<{
    tool_id: string;
    display_name: string;
    usage_count: number;
    status: string;
  }>;

  const toolUsageStats: ToolUsageStat[] = toolRows.map((r) => ({
    tool_id: r.tool_id,
    display_name: r.display_name,
    usage_count: r.usage_count,
    status: r.status,
  }));

  // ── Deliverable stats ─────────────────────────────────────────
  let delivSql = `
    SELECT status, COUNT(*) as count
    FROM deliverables
    WHERE delivered_at >= ? AND delivered_at <= ?
  `;
  const delivParams: unknown[] = [timeStart, timeEnd];

  if (input.cluster_id) {
    delivSql += ` AND contract_id IN (
      SELECT contract_id FROM contracts
      WHERE candidate_id IN (SELECT id FROM candidates WHERE cluster_id = ?)
    )`;
    delivParams.push(input.cluster_id);
  }

  delivSql += " GROUP BY status";

  const delivRows = ctx.db.prepare(delivSql).all(...delivParams) as Array<{
    status: string;
    count: number;
  }>;

  const deliverableStats: DeliverableStats = {
    total_delivered: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
  };

  for (const row of delivRows) {
    deliverableStats.total_delivered += row.count;
    switch (row.status) {
      case "accepted":
        deliverableStats.accepted = row.count;
        break;
      case "rejected":
        deliverableStats.rejected = row.count;
        break;
      case "expired":
        deliverableStats.expired = row.count;
        break;
    }
  }

  // ── Build result ──────────────────────────────────────────────
  return {
    ok: true,
    data: {
      cluster_stats: clusterStats,
      funnel_conversion,
      agent_quality: agentQuality,
      trait_importance: [],
      rejection_patterns: rejectionPatterns,
      verification_stats: verificationStats,
      enforcement_stats: enforcementStats,
      tool_usage_stats: toolUsageStats,
      deliverable_stats: deliverableStats,
    },
  };
}
