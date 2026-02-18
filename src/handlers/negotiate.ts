import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult, UserRecord } from "../types.js";
import { Stage, orderTokens } from "../types.js";
import { getCluster as getVertical } from "../clusters/registry.js";

export interface NegotiateInput {
  user_token: string;
  candidate_id: string;
  proposal?: {
    price?: number;
    shipping_method?: string;
    delivery_date?: string;
    notes?: string;
  };
  accept?: boolean; // If true, accept the latest proposal and advance to COMMITTED
  idempotency_key?: string;
}

export interface NegotiateOutput {
  round: number;
  status: "proposed" | "accepted" | "countered" | "expired";
  proposal: Record<string, any>;
  counterparty_token?: string; // For accepted proposals
  negotiations_left: number;
  expires_at: number;
}

export async function handleNegotiate(
  input: NegotiateInput,
  ctx: HandlerContext
): Promise<HandlerResult<NegotiateOutput>> {
  
  // Check idempotency
  if (input.idempotency_key) {
    const existing = ctx.db
      .prepare("SELECT response FROM idempotency_keys WHERE key = ? AND operation = 'negotiate'")
      .get(input.idempotency_key) as { response: string } | undefined;
    if (existing) {
      return { ok: true, data: JSON.parse(existing.response) };
    }
  }

  const caller = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!caller) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // Get the candidate pair
  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(input.candidate_id) as any;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" },
    };
  }

  // Verify caller is part of this candidate pair
  if (candidate.user_a_token !== input.user_token && candidate.user_b_token !== input.user_token) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not part of this candidate pair" },
    };
  }

  // Get vertical configuration
  const vertical = getVertical(candidate.vertical_id);
  if (!vertical) {
    return {
      ok: false,
      error: { code: "INVALID_VERTICAL", message: `Vertical ${candidate.vertical_id} not found` }
    };
  }

  // Check if negotiation is enabled for this vertical
  if (!vertical.negotiation?.enabled) {
    return {
      ok: false,
      error: { 
        code: "NEGOTIATION_NOT_ENABLED", 
        message: `Negotiation is not enabled for vertical ${candidate.vertical_id}` 
      }
    };
  }

  // Verify candidate is at EXCHANGED stage
  const callerStage = candidate.user_a_token === input.user_token ? candidate.stage_a : candidate.stage_b;
  const counterpartyStage = candidate.user_a_token === input.user_token ? candidate.stage_b : candidate.stage_a;
  
  if (callerStage < Stage.EXCHANGED) {
    return {
      ok: false,
      error: { 
        code: "INVALID_STAGE", 
        message: "Negotiation requires EXCHANGED stage. Current stage is too early." 
      }
    };
  }

  // Get existing negotiations for this candidate pair
  const existingNegotiations = ctx.db
    .prepare("SELECT * FROM negotiations WHERE candidate_id = ? ORDER BY round DESC")
    .all(input.candidate_id) as any[];

  const maxRounds = vertical.negotiation.max_rounds || 5;
  const timeoutHours = vertical.negotiation.timeout_hours || 48;

  // Check if max rounds exceeded
  if (existingNegotiations.length >= maxRounds) {
    return {
      ok: false,
      error: { 
        code: "MAX_ROUNDS_EXCEEDED", 
        message: `Maximum of ${maxRounds} negotiation rounds exceeded` 
      }
    };
  }

  const counterpartyToken = candidate.user_a_token === input.user_token 
    ? candidate.user_b_token 
    : candidate.user_a_token;

  const now = Date.now();
  const expiresAt = now + (timeoutHours * 60 * 60 * 1000);

  // Handle acceptance of latest proposal
  if (input.accept) {
    if (existingNegotiations.length === 0) {
      return {
        ok: false,
        error: { code: "NO_PROPOSAL_TO_ACCEPT", message: "No proposal to accept" }
      };
    }

    const latestProposal = existingNegotiations[0];
    if (latestProposal.from_identity === input.user_token) {
      return {
        ok: false,
        error: { code: "CANNOT_ACCEPT_OWN_PROPOSAL", message: "Cannot accept your own proposal" }
      };
    }

    if (latestProposal.status !== 'pending') {
      return {
        ok: false,
        error: { code: "PROPOSAL_NOT_PENDING", message: "Proposal is not pending acceptance" }
      };
    }

    // Accept the proposal - advance both sides to COMMITTED
    const updateResult = ctx.db.transaction(() => {
      // Update proposal status to accepted
      ctx.db
        .prepare("UPDATE negotiations SET status = 'accepted' WHERE id = ?")
        .run(latestProposal.id);

      // Advance both users to COMMITTED stage
      ctx.db
        .prepare("UPDATE candidates SET stage_a = 4, stage_b = 4, updated_at = datetime('now') WHERE id = ?")
        .run(input.candidate_id);

      // Handle exclusive commitment for marketplace
      if (vertical.exclusive_commitment) {
        handleExclusiveCommitment(ctx, candidate, input.user_token, counterpartyToken);
      }

      // Add pending action for counterparty
      ctx.db
        .prepare(`INSERT INTO pending_actions (id, user_token, candidate_id, action_type) 
                  VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), counterpartyToken, input.candidate_id, 'review_commitment');
    });

    updateResult();

    const result: NegotiateOutput = {
      round: latestProposal.round,
      status: "accepted",
      proposal: JSON.parse(latestProposal.proposal),
      counterparty_token: counterpartyToken,
      negotiations_left: maxRounds - existingNegotiations.length,
      expires_at: expiresAt
    };

    // Store idempotency key
    if (input.idempotency_key) {
      ctx.db
        .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
        .run(input.idempotency_key, 'negotiate', input.user_token, JSON.stringify(result));
    }

    return { ok: true, data: result };
  }

  // Handle new proposal
  if (!input.proposal || Object.keys(input.proposal).length === 0) {
    return {
      ok: false,
      error: { code: "MISSING_PROPOSAL", message: "Proposal data is required" }
    };
  }

  // Validate proposal against schema
  const proposalSchema = vertical.negotiation.proposal_schema;
  for (const [key, value] of Object.entries(input.proposal)) {
    if (!proposalSchema[key]) {
      return {
        ok: false,
        error: { 
          code: "INVALID_PROPOSAL_FIELD", 
          message: `Field '${key}' is not allowed in proposals for this vertical` 
        }
      };
    }
  }

  const nextRound = existingNegotiations.length + 1;
  
  // Create new negotiation record
  const negotiationId = randomUUID();
  
  const createResult = ctx.db.transaction(() => {
    ctx.db
      .prepare(`
        INSERT INTO negotiations (id, candidate_id, from_identity, round, proposal, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .run(
        negotiationId,
        input.candidate_id,
        input.user_token,
        nextRound,
        JSON.stringify(input.proposal),
        now,
        expiresAt
      );

    // Add pending action for counterparty
    ctx.db
      .prepare(`INSERT INTO pending_actions (id, user_token, candidate_id, action_type) 
                VALUES (?, ?, ?, ?)`)
      .run(randomUUID(), counterpartyToken, input.candidate_id, 'respond_proposal');
  });

  createResult();

  const result: NegotiateOutput = {
    round: nextRound,
    status: "proposed",
    proposal: input.proposal,
    negotiations_left: maxRounds - nextRound,
    expires_at: expiresAt
  };

  // Store idempotency key
  if (input.idempotency_key) {
    ctx.db
      .prepare("INSERT OR REPLACE INTO idempotency_keys (key, operation, user_token, response) VALUES (?, ?, ?, ?)")
      .run(input.idempotency_key, 'negotiate', input.user_token, JSON.stringify(result));
  }

  return { ok: true, data: result };
}

/**
 * Handle exclusive commitment logic for marketplace verticals
 * When a seller commits, all other candidate pairs for the same seller are auto-declined
 */
function handleExclusiveCommitment(
  ctx: HandlerContext, 
  currentCandidate: any, 
  callerToken: string, 
  counterpartyToken: string
): void {
  // Find all other candidate pairs for the same seller in this vertical
  const otherCandidates = ctx.db
    .prepare(`
      SELECT id, user_a_token, user_b_token FROM candidates 
      WHERE vertical_id = ? 
        AND id != ? 
        AND (user_a_token = ? OR user_b_token = ?)
        AND (stage_a < 4 OR stage_b < 4)
    `)
    .all(
      currentCandidate.vertical_id,
      currentCandidate.id,
      callerToken,
      callerToken
    ) as any[];

  // Auto-decline all other candidates with exclusive_commitment reason
  for (const candidate of otherCandidates) {
    ctx.db
      .prepare(`
        INSERT INTO declines (id, decliner_token, declined_token, vertical_id, stage_at_decline, reason)
        VALUES (?, ?, ?, ?, ?, 'exclusive_commitment')
      `)
      .run(
        randomUUID(),
        callerToken,
        candidate.user_a_token === callerToken ? candidate.user_b_token : candidate.user_a_token,
        currentCandidate.vertical_id,
        Math.max(candidate.stage_a, candidate.stage_b),
      );

    // Delete the candidate pair
    ctx.db
      .prepare("DELETE FROM candidates WHERE id = ?")
      .run(candidate.id);
  }
}