import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
} from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface RefreshInput {
  user_token: string;
  idempotency_key?: string;
}

export interface RefreshOutput {
  refreshed: true;
  refreshed_at: string;
  next_refresh_due: string;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleRefresh(
  input: RefreshInput,
  ctx: HandlerContext,
): Promise<HandlerResult<RefreshOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<RefreshOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

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

  // ── Update staleness clock ─────────────────────────────────────
  ctx.db
    .prepare("UPDATE users SET updated_at = datetime('now') WHERE user_token = ?")
    .run(input.user_token);

  // ── Build result ───────────────────────────────────────────────
  const now = new Date();
  const nextRefreshDue = new Date(now);
  nextRefreshDue.setDate(nextRefreshDue.getDate() + 90);

  const result: RefreshOutput = {
    refreshed: true,
    refreshed_at: now.toISOString(),
    next_refresh_due: nextRefreshDue.toISOString(),
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "refresh", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
