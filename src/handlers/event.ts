import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, CandidateRecord } from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";

export interface EventInput {
  user_token: string;
  action: "emit" | "ack" | "list";
  candidate_id?: string;
  contract_id?: string;
  type?: "milestone" | "update" | "completion" | "issue" | "custom";
  data?: Record<string, any>;
  requires_ack?: boolean;
  ack_window_hours?: number;
  event_id?: string;
  ack_note?: string;
  since?: string;
  limit?: number;
  idempotency_key?: string;
}

export async function handleEvent(
  input: EventInput,
  ctx: HandlerContext
): Promise<HandlerResult<any>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  if (input.action === "emit") {
    if (!input.candidate_id) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "candidate_id required" } };
    }
    if (!input.type) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "type required" } };
    }
    if (!input.data) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "data required" } };
    }
    const dataStr = JSON.stringify(input.data);
    if (dataStr.length > 10240) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Event data must be 10KB or less" } };
    }

    const candidate = ctx.db.prepare("SELECT * FROM candidates WHERE id = ?").get(input.candidate_id) as CandidateRecord | undefined;
    if (!candidate) {
      return { ok: false, error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" } };
    }
    if (candidate.user_a_token !== input.user_token && candidate.user_b_token !== input.user_token) {
      return { ok: false, error: { code: "NOT_PARTICIPANT", message: "Not a participant" } };
    }

    const side = callerSide(input.user_token, candidate);
    const myStage = side === "a" ? candidate.stage_a : candidate.stage_b;
    if (myStage < Stage.CONNECTED) {
      return { ok: false, error: { code: "STAGE_VIOLATION", message: "Must be at CONNECTED stage or later" } };
    }

    // If contract_id provided, validate it's active
    if (input.contract_id) {
      const contract = ctx.db.prepare("SELECT status FROM contracts WHERE id = ?").get(input.contract_id) as any;
      if (!contract) {
        return { ok: false, error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" } };
      }
      if (contract.status !== "active") {
        return { ok: false, error: { code: "CONTRACT_NOT_ACTIVE", message: "Contract must be active" } };
      }
    }

    const id = randomUUID();
    const requiresAck = input.requires_ack ? 1 : 0;
    const ackDeadline = input.requires_ack
      ? new Date(Date.now() + (input.ack_window_hours ?? 48) * 60 * 60 * 1000).toISOString()
      : null;
    const status = input.requires_ack ? "pending_ack" : "emitted";

    ctx.db.prepare(
      `INSERT INTO lifecycle_events (id, candidate_id, contract_id, emitter_token, type, data, requires_ack, ack_deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.candidate_id, input.contract_id ?? null, input.user_token, input.type, dataStr, requiresAck, ackDeadline, status);

    // Pending action for counterparty
    const counterparty = otherToken(input.user_token, candidate);
    const actionType = input.requires_ack ? "new_message" : "new_message";
    ctx.db.prepare(
      "INSERT INTO pending_actions (id, user_token, candidate_id, action_type) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), counterparty, input.candidate_id, actionType);

    // Completion events = positive reputation
    if (input.type === "completion") {
      ctx.db.prepare(
        "INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, vertical_id, event_type, rating, created_at) VALUES (?, ?, ?, 0.5, 'event', 'completion', 'positive', ?)"
      ).run(randomUUID(), input.user_token, counterparty, Date.now());
    }

    return { ok: true, data: { event_id: id, status, ack_deadline: ackDeadline } };
  }

  if (input.action === "ack") {
    if (!input.event_id) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "event_id required" } };
    }

    const event = ctx.db.prepare("SELECT * FROM lifecycle_events WHERE id = ?").get(input.event_id) as any;
    if (!event) {
      return { ok: false, error: { code: "EVENT_NOT_FOUND", message: "Event not found" } };
    }
    if (event.emitter_token === input.user_token) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Cannot acknowledge your own event" } };
    }
    if (event.status === "acknowledged") {
      return { ok: false, error: { code: "EVENT_ALREADY_ACKED", message: "Event already acknowledged" } };
    }
    if (event.ack_deadline && new Date(event.ack_deadline) < new Date()) {
      return { ok: false, error: { code: "ACK_DEADLINE_PASSED", message: "Acknowledgment deadline has passed" } };
    }

    ctx.db.prepare("UPDATE lifecycle_events SET status = 'acknowledged', acknowledged_at = datetime('now'), ack_note = ? WHERE id = ?")
      .run(input.ack_note ?? null, input.event_id);

    return { ok: true, data: { event_id: input.event_id, status: "acknowledged" } };
  }

  if (input.action === "list") {
    let sql = `SELECT * FROM lifecycle_events WHERE 1=1`;
    const params: any[] = [];

    if (input.candidate_id) {
      sql += " AND candidate_id = ?";
      params.push(input.candidate_id);
    }
    if (input.contract_id) {
      sql += " AND contract_id = ?";
      params.push(input.contract_id);
    }
    if (input.since) {
      sql += " AND emitted_at > ?";
      params.push(input.since);
    }

    // Must be participant in at least one of the events
    sql += " AND (emitter_token = ? OR candidate_id IN (SELECT id FROM candidates WHERE user_a_token = ? OR user_b_token = ?))";
    params.push(input.user_token, input.user_token, input.user_token);

    sql += " ORDER BY emitted_at DESC LIMIT ?";
    params.push(input.limit ?? 50);

    const events = ctx.db.prepare(sql).all(...params);
    return { ok: true, data: { events } };
  }

  return { ok: false, error: { code: "INVALID_INPUT", message: `Unknown action: ${input.action}` } };
}
