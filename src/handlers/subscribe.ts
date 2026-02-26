import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  SubscriptionRecord,
} from "../types.js";
import { validateIntentEmbedding } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface TraitFilter {
  trait_key: string;
  operator: string;
  value: unknown;
}

export interface SubscribeInput {
  user_token: string;
  action?: "create" | "list";
  threshold?: number;
  intent_embedding?: number[];
  trait_filters?: TraitFilter[];
  capability_filters?: string[];
  cluster_filter?: string;
  mode_filter?: string;
  max_notifications_per_day?: number;
  ttl_days?: number;
  idempotency_key?: string;
}

export interface SubscribeCreateOutput {
  subscription_id: string;
  created_at: string;
  expires_at: string;
}

export interface SubscribeListOutput {
  subscriptions: Array<{
    subscription_id: string;
    cluster_filter: string | null;
    intent_embedding: number[] | null;
    threshold: number;
    trait_filters: TraitFilter[] | null;
    capability_filters: string[] | null;
    mode_filter: string | null;
    max_notifications_per_day: number;
    notification_count: number;
    created_at: string;
    expires_at: string;
  }>;
}

export type SubscribeOutput = SubscribeCreateOutput | SubscribeListOutput;

// ─── Handler ───────────────────────────────────────────────────────

export async function handleSubscribe(
  input: SubscribeInput,
  ctx: HandlerContext,
): Promise<HandlerResult<SubscribeOutput>> {
  const action = input.action ?? "create";

  // ── Verify user exists and is active ──────────────────────────
  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── List action ────────────────────────────────────────────────
  if (action === "list") {
    const rows = ctx.db
      .prepare(
        `SELECT * FROM subscriptions
         WHERE user_token = ? AND expires_at > datetime('now')
         ORDER BY created_at DESC`,
      )
      .all(input.user_token) as SubscriptionRecord[];

    const subscriptions = rows.map((r) => ({
      subscription_id: r.subscription_id,
      cluster_filter: r.cluster_filter,
      intent_embedding: r.intent_embedding
        ? (JSON.parse(r.intent_embedding) as number[])
        : null,
      threshold: r.threshold,
      trait_filters: r.trait_filters
        ? (JSON.parse(r.trait_filters) as TraitFilter[])
        : null,
      capability_filters: r.capability_filters
        ? (JSON.parse(r.capability_filters) as string[])
        : null,
      mode_filter: r.mode_filter,
      max_notifications_per_day: r.max_notifications_per_day,
      notification_count: r.notification_count,
      created_at: r.created_at,
      expires_at: r.expires_at,
    }));

    return { ok: true, data: { subscriptions } };
  }

  // ── Create action ──────────────────────────────────────────────

  // Idempotency check
  if (input.idempotency_key) {
    const cached = checkIdempotency<SubscribeCreateOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // Validate threshold (required for create)
  if (input.threshold === undefined || input.threshold === null) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "threshold is required for subscription creation",
      },
    };
  }

  if (typeof input.threshold !== "number" || input.threshold < 0 || input.threshold > 1) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "threshold must be a float between 0 and 1",
      },
    };
  }

  // Validate intent_embedding if provided
  if (input.intent_embedding !== undefined) {
    const embeddingError = validateIntentEmbedding(input.intent_embedding);
    if (embeddingError) {
      return {
        ok: false,
        error: {
          code: "INVALID_INTENT_EMBEDDING",
          message: embeddingError,
        },
      };
    }
  }

  // Validate max_notifications_per_day
  const maxNotifs = input.max_notifications_per_day ?? 10;
  if (!Number.isInteger(maxNotifs) || maxNotifs < 1 || maxNotifs > 50) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "max_notifications_per_day must be an integer between 1 and 50",
      },
    };
  }

  // Validate ttl_days
  const ttlDays = input.ttl_days ?? 30;
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 90) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "ttl_days must be an integer between 1 and 90",
      },
    };
  }

  // Check max active subscriptions (10)
  const activeCount = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) as count FROM subscriptions
         WHERE user_token = ? AND expires_at > datetime('now')`,
      )
      .get(input.user_token) as { count: number }
  ).count;

  if (activeCount >= 10) {
    return {
      ok: false,
      error: {
        code: "MAX_SUBSCRIPTIONS",
        message: "Maximum of 10 active subscriptions per user",
      },
    };
  }

  // Compute expires_at
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const subscriptionId = randomUUID();
  const createdAt = now.toISOString().replace("T", " ").slice(0, 19);
  const expiresAtStr = expiresAt.toISOString().replace("T", " ").slice(0, 19);

  // Insert subscription
  ctx.db
    .prepare(
      `INSERT INTO subscriptions (
        subscription_id, user_token, cluster_filter, intent_embedding,
        threshold, trait_filters, capability_filters, mode_filter,
        max_notifications_per_day, notification_count, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      subscriptionId,
      input.user_token,
      input.cluster_filter ?? null,
      input.intent_embedding ? JSON.stringify(input.intent_embedding) : null,
      input.threshold,
      input.trait_filters ? JSON.stringify(input.trait_filters) : null,
      input.capability_filters ? JSON.stringify(input.capability_filters) : null,
      input.mode_filter ?? null,
      maxNotifs,
      createdAt,
      expiresAtStr,
    );

  const result: SubscribeCreateOutput = {
    subscription_id: subscriptionId,
    created_at: createdAt,
    expires_at: expiresAtStr,
  };

  // Record idempotency
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "subscribe", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
