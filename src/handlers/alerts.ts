import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { authenticateAgent, extractApiKey, safeJsonParse } from "./submit.js";

// ─── Constants ────────────────────────────────────────────────────────

export const DEFAULT_ALERT_THRESHOLD = 0.5;
export const ALERT_W_AB = 0.5;
export const ALERT_W_BA = 0.5;

// ─── Cosine similarity (local — avoids circular import with match.ts) ─

export function alertCosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── List Alerts ──────────────────────────────────────────────────────

export interface AlertsListInput {
  agent_api_key?: string;
  status?: "pending" | "dismissed";
  limit?: number;
  offset?: number;
}

export interface AlertRecord {
  alert_id: string;
  submission_id: string;
  matched_submission_id: string;
  matched_intent_text: string;
  score: number;
  score_breakdown: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export async function handleAlertsList(
  params: AlertsListInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ alerts: AlertRecord[]; total: number }>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const statusFilter = params.status ?? null;

  // Only return alerts for submissions owned by this agent
  let query = `
    SELECT a.id, a.submission_id, a.matched_submission_id,
           ms.intent_text as matched_intent_text,
           a.score, a.score_breakdown, a.status, a.created_at
    FROM v4_alerts a
    JOIN submissions s  ON a.submission_id = s.id
    JOIN submissions ms ON a.matched_submission_id = ms.id
    WHERE s.agent_id = ?`;
  const qParams: unknown[] = [agent.id];

  if (statusFilter) {
    query += " AND a.status = ?";
    qParams.push(statusFilter);
  }

  const countQuery = `
    SELECT COUNT(*) as c FROM v4_alerts a
    JOIN submissions s ON a.submission_id = s.id
    WHERE s.agent_id = ?${statusFilter ? " AND a.status = ?" : ""}`;
  const countParams: unknown[] = statusFilter ? [agent.id, statusFilter] : [agent.id];
  const total = (ctx.db.prepare(countQuery).get(...countParams) as { c: number })?.c ?? 0;

  query += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
  qParams.push(limit, offset);

  const rows = ctx.db.prepare(query).all(...qParams) as Record<string, any>[];

  const alerts: AlertRecord[] = rows.map((row) => ({
    alert_id: row.id,
    submission_id: row.submission_id,
    matched_submission_id: row.matched_submission_id,
    matched_intent_text: row.matched_intent_text,
    score: row.score,
    score_breakdown: row.score_breakdown ? safeJsonParse(row.score_breakdown, null) : null,
    status: row.status,
    created_at: row.created_at,
  }));

  return { ok: true, data: { alerts, total } };
}

// ─── Dismiss Alert ────────────────────────────────────────────────────

export interface AlertsDismissInput {
  agent_api_key?: string;
  alert_id: string;
}

export async function handleAlertsDismiss(
  params: AlertsDismissInput,
  ctx: HandlerContext,
  authHeader?: string | null,
): Promise<HandlerResult<{ alert_id: string; status: "dismissed" }>> {
  const { key: apiKey } = extractApiKey(params as Record<string, unknown>, authHeader ?? null);
  const agent = authenticateAgent(ctx.db, apiKey);
  if (!agent) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing agent_api_key." } };
  }

  if (!params.alert_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "alert_id is required." } };
  }

  // Verify the alert belongs to this agent (via submission ownership)
  const alert = ctx.db
    .prepare(
      `SELECT a.id, a.status FROM v4_alerts a
       JOIN submissions s ON a.submission_id = s.id
       WHERE a.id = ? AND s.agent_id = ?`,
    )
    .get(params.alert_id, agent.id) as { id: string; status: string } | undefined;

  if (!alert) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Alert not found or not owned by this agent." } };
  }

  if (alert.status === "dismissed") {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Alert is already dismissed." } };
  }

  ctx.db
    .prepare("UPDATE v4_alerts SET status = 'dismissed' WHERE id = ?")
    .run(params.alert_id);

  return { ok: true, data: { alert_id: params.alert_id, status: "dismissed" } };
}
