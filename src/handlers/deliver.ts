import { randomUUID } from "node:crypto";
import type {
  HandlerContext,
  HandlerResult,
  CandidateRecord,
  UserRecord,
  ContractRecord,
  DeliverableRecord,
} from "../types.js";
import { callerSide, otherToken } from "../types.js";
import { checkIdempotency, recordIdempotency } from "../core/funnel.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface DeliverInput {
  user_token: string;
  contract_id: string;
  milestone_id?: string;
  deliverable: {
    type: string;
    content: string;
    content_type?: string;
    filename?: string;
    metadata?: Record<string, unknown>;
    checksum?: string;
  };
  message?: string;
  idempotency_key?: string;
}

export interface DeliverOutput {
  delivery_id: string;
  contract_id: string;
  milestone_id: string | null;
  delivered_at: string;
  expires_at: string;
  status: string;
}

// ─── Constants ────────────────────────────────────────────────────

const VALID_DELIVERABLE_TYPES = ["file", "url", "message", "structured"];
const MAX_MESSAGE_LENGTH = 5000;
const EXECUTABLE_MIME_TYPES = [
  "application/x-executable",
  "application/x-msdos-program",
  "application/x-msdownload",
  "application/x-sh",
  "application/x-shellscript",
  "application/x-bat",
  "application/x-msi",
  "application/vnd.microsoft.portable-executable",
];

// ─── Handler ───────────────────────────────────────────────────────

export async function handleDeliver(
  input: DeliverInput,
  ctx: HandlerContext,
): Promise<HandlerResult<DeliverOutput>> {
  // ── Idempotency ────────────────────────────────────────────────
  if (input.idempotency_key) {
    const cached = checkIdempotency<DeliverOutput>(ctx.db, input.idempotency_key);
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

  // ── Validate deliverable type ──────────────────────────────────
  if (!input.deliverable || !VALID_DELIVERABLE_TYPES.includes(input.deliverable.type)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DELIVERABLE_TYPE",
        message: `deliverable.type must be one of: ${VALID_DELIVERABLE_TYPES.join(", ")}`,
      },
    };
  }

  // ── Validate message length ────────────────────────────────────
  if (input.message && input.message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: `message must not exceed ${MAX_MESSAGE_LENGTH} characters` },
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

  // ── Contract must be active or completing ──────────────────────
  if (contract.status !== "active" && contract.status !== "completing") {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_ACTIVE", message: `Contract is not active (status: ${contract.status})` },
    };
  }

  // ── Caller must be party to the contract ───────────────────────
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

  // ── Validate content_type against safe_types and executable blocking ──
  if (input.deliverable.type === "file" && input.deliverable.content_type) {
    const contentType = input.deliverable.content_type;

    // Block executable MIME types unless in safe_types
    const safeTypes: string[] = contract.safe_types ? JSON.parse(contract.safe_types) : [];
    if (EXECUTABLE_MIME_TYPES.includes(contentType) && !safeTypes.includes(contentType)) {
      return {
        ok: false,
        error: {
          code: "INVALID_DELIVERABLE_TYPE",
          message: `Executable MIME type "${contentType}" is not allowed unless specified in contract safe_types`,
        },
      };
    }

    // If safe_types is set, only matching content_type is allowed
    if (safeTypes.length > 0 && !safeTypes.includes(contentType)) {
      return {
        ok: false,
        error: {
          code: "INVALID_DELIVERABLE_TYPE",
          message: `Content type "${contentType}" is not in the contract's allowed safe_types`,
        },
      };
    }
  }

  // ── Validate milestone if provided ─────────────────────────────
  if (input.milestone_id && contract.milestones) {
    const milestones: Array<{ milestone_id: string }> = JSON.parse(contract.milestones);
    const found = milestones.some((m) => m.milestone_id === input.milestone_id);
    if (!found) {
      return {
        ok: false,
        error: { code: "MILESTONE_NOT_FOUND", message: `Milestone "${input.milestone_id}" not found in contract` },
      };
    }
  } else if (input.milestone_id && !contract.milestones) {
    return {
      ok: false,
      error: { code: "MILESTONE_NOT_FOUND", message: "Contract has no milestones defined" },
    };
  }

  // ── Insert deliverable ─────────────────────────────────────────
  const deliveryId = randomUUID();
  const now = new Date();
  const deliveredAt = now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const expiresDate = new Date(now);
  expiresDate.setDate(expiresDate.getDate() + 7);
  const expiresAt = expiresDate.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

  const metadataJson = input.deliverable.metadata ? JSON.stringify(input.deliverable.metadata) : null;

  ctx.db.prepare(
    `INSERT INTO deliverables (delivery_id, contract_id, deliverer_token, milestone_id, type, content, content_type, filename, metadata, checksum, message, status, delivered_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?)`,
  ).run(
    deliveryId,
    input.contract_id,
    input.user_token,
    input.milestone_id ?? null,
    input.deliverable.type,
    input.deliverable.content,
    input.deliverable.content_type ?? null,
    input.deliverable.filename ?? null,
    metadataJson,
    input.deliverable.checksum ?? null,
    input.message ?? null,
    deliveredAt,
    expiresAt,
  );

  const result: DeliverOutput = {
    delivery_id: deliveryId,
    contract_id: input.contract_id,
    milestone_id: input.milestone_id ?? null,
    delivered_at: deliveredAt,
    expires_at: expiresAt,
    status: "delivered",
  };

  // ── Record idempotency ─────────────────────────────────────────
  if (input.idempotency_key) {
    recordIdempotency(ctx.db, input.idempotency_key, "deliver", input.user_token, {
      ok: true,
      data: result,
    });
  }

  return { ok: true, data: result };
}
