import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  SubscriptionRecord,
} from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface NotificationsInput {
  user_token: string;
  subscription_id?: string;
  since?: string;
  limit?: number;
}

export interface NotificationItem {
  notification_id: string;
  subscription_id: string;
  candidate_token_hash: string;
  advisory_score: number;
  intent_similarity: number | null;
  matched_at: string;
}

export interface NotificationsOutput {
  notifications: NotificationItem[];
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleNotifications(
  input: NotificationsInput,
  ctx: HandlerContext,
): Promise<HandlerResult<NotificationsOutput>> {
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

  // ── Validate limit ────────────────────────────────────────────
  const limit = Math.min(input.limit ?? 50, 100);
  if (input.limit !== undefined && (input.limit < 1 || !Number.isInteger(input.limit))) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "limit must be a positive integer (max 100)",
      },
    };
  }

  // ── If subscription_id provided, verify it belongs to caller ──
  if (input.subscription_id) {
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
  }

  // ── Build query ───────────────────────────────────────────────
  let sql = `
    SELECT n.* FROM notifications n
    INNER JOIN subscriptions s ON n.subscription_id = s.subscription_id
    WHERE s.user_token = ?
  `;
  const params: unknown[] = [input.user_token];

  if (input.subscription_id) {
    sql += " AND n.subscription_id = ?";
    params.push(input.subscription_id);
  }

  if (input.since) {
    sql += " AND n.matched_at > ?";
    params.push(input.since);
  }

  sql += " ORDER BY n.matched_at DESC LIMIT ?";
  params.push(limit);

  const rows = ctx.db.prepare(sql).all(...params) as Array<{
    notification_id: string;
    subscription_id: string;
    candidate_token_hash: string;
    advisory_score: number;
    intent_similarity: number | null;
    matched_at: string;
  }>;

  const notifications: NotificationItem[] = rows.map((r) => ({
    notification_id: r.notification_id,
    subscription_id: r.subscription_id,
    candidate_token_hash: r.candidate_token_hash,
    advisory_score: r.advisory_score,
    intent_similarity: r.intent_similarity,
    matched_at: r.matched_at,
  }));

  return { ok: true, data: { notifications } };
}
