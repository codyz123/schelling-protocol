/**
 * Rate limiting middleware for Schelling Protocol endpoints.
 * Uses the rate_limits table in SQLite for persistence.
 */

import type { Database } from "bun:sqlite";

/** Rate limits per endpoint (requests per window). */
export const RATE_LIMITS: Record<string, { limit: number; window_seconds: number }> = {
  "schelling.register": { limit: 5, window_seconds: 86400 },       // 5 per day
  "schelling.search": { limit: 10, window_seconds: 3600 },         // 10 per hour
  "schelling.evaluate": { limit: 50, window_seconds: 3600 },       // 50 per hour
  "schelling.exchange": { limit: 20, window_seconds: 3600 },       // 20 per hour
  "schelling.message": { limit: 100, window_seconds: 3600 },       // 100 per hour
  "schelling.update": { limit: 20, window_seconds: 3600 },         // 20 per hour
  "schelling.refresh": { limit: 1, window_seconds: 2592000 },      // 1 per 30 days
  "schelling.commit": { limit: 10, window_seconds: 3600 },         // 10 per hour
  "schelling.feedback": { limit: 50, window_seconds: 3600 },       // 50 per hour
  "schelling.dispute": { limit: 3, window_seconds: 86400 },        // 3 per day
  "schelling.reconsider": { limit: 10, window_seconds: 86400 },    // 10 per day
  "schelling.relay_block": { limit: 20, window_seconds: 3600 },    // 20 per hour
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: number; // Unix timestamp
}

/**
 * Check and consume a rate limit slot for a user+endpoint.
 * Returns whether the request is allowed and how many remain.
 */
export function checkRateLimit(
  db: Database,
  userToken: string,
  endpoint: string
): RateLimitResult {
  const config = RATE_LIMITS[endpoint];
  if (!config) {
    // No rate limit configured for this endpoint — allow
    return { allowed: true, remaining: Infinity, reset_at: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.window_seconds;

  // Count requests in the current window
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM rate_limits
       WHERE user_token = ? AND endpoint = ? AND window_start > ?`
    )
    .get(userToken, endpoint, windowStart) as { count: number };

  if (row.count >= config.limit) {
    // Rate limited
    const oldestInWindow = db
      .prepare(
        `SELECT MIN(window_start) as oldest FROM rate_limits
         WHERE user_token = ? AND endpoint = ? AND window_start > ?`
      )
      .get(userToken, endpoint, windowStart) as { oldest: number | null };

    const resetAt = (oldestInWindow?.oldest ?? now) + config.window_seconds;
    return { allowed: false, remaining: 0, reset_at: resetAt };
  }

  // Record this request
  const id = `${userToken}:${endpoint}:${now}:${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    `INSERT INTO rate_limits (id, user_token, endpoint, window_start)
     VALUES (?, ?, ?, ?)`
  ).run(id, userToken, endpoint, now);

  // Cleanup old entries (older than 2x window to avoid unbounded growth)
  db.prepare(
    `DELETE FROM rate_limits WHERE endpoint = ? AND window_start < ?`
  ).run(endpoint, now - config.window_seconds * 2);

  return {
    allowed: true,
    remaining: config.limit - row.count - 1,
    reset_at: now + config.window_seconds,
  };
}
