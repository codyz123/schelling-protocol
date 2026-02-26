import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  ContractRecord,
  UserRecord,
  EventRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

const VALID_EVENT_TYPES = [
  "milestone_reached",
  "schedule_change",
  "issue_reported",
  "completion_signal",
  "status_update",
  "custom",
] as const;

type EventType = (typeof VALID_EVENT_TYPES)[number];

export interface EventEmitInput {
  user_token: string;
  action: "emit";
  candidate_id: string;
  contract_id?: string;
  event_type: EventType;
  payload?: unknown;
  requires_ack?: boolean;
  ack_deadline_hours?: number;
  idempotency_key?: string;
}

export interface EventAckInput {
  user_token: string;
  action: "ack";
  event_id: string;
  response?: string;
}

export interface EventListInput {
  user_token: string;
  action: "list";
  candidate_id?: string;
  contract_id?: string;
  since?: string;
  limit?: number;
}

export type EventInput = EventEmitInput | EventAckInput | EventListInput;

export interface EventEmitOutput {
  event_id: string;
  emitted_at: string;
  ack_deadline: string | null;
}

export interface EventAckOutput {
  acked: true;
  acked_at: string;
}

export interface EventListItem {
  event_id: string;
  candidate_id: string;
  contract_id: string | null;
  event_type: string;
  payload: unknown;
  requires_ack: boolean;
  ack_deadline: string | null;
  acked: boolean;
  acked_at: string | null;
  ack_response: string | null;
  emitted_at: string;
  emitted_by: "you" | "them";
}

export interface EventListOutput {
  events: EventListItem[];
}

export type EventOutput = EventEmitOutput | EventAckOutput | EventListOutput;

// ─── Handler ───────────────────────────────────────────────────────

export async function handleEvent(
  input: EventInput,
  ctx: HandlerContext,
): Promise<HandlerResult<EventOutput>> {
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

  switch (input.action) {
    case "emit":
      return handleEmit(input, ctx);
    case "ack":
      return handleAck(input, ctx);
    case "list":
      return handleList(input, ctx);
    default:
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `action must be one of: emit, ack, list`,
        },
      };
  }
}

// ─── Emit ───────────────────────────────────────────────────────────

