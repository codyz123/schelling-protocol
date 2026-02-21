import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { validateIntentEmbedding } from "../matching/intent.js";

export interface SubscribeInput {
  user_token: string;
  intent_embedding: number[];
  hard_filters?: Record<string, string | string[]>;
  capability_filters?: string[];
  threshold: number;
  max_notifications_per_day?: number;
  ttl_days?: number;
  idempotency_key?: string;
}

export interface SubscribeOutput {
  subscription_id: string;
  expires_at: string;
  status: string;
}

export async function handleSubscribe(
  input: SubscribeInput,
  ctx: HandlerContext
): Promise<HandlerResult<SubscribeOutput>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const validation = validateIntentEmbedding(input.intent_embedding);
  if (!validation.valid) {
    return { ok: false, error: { code: "INVALID_INTENT_EMBEDDING", message: validation.errors.join("; ") } };
  }

  if (input.threshold < 0 || input.threshold > 1) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "threshold must be between 0 and 1" } };
  }

  // Max 10 active subscriptions
  const activeCount = ctx.db.prepare(
    "SELECT COUNT(*) as count FROM subscriptions WHERE user_token = ? AND status = 'active'"
  ).get(input.user_token) as { count: number };

  if (activeCount.count >= 10) {
    return { ok: false, error: { code: "MAX_SUBSCRIPTIONS", message: "Maximum 10 active subscriptions allowed" } };
  }

  const ttlDays = input.ttl_days ?? 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();

  ctx.db.prepare(
    `INSERT INTO subscriptions (id, user_token, intent_embedding, hard_filters, capability_filters, threshold, max_notifications_per_day, ttl_days, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.user_token,
    JSON.stringify(input.intent_embedding),
    input.hard_filters ? JSON.stringify(input.hard_filters) : null,
    input.capability_filters ? JSON.stringify(input.capability_filters) : null,
    input.threshold,
    input.max_notifications_per_day ?? 10,
    ttlDays,
    expiresAt
  );

  return {
    ok: true,
    data: { subscription_id: id, expires_at: expiresAt, status: "active" },
  };
}
