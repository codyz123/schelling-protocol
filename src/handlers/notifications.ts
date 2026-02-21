import type { HandlerContext, HandlerResult } from "../types.js";

export interface NotificationsInput {
  user_token: string;
  subscription_id?: string;
  since?: string;
  limit?: number;
}

export interface NotificationRecord {
  id: string;
  subscription_id: string;
  matched_user_token: string;
  combined_score: number;
  intent_similarity: number;
  matched_at: string;
  read: number;
}

export async function handleNotifications(
  input: NotificationsInput,
  ctx: HandlerContext
): Promise<HandlerResult<{ notifications: any[] }>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  let sql = `
    SELECT sn.* FROM subscription_notifications sn
    JOIN subscriptions s ON sn.subscription_id = s.id
    WHERE s.user_token = ?
  `;
  const params: any[] = [input.user_token];

  if (input.subscription_id) {
    sql += " AND sn.subscription_id = ?";
    params.push(input.subscription_id);
  }
  if (input.since) {
    sql += " AND sn.matched_at > ?";
    params.push(input.since);
  }
  sql += " ORDER BY sn.matched_at DESC LIMIT ?";
  params.push(input.limit ?? 50);

  const notifications = ctx.db.prepare(sql).all(...params) as NotificationRecord[];

  return {
    ok: true,
    data: {
      notifications: notifications.map(n => ({
        id: n.id,
        subscription_id: n.subscription_id,
        matched_user_token: n.matched_user_token,
        combined_score: n.combined_score,
        intent_similarity: n.intent_similarity,
        matched_at: n.matched_at,
        read: n.read === 1,
      })),
    },
  };
}
