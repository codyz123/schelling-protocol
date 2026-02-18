import type { HandlerContext, HandlerResult } from "../types.js";

interface DeleteAccountRequest {
  user_token: string;
  confirmation: string;
}

interface DeleteAccountResponse {
  deleted: true;
  deleted_at: number;
}

export async function handleDeleteAccount(
  params: DeleteAccountRequest,
  ctx: HandlerContext
): Promise<HandlerResult<DeleteAccountResponse>> {
  const { db } = ctx;
  const { user_token, confirmation } = params;

  try {
    // Validate confirmation string
    if (confirmation !== "DELETE_ALL_DATA") {
      return { 
        ok: false, 
        error: { 
          code: "CONFIRMATION_REQUIRED", 
          message: "Must provide confirmation string 'DELETE_ALL_DATA'" 
        } 
      };
    }

    // Validate user exists
    const getUserQuery = db.query<{ user_token: string }>(`
      SELECT user_token FROM users WHERE user_token = ?
    `);
    const user = getUserQuery.get(user_token);
    
    if (!user) {
      return { 
        ok: false, 
        error: { code: "USER_NOT_FOUND", message: "User not found" } 
      };
    }

    const deleted_at = Date.now();

    // Perform cascading deletion in the correct order to avoid foreign key constraint issues
    
    // 1. Delete pending actions
    const deletePendingActions = db.query(`
      DELETE FROM pending_actions WHERE user_token = ?
    `);
    deletePendingActions.run(user_token);

    // 2. Delete negotiations (via candidate relationship)
    const deleteNegotiations = db.query(`
      DELETE FROM negotiations 
      WHERE candidate_id IN (
        SELECT id FROM candidates 
        WHERE user_a_token = ? OR user_b_token = ?
      )
    `);
    deleteNegotiations.run(user_token, user_token);

    // 3. Delete verifications
    const deleteVerifications = db.query(`
      DELETE FROM verifications 
      WHERE requested_by = ? OR requested_from = ?
    `);
    deleteVerifications.run(user_token, user_token);

    // 4. Delete outcomes
    const deleteOutcomes = db.query(`
      DELETE FROM outcomes 
      WHERE reporter_token = ?
    `);
    deleteOutcomes.run(user_token);

    // 5. Delete disputes
    const deleteDisputes = db.query(`
      DELETE FROM disputes 
      WHERE filed_by = ? OR filed_against = ?
    `);
    deleteDisputes.run(user_token, user_token);

    // 6. Delete reputation events about this user
    const deleteReputationEvents = db.query(`
      DELETE FROM reputation_events 
      WHERE identity_id = ?
    `);
    deleteReputationEvents.run(user_token);

    // 7. Delete reputation events reported by this user
    const deleteReportedReputationEvents = db.query(`
      DELETE FROM reputation_events 
      WHERE reporter_id = ?
    `);
    deleteReportedReputationEvents.run(user_token);

    // 8. Delete declines
    const deleteDeclines = db.query(`
      DELETE FROM declines 
      WHERE decliner_token = ? OR declined_token = ?
    `);
    deleteDeclines.run(user_token, user_token);

    // 9. Delete candidates (this will cascade to outcomes due to FK constraint)
    const deleteCandidates = db.query(`
      DELETE FROM candidates 
      WHERE user_a_token = ? OR user_b_token = ?
    `);
    deleteCandidates.run(user_token, user_token);

    // 10. Delete idempotency keys for this user
    const deleteIdempotencyKeys = db.query(`
      DELETE FROM idempotency_keys 
      WHERE user_token = ?
    `);
    deleteIdempotencyKeys.run(user_token);

    // 11. Finally, delete the user record itself
    const deleteUser = db.query(`
      DELETE FROM users WHERE user_token = ?
    `);
    deleteUser.run(user_token);

    return {
      ok: true,
      data: {
        deleted: true,
        deleted_at
      }
    };

  } catch (error) {
    return { 
      ok: false, 
      error: { 
        code: "INTERNAL_ERROR", 
        message: error instanceof Error ? error.message : "Unknown error occurred during account deletion" 
      } 
    };
  }
}