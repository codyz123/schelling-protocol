import type {
  HandlerContext,
  HandlerResult,
  PendingActionRecord,
} from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface PendingInput {
  user_token: string;
}

export interface PendingAction {
  id: string;
  candidate_id: string | null;
  action_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PendingOutput {
  actions: PendingAction[];
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handlePending(
  input: PendingInput,
  ctx: HandlerContext,
): Promise<HandlerResult<PendingOutput>> {
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

  // ── Query unconsumed pending actions ───────────────────────────
  const rows = ctx.db
    .prepare(
      `SELECT id, candidate_id, action_type, details, created_at
       FROM pending_actions
       WHERE user_token = ? AND consumed_at IS NULL
       ORDER BY created_at ASC`,
    )
    .all(input.user_token) as Array<Pick<PendingActionRecord, "id" | "candidate_id" | "action_type" | "details" | "created_at">>;

  // ── Parse details JSON ─────────────────────────────────────────
  const actions: PendingAction[] = rows.map((row) => ({
    id: row.id,
    candidate_id: row.candidate_id,
    action_type: row.action_type,
    details: row.details ? JSON.parse(row.details) : null,
    created_at: row.created_at,
  }));

  return {
    ok: true,
    data: { actions },
  };
}
