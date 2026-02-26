import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  TraitRecord,
} from "../types.js";
import { isTraitVisible } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface ConnectionsInput {
  user_token: string;
  stage_filter?: number;
  cluster_filter?: string;
  mode_filter?: string;
  limit?: number;
  cursor?: string;
}

export interface CandidateSummary {
  id: string;
  other_token_hash: string;  // hashed for privacy
  cluster_id: string;
  funnel_mode: string;
  score: number;
  fit_for_you: number;
  fit_for_them: number;
  intent_similarity: number | null;
  your_stage: number;
  their_stage: number;
  created_at: string;
  updated_at: string;
  visible_traits: Array<{
    key: string;
    value: unknown;
    value_type: string;
    display_name: string | null;
    category: string | null;
    verification: string;
    visibility: string;
  }>;
}

export interface ConnectionsOutput {
  candidates: CandidateSummary[];
  total: number;
  next_cursor: string | null;
}

// ─── Helper: hash token for privacy ───────────────────────────────

function hashToken(token: string): string {
  // Simple deterministic hash — not cryptographic but sufficient for display
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // convert to 32-bit int
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleConnections(
  input: ConnectionsInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ConnectionsOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const user = ctx.db
    .prepare("SELECT 1 FROM users WHERE user_token = ?")
    .get(input.user_token);

  if (!user) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Build query with filters ───────────────────────────────────
  const limit = Math.min(input.limit ?? 50, 200);

  // Decode cursor (if provided) — cursor is the updated_at of the last record
  let cursorUpdatedAt: string | null = null;
  if (input.cursor) {
    try {
      cursorUpdatedAt = Buffer.from(input.cursor, "base64").toString("utf8");
    } catch {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Invalid cursor" },
      };
    }
  }

  // Base query: candidates where this user is a participant
  let sql = `
    SELECT * FROM candidates
    WHERE (user_a_token = ? OR user_b_token = ?)
  `;
  const params: unknown[] = [input.user_token, input.user_token];

  // Stage filter: filter on the caller's own stage
  if (input.stage_filter !== undefined) {
    sql += `
      AND (
        (user_a_token = ? AND stage_a = ?)
        OR (user_b_token = ? AND stage_b = ?)
      )
    `;
    params.push(
      input.user_token,
      input.stage_filter,
      input.user_token,
      input.stage_filter,
    );
  }

  if (input.cluster_filter) {
    sql += " AND cluster_id = ?";
    params.push(input.cluster_filter);
  }

  if (input.mode_filter) {
    sql += " AND funnel_mode = ?";
    params.push(input.mode_filter);
  }

  // Cursor pagination (keyset on updated_at)
  if (cursorUpdatedAt) {
    sql += " AND updated_at < ?";
    params.push(cursorUpdatedAt);
  }

  // Count total matching (without cursor/limit for accurate total)
  let countSql = `
    SELECT COUNT(*) as count FROM candidates
    WHERE (user_a_token = ? OR user_b_token = ?)
  `;
  const countParams: unknown[] = [input.user_token, input.user_token];

  if (input.stage_filter !== undefined) {
    countSql += `
      AND (
        (user_a_token = ? AND stage_a = ?)
        OR (user_b_token = ? AND stage_b = ?)
      )
    `;
    countParams.push(
      input.user_token,
      input.stage_filter,
      input.user_token,
      input.stage_filter,
    );
  }

  if (input.cluster_filter) {
    countSql += " AND cluster_id = ?";
    countParams.push(input.cluster_filter);
  }

  if (input.mode_filter) {
    countSql += " AND funnel_mode = ?";
    countParams.push(input.mode_filter);
  }

  sql += " ORDER BY updated_at DESC LIMIT ?";
  params.push(limit + 1); // fetch one extra to detect if there's a next page

  const rows = ctx.db.prepare(sql).all(...params) as CandidateRecord[];
  const total = (ctx.db.prepare(countSql).get(...countParams) as { count: number }).count;

  // Detect next page
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // ── For each candidate, compute visible traits ─────────────────
  const candidates: CandidateSummary[] = [];

  for (const row of pageRows) {
    const isA = input.user_token === row.user_a_token;
    const yourStage = isA ? row.stage_a : row.stage_b;
    const theirStage = isA ? row.stage_b : row.stage_a;
    const otherUserToken = isA ? row.user_b_token : row.user_a_token;
    const fitForYou = isA ? row.fit_b : row.fit_a;   // how well other fits your prefs
    const fitForThem = isA ? row.fit_a : row.fit_b;  // how well you fit their prefs

    // Mutual minimum stage determines what's visible
    const mutualMinStage = Math.min(yourStage, theirStage);

    // Load other party's traits that are visible at the mutual stage
    const otherTraits = ctx.db
      .prepare("SELECT * FROM traits WHERE user_token = ?")
      .all(otherUserToken) as TraitRecord[];

    const visibleTraits = otherTraits
      .filter((t) => isTraitVisible(t.visibility as any, mutualMinStage))
      .map((t) => ({
        key: t.key,
        value: JSON.parse(t.value),
        value_type: t.value_type,
        display_name: t.display_name,
        category: t.category,
        verification: t.verification,
        visibility: t.visibility,
      }));

    candidates.push({
      id: row.id,
      other_token_hash: hashToken(otherUserToken),
      cluster_id: row.cluster_id,
      funnel_mode: row.funnel_mode,
      score: row.score,
      fit_for_you: fitForYou,
      fit_for_them: fitForThem,
      intent_similarity: row.intent_similarity,
      your_stage: yourStage,
      their_stage: theirStage,
      created_at: row.created_at,
      updated_at: row.updated_at,
      visible_traits: visibleTraits,
    });
  }

  // ── Build next_cursor ──────────────────────────────────────────
  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(lastRow.updated_at, "utf8").toString("base64");
  }

  return {
    ok: true,
    data: {
      candidates,
      total,
      next_cursor: nextCursor,
    },
  };
}
