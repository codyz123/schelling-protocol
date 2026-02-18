import type { HandlerContext, HandlerResult, UserRecord } from "../types.js";

export interface RefreshInput {
  user_token: string;
}

export interface RefreshOutput {
  refreshed: true;
  last_registered_at: string;
  previous_registered_at: string;
}

export async function handleRefresh(
  input: RefreshInput,
  ctx: HandlerContext
): Promise<HandlerResult<RefreshOutput>> {
  const caller = ctx.db
    .prepare("SELECT last_registered_at FROM users WHERE user_token = ?")
    .get(input.user_token) as { last_registered_at: string } | undefined;

  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  // Rate limit: max once per 30 days
  const prevDate = new Date(caller.last_registered_at);
  const daysSince = (Date.now() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 30) {
    return { ok: false, error: { code: "RATE_LIMITED", message: `Can only refresh once per 30 days. Last refresh was ${Math.floor(daysSince)} days ago.` } };
  }

  ctx.db
    .prepare("UPDATE users SET last_registered_at = datetime('now'), updated_at = datetime('now') WHERE user_token = ?")
    .run(input.user_token);

  return {
    ok: true,
    data: {
      refreshed: true,
      last_registered_at: new Date().toISOString(),
      previous_registered_at: caller.last_registered_at,
    },
  };
}
