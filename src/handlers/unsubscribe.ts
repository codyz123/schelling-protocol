import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  SubscriptionRecord,
} from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface UnsubscribeInput {
  user_token: string;
  subscription_id: string;
}

export interface UnsubscribeOutput {
  cancelled: true;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleUnsubscribe(
  input: UnsubscribeInput,
  ctx: HandlerContext,
): Promise<HandlerResult<UnsubscribeOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Verify subscription exists and belongs to caller ───────────
  const subscription = ctx.db
    .prepare("SELECT * FROM subscriptions WHERE subscription_id = ?")
    .get(input.subscription_id) as SubscriptionRecord | undefined;

  if (!subscription) {
    return {
      ok: false,
      error: { code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found" },
    };
  }

  if (subscription.user_token !== input.user_token) {
    return {
      ok: false,
      error: { code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found" },
    };
  }

  // ── Delete subscription ────────────────────────────────────────
  ctx.db
    .prepare("DELETE FROM subscriptions WHERE subscription_id = ?")
    .run(input.subscription_id);

  return { ok: true, data: { cancelled: true } };
}
