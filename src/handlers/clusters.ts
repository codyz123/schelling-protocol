import type { HandlerContext, HandlerResult, ClusterRecord } from "../types.js";

// ─── Input / Output types ────────────────────────────────────────────

export interface ClustersInput {
  action?: "list" | "search" | "describe";
  query?: string;
  prefix?: string;
  min_population?: number;
  sort?: string;
  limit?: number;
  cursor?: string;
}

interface ClusterNormRow {
  trait_key: string;
  value_type: string | null;
  display_name: string | null;
  frequency: number;
  signal_strength: number;
  prompt: string | null;
  enum_values: string | null;
}

interface ClusterSummary {
  cluster_id: string;
  display_name: string | null;
  description: string | null;
  population: number;
  phase: string;
  default_funnel_mode: string;
  symmetric: boolean;
  age_restricted: boolean;
  last_activity: string;
}

interface ClustersOutput {
  action: string;
  clusters: ClusterSummary[];
  total: number;
  next_cursor: string | null;
}

// ─── Cluster info types ──────────────────────────────────────────────

export interface ClusterInfoInput {
  cluster_id: string;
}

interface SuggestedTrait {
  trait_key: string;
  value_type: string | null;
  display_name: string | null;
  frequency: number;
  signal_strength: number;
  prompt: string | null;
  enum_values: string[] | null;
}

interface ClusterInfoOutput {
  cluster_id: string;
  display_name: string | null;
  description: string | null;
  population: number;
  phase: string;
  settings: {
    symmetric: boolean;
    exclusive_commitment: boolean;
    age_restricted: boolean;
    default_funnel_mode: string;
    max_negotiation_rounds: number;
    proposal_timeout_hours: number;
  };
  suggested_traits: SuggestedTrait[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  last_activity: string;
}

// ─── handleClusters ──────────────────────────────────────────────────

export async function handleClusters(
  input: ClustersInput,
  ctx: HandlerContext
): Promise<HandlerResult<ClustersOutput>> {
  try {
    const action = input.action ?? "list";
    const limit = Math.min(input.limit ?? 50, 200);

    // Decode cursor (offset-based pagination)
    let offset = 0;
    if (input.cursor) {
      const parsed = parseInt(input.cursor, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        offset = parsed;
      }
    }

    const conditions: string[] = ["phase != 'dead'"];
    const params: unknown[] = [];

    if (action === "search") {
      if (!input.query || typeof input.query !== "string" || input.query.trim() === "") {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "action 'search' requires a non-empty query string.",
          },
        };
      }
      const term = `%${input.query.trim()}%`;
      conditions.push(
        "(cluster_id LIKE ? OR display_name LIKE ? OR description LIKE ?)"
      );
      params.push(term, term, term);
    }

    if (input.prefix) {
      conditions.push("cluster_id LIKE ?");
      params.push(`${input.prefix}%`);
    }

    if (typeof input.min_population === "number") {
      conditions.push("population >= ?");
      params.push(input.min_population);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Determine sort order
    let orderBy = "population DESC, last_activity DESC";
    if (input.sort === "activity") {
      orderBy = "last_activity DESC";
    } else if (input.sort === "name") {
      orderBy = "cluster_id ASC";
    } else if (input.sort === "created") {
      orderBy = "created_at DESC";
    }

    const countRow = ctx.db
      .prepare(`SELECT COUNT(*) as count FROM clusters ${whereClause}`)
      .get(...params) as { count: number };
    const total = countRow?.count ?? 0;

    const rows = ctx.db
      .prepare(
        `SELECT cluster_id, display_name, description, population, phase,
                default_funnel_mode, symmetric, age_restricted, last_activity
         FROM clusters
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as ClusterRecord[];

    const clusters: ClusterSummary[] = rows.map((r) => ({
      cluster_id: r.cluster_id,
      display_name: r.display_name,
      description: r.description,
      population: r.population,
      phase: r.phase,
      default_funnel_mode: r.default_funnel_mode,
      symmetric: r.symmetric === 1,
      age_restricted: r.age_restricted === 1,
      last_activity: r.last_activity,
    }));

    const nextOffset = offset + rows.length;
    const nextCursor = nextOffset < total ? String(nextOffset) : null;

    return {
      ok: true,
      data: {
        action,
        clusters,
        total,
        next_cursor: nextCursor,
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

// ─── handleClusterInfo ───────────────────────────────────────────────

export async function handleClusterInfo(
  input: ClusterInfoInput,
  ctx: HandlerContext
): Promise<HandlerResult<ClusterInfoOutput>> {
  try {
    if (!input.cluster_id || typeof input.cluster_id !== "string") {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "cluster_id is required.",
        },
      };
    }

    const cluster = ctx.db
      .prepare("SELECT * FROM clusters WHERE cluster_id = ?")
      .get(input.cluster_id) as ClusterRecord | undefined;

    if (!cluster) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_CLUSTER",
          message: `Cluster '${input.cluster_id}' not found.`,
        },
      };
    }

    const normRows = ctx.db
      .prepare(
        `SELECT trait_key, value_type, display_name, frequency, signal_strength, prompt, enum_values
         FROM cluster_norms
         WHERE cluster_id = ?
         ORDER BY frequency DESC`
      )
      .all(input.cluster_id) as ClusterNormRow[];

    const suggestedTraits: SuggestedTrait[] = normRows.map((n) => ({
      trait_key: n.trait_key,
      value_type: n.value_type,
      display_name: n.display_name,
      frequency: n.frequency,
      signal_strength: n.signal_strength,
      prompt: n.prompt,
      enum_values: n.enum_values ? (JSON.parse(n.enum_values) as string[]) : null,
    }));

    let metadata: Record<string, unknown> | null = null;
    if (cluster.metadata) {
      try {
        metadata = JSON.parse(cluster.metadata) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }

    return {
      ok: true,
      data: {
        cluster_id: cluster.cluster_id,
        display_name: cluster.display_name,
        description: cluster.description,
        population: cluster.population,
        phase: cluster.phase,
        settings: {
          symmetric: cluster.symmetric === 1,
          exclusive_commitment: cluster.exclusive_commitment === 1,
          age_restricted: cluster.age_restricted === 1,
          default_funnel_mode: cluster.default_funnel_mode,
          max_negotiation_rounds: cluster.max_negotiation_rounds,
          proposal_timeout_hours: cluster.proposal_timeout_hours,
        },
        suggested_traits: suggestedTraits,
        metadata,
        created_at: cluster.created_at,
        last_activity: cluster.last_activity,
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
