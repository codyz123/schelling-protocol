import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, CandidateRecord } from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";

export interface ContractInput {
  user_token: string;
  candidate_id?: string;
  action: "propose" | "accept" | "reject" | "counter" | "complete" | "terminate" | "list";
  contract_id?: string;
  terms?: Record<string, any>;
  type?: "match" | "service" | "task" | "custom";
  expires_at?: string;
  reason?: string;
  status?: string; // for list filter
  idempotency_key?: string;
}

export async function handleContract(
  input: ContractInput,
  ctx: HandlerContext
): Promise<HandlerResult<any>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  if (input.action === "list") {
    let sql = "SELECT * FROM contracts WHERE (proposer_token = ? OR responder_token = ?)";
    const params: any[] = [input.user_token, input.user_token];
    if (input.candidate_id) {
      sql += " AND candidate_id = ?";
      params.push(input.candidate_id);
    }
    if (input.status) {
      sql += " AND status = ?";
      params.push(input.status);
    }
    sql += " ORDER BY proposed_at DESC";
    const contracts = ctx.db.prepare(sql).all(...params);
    return { ok: true, data: { contracts } };
  }

  if (input.action === "propose") {
    if (!input.candidate_id) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "candidate_id required" } };
    }
    if (!input.terms) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "terms required" } };
    }
    if (!input.type) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "type required" } };
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
    if (myStage < Stage.COMMITTED) {
      return { ok: false, error: { code: "STAGE_VIOLATION", message: "Must be at COMMITTED stage or later" } };
    }

    const responder = otherToken(input.user_token, candidate);
    const expiresAt = input.expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const id = randomUUID();

    ctx.db.prepare(
      `INSERT INTO contracts (id, candidate_id, proposer_token, responder_token, type, terms, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`
    ).run(id, input.candidate_id, input.user_token, responder, input.type, JSON.stringify(input.terms), expiresAt);

    // Pending action
    ctx.db.prepare(
      "INSERT INTO pending_actions (id, user_token, candidate_id, action_type) VALUES (?, ?, ?, 'respond_proposal')"
    ).run(randomUUID(), responder, input.candidate_id);

    return { ok: true, data: { contract_id: id, status: "proposed" } };
  }

  // For accept/reject/counter/complete/terminate - need contract_id
  if (!input.contract_id) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "contract_id required" } };
  }

  const contract = ctx.db.prepare("SELECT * FROM contracts WHERE id = ?").get(input.contract_id) as any;
  if (!contract) {
    return { ok: false, error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" } };
  }

  if (contract.proposer_token !== input.user_token && contract.responder_token !== input.user_token) {
    return { ok: false, error: { code: "NOT_PARTICIPANT", message: "Not a participant" } };
  }

  if (input.action === "accept") {
    if (contract.proposer_token === input.user_token) {
      return { ok: false, error: { code: "CANNOT_RESPOND_OWN_PROPOSAL", message: "Cannot accept your own proposal" } };
    }
    if (contract.status !== "proposed" && contract.status !== "counter_proposed") {
      return { ok: false, error: { code: "CONTRACT_NOT_PENDING", message: "Contract is not in a pending state" } };
    }
    ctx.db.prepare("UPDATE contracts SET status = 'active', accepted_at = datetime('now') WHERE id = ?").run(input.contract_id);
    return { ok: true, data: { contract_id: input.contract_id, status: "active" } };
  }

  if (input.action === "reject") {
    if (contract.proposer_token === input.user_token) {
      return { ok: false, error: { code: "CANNOT_RESPOND_OWN_PROPOSAL", message: "Cannot reject your own proposal" } };
    }
    if (contract.status !== "proposed" && contract.status !== "counter_proposed") {
      return { ok: false, error: { code: "CONTRACT_NOT_PENDING", message: "Contract is not in a pending state" } };
    }
    ctx.db.prepare("UPDATE contracts SET status = 'rejected' WHERE id = ?").run(input.contract_id);
    return { ok: true, data: { contract_id: input.contract_id, status: "rejected" } };
  }

  if (input.action === "counter") {
    if (!input.terms) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "terms required for counter" } };
    }
    if (contract.status !== "proposed" && contract.status !== "counter_proposed") {
      return { ok: false, error: { code: "CONTRACT_NOT_PENDING", message: "Contract is not in a pending state" } };
    }
    ctx.db.prepare("UPDATE contracts SET status = 'counter_proposed', terms = ?, version = version + 1 WHERE id = ?")
      .run(JSON.stringify(input.terms), input.contract_id);
    return { ok: true, data: { contract_id: input.contract_id, status: "counter_proposed" } };
  }

  if (input.action === "complete") {
    if (contract.status !== "active") {
      return { ok: false, error: { code: "CONTRACT_NOT_ACTIVE", message: "Contract must be active to complete" } };
    }
    ctx.db.prepare("UPDATE contracts SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(input.contract_id);

    // Positive reputation events for both parties
    const now = Date.now();
    ctx.db.prepare(
      "INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, vertical_id, event_type, rating, created_at) VALUES (?, ?, ?, 0.5, 'contract', 'completion', 'positive', ?)"
    ).run(randomUUID(), contract.proposer_token, contract.responder_token, now);
    ctx.db.prepare(
      "INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, vertical_id, event_type, rating, created_at) VALUES (?, ?, ?, 0.5, 'contract', 'completion', 'positive', ?)"
    ).run(randomUUID(), contract.responder_token, contract.proposer_token, now);

    return { ok: true, data: { contract_id: input.contract_id, status: "completed" } };
  }

  if (input.action === "terminate") {
    if (contract.status !== "active") {
      return { ok: false, error: { code: "CONTRACT_NOT_ACTIVE", message: "Contract must be active to terminate" } };
    }
    ctx.db.prepare("UPDATE contracts SET status = 'terminated', terminated_at = datetime('now'), terminated_by = ?, termination_reason = ? WHERE id = ?")
      .run(input.user_token, input.reason ?? null, input.contract_id);

    // Negative reputation for terminator
    ctx.db.prepare(
      "INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, vertical_id, event_type, rating, created_at) VALUES (?, ?, ?, 0.5, 'contract', 'abandonment', 'negative', ?)"
    ).run(randomUUID(), input.user_token, otherToken(input.user_token, { user_a_token: contract.proposer_token, user_b_token: contract.responder_token } as any), Date.now());

    return { ok: true, data: { contract_id: input.contract_id, status: "terminated" } };
  }

  return { ok: false, error: { code: "INVALID_INPUT", message: `Unknown action: ${input.action}` } };
}
