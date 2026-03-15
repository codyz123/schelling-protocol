import type { HandlerContext, HandlerResult, ClusterRecord, ToolRecord } from "../types.js";
import { PROTOCOL_VERSION, SERVER_VERSION, SERVER_NAME } from "../types.js";
import { getFeatures, getLegacyFeatureDescriptions } from "../features.js";

interface ClusterSummary {
  cluster_id: string;
  display_name: string | null;
  population: number;
  phase: string;
}

interface ToolSummary {
  tool_id: string;
  display_name: string;
  one_line_description: string;
}

interface DescribeOutput {
  protocol: {
    name: string;
    version: string;
    purpose: string;
    how_it_works: string;
    key_concepts: {
      trait: string;
      preference: string;
      cluster: string;
      funnel: string;
      funnel_modes: string;
    };
  };
  getting_started: {
    steps: string[];
    zero_config: string;
  };
  clusters: {
    total_active: number;
    top_clusters: ClusterSummary[];
    browse_operation: string;
  };
  tools: {
    total_available: number;
    default_tools: ToolSummary[];
    browse_operation: string;
  };
  capabilities: {
    natural_language: boolean;
    funnel_modes: string[];
    federation: boolean;
    fast_paths: boolean;
    deliverables: boolean;
  };
  features: {
    core_protocol: string;
    agent_cards: string;
    serendipity: string;
    mcp_server: string;
    sdks: string;
    community: string;
  };
  server: {
    name: string;
    version: string;
    operator: null;
  };
  mcp_manifest_url: null;
  openapi_url: "/openapi.yaml";
}

export async function handleDescribe(
  _input: Record<string, never>,
  ctx: HandlerContext
): Promise<HandlerResult<DescribeOutput>> {
  try {
    const clusterCountRow = ctx.db
      .prepare("SELECT COUNT(*) as count FROM clusters WHERE phase != 'dead'")
      .get() as { count: number };
    const totalActiveClusters = clusterCountRow?.count ?? 0;

    const topClusters = ctx.db
      .prepare(
        `SELECT cluster_id, display_name, population, phase
         FROM clusters
         WHERE phase != 'dead'
         ORDER BY population DESC
         LIMIT 10`
      )
      .all() as ClusterRecord[];

    const toolCountRow = ctx.db
      .prepare("SELECT COUNT(*) as count FROM tools WHERE status = 'active'")
      .get() as { count: number };
    const totalTools = toolCountRow?.count ?? 0;

    const defaultTools = ctx.db
      .prepare(
        `SELECT tool_id, display_name, one_line_description
         FROM tools
         WHERE type = 'default' AND status = 'active'
         ORDER BY usage_count DESC`
      )
      .all() as Pick<ToolRecord, "tool_id" | "display_name" | "one_line_description">[];

    // Get dynamic feature descriptions
    const featureRegistry = await getFeatures(ctx);
    const legacyFeatures = getLegacyFeatureDescriptions();
    
    // Build features object from registry, falling back to legacy descriptions
    const features = {
      core_protocol: "",
      agent_cards: "",
      serendipity: "",
      mcp_server: "",
      sdks: "",
      community: "",
    };
    
    for (const feature of featureRegistry.features) {
      if (feature.id in features) {
        (features as any)[feature.id] = feature.description;
      }
    }
    
    // Fill any missing features with legacy descriptions
    for (const [key, value] of Object.entries(legacyFeatures)) {
      if (key in features && !(features as any)[key]) {
        (features as any)[key] = value;
      }
    }

    const output: DescribeOutput = {
      protocol: {
        name: "Schelling Protocol",
        version: PROTOCOL_VERSION,
        purpose:
          "An open protocol for agent-to-agent coordination — discover counterparts, evaluate fit, negotiate terms, exchange deliverables, and coordinate activity across any domain.",
        how_it_works:
          "Agents register with traits (facts about participants) and preferences (what they're looking for). The server matches participants through a staged funnel: DISCOVERED → INTERESTED → COMMITTED → CONNECTED. Information is revealed progressively at each stage.",
        key_concepts: {
          trait:
            "A fact about a participant, expressed as a key-value pair (e.g., work.years_experience: 5).",
          preference:
            "What a participant is looking for — references a trait key with a comparison operator and importance weight (0.0–1.0, where 1.0 is non-negotiable).",
          cluster:
            "A dynamic grouping of participants with similar goals (e.g., dating.general, hiring.engineering.frontend). Created automatically on first registration.",
          funnel:
            "Staged progression: DISCOVERED → INTERESTED → COMMITTED → CONNECTED. Information revealed progressively at each stage.",
          funnel_modes:
            "Bilateral (mutual evaluation, default), broadcast (one-to-many), group (accumulate N members), auction (competitive bidding).",
        },
      },
      getting_started: {
        steps: [
          "1. Call schelling.onboard with a natural language description to get a registration template.",
          "2. Call schelling.register with your cluster_id, role, traits, and preferences.",
          "3. Call schelling.search to discover candidates — the server scores and ranks them for you.",
          "4. Express interest with schelling.propose; counterparts who match back become CONNECTED.",
          "5. Once connected, exchange contact info, negotiate contracts, and deliver work.",
        ],
        zero_config:
          "Call schelling.onboard with a natural language description of what you need — the server will suggest a cluster, parse your traits, and generate a registration template.",
      },
      clusters: {
        total_active: totalActiveClusters,
        top_clusters: topClusters.map((c) => ({
          cluster_id: c.cluster_id,
          display_name: c.display_name,
          population: c.population,
          phase: c.phase,
        })),
        browse_operation: "schelling.clusters",
      },
      tools: {
        total_available: totalTools,
        default_tools: defaultTools.map((t) => ({
          tool_id: t.tool_id,
          display_name: t.display_name,
          one_line_description: t.one_line_description,
        })),
        browse_operation: "schelling.list_tools",
      },
      capabilities: {
        natural_language: true,
        funnel_modes: ["bilateral", "broadcast", "group", "auction"],
        federation: false,
        fast_paths: true,
        deliverables: true,
      },
      features,
      server: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        operator: null,
      },
      mcp_manifest_url: null,
      openapi_url: "/openapi.yaml",
    };

    return { ok: true, data: output };
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
