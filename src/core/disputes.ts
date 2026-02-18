import type { Database } from "bun:sqlite";
import { computeReputation, recordReputationEvent } from "./reputation.js";

export interface Dispute {
  id: string;
  candidate_id: string;
  filed_by: string;
  filed_against: string;
  vertical_id: string;
  stage_at_filing: number;
  reason: string;
  evidence?: string; // JSON
  status: 'open' | 'resolved_for_filer' | 'resolved_for_defendant' | 'dismissed';
  resolved_at?: number;
  resolution_notes?: string;
  created_at: number;
}

export interface DisputeResolution {
  resolution: 'for_filer' | 'for_defendant' | 'dismissed';
  notes: string;
}

/**
 * Resolve a dispute and apply reputation consequences
 */
export function resolveDispute(
  db: Database, 
  dispute_id: string, 
  resolution: 'for_filer' | 'for_defendant' | 'dismissed',
  notes: string
): { success: boolean; error?: string } {
  const getDispute = db.query<Dispute>(`
    SELECT * FROM disputes WHERE id = ? AND status = 'open'
  `);

  const dispute = getDispute.get(dispute_id);
  if (!dispute) {
    return { success: false, error: "Dispute not found or already resolved" };
  }

  const resolved_at = Date.now();

  // Update dispute status
  const updateDispute = db.query(`
    UPDATE disputes 
    SET status = ?, resolved_at = ?, resolution_notes = ?
    WHERE id = ?
  `);

  updateDispute.run(`resolved_${resolution}`, resolved_at, notes, dispute_id);

  // Apply reputation consequences
  if (resolution === 'for_filer') {
    // Filer won, so the accused party (filed_against) gets negative reputation
    if (dispute.filed_against) {
      recordReputationEvent(db, {
        identity_id: dispute.filed_against,
        reporter_id: 'system',
        reporter_reputation: 1.0,
        vertical_id: dispute.vertical_id,
        event_type: 'dispute',
        rating: 'negative',
        dimensions: null,
        notes: `Lost dispute: ${dispute.reason}`
      });
    }
  } else if (resolution === 'for_defendant') {
    // Defendant won, so the filer gets negative reputation for frivolous filing
    if (dispute.filed_by) {
      recordReputationEvent(db, {
        identity_id: dispute.filed_by,
        reporter_id: 'system',
        reporter_reputation: 1.0,
        vertical_id: dispute.vertical_id,
        event_type: 'dispute',
        rating: 'negative',
        dimensions: null,
        notes: `Frivolous dispute filing: ${dispute.reason}`
      });
    }
  }
  // No reputation consequence for 'dismissed' disputes

  // Check for frivolous filing pattern
  if (resolution === 'for_defendant') {
    checkFrivolousFilingPattern(db, dispute.filed_by, dispute.vertical_id);
  }

  return { success: true };
}

/**
 * Check for expired disputes and auto-resolve in filer's favor after 7 days
 */
export function checkExpiredDisputes(db: Database): number {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  const getExpiredDisputes = db.query<{ id: string; filed_by: string; filed_against: string; vertical_id: string }>(`
    SELECT id, filed_by, filed_against, vertical_id
    FROM disputes 
    WHERE status = 'open' 
    AND created_at < ?
  `);

  const expiredDisputes = getExpiredDisputes.all(sevenDaysAgo);
  
  for (const dispute of expiredDisputes) {
    resolveDispute(
      db, 
      dispute.id, 
      'for_filer', 
      'Auto-resolved in filer\'s favor due to no response within 7 days'
    );
  }

  return expiredDisputes.length;
}

/**
 * Check if a user has a pattern of frivolous dispute filing
 */
function checkFrivolousFilingPattern(db: Database, user_token: string, vertical_id: string): void {
  const getDismissedDisputeCount = db.query<{ count: number }>(`
    SELECT COUNT(*) as count 
    FROM disputes 
    WHERE filed_by = ? 
    AND vertical_id = ? 
    AND status = 'resolved_for_defendant'
    AND created_at > ?
  `);

  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const result = getDismissedDisputeCount.get(user_token, vertical_id, thirtyDaysAgo);
  
  if (result && result.count >= 3) {
    // Flag user for frivolous filing - create negative reputation event
    recordReputationEvent(db, {
      identity_id: user_token,
      reporter_id: 'system',
      reporter_reputation: 1.0,
      vertical_id: vertical_id,
      event_type: 'dispute',
      rating: 'negative',
      dimensions: null,
      notes: 'Flagged for frivolous dispute filing pattern (3+ dismissed disputes in 30 days)'
    });
  }
}

/**
 * Get all disputes involving a user
 */
export function getUserDisputes(
  db: Database, 
  user_token: string, 
  vertical_id?: string
): Dispute[] {
  const query = vertical_id 
    ? db.query<Dispute>(`
        SELECT * FROM disputes 
        WHERE (filed_by = ? OR filed_against = ?) 
        AND vertical_id = ?
        ORDER BY created_at DESC
      `)
    : db.query<Dispute>(`
        SELECT * FROM disputes 
        WHERE (filed_by = ? OR filed_against = ?)
        ORDER BY created_at DESC
      `);

  return vertical_id 
    ? query.all(user_token, user_token, vertical_id)
    : query.all(user_token, user_token);
}

/**
 * Check if a dispute already exists for a candidate pair
 */
export function disputeExists(
  db: Database, 
  candidate_id: string, 
  filed_by: string
): boolean {
  const checkQuery = db.query<{ count: number }>(`
    SELECT COUNT(*) as count 
    FROM disputes 
    WHERE candidate_id = ? AND filed_by = ? AND status = 'open'
  `);

  const result = checkQuery.get(candidate_id, filed_by);
  return result ? result.count > 0 : false;
}