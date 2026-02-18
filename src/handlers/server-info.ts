import type { HandlerContext, HandlerResult } from "../types.js";
import { getVerticalIds } from "../verticals/registry.js";

interface ServerInfoParams {
  // No parameters needed - this is an unauthenticated operation
}

interface ServerInfoResult {
  protocol_version: string;
  server_version: string;
  supported_verticals: string[];
  total_users: number;
  total_candidates: number;
  uptime_seconds: number;
  capabilities: string[];
  server_name: string;
  federation_enabled: boolean;
  rate_limits: Record<string, number>;
}

// Track server start time for uptime calculation
const SERVER_START_TIME = Date.now();

export function handleServerInfo(
  params: ServerInfoParams,
  ctx: HandlerContext
): HandlerResult<ServerInfoResult> {
  try {
    const supportedVerticals = getVerticalIds();
    
    // Get total user count across all verticals
    const totalUsersQuery = ctx.db.query(
      "SELECT COUNT(*) as count FROM users"
    );
    const totalUsers = (totalUsersQuery.get() as { count: number })?.count || 0;

    // Get total candidate count across all verticals
    const totalCandidatesQuery = ctx.db.query(
      "SELECT COUNT(*) as count FROM candidates WHERE stage_a > 0 OR stage_b > 0"
    );
    const totalCandidates = (totalCandidatesQuery.get() as { count: number })?.count || 0;

    // Calculate uptime
    const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

    const result: ServerInfoResult = {
      protocol_version: "schelling-2.0",
      server_version: "2.0.0-phase5", // Version corresponding to Phase 5 implementation
      supported_verticals: supportedVerticals,
      total_users: totalUsers,
      total_candidates: totalCandidates,
      uptime_seconds: uptimeSeconds,
      capabilities: [
        "MCP", // Model Context Protocol transport
        "REST", // REST API transport (being added in Phase 5)
        "progressive_disclosure", // Core feature
        "reputation_system", // Phase 2 feature
        "dispute_resolution", // Phase 4 feature
        "multi_vertical", // Phase 1 feature
        "asymmetric_matching", // Phase 3 feature
        "negotiation", // Phase 3 feature
        "verification", // Phase 4 feature
        "data_export", // Phase 4 feature
        "structured_logging" // Phase 5 feature
      ],
      server_name: "Schelling Protocol Node",
      federation_enabled: false, // Not yet implemented
      rate_limits: {
        "search": 10, // per hour
        "register": 5, // per day  
        "evaluate": 50, // per hour
        "exchange": 20, // per hour
        "commit": 10, // per hour
        "dispute": 3, // per day
        "negotiate": 20, // per hour
        "verticals": 100, // per hour (high limit for discovery)
        "onboard": 100, // per hour (high limit for onboarding)
        "server_info": 100 // per hour (high limit for meta queries)
      }
    };

    return {
      ok: true,
      data: result
    };

  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT", 
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}