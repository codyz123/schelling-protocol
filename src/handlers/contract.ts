import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  ContractRecord,
} from "../types.js";
import { Stage, callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface ContractInput {
  user_token: string;
  candidate_id?: string;
  action: "propose" | "accept" | "reject" | "counter" | "complete" | "terminate" | "list";
  contract_id?: string;
  terms?: Record<string, unknown>;
  type?: "match" | "service" | "task" | "custom";
  dispute_content_disclosure?: boolean;
  safe_types?: string[];
  terms_schema_version?: string;
  milestones?: Array<{ milestone_id: string; description: string; deadline: string }>;
  expires_at?: string;
  reason?: string;
  status?: string;
  idempotency_key?: string;
}

export interface ContractOutput {
  contract_id: string;
  candidate_id: string;
  status: string;
  type: string;
  terms: Record<string, unknown>;
  milestones: Array<{ milestone_id: string; description: string; deadline: string }> | null;
  round: number;
  proposed_by: string;
  proposed_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  expires_at: string;
  supersedes: string | null;
}

export interface ContractListOutput {
  contracts: ContractOutput[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

const VALID_CONTRACT_TYPES = ["match", "service", "task", "custom"] as const;
const TERMINAL_STATUSES = ["completed", "expired", "expired_stale", "terminated", "rejected", "superseded"];
const MAX_TERMS_SIZE = 50 * 1024; // 50KB
const MAX_MILESTONES = 20;

function contractToOutput(row: ContractRecord): ContractOutput {
  return {
    contract_id: row.contract_id,
    candidate_id: row.candidate_id,
    status: row.status,
    type: row.type,
    terms: JSON.parse(row.terms),
    milestones: row.milestones ? JSON.parse(row.milestones) : null,
    round: row.round,
    proposed_by: row.proposed_by,
    proposed_at: row.proposed_at,
    accepted_at: row.accepted_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    supersedes: row.supersedes,
  };
}

function insertReputationEvent(
  db: HandlerContext["db"],
  identityId: string,
  reporterId: string,
  clusterId: string,
  eventType: string,
  notes?: string | null,
): void {
  db.prepare(
    `INSERT INTO reputation_events (id, identity_id, reporter_id, reporter_reputation, cluster_id, event_type, rating, dimensions, notes, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    randomUUID(),
    identityId,
    reporterId,
    clusterId,
    eventType,
    notes ?? null,
    Date.now(),
  );
}

function defaultExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleContract(
  input: ContractInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ContractOutput | ContractListOutput>> {
  // ── Validate action ─────────────────────────────────────────────
  const validActions = ["propose", "accept", "reject", "counter", "complete", "terminate", "list"];
  if (!validActions.includes(input.action)) {
    return {
      ok: false,
      error: { code: "INVALID_CONTRACT_ACTION", message: `Invalid action: ${input.action}` },
    };
  }

  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<ContractOutput | ContractListOutput>(ctx.db, input.idempotency_key);
    if (cached) return cached;
  }

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

  // ── List action (does not require candidate_id) ────────────────
  if (input.action === "list") {
    return handleList(input, ctx);
  }

  // ── All non-list actions require candidate_id ──────────────────
  if (!input.candidate_id) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "candidate_id is required" },
    };
  }

  // ── Verify candidate pair exists and user is a participant ─────
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

  // ── Stage gating: must be at COMMITTED(3) or higher ────────────
  const side = callerSide(input.user_token, candidate);
  const callerStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  if (callerStage < Stage.COMMITTED) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Contract operations require COMMITTED stage or higher. Current stage: ${callerStage}`,
      },
    };
  }

  // ── Dispatch to action handlers ─────────────────────────────────
  switch (input.action) {
    case "propose":
      return handlePropose(input, ctx, candidate);
    case "accept":
      return handleAccept(input, ctx, candidate);
    case "reject":
      return handleReject(input, ctx, candidate);
    case "counter":
      return handleCounter(input, ctx, candidate);
    case "complete":
      return handleComplete(input, ctx, candidate);
    case "terminate":
      return handleTerminate(input, ctx, candidate);
    default:
      return {
        ok: false,
        error: { code: "INVALID_CONTRACT_ACTION", message: `Unknown action: ${input.action}` },
      };
  }
}

// ─── Propose ───────────────────────────────────────────────────────

async function handlePropose(
  input: ContractInput,
  ctx: HandlerContext,
  candidate: CandidateRecord,
): Promise<HandlerResult<ContractOutput>> {
  // Validate required fields
  if (!input.terms) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "terms is required for propose" },
    };
  }

  const termsJson = JSON.stringify(input.terms);
  if (termsJson.length > MAX_TERMS_SIZE) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `terms JSON exceeds maximum size of ${MAX_TERMS_SIZE} bytes` },
    };
  }

  if (!input.type || !VALID_CONTRACT_TYPES.includes(input.type)) {
    return {
      ok: false,
      error: { code: "INVALID_CONTRACT_TYPE", message: `type must be one of: ${VALID_CONTRACT_TYPES.join(", ")}` },
    };
  }

  if (input.milestones && input.milestones.length > MAX_MILESTONES) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `Maximum ${MAX_MILESTONES} milestones allowed` },
    };
  }

  const contractId = randomUUID();
  const expiresAt = input.expires_at ?? defaultExpiresAt();
  const milestonesJson = input.milestones ? JSON.stringify(input.milestones) : null;
  const safeTypesJson = input.safe_types ? JSON.stringify(input.safe_types) : null;

  ctx.db.prepare(
    `INSERT INTO contracts (contract_id, candidate_id, proposed_by, type, terms, terms_schema_version, milestones, dispute_content_disclosure, safe_types, status, round, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', 1, ?)`,
  ).run(
    contractId,
    input.candidate_id!,
    input.user_token,
    input.type,
    termsJson,
    input.terms_schema_version ?? null,
    milestonesJson,
    input.dispute_content_disclosure ? 1 : 0,
    safeTypesJson,
    expiresAt,
  );

  const row = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(contractId) as ContractRecord;

  const result = contractToOutput(row);

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_propose", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Accept ────────────────────────────────────────────────────────

