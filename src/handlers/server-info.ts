import type { HandlerContext, HandlerResult } from "../types.js";
import { getClusterIds } from "../clusters/registry.js";

interface ServerInfoParams {}

interface ServerInfoResult {
  protocol_version: string;
  server_version: string;
  supported_verticals: string[];
  supported_clusters: string[];
  total_users: number;
  total_candidates: number;
  uptime_seconds: number;
  capabilities: string[];
  server_name: string;
  federation_enabled: boolean;
  rate_limits: Record<string, number>;
}

const SERVER_START_TIME = Date.now();

export function handleServerInfo(
  _params: ServerInfoParams,
  ctx: HandlerContext
): HandlerResult<ServerInfoResult> {
  try {
    const clusterIds = getClusterIds();

    const totalUsers = (ctx.db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number })?.count || 0;
    const totalCandidates = (ctx.db.prepare("SELECT COUNT(*) as count FROM candidates WHERE stage_a > 0 OR stage_b > 0").get() as { count: number })?.count || 0;
    const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

    return {
      ok: true,
      data: {
        protocol_version: "schelling-2.0",
        server_version: "2.0.0-v2phase1",
        supported_verticals: clusterIds, // backward compat
        supported_clusters: clusterIds,
        total_users: totalUsers,
        total_candidates: totalCandidates,
        uptime_seconds: uptimeSeconds,
        capabilities: [
          "MCP", "REST", "progressive_disclosure", "reputation_system",
          "dispute_resolution", "multi_cluster", "asymmetric_matching",
          "negotiation", "verification", "data_export", "structured_logging",
          "intent_space", "cluster_affinity",
        ],
        server_name: "Schelling Protocol Node",
        federation_enabled: false,
        rate_limits: {
          search: 10, register: 5, evaluate: 50, exchange: 20,
          commit: 10, dispute: 3, negotiate: 20,
        },
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: error instanceof Error ? error.message : String(error) },
    };
  }
}
