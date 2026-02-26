import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  ContractRecord,
  DeliverableRecord,
} from "../types.js";
import { otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface AcceptDeliveryInput {
  user_token: string;
  delivery_id: string;
  accepted: boolean;
  feedback?: string;
  rating?: number;
  idempotency_key?: string;
}

export interface AcceptDeliveryOutput {
  delivery_id: string;
  status: string;
  responded_at: string;
  contract_status: string;
  milestone_status: string | null;
}

// ─── Constants ────────────────────────────────────────────────────

const MAX_FEEDBACK_LENGTH = 5000;

// ─── Helpers ──────────────────────────────────────────────────────

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

// ─── Handler ───────────────────────────────────────────────────────

export async function handleAcceptDelivery(
  input: AcceptDeliveryInput,
  ctx: HandlerContext,
): Promise<HandlerResult<AcceptDeliveryOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<AcceptDeliveryOutput>(ctx.db, input.idempotency_key);
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

  // ── Validate feedback length ───────────────────────────────────
  if (input.feedback && input.feedback.length > MAX_FEEDBACK_LENGTH) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `feedback must not exceed ${MAX_FEEDBACK_LENGTH} characters` },
    };
  }

  // ── Validate rating range ──────────────────────────────────────
  if (input.rating !== undefined && input.rating !== null) {
    if (typeof input.rating !== "number" || input.rating < 0 || input.rating > 1) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "rating must be a number between 0 and 1" },
      };
    }
  }

  // ── Verify delivery exists ─────────────────────────────────────
  const delivery = ctx.db
    .prepare("SELECT * FROM deliverables WHERE delivery_id = ?")
    .get(input.delivery_id) as DeliverableRecord | undefined;

  if (!delivery) {
    return {
      ok: false,
      error: { code: "DELIVERY_NOT_FOUND", message: "Delivery not found" },
    };
  }

  // ── Delivery must be in "delivered" status ─────────────────────
  if (delivery.status !== "delivered") {
    return {
      ok: false,
      error: { code: "ALREADY_RESPONDED", message: `Delivery has already been responded to (status: ${delivery.status})` },
    };
  }

  // ── Check delivery expiration ──────────────────────────────────
  if (new Date(delivery.expires_at) < new Date()) {
    return {
      ok: false,
      error: { code: "DELIVERY_EXPIRED", message: "Delivery has expired" },
    };
  }

  // ── Verify contract and candidate ──────────────────────────────
  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(delivery.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract for delivery not found" },
    };
  }

  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(contract.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Candidate pair for contract not found" },
    };
  }

  // ── Caller must be the OTHER party (not the deliverer) ─────────
  if (input.user_token === delivery.deliverer_token) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Cannot respond to your own delivery" },
    };
  }

  if (
    input.user_token !== candidate.user_a_token &&
    input.user_token !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "You are not a party to this contract" },
    };
  }

  // ── Perform accept/reject ──────────────────────────────────────
  const respondedAt = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const newStatus = input.accepted ? "accepted" : "rejected";

  const doRespond = ctx.db.transaction(() => {
    ctx.db.prepare(
      `UPDATE deliverables SET status = ?, feedback = ?, rating = ?, responded_at = ? WHERE delivery_id = ?`,
    ).run(
      newStatus,
      input.feedback ?? null,
      input.rating ?? null,
      respondedAt,
      delivery.delivery_id,
    );

    // Reputation events
    if (input.accepted) {
      // +0.03 for deliverer
      insertReputationEvent(ctx.db, delivery.deliverer_token, input.user_token, candidate.cluster_id, "deliverable_accepted");
    } else {
      // -0.02 for deliverer
      insertReputationEvent(ctx.db, delivery.deliverer_token, input.user_token, candidate.cluster_id, "deliverable_rejected", input.feedback ?? null);
    }
  });

  try {
    doRespond();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // ── Check milestone completion status ──────────────────────────
  let milestoneStatus: string | null = null;

  if (input.accepted && delivery.milestone_id && contract.milestones) {
    const milestones: Array<{ milestone_id: string }> = JSON.parse(contract.milestones);

    // Check if all milestones have accepted deliverables
    const allMilestonesAccepted = milestones.every((m) => {
      const accepted = ctx.db
        .prepare(
          "SELECT 1 FROM deliverables WHERE contract_id = ? AND milestone_id = ? AND status = 'accepted' LIMIT 1",
        )
        .get(contract.contract_id, m.milestone_id);
      return !!accepted;
    });

    if (allMilestonesAccepted) {
      milestoneStatus = "all_completed";
      // Create pending action for contract completion
      const otherPartyToken = otherToken(input.user_token, candidate);
      ctx.db.prepare(
        `INSERT INTO pending_actions (id, user_token, candidate_id, action_type, details, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      ).run(
        randomUUID(),
        otherPartyToken,
        candidate.id,
        "all_milestones_completed",
        JSON.stringify({ contract_id: contract.contract_id }),
      );
      ctx.db.prepare(
        `INSERT INTO pending_actions (id, user_token, candidate_id, action_type, details, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      ).run(
        randomUUID(),
        input.user_token,
        candidate.id,
        "all_milestones_completed",
        JSON.stringify({ contract_id: contract.contract_id }),
      );
    } else {
      milestoneStatus = "partial";
    }
  }

  // ── Re-read contract for latest status ─────────────────────────
  const updatedContract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(contract.contract_id) as ContractRecord;

  const result: AcceptDeliveryOutput = {
    delivery_id: delivery.delivery_id,
    status: newStatus,
    responded_at: respondedAt,
    contract_status: updatedContract.status,
    milestone_status: milestoneStatus,
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "accept_delivery", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
