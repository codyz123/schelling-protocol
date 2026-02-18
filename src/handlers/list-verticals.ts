import type { HandlerContext, HandlerResult } from "../types.js";
import { listVerticals } from "../verticals/registry.js";

interface ListVerticalsParams {
  // No parameters needed - this is an unauthenticated operation
}

interface VerticalInfo {
  id: string;
  display_name: string;
  description: string;
  version: string;
  roles: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  user_count: number;
  active_candidates: number;
}

interface ListVerticalsResult {
  verticals: VerticalInfo[];
  protocol_version: string;
}

export function handleListVerticals(
  params: ListVerticalsParams,
  ctx: HandlerContext
): HandlerResult<ListVerticalsResult> {
  try {
    const verticalDescriptors = listVerticals();
    const verticals: VerticalInfo[] = [];

    for (const descriptor of verticalDescriptors) {
      const verticalId = descriptor.vertical_id;
      // Query live stats for this vertical
      const userCountQuery = ctx.db.query(
        "SELECT COUNT(*) as count FROM users WHERE vertical_id = ?"
      );
      const userCount = (userCountQuery.get(verticalId) as { count: number })?.count || 0;

      const candidateCountQuery = ctx.db.query(
        "SELECT COUNT(*) as count FROM candidates WHERE (stage_a > 0 OR stage_b > 0)"
      );
      const candidateCount = (candidateCountQuery.get() as { count: number })?.count || 0;

      // Convert roles to the simpler format
      const roles = Object.entries(descriptor.roles).map(([roleId, role]) => ({
        id: roleId,
        name: role.name,
        description: role.description,
      }));

      verticals.push({
        id: verticalId,
        display_name: descriptor.display_name,
        description: descriptor.description,
        version: descriptor.version,
        roles,
        user_count: userCount,
        active_candidates: candidateCount,
      });
    }

    return {
      ok: true,
      data: {
        verticals,
        protocol_version: "schelling-2.0",
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}