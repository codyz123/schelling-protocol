import type { HandlerContext, HandlerResult } from "../types.js";
import { listClusters } from "../clusters/registry.js";

interface ListVerticalsParams {}

interface ClusterInfo {
  id: string;
  display_name: string;
  description: string;
  version: string;
  centroid: number[];
  roles: Array<{ id: string; name: string; description: string }>;
  symmetric: boolean;
  exclusive_commitment: boolean;
  peer_roles?: string[];
  recommended_attributes?: string[];
  decline_ttl_days?: number;
  user_count: number;
  active_candidates: number;
}

interface ListVerticalsResult {
  verticals: ClusterInfo[];  // backward compat
  clusters: ClusterInfo[];
  protocol_version: string;
}

export function handleListVerticals(
  _params: ListVerticalsParams,
  ctx: HandlerContext
): HandlerResult<ListVerticalsResult> {
  try {
    const clusters = listClusters();
    const clusterInfos: ClusterInfo[] = [];

    for (const descriptor of clusters) {
      const clusterId = descriptor.cluster_id;

      const userCount = (ctx.db
        .prepare("SELECT COUNT(*) as count FROM users WHERE vertical_id = ? OR primary_cluster = ?")
        .get(clusterId, clusterId) as { count: number })?.count || 0;

      const candidateCount = (ctx.db
        .prepare("SELECT COUNT(*) as count FROM candidates WHERE vertical_id = ? AND (stage_a > 0 OR stage_b > 0)")
        .get(clusterId) as { count: number })?.count || 0;

      const roles = Object.entries(descriptor.roles).map(([roleId, role]) => ({
        id: roleId,
        name: role.name,
        description: role.description,
      }));

      clusterInfos.push({
        id: clusterId,
        display_name: descriptor.display_name,
        description: descriptor.description,
        version: descriptor.version,
        centroid: descriptor.centroid,
        roles,
        symmetric: descriptor.symmetric,
        exclusive_commitment: descriptor.exclusive_commitment,
        peer_roles: descriptor.peer_roles,
        recommended_attributes: descriptor.recommended_attributes,
        decline_ttl_days: descriptor.decline_ttl_days,
        user_count: userCount,
        active_candidates: candidateCount,
      });
    }

    return {
      ok: true,
      data: { verticals: clusterInfos, clusters: clusterInfos, protocol_version: "schelling-2.0" },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: error instanceof Error ? error.message : String(error) },
    };
  }
}
