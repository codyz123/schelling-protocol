import type { HandlerContext, HandlerResult, ToolRecord } from "../types.js";
import { PROTOCOL_VERSION, SERVER_VERSION, SERVER_NAME } from "../types.js";

// ─── Output type ─────────────────────────────────────────────────────

interface DefaultToolSummary {
  tool_id: string;
  display_name: string;
  one_line_description: string;
}

interface ServerInfoOutput {
  protocol_version: string;
  server_name: string;
  server_version: string;
  cluster_count: number;
  total_tools: number;
  default_tools: DefaultToolSummary[];
  federation_enabled: boolean;
  capabilities: {
    natural_language: boolean;
    funnel_modes: string[];
    fast_paths: boolean;
    deliverables: boolean;
    disputes: boolean;
    reputation: boolean;
    verification: boolean;
    data_export: boolean;
  };
  rate_limits: {
    register_per_day: number;
    search_per_hour: number;
    propose_per_hour: number;
    onboard_per_hour: number;
    describe_per_hour: number;
    clusters_per_hour: number;
  };
  mcp_manifest_url: null;
  openapi_url: null;
}

// ─── handleServerInfo ────────────────────────────────────────────────

export async function handleServerInfo(
  _input: Record<string, never>,
  ctx: HandlerContext
): Promise<HandlerResult<ServerInfoOutput>> {
  try {
    const clusterCountRow = ctx.db
      .prepare("SELECT COUNT(*) as count FROM clusters WHERE phase != 'dead'")
      .get() as { count: number };
    const clusterCount = clusterCountRow?.count ?? 0;

    const toolCountRow = ctx.db
      .prepare("SELECT COUNT(*) as count FROM tools WHERE status = 'active'")
      .get() as { count: number };
    const totalTools = toolCountRow?.count ?? 0;

    const defaultToolRows = ctx.db
      .prepare(
        `SELECT tool_id, display_name, one_line_description
         FROM tools
         WHERE type = 'default' AND status = 'active'
         ORDER BY usage_count DESC`
      )
      .all() as Pick<ToolRecord, "tool_id" | "display_name" | "one_line_description">[];

    const defaultTools: DefaultToolSummary[] = defaultToolRows.map((t) => ({
      tool_id: t.tool_id,
      display_name: t.display_name,
      one_line_description: t.one_line_description,
    }));

    return {
      ok: true,
      data: {
        protocol_version: PROTOCOL_VERSION,
        server_name: SERVER_NAME,
        server_version: SERVER_VERSION,
        cluster_count: clusterCount,
        total_tools: totalTools,
        default_tools: defaultTools,
        federation_enabled: false,
        capabilities: {
          natural_language: true,
          funnel_modes: ["bilateral", "broadcast", "group", "auction"],
          fast_paths: true,
          deliverables: true,
          disputes: true,
          reputation: true,
          verification: true,
          data_export: true,
        },
        rate_limits: {
          register_per_day: 10,
          search_per_hour: 60,
          propose_per_hour: 30,
          onboard_per_hour: 100,
          describe_per_hour: 100,
          clusters_per_hour: 100,
        },
        mcp_manifest_url: null,
        openapi_url: null,
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
