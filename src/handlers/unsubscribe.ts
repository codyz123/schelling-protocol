import type { HandlerContext, HandlerResult } from "../types.js";

export interface UnsubscribeInput {
  user_token: string;
  subscription_id: string;
}

export async function handleUnsubscribe(
  input: UnsubscribeInput,
  ctx: HandlerContext
): Promise<HandlerResult<{ subscription_id: string; status: string }>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const sub = ctx.db.prepare("SELECT * FROM subscriptions WHERE id = ? AND user_token = ?").get(input.subscription_id, input.user_token) as any;
  if (!sub) {
    return { ok: false, error: { code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found" } };
  }

  // Idempotent: already cancelled is fine
  if (sub.status !== "cancelled") {
    ctx.db.prepare("UPDATE subscriptions SET status = 'cancelled' WHERE id = ?").run(input.subscription_id);
  }

  return { ok: true, data: { subscription_id: input.subscription_id, status: "cancelled" } };
}
