import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  ContractRecord,
  DeliverableRecord,
} from "../types.js";
import { otherToken } from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface DeliveriesInput {
  user_token: string;
  contract_id: string;
  status_filter?: string;
}

export interface DeliveryView {
  delivery_id: string;
  contract_id: string;
  milestone_id: string | null;
  type: string;
  content: string;
  content_type: string | null;
  filename: string | null;
  metadata: Record<string, unknown> | null;
  checksum: string | null;
  message: string | null;
  status: string;
  feedback: string | null;
  rating: number | null;
  delivered_at: string;
  responded_at: string | null;
  expires_at: string;
  delivered_by: "you" | "them";
}

export interface DeliveriesOutput {
  deliveries: DeliveryView[];
  total: number;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleDeliveries(
  input: DeliveriesInput,
  ctx: HandlerContext,
): Promise<HandlerResult<DeliveriesOutput>> {
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

  // ── Verify contract exists ─────────────────────────────────────
  const contract = ctx.db
    .prepare("SELECT * FROM contracts WHERE contract_id = ?")
    .get(input.contract_id) as ContractRecord | undefined;

  if (!contract) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found" },
    };
  }

  // ── Verify candidate pair and authorization ────────────────────
  const candidate = ctx.db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(contract.candidate_id) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_FOUND", message: "Candidate pair for contract not found" },
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

  // ── Query deliverables ─────────────────────────────────────────
  let rows: DeliverableRecord[];

  if (input.status_filter) {
    rows = ctx.db
      .prepare(
        "SELECT * FROM deliverables WHERE contract_id = ? AND status = ? ORDER BY delivered_at DESC",
      )
      .all(input.contract_id, input.status_filter) as DeliverableRecord[];
  } else {
    rows = ctx.db
      .prepare(
        "SELECT * FROM deliverables WHERE contract_id = ? ORDER BY delivered_at DESC",
      )
      .all(input.contract_id) as DeliverableRecord[];
  }

  // ── Map to output with delivered_by perspective ─────────────────
  const deliveries: DeliveryView[] = rows.map((row) => ({
    delivery_id: row.delivery_id,
    contract_id: row.contract_id,
    milestone_id: row.milestone_id,
    type: row.type,
    content: row.content,
    content_type: row.content_type,
    filename: row.filename,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    checksum: row.checksum,
    message: row.message,
    status: row.status,
    feedback: row.feedback,
    rating: row.rating,
    delivered_at: row.delivered_at,
    responded_at: row.responded_at,
    expires_at: row.expires_at,
    delivered_by: row.deliverer_token === input.user_token ? "you" as const : "them" as const,
  }));

  const result: DeliveriesOutput = {
    deliveries,
    total: deliveries.length,
  };

  return { ok: true, data: result };
}
