import type { HandlerContext, HandlerResult } from "../types.js";

export interface PendingInput {
  user_token: string;
}

export interface PendingAction {
  id: string;
  candidate_id: string;
  action_type: string;
  created_at: string;
}

export interface PendingOutput {
  actions: PendingAction[];
}

export async function handlePending(
  input: PendingInput,
  ctx: HandlerContext
): Promise<HandlerResult<PendingOutput>> {
  const caller = ctx.db
    .prepare("SELECT 1 FROM users WHERE user_token = ?")
    .get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const actions = ctx.db
    .prepare("SELECT id, candidate_id, action_type, created_at FROM pending_actions WHERE user_token = ? AND consumed_at IS NULL ORDER BY created_at DESC")
    .all(input.user_token) as PendingAction[];

  return { ok: true, data: { actions } };
}
