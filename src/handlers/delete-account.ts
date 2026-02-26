import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
} from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface DeleteAccountInput {
  user_token: string;
  confirmation: string;
}

export interface DeleteAccountOutput {
  deleted: true;
  deleted_at: string;
  cascade_summary: {
    profiles: number;
    candidates: number;
    messages: number;
    inquiries: number;
    subscriptions: number;
    contracts: number;
    deliverables: number;
    events: number;
  };
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleDeleteAccount(
  input: DeleteAccountInput,
  ctx: HandlerContext,
): Promise<HandlerResult<DeleteAccountOutput>> {
  // ── Validate confirmation ────────────────────────────────────────
  if (input.confirmation !== "PERMANENTLY_DELETE") {
    return {
      ok: false,
      error: {
        code: "CONFIRMATION_REQUIRED",
        message: "Must provide confirmation string 'PERMANENTLY_DELETE'",
      },
    };
  }

  // ── Verify user exists ─────────────────────────────────────────
  const user = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!user) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Cascade delete with counts ─────────────────────────────────
  const summary = {
    profiles: 0,
    candidates: 0,
    messages: 0,
    inquiries: 0,
    subscriptions: 0,
    contracts: 0,
    deliverables: 0,
    events: 0,
  };

  const doDelete = ctx.db.transaction(() => {
    // 1. Delete traits
    const traitResult = ctx.db
      .prepare("DELETE FROM traits WHERE user_token = ?")
      .run(input.user_token);
    summary.profiles += traitResult.changes;

    // 2. Delete preferences
    const prefResult = ctx.db
      .prepare("DELETE FROM preferences WHERE user_token = ?")
      .run(input.user_token);
    summary.profiles += prefResult.changes;

    // 3. Find candidate IDs involving this user (for cascading)
    const candidateRows = ctx.db
      .prepare(
        "SELECT id FROM candidates WHERE user_a_token = ? OR user_b_token = ?",
      )
      .all(input.user_token, input.user_token) as { id: string }[];

    const candidateIds = candidateRows.map((r) => r.id);

    if (candidateIds.length > 0) {
      const placeholders = candidateIds.map(() => "?").join(",");

      // 4. Delete messages in those candidate pairs
      const msgResult = ctx.db
        .prepare(
          `DELETE FROM messages WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);
      summary.messages = msgResult.changes;

      // 5. Delete inquiries
      const inqResult = ctx.db
        .prepare(
          `DELETE FROM inquiries WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);
      summary.inquiries = inqResult.changes;

      // Find contract IDs for deliverable cleanup
      const contractRows = ctx.db
        .prepare(
          `SELECT contract_id FROM contracts WHERE candidate_id IN (${placeholders})`,
        )
        .all(...candidateIds) as { contract_id: string }[];

      const contractIds = contractRows.map((r) => r.contract_id);

      if (contractIds.length > 0) {
        const contractPlaceholders = contractIds.map(() => "?").join(",");

        // Delete deliverables
        const delResult = ctx.db
          .prepare(
            `DELETE FROM deliverables WHERE contract_id IN (${contractPlaceholders})`,
          )
          .run(...contractIds);
        summary.deliverables = delResult.changes;

        // Delete contract amendments
        ctx.db
          .prepare(
            `DELETE FROM contract_amendments WHERE contract_id IN (${contractPlaceholders})`,
          )
          .run(...contractIds);
      }

      // Delete contracts
      const contractResult = ctx.db
        .prepare(
          `DELETE FROM contracts WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);
      summary.contracts = contractResult.changes;

      // Delete events
      const eventResult = ctx.db
        .prepare(
          `DELETE FROM events WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);
      summary.events = eventResult.changes;

      // Delete outcomes
      ctx.db
        .prepare(
          `DELETE FROM outcomes WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);

      // Delete disputes
      ctx.db
        .prepare(
          `DELETE FROM disputes WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);

      // Delete direct contacts
      ctx.db
        .prepare(
          `DELETE FROM direct_contacts WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);

      // Delete relay blocks
      ctx.db
        .prepare(
          `DELETE FROM relay_blocks WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);

      // Delete pending actions tied to candidates
      ctx.db
        .prepare(
          `DELETE FROM pending_actions WHERE candidate_id IN (${placeholders})`,
        )
        .run(...candidateIds);
    }

    // Delete candidates
    const candResult = ctx.db
      .prepare(
        "DELETE FROM candidates WHERE user_a_token = ? OR user_b_token = ?",
      )
      .run(input.user_token, input.user_token);
    summary.candidates = candResult.changes;

    // Delete subscriptions
    const subResult = ctx.db
      .prepare("DELETE FROM subscriptions WHERE user_token = ?")
      .run(input.user_token);
    summary.subscriptions = subResult.changes;

    // Delete notifications tied to subscriptions (already gone via CASCADE, but explicit)
    // Delete remaining pending actions
    ctx.db
      .prepare("DELETE FROM pending_actions WHERE user_token = ?")
      .run(input.user_token);

    // Delete jury assignments
    ctx.db
      .prepare("DELETE FROM jury_assignments WHERE juror_token = ?")
      .run(input.user_token);

    // Delete jury verdicts
    ctx.db
      .prepare("DELETE FROM jury_verdicts WHERE juror_token = ?")
      .run(input.user_token);

    // Delete verifications
    ctx.db
      .prepare(
        "DELETE FROM verifications WHERE user_token = ? OR requested_from = ?",
      )
      .run(input.user_token, input.user_token);

    // Delete enforcement actions
    ctx.db
      .prepare("DELETE FROM enforcement_actions WHERE user_token = ?")
      .run(input.user_token);

    // Delete reputation events
    ctx.db
      .prepare(
        "DELETE FROM reputation_events WHERE identity_id = ? OR reporter_id = ?",
      )
      .run(input.user_token, input.user_token);

    // Delete declines
    ctx.db
      .prepare(
        "DELETE FROM declines WHERE decliner_token = ? OR declined_token = ?",
      )
      .run(input.user_token, input.user_token);

    // Delete tool feedback
    ctx.db
      .prepare("DELETE FROM tool_feedback WHERE user_token = ?")
      .run(input.user_token);

    // Delete tools owned by this user
    ctx.db
      .prepare("DELETE FROM tools WHERE owner_token = ?")
      .run(input.user_token);

    // Delete idempotency keys
    ctx.db
      .prepare("DELETE FROM idempotency_keys WHERE user_token = ?")
      .run(input.user_token);

    // Finally delete user record
    ctx.db
      .prepare("DELETE FROM users WHERE user_token = ?")
      .run(input.user_token);
    summary.profiles += 1;
  });

  try {
    doDelete();
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  return {
    ok: true,
    data: {
      deleted: true,
      deleted_at: new Date().toISOString(),
      cascade_summary: summary,
    },
  };
}
