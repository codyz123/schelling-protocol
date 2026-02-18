import type { HandlerContext, HandlerResult } from "../types.js";

interface ExportDataRequest {
  user_token: string;
}

interface ExportDataResponse {
  user_data: {
    user_profile: any;
    registrations: any[];
    candidates: any[];
    reputation_events: any[];
    disputes: any[];
    outcomes: any[];
    negotiations: any[];
    verifications: any[];
    pending_actions: any[];
  };
  export_timestamp: number;
  data_format: "json";
}

export async function handleExportData(
  params: ExportDataRequest,
  ctx: HandlerContext
): Promise<HandlerResult<ExportDataResponse>> {
  const { db } = ctx;
  const { user_token } = params;

  try {
    // Validate user exists
    const getUserQuery = db.query<any>(`
      SELECT * FROM users WHERE user_token = ?
    `);
    const user = getUserQuery.get(user_token);
    
    if (!user) {
      return { 
        ok: false, 
        error: { code: "USER_NOT_FOUND", message: "User not found" } 
      };
    }

    // Export all user data from all relevant tables

    // 1. User profile data
    const user_profile = user;

    // 2. All registrations (in case user registered in multiple verticals)
    const getRegistrations = db.query<any>(`
      SELECT * FROM users WHERE user_token = ?
    `);
    const registrations = getRegistrations.all(user_token);

    // 3. All candidate pairs involving this user
    const getCandidates = db.query<any>(`
      SELECT * FROM candidates 
      WHERE user_a_token = ? OR user_b_token = ?
      ORDER BY created_at DESC
    `);
    const candidates = getCandidates.all(user_token, user_token);

    // 4. All reputation events about this user
    const getReputationEvents = db.query<any>(`
      SELECT * FROM reputation_events 
      WHERE identity_id = ?
      ORDER BY created_at DESC
    `);
    const reputation_events = getReputationEvents.all(user_token);

    // 5. All disputes involving this user (filed by or against)
    const getDisputes = db.query<any>(`
      SELECT * FROM disputes 
      WHERE filed_by = ? OR filed_against = ?
      ORDER BY created_at DESC
    `);
    const disputes = getDisputes.all(user_token, user_token);

    // 6. All outcome reports by this user
    const getOutcomes = db.query<any>(`
      SELECT * FROM outcomes 
      WHERE reporter_token = ?
      ORDER BY created_at DESC
    `);
    const outcomes = getOutcomes.all(user_token);

    // 7. All negotiations involving this user
    const getNegotiations = db.query<any>(`
      SELECT n.* FROM negotiations n
      JOIN candidates c ON n.candidate_id = c.id
      WHERE c.user_a_token = ? OR c.user_b_token = ?
      ORDER BY n.created_at DESC
    `);
    const negotiations = getNegotiations.all(user_token, user_token);

    // 8. All verifications involving this user
    const getVerifications = db.query<any>(`
      SELECT * FROM verifications 
      WHERE requested_by = ? OR requested_from = ?
      ORDER BY created_at DESC
    `);
    const verifications = getVerifications.all(user_token, user_token);

    // 9. All pending actions for this user
    const getPendingActions = db.query<any>(`
      SELECT * FROM pending_actions 
      WHERE user_token = ?
      ORDER BY created_at DESC
    `);
    const pending_actions = getPendingActions.all(user_token);

    // Also get declines table data
    const getDeclines = db.query<any>(`
      SELECT * FROM declines 
      WHERE decliner_token = ? OR declined_token = ?
      ORDER BY created_at DESC
    `);
    const declines = getDeclines.all(user_token, user_token);

    return {
      ok: true,
      data: {
        user_data: {
          user_profile,
          registrations,
          candidates,
          reputation_events,
          disputes,
          outcomes,
          negotiations,
          verifications,
          pending_actions,
          declines
        },
        export_timestamp: Date.now(),
        data_format: "json"
      }
    };

  } catch (error) {
    return { 
      ok: false, 
      error: { 
        code: "INTERNAL_ERROR", 
        message: error instanceof Error ? error.message : "Unknown error" 
      } 
    };
  }
}