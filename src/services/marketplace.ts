import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "../db/interface.js";
import type { HandlerContext, HandlerResult } from "../types.js";

export interface MarketplaceProfile {
  id: string;
  registration_id: string;
  hourly_rate_cents: number | null;
  per_task_rate_cents: number | null;
  currency: string;
  min_price_cents: number;
  max_concurrent_jobs: number;
  auto_accept_below_cents: number | null;
  availability: string;
  capabilities_json: string | null;
  stripe_account_id: string | null;
  stripe_onboarded: number;
  total_earned_cents: number;
  total_jobs_completed: number;
  avg_delivery_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export function handleMarketplaceRegister(params: any, ctx: HandlerContext): HandlerResult<any> {
  const { user_token, registration_id, hourly_rate_cents, per_task_rate_cents, min_price_cents, max_concurrent_jobs, auto_accept_below_cents, capabilities } = params;

  if (!user_token) return { ok: false, error: { code: "INVALID_INPUT", message: "user_token required" } };

  const regId = registration_id || user_token;

  // Verify the user exists
  const user = ctx.db.prepare(`SELECT user_token FROM users WHERE user_token = ?`).get(regId);
  if (!user) return { ok: false, error: { code: "USER_NOT_FOUND", message: "Registration not found" } };

  // Check for existing marketplace profile
  const existing = ctx.db.prepare(`SELECT id FROM marketplace_profiles WHERE registration_id = ?`).get(regId) as any;
  if (existing) return { ok: false, error: { code: "INVALID_INPUT", message: "Marketplace profile already exists for this registration" } };

  if (min_price_cents !== undefined && min_price_cents < 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "min_price_cents must be >= 0" } };
  }
  if (max_concurrent_jobs !== undefined && max_concurrent_jobs < 1) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "max_concurrent_jobs must be >= 1" } };
  }

  const id = randomUUID();
  ctx.db.prepare(
    `INSERT INTO marketplace_profiles (id, registration_id, hourly_rate_cents, per_task_rate_cents, min_price_cents, max_concurrent_jobs, auto_accept_below_cents, capabilities_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, regId,
    hourly_rate_cents ?? null, per_task_rate_cents ?? null,
    min_price_cents ?? 0, max_concurrent_jobs ?? 5,
    auto_accept_below_cents ?? null,
    capabilities ? JSON.stringify(capabilities) : null,
  );

  const profile = ctx.db.prepare(`SELECT * FROM marketplace_profiles WHERE id = ?`).get(id) as MarketplaceProfile;

  return {
    ok: true,
    data: {
      marketplace_id: profile.id,
      registration_id: profile.registration_id,
      hourly_rate_cents: profile.hourly_rate_cents,
      per_task_rate_cents: profile.per_task_rate_cents,
      min_price_cents: profile.min_price_cents,
      availability: profile.availability,
    },
  };
}

export function handleMarketplaceUpdate(params: any, ctx: HandlerContext): HandlerResult<any> {
  const { user_token } = params;
  if (!user_token) return { ok: false, error: { code: "INVALID_INPUT", message: "user_token required" } };

  const profile = ctx.db.prepare(
    `SELECT * FROM marketplace_profiles WHERE registration_id = ?`,
  ).get(user_token) as MarketplaceProfile | undefined;
  if (!profile) return { ok: false, error: { code: "USER_NOT_FOUND", message: "No marketplace profile found" } };

  const updates: string[] = [];
  const values: any[] = [];

  const fields: Record<string, string> = {
    hourly_rate_cents: "hourly_rate_cents",
    per_task_rate_cents: "per_task_rate_cents",
    min_price_cents: "min_price_cents",
    max_concurrent_jobs: "max_concurrent_jobs",
    auto_accept_below_cents: "auto_accept_below_cents",
    availability: "availability",
  };

  for (const [param, col] of Object.entries(fields)) {
    if (params[param] !== undefined) {
      if (param === "min_price_cents" && params[param] < 0) {
        return { ok: false, error: { code: "INVALID_INPUT", message: "min_price_cents must be >= 0" } };
      }
      if (param === "max_concurrent_jobs" && params[param] < 1) {
        return { ok: false, error: { code: "INVALID_INPUT", message: "max_concurrent_jobs must be >= 1" } };
      }
      if (param === "availability" && !["available", "busy", "offline"].includes(params[param])) {
        return { ok: false, error: { code: "INVALID_INPUT", message: "availability must be available, busy, or offline" } };
      }
      updates.push(`${col} = ?`);
      values.push(params[param]);
    }
  }

  if (params.capabilities !== undefined) {
    updates.push("capabilities_json = ?");
    values.push(JSON.stringify(params.capabilities));
  }

  if (updates.length === 0) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "No fields to update" } };
  }

  updates.push("updated_at = datetime('now')");
  values.push(profile.id);

  ctx.db.prepare(
    `UPDATE marketplace_profiles SET ${updates.join(", ")} WHERE id = ?`,
  ).run(...values);

  const updated = ctx.db.prepare(`SELECT * FROM marketplace_profiles WHERE id = ?`).get(profile.id);
  return { ok: true, data: updated };
}

export function handleMarketplaceSearch(params: any, ctx: HandlerContext): HandlerResult<any> {
  const conditions: string[] = ["mp.availability = 'available'"];
  const values: any[] = [];

  if (params.max_price_cents !== undefined) {
    conditions.push("(mp.per_task_rate_cents <= ? OR mp.hourly_rate_cents <= ?)");
    values.push(params.max_price_cents, params.max_price_cents);
  }

  if (params.availability) {
    conditions[0] = "mp.availability = ?";
    values.push(params.availability);
  }

  if (params.capabilities) {
    // Simple keyword match on capabilities JSON
    for (const cap of params.capabilities) {
      conditions.push("mp.capabilities_json LIKE ?");
      values.push(`%${cap}%`);
    }
  }

  const limit = Math.min(params.max_results || 20, 100);
  values.push(limit);

  const rows = ctx.db.prepare(
    `SELECT mp.*, u.cluster_id, u.display_name, u.text_profile, u.agent_capabilities
     FROM marketplace_profiles mp
     JOIN users u ON u.user_token = mp.registration_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY mp.total_jobs_completed DESC, mp.total_earned_cents DESC
     LIMIT ?`,
  ).all(...values) as any[];

  // Enrich with reputation if available
  const results = rows.map(row => ({
    marketplace_id: row.id,
    registration_id: row.registration_id,
    display_name: row.display_name,
    cluster_id: row.cluster_id,
    hourly_rate_cents: row.hourly_rate_cents,
    per_task_rate_cents: row.per_task_rate_cents,
    availability: row.availability,
    total_jobs_completed: row.total_jobs_completed,
    total_earned_cents: row.total_earned_cents,
    avg_delivery_seconds: row.avg_delivery_seconds,
    capabilities: row.capabilities_json ? JSON.parse(row.capabilities_json) : null,
  }));

  return { ok: true, data: { results, total: results.length } };
}

export function handleMarketRates(params: any, ctx: HandlerContext): HandlerResult<any> {
  const clusterId = params.cluster_id;

  let query = `SELECT ns.agreed_price_cents FROM negotiation_sessions ns
    WHERE ns.status = 'agreed' AND ns.agreed_price_cents IS NOT NULL`;
  const values: any[] = [];

  if (clusterId) {
    query += " AND ns.cluster_id = ?";
    values.push(clusterId);
  }
  query += " ORDER BY ns.agreed_price_cents";

  const rows = ctx.db.prepare(query).all(...values) as any[];

  if (rows.length === 0) {
    return {
      ok: true,
      data: {
        cluster_id: clusterId || "all",
        sample_size: 0,
        message: "No completed negotiations to compute rates",
      },
    };
  }

  const prices = rows.map((r: any) => r.agreed_price_cents);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0
    ? Math.round((prices[mid - 1] + prices[mid]) / 2)
    : prices[mid];
  const p25 = prices[Math.floor(prices.length * 0.25)];
  const p75 = prices[Math.floor(prices.length * 0.75)];

  return {
    ok: true,
    data: {
      cluster_id: clusterId || "all",
      sample_size: prices.length,
      median_cents: median,
      p25_cents: p25,
      p75_cents: p75,
      min_cents: prices[0],
      max_cents: prices[prices.length - 1],
    },
  };
}