async function handleEmit(
  input: EventEmitInput,
  ctx: HandlerContext,
): Promise<HandlerResult<EventEmitOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<EventEmitOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

  // ── Validate event_type ────────────────────────────────────────
  if (!VALID_EVENT_TYPES.includes(input.event_type as EventType)) {
    return {
      ok: false,
      error: {
        code: "INVALID_EVENT_TYPE",
        message: `event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
      },
    };
  }

  // ── Validate payload size ─────────────────────────────────────
  if (input.payload !== undefined) {
    const payloadStr = JSON.stringify(input.payload);
    if (payloadStr.length > 10240) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "payload must not exceed 10KB",
        },
      };
    }
  }

  // ── Validate ack_deadline_hours ────────────────────────────────
  const ackDeadlineHours = input.ack_deadline_hours ?? 72;
  if (ackDeadlineHours < 1 || ackDeadlineHours > 720) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "ack_deadline_hours must be between 1 and 720",
      },
    };
  }

  // ── Verify candidate pair exists and user is a participant ────
  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate pair not found" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not a participant in this candidate pair" },
    };
  }

  // ── Stage gating ──────────────────────────────────────────────
  if (input.contract_id) {
    // Events on contracts: COMMITTED (stage 3+) with active/completing contract
    const side = callerSide(input.user_token, candidate);
    const callerStage = side === "a" ? candidate.stage_a : candidate.stage_b;

    if (callerStage < Stage.COMMITTED) {
      return {
        ok: false,
        error: {
          code: "STAGE_VIOLATION",
          message: "Contract events require COMMITTED stage (3) or higher",
        },
      };
    }

    // Verify contract exists and is active/completing
    const contract = ctx.db
      .prepare("SELECT * FROM contracts WHERE contract_id = ?")
      .get(input.contract_id) as ContractRecord | undefined;

    if (!contract) {
      return {
        ok: false,
        error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
      };
    }

    if (contract.candidate_id !== input.candidate_id) {
      return {
        ok: false,
        error: { code: "CONTRACT_NOT_FOUND", message: "Contract does not belong to this candidate pair" },
      };
    }

    if (contract.status !== "active" && contract.status !== "completing" && contract.status !== "accepted") {
      return {
        ok: false,
        error: {
          code: "CONTRACT_NOT_ACTIVE",
          message: `Contract status is "${contract.status}" — events require active or completing contract`,
        },
      };
    }
  } else {
    // Events on candidate pairs: CONNECTED (stage 4)
    if (candidate.stage_a < Stage.CONNECTED || candidate.stage_b < Stage.CONNECTED) {
      return {
        ok: false,
        error: {
          code: "STAGE_VIOLATION",
          message: "Candidate events require both parties at CONNECTED stage (4)",
        },
      };
    }
  }

  // ── Insert event ──────────────────────────────────────────────
  const eventId = randomUUID();
  const now = new Date();
  const emittedAt = now.toISOString().replace("T", " ").slice(0, 19);
  const requiresAck = input.requires_ack ?? false;

  let ackDeadline: string | null = null;
  if (requiresAck) {
    const deadline = new Date(now);
    deadline.setHours(deadline.getHours() + ackDeadlineHours);
    ackDeadline = deadline.toISOString().replace("T", " ").slice(0, 19);
  }

  ctx.db
    .prepare(
      `INSERT INTO events (
        event_id, candidate_id, contract_id, emitter_token, event_type,
        payload, requires_ack, ack_deadline, acked, emitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      eventId,
      input.candidate_id,
      input.contract_id ?? null,
      input.user_token,
      input.event_type,
      input.payload !== undefined ? JSON.stringify(input.payload) : null,
      requiresAck ? 1 : 0,
      ackDeadline,
      emittedAt,
    );

  const result: EventEmitOutput = {
    event_id: eventId,
    emitted_at: emittedAt,
    ack_deadline: ackDeadline,
  };

  // Record idempotency
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "event_emit", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Ack ────────────────────────────────────────────────────────────

async function handleAck(
  input: EventAckInput,
  ctx: HandlerContext,
): Promise<HandlerResult<EventAckOutput>> {
  // ── Validate response length ──────────────────────────────────
  if (input.response !== undefined && input.response.length > 2000) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "response must not exceed 2000 characters",
      },
    };
  }

  // ── Verify event exists ───────────────────────────────────────
  const event = ctx.db
    .prepare("SELECT * FROM events WHERE event_id = ?")
    .get(input.event_id) as EventRecord | undefined;

  if (!event) {
    return {
      ok: false,
      error: { code: "EVENT_NOT_FOUND", message: "Event not found" },
    };
  }

  // ── Verify event requires ack ─────────────────────────────────
  if (!event.requires_ack) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "This event does not require acknowledgement",
      },
    };
  }

  // ── Verify not already acked ──────────────────────────────────
  if (event.acked) {
    return {
      ok: false,
      error: { code: "EVENT_ALREADY_ACKED", message: "Event has already been acknowledged" },
    };
  }

  // ── Verify caller is NOT the emitter ──────────────────────────
  if (event.emitter_token === input.user_token) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Cannot acknowledge your own event" },
    };
  }

  // ── Verify caller is a participant in the candidate pair ──────
  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(event.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate pair not found" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not a participant in this candidate pair" },
    };
  }

  // ── Verify not past deadline ──────────────────────────────────
  if (event.ack_deadline) {
    const deadline = new Date(event.ack_deadline);
    if (new Date() > deadline) {
      return {
        ok: false,
        error: { code: "ACK_DEADLINE_PASSED", message: "Acknowledgement deadline has passed" },
      };
    }
  }

  // ── Update event ──────────────────────────────────────────────
  const ackedAt = new Date().toISOString().replace("T", " ").slice(0, 19);

  ctx.db
    .prepare(
      `UPDATE events SET acked = 1, acked_at = ?, ack_response = ?
       WHERE event_id = ?`,
    )
    .run(ackedAt, input.response ?? null, input.event_id);

  return { ok: true, data: { acked: true, acked_at: ackedAt } };
}

// ─── List ───────────────────────────────────────────────────────────

async function handleList(
  input: EventListInput,
  ctx: HandlerContext,
): Promise<HandlerResult<EventListOutput>> {
  const limit = Math.min(input.limit ?? 50, 200);

  // Build query: events for candidate pairs the caller participates in
  let sql = `
    SELECT e.* FROM events e
    INNER JOIN candidates c ON e.candidate_id = c.id
    WHERE (c.user_a_token = ? OR c.user_b_token = ?)
  `;
  const params: unknown[] = [input.user_token, input.user_token];

  if (input.candidate_id) {
    sql += " AND e.candidate_id = ?";
    params.push(input.candidate_id);
  }

  if (input.contract_id) {
    sql += " AND e.contract_id = ?";
    params.push(input.contract_id);
  }

  if (input.since) {
    sql += " AND e.emitted_at > ?";
    params.push(input.since);
  }

  sql += " ORDER BY e.emitted_at DESC LIMIT ?";
  params.push(limit);

  const rows = ctx.db.prepare(sql).all(...params) as EventRecord[];

  const events: EventListItem[] = rows.map((r) => ({
    event_id: r.event_id,
    candidate_id: r.candidate_id,
    contract_id: r.contract_id,
    event_type: r.event_type,
    payload: r.payload ? JSON.parse(r.payload) : null,
    requires_ack: r.requires_ack === 1,
    ack_deadline: r.ack_deadline,
    acked: r.acked === 1,
    acked_at: r.acked_at,
    ack_response: r.ack_response,
    emitted_at: r.emitted_at,
    emitted_by: r.emitter_token === input.user_token ? "you" : "them",
  }));

  return { ok: true, data: { events } };
}
