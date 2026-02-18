import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";

export interface ContractUpdateInput {
  user_token: string;
  contract_id: string;
  updated_terms: Record<string, any>;
  reason?: string;
  idempotency_key?: string;
}

export async function handleContractUpdate(
  input: ContractUpdateInput,
  ctx: HandlerContext
): Promise<HandlerResult<{ amendment_id: string; status: string }>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  const contract = ctx.db.prepare("SELECT * FROM contracts WHERE id = ?").get(input.contract_id) as any;
  if (!contract) {
    return { ok: false, error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" } };
  }

  if (contract.proposer_token !== input.user_token && contract.responder_token !== input.user_token) {
    return { ok: false, error: { code: "NOT_PARTICIPANT", message: "Not a participant" } };
  }

  if (contract.status !== "active") {
    return { ok: false, error: { code: "CONTRACT_NOT_ACTIVE", message: "Contract must be active for amendments" } };
  }

  // Rate limit: 5 amendments per contract per 24h
  const recentCount = ctx.db.prepare(
    "SELECT COUNT(*) as count FROM contract_amendments WHERE contract_id = ? AND proposed_at > datetime('now', '-24 hours')"
  ).get(input.contract_id) as { count: number };

  if (recentCount.count >= 5) {
    return { ok: false, error: { code: "RATE_LIMITED", message: "Maximum 5 amendments per contract per 24 hours" } };
  }

  const id = randomUUID();
  ctx.db.prepare(
    "INSERT INTO contract_amendments (id, contract_id, proposer_token, updated_terms, reason) VALUES (?, ?, ?, ?, ?)"
  ).run(id, input.contract_id, input.user_token, JSON.stringify(input.updated_terms), input.reason ?? null);

  // Pending action for counterparty
  const counterparty = contract.proposer_token === input.user_token ? contract.responder_token : contract.proposer_token;
  ctx.db.prepare(
    "INSERT INTO pending_actions (id, user_token, candidate_id, action_type) VALUES (?, ?, ?, 'respond_proposal')"
  ).run(randomUUID(), counterparty, contract.candidate_id);

  return { ok: true, data: { amendment_id: id, status: "proposed" } };
}