async function handleAccept(
  input: ContractInput,
  ctx: HandlerContext,
  candidate: CandidateRecord,
): Promise<HandlerResult<ContractOutput>> {
  if (!input.contract_id) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contract_id is required for accept" },
    };
  }

  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(input.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
    };
  }

  // Cannot respond to own proposal
  if (contract.proposed_by === input.user_token) {
    return {
      ok: false,
      error: { code: "CANNOT_RESPOND_OWN_PROPOSAL", message: "Cannot accept your own proposal" },
    };
  }

  // Must be pending (proposed or counter_proposed)
  if (contract.status !== "proposed" && contract.status !== "counter_proposed") {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_PENDING", message: `Contract is not pending (status: ${contract.status})` },
    };
  }

  // Check expiration
  if (new Date(contract.expires_at) < new Date()) {
    ctx.db.prepare("UPDATE contracts SET status = 'expired' WHERE contract_id = ?").run(contract.contract_id);
    return {
      ok: false,
      error: { code: "CONTRACT_EXPIRED", message: "Contract has expired" },
    };
  }

  ctx.db.prepare(
    `UPDATE contracts SET status = 'active', accepted_at = datetime('now') WHERE contract_id = ?`,
  ).run(contract.contract_id);

  const row = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(contract.contract_id) as ContractRecord;

  const result = contractToOutput(row);

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_accept", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Reject ────────────────────────────────────────────────────────

