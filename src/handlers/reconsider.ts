import type { HandlerContext, HandlerResult } from "../types.js";

export interface ReconsiderInput {
  user_token: string;
  candidate_id?: string;
  declined_token?: string;
}

export interface ReconsiderOutput {
  reconsidered: true;
  decline_id: string;
  original_declined_at: string;
}

export async function handleReconsider(
  input: ReconsiderInput,
  ctx: HandlerContext
): Promise<HandlerResult<ReconsiderOutput>> {
  const caller = ctx.db
    .prepare("SELECT 1 FROM users WHERE user_token = ?")
    .get(input.user_token);

  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Find the active decline — either by declined_token or by looking up candidate_id
  let decline: { id: string; declined_token: string; created_at: string; expiry_at: string | null; repeat_count: number } | undefined;

  if (input.declined_token) {
    decline = ctx.db
      .prepare(
        `SELECT id, declined_token, created_at, expiry_at, repeat_count FROM declines
         WHERE decliner_token = ? AND declined_token = ?
         AND reconsidered = 0
         AND (expiry_at IS NULL OR expiry_at > datetime('now'))
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(input.user_token, input.declined_token) as typeof decline;
  } else if (input.candidate_id) {
    // Look up from the candidate record (which was deleted, so we look at declines by user pair)
    // Can't directly map candidate_id to declined_token without old candidate data
    return { ok: false, error: { code: "INVALID_INPUT", message: "Provide declined_token to reconsider a decline" } };
  }

  if (!decline) {
    return { ok: false, error: { code: "NO_ACTIVE_DECLINE", message: "No active decline found for this pair" } };
  }

  // Check if permanent
  if (decline.expiry_at === null) {
    const history = ctx.db
      .prepare("SELECT permanent FROM decline_pair_history WHERE decliner_token = ? AND declined_token = ?")
      .get(input.user_token, decline.declined_token) as { permanent: number } | undefined;
    if (history?.permanent) {
      return { ok: false, error: { code: "PERMANENT_DECLINE", message: "This decline is permanent (3+ declines) and cannot be reconsidered" } };
    }
  }

  // Mark as reconsidered
  ctx.db
    .prepare("UPDATE declines SET reconsidered = 1, reconsidered_at = datetime('now') WHERE id = ?")
    .run(decline.id);

  return {
    ok: true,
    data: {
      reconsidered: true,
      decline_id: decline.id,
      original_declined_at: decline.created_at,
    },
  };
}