async function handleReject(
  input: ContractInput,
  ctx: HandlerContext,
  candidate: CandidateRecord,
): Promise<HandlerResult<ContractOutput>> {
  if (!input.contract_id) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contract_id is required for reject" },
    };
  }

  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(input.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
    };
  }

  if (contract.proposed_by === input.user_token) {
    return {
      ok: false,
      error: { code: "CANNOT_RESPOND_OWN_PROPOSAL", message: "Cannot reject your own proposal" },
    };
  }

  if (contract.status !== "proposed" && contract.status !== "counter_proposed") {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_PENDING", message: `Contract is not pending (status: ${contract.status})` },
    };
  }

  if (new Date(contract.expires_at) < new Date()) {
    ctx.db.prepare("UPDATE contracts SET status = 'expired' WHERE contract_id = ?").run(contract.contract_id);
    return {
      ok: false,
      error: { code: "CONTRACT_EXPIRED", message: "Contract has expired" },
    };
  }

  ctx.db.prepare(
    "UPDATE contracts SET status = 'rejected' WHERE contract_id = ?",
  ).run(contract.contract_id);

  const row = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(contract.contract_id) as ContractRecord;

  const result = contractToOutput(row);

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_reject", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Counter ───────────────────────────────────────────────────────

async function handleCounter(
  input: ContractInput,
  ctx: HandlerContext,
  candidate: CandidateRecord,
): Promise<HandlerResult<ContractOutput>> {
  if (!input.contract_id) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contract_id is required for counter" },
    };
  }

  if (!input.terms) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "terms is required for counter" },
    };
  }

  const termsJson = JSON.stringify(input.terms);
  if (termsJson.length > MAX_TERMS_SIZE) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `terms JSON exceeds maximum size of ${MAX_TERMS_SIZE} bytes` },
    };
  }

  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(input.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
    };
  }

  if (contract.proposed_by === input.user_token) {
    return {
      ok: false,
      error: { code: "CANNOT_RESPOND_OWN_PROPOSAL", message: "Cannot counter your own proposal" },
    };
  }

  if (contract.status !== "proposed" && contract.status !== "counter_proposed") {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_PENDING", message: `Contract is not pending (status: ${contract.status})` },
    };
  }

  if (new Date(contract.expires_at) < new Date()) {
    ctx.db.prepare("UPDATE contracts SET status = 'expired' WHERE contract_id = ?").run(contract.contract_id);
    return {
      ok: false,
      error: { code: "CONTRACT_EXPIRED", message: "Contract has expired" },
    };
  }

  const newContractId = randomUUID();
  const newRound = contract.round + 1;
  const expiresAt = input.expires_at ?? defaultExpiresAt();
  const milestonesJson = input.milestones ? JSON.stringify(input.milestones) : contract.milestones;

  const doCounter = ctx.db.transaction(() => {
    // Supersede the original
    ctx.db.prepare(
      "UPDATE contracts SET status = 'superseded' WHERE contract_id = ?",
    ).run(contract.contract_id);

    // Create new counter proposal
    ctx.db.prepare(
      `INSERT INTO contracts (contract_id, candidate_id, proposed_by, type, terms, terms_schema_version, milestones, dispute_content_disclosure, safe_types, status, supersedes, round, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'counter_proposed', ?, ?, ?)`,
    ).run(
      newContractId,
      contract.candidate_id,
      input.user_token,
      contract.type,
      termsJson,
      input.terms_schema_version ?? contract.terms_schema_version,
      milestonesJson,
      contract.dispute_content_disclosure,
      contract.safe_types,
      contract.contract_id,
      newRound,
      expiresAt,
    );
  });

  try {
    doCounter();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const row = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(newContractId) as ContractRecord;

  const result = contractToOutput(row);

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_counter", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Complete ──────────────────────────────────────────────────────

async function handleComplete(
  input: ContractInput,
  ctx: HandlerContext,
  candidate: CandidateRecord,
): Promise<HandlerResult<ContractOutput>> {
  if (!input.contract_id) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contract_id is required for complete" },
    };
  }

  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(input.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
    };
  }

  if (TERMINAL_STATUSES.includes(contract.status)) {
    return {
      ok: false,
      error: { code: "CONTRACT_ALREADY_TERMINAL", message: `Contract is already in terminal status: ${contract.status}` },
    };
  }

  if (contract.status !== "active" && contract.status !== "completing") {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_ACTIVE", message: `Contract must be active or completing to complete (status: ${contract.status})` },
    };
  }

  const callerToken = input.user_token;
  const otherPartyToken = otherToken(input.user_token, candidate);

  if (contract.status === "active") {
    // First party to complete: transition to "completing"
    ctx.db.prepare(
      "UPDATE contracts SET status = 'completing' WHERE contract_id = ?",
    ).run(contract.contract_id);

    // Create pending action for the other party
    ctx.db.prepare(
      `INSERT INTO pending_actions (id, user_token, candidate_id, action_type, details, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      randomUUID(),
      otherPartyToken,
      candidate.id,
      "contract_completing",
      JSON.stringify({ contract_id: contract.contract_id, completed_by: callerToken }),
    );
  } else if (contract.status === "completing") {
    // Second party to complete: finalize
    const doComplete = ctx.db.transaction(() => {
      ctx.db.prepare(
        "UPDATE contracts SET status = 'completed', completed_at = datetime('now') WHERE contract_id = ?",
      ).run(contract.contract_id);

      // Reputation: +0.05 for both parties
      insertReputationEvent(ctx.db, callerToken, "system", candidate.cluster_id, "contract_completed");
      insertReputationEvent(ctx.db, otherPartyToken, "system", candidate.cluster_id, "contract_completed");
    });

    try {
      doComplete();
    } catch (err: unknown) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  const row = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(contract.contract_id) as ContractRecord;

  const result = contractToOutput(row);

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_complete", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── Terminate ─────────────────────────────────────────────────────

async function handleTerminate(
  input: ContractInput,
  ctx: HandlerContext,
  candidate: CandidateRecord,
): Promise<HandlerResult<ContractOutput>> {
  if (!input.contract_id) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "contract_id is required for terminate" },
    };
  }

  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(input.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
    };
  }

  if (TERMINAL_STATUSES.includes(contract.status)) {
    return {
      ok: false,
      error: { code: "CONTRACT_ALREADY_TERMINAL", message: `Contract is already in terminal status: ${contract.status}` },
    };
  }

  const doTerminate = ctx.db.transaction(() => {
    ctx.db.prepare(
      "UPDATE contracts SET status = 'terminated' WHERE contract_id = ?",
    ).run(contract.contract_id);

    // Reputation: -0.04 for terminator
    insertReputationEvent(ctx.db, input.user_token, "system", candidate.cluster_id, "contract_terminated", input.reason ?? null);
  });

  try {
    doTerminate();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const row = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(contract.contract_id) as ContractRecord;

  const result = contractToOutput(row);

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_terminate", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}

// ─── List ──────────────────────────────────────────────────────────

async function handleList(
  input: ContractInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ContractListOutput>> {
  // Find all candidate pairs this user is part of
  let contracts: ContractRecord[];

  if (input.candidate_id) {
    // Verify user is participant in this candidate
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

    if (input.status) {
      contracts = ctx.db
        .prepare("SELECT * FROM contracts WHERE candidate_id = ? AND status = ? ORDER BY proposed_at DESC")
        .all(input.candidate_id, input.status) as ContractRecord[];
    } else {
      contracts = ctx.db
        .prepare("SELECT * FROM contracts WHERE candidate_id = ? ORDER BY proposed_at DESC")
        .all(input.candidate_id) as ContractRecord[];
    }
  } else {
    // Get all contracts for all candidate pairs this user participates in
    if (input.status) {
      contracts = ctx.db
        .prepare(
          `SELECT c.* FROM contracts c
           JOIN candidates cand ON c.candidate_id = cand.id
           WHERE (cand.user_a_token = ? OR cand.user_b_token = ?) AND c.status = ?
           ORDER BY c.proposed_at DESC`,
        )
        .all(input.user_token, input.user_token, input.status) as ContractRecord[];
    } else {
      contracts = ctx.db
        .prepare(
          `SELECT c.* FROM contracts c
           JOIN candidates cand ON c.candidate_id = cand.id
           WHERE cand.user_a_token = ? OR cand.user_b_token = ?
           ORDER BY c.proposed_at DESC`,
        )
        .all(input.user_token, input.user_token) as ContractRecord[];
    }
  }

  const result: ContractListOutput = {
    contracts: contracts.map(contractToOutput),
    total: contracts.length,
  };

  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "contract_list", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
