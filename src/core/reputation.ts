import type { Database } from "bun:sqlite";
import type { ReputationEventRecord, ReputationScore } from "../types.js";

/**
 * Reputation System for Schelling Protocol v2
 * 
 * 5-factor score computation:
 * - Outcome (40%): Weighted average of ratings received
 * - Completion (20%): Follow-through on commitments
 * - Consistency (20%): How well embedding predicts outcomes
 * - Dispute (10%): Clean dispute record
 * - Tenure (10%): Time-weighted participation
 */

interface ReputationFactors {
  outcome: number;
  completion: number;
  consistency: number;
  dispute: number;
  tenure: number;
}

const REPUTATION_WEIGHTS = {
  outcome: 0.40,
  completion: 0.20,
  consistency: 0.20,
  dispute: 0.10,
  tenure: 0.10,
};

const COLD_START_SCORE = 0.5;
const PROVISIONAL_WEIGHT_MULTIPLIER = 1.5;
const PROVISIONAL_INTERACTION_COUNT = 5;
const CROSS_VERTICAL_BLEED = 0.2;

/**
 * Time-weighted decay function for reputation events
 * weight = max(0.2, e^(-age_days / 365))
 */
function calculateEventWeight(eventTimestamp: number): number {
  const now = Date.now();
  const ageDays = (now - eventTimestamp) / (1000 * 60 * 60 * 24);
  return Math.max(0.2, Math.exp(-ageDays / 365));
}

/**
 * Get all reputation events for a user
 */
function getReputationEvents(db: Database, identityId: string): ReputationEventRecord[] {
  const stmt = db.prepare(`
    SELECT id, identity_id, reporter_id, reporter_reputation, vertical_id, 
           event_type, rating, dimensions, notes, created_at
    FROM reputation_events 
    WHERE identity_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(identityId) as ReputationEventRecord[];
}

/**
 * Get completion stats for a user (CONNECTED -> COMPLETED vs abandoned)
 */
function getCompletionStats(db: Database, identityId: string): { connected: number; completed: number } {
  // Count candidates that reached CONNECTED (stage 5) for this user
  const connectedStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM candidates c
    WHERE (c.user_a_token = ? AND c.stage_a >= 5) 
       OR (c.user_b_token = ? AND c.stage_b >= 5)
  `);
  const connected = (connectedStmt.get(identityId, identityId) as any)?.count || 0;

  // Count candidates that reached COMPLETED (stage 6) for this user
  const completedStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM candidates c
    WHERE ((c.user_a_token = ? AND c.stage_a >= 6) 
        OR (c.user_b_token = ? AND c.stage_b >= 6))
  `);
  const completed = (completedStmt.get(identityId, identityId) as any)?.count || 0;

  return { connected, completed };
}

/**
 * Get user registration date for tenure calculation
 */
function getUserRegistrationDate(db: Database, identityId: string): Date {
  const stmt = db.prepare(`
    SELECT created_at FROM users WHERE user_token = ?
  `);
  const result = stmt.get(identityId) as any;
  return new Date(result?.created_at || Date.now());
}

/**
 * Get count of disputes lost by this user
 */
function getDisputesLost(db: Database, identityId: string): number {
  // This is a placeholder - disputes table doesn't exist yet
  // For now, return 0
  return 0;
}

/**
 * Compute consistency score based on embedding vs outcomes
 * Requires at least 5 outcome events to calculate
 */
function computeConsistencyScore(events: ReputationEventRecord[]): number {
  const outcomeEvents = events.filter(e => e.event_type === "outcome");
  if (outcomeEvents.length < 5) {
    return COLD_START_SCORE; // Not enough data
  }

  // Placeholder implementation - this would require more complex analysis
  // of embedding dimensions vs outcome ratings
  // For now, return neutral score
  return 0.5;
}

/**
 * Compute outcome score from reputation events
 */
function computeOutcomeScore(events: ReputationEventRecord[]): number {
  const outcomeEvents = events.filter(e => e.event_type === "outcome");
  if (outcomeEvents.length === 0) {
    return COLD_START_SCORE;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const event of outcomeEvents) {
    // Convert rating to numeric value
    let value = 0.5; // neutral
    if (event.rating === "positive") value = 1.0;
    else if (event.rating === "negative") value = 0.0;

    // Weight by reporter reputation and time decay
    const reporterWeight = event.reporter_reputation || 0.5;
    const timeWeight = calculateEventWeight(event.created_at);
    const totalEventWeight = reporterWeight * timeWeight;

    // Apply provisional period boost for first 5 interactions
    const provisionalWeight = outcomeEvents.length <= PROVISIONAL_INTERACTION_COUNT ? 
      PROVISIONAL_WEIGHT_MULTIPLIER : 1.0;

    weightedSum += value * totalEventWeight * provisionalWeight;
    totalWeight += totalEventWeight * provisionalWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : COLD_START_SCORE;
}

/**
 * Compute reputation factors for a user in a specific vertical
 */
function computeReputationFactors(
  db: Database, 
  identityId: string, 
  verticalId: string
): ReputationFactors {
  const allEvents = getReputationEvents(db, identityId);
  const verticalEvents = allEvents.filter(e => e.vertical_id === verticalId);

  // 1. Outcome score (0-1): weighted average of ratings
  const outcomeScore = computeOutcomeScore(verticalEvents);

  // 2. Completion rate (0-1)
  const { connected, completed } = getCompletionStats(db, identityId);
  const completionRate = connected > 0 ? completed / connected : 0.5;

  // 3. Consistency score (0-1): embedding vs outcomes
  const consistencyScore = computeConsistencyScore(verticalEvents);

  // 4. Dispute score (0-1): clean record = 1.0
  const disputesLost = getDisputesLost(db, identityId);
  const disputeScore = Math.max(0, 1.0 - (disputesLost * 0.15));

  // 5. Tenure (0-1): months active, capped at 24
  const registrationDate = getUserRegistrationDate(db, identityId);
  const monthsActive = (Date.now() - registrationDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const tenureScore = Math.min(monthsActive / 24, 1.0);

  return {
    outcome: outcomeScore,
    completion: completionRate,
    consistency: consistencyScore,
    dispute: disputeScore,
    tenure: tenureScore,
  };
}

/**
 * Compute overall reputation score for a user in a specific vertical
 */
function computeVerticalReputation(
  db: Database,
  identityId: string,
  verticalId: string
): { score: number; factors: ReputationFactors } {
  const factors = computeReputationFactors(db, identityId, verticalId);
  
  const score = (
    REPUTATION_WEIGHTS.outcome * factors.outcome +
    REPUTATION_WEIGHTS.completion * factors.completion +
    REPUTATION_WEIGHTS.consistency * factors.consistency +
    REPUTATION_WEIGHTS.dispute * factors.dispute +
    REPUTATION_WEIGHTS.tenure * factors.tenure
  );

  return { score: Math.max(0, Math.min(1, score)), factors };
}

/**
 * Get all verticals a user has participated in
 */
function getUserVerticals(db: Database, identityId: string): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT vertical_id 
    FROM reputation_events 
    WHERE identity_id = ?
  `);
  const results = stmt.all(identityId) as any[];
  return results.map(r => r.vertical_id);
}

/**
 * Compute global reputation with cross-vertical bleed
 */
function computeGlobalReputation(db: Database, identityId: string): number {
  const verticals = getUserVerticals(db, identityId);
  if (verticals.length === 0) {
    return COLD_START_SCORE;
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const verticalId of verticals) {
    const { score } = computeVerticalReputation(db, identityId, verticalId);
    const events = getReputationEvents(db, identityId).filter(e => e.vertical_id === verticalId);
    const weight = events.length; // Weight by interaction count in vertical

    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : COLD_START_SCORE;
}

/**
 * Apply cross-vertical bleed to compute effective reputation
 * effective = 0.8 * vertical_rep + 0.2 * global_rep
 */
function computeEffectiveReputation(
  verticalScore: number,
  globalScore: number
): number {
  return (1 - CROSS_VERTICAL_BLEED) * verticalScore + CROSS_VERTICAL_BLEED * globalScore;
}

/**
 * Get interaction count for a user (total completed interactions)
 */
function getInteractionCount(db: Database, identityId: string): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM reputation_events 
    WHERE identity_id = ? AND event_type = 'completion'
  `);
  return (stmt.get(identityId) as any)?.count || 0;
}

/**
 * Get user verification level and member since date
 */
function getUserInfo(db: Database, identityId: string): { 
  verification_level: "anonymous" | "verified" | "attested";
  member_since: string;
} {
  const stmt = db.prepare(`
    SELECT verification_level, created_at 
    FROM users 
    WHERE user_token = ?
  `);
  const result = stmt.get(identityId) as any;
  return {
    verification_level: result?.verification_level || "anonymous",
    member_since: result?.created_at || new Date().toISOString(),
  };
}

/**
 * Main function to compute reputation score for a user
 */
export function computeReputation(
  db: Database,
  identityId: string,
  verticalId?: string
): ReputationScore {
  const userInfo = getUserInfo(db, identityId);
  const interactionCount = getInteractionCount(db, identityId);

  if (verticalId) {
    // Compute for specific vertical with cross-vertical bleed
    const { score: verticalScore, factors } = computeVerticalReputation(db, identityId, verticalId);
    const globalScore = computeGlobalReputation(db, identityId);
    const effectiveScore = computeEffectiveReputation(verticalScore, globalScore);

    // Get all vertical scores
    const verticals = getUserVerticals(db, identityId);
    const verticalScores: Record<string, number> = {};
    for (const vId of verticals) {
      const { score } = computeVerticalReputation(db, identityId, vId);
      verticalScores[vId] = score;
    }

    return {
      score: effectiveScore,
      vertical_scores: verticalScores,
      breakdown: factors,
      interaction_count: interactionCount,
      verification_level: userInfo.verification_level,
      member_since: userInfo.member_since,
    };
  } else {
    // Compute global reputation across all verticals
    const globalScore = computeGlobalReputation(db, identityId);
    const verticals = getUserVerticals(db, identityId);
    const verticalScores: Record<string, number> = {};
    for (const vId of verticals) {
      const { score } = computeVerticalReputation(db, identityId, vId);
      verticalScores[vId] = score;
    }

    // For global reputation, use average factors across all verticals
    const allFactors: ReputationFactors[] = [];
    for (const vId of verticals) {
      const { factors } = computeVerticalReputation(db, identityId, vId);
      allFactors.push(factors);
    }

    const avgFactors = allFactors.length > 0 ? {
      outcome: allFactors.reduce((sum, f) => sum + f.outcome, 0) / allFactors.length,
      completion: allFactors.reduce((sum, f) => sum + f.completion, 0) / allFactors.length,
      consistency: allFactors.reduce((sum, f) => sum + f.consistency, 0) / allFactors.length,
      dispute: allFactors.reduce((sum, f) => sum + f.dispute, 0) / allFactors.length,
      tenure: allFactors.reduce((sum, f) => sum + f.tenure, 0) / allFactors.length,
    } : {
      outcome: COLD_START_SCORE,
      completion: COLD_START_SCORE,
      consistency: COLD_START_SCORE,
      dispute: 1.0,
      tenure: 0.0,
    };

    return {
      score: globalScore,
      vertical_scores: verticalScores,
      breakdown: avgFactors,
      interaction_count: interactionCount,
      verification_level: userInfo.verification_level,
      member_since: userInfo.member_since,
    };
  }
}

/**
 * Record a reputation event
 */
export function recordReputationEvent(
  db: Database,
  event: Omit<ReputationEventRecord, "id" | "created_at">
): void {
  const id = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = Date.now();

  const stmt = db.prepare(`
    INSERT INTO reputation_events 
    (id, identity_id, reporter_id, reporter_reputation, vertical_id, 
     event_type, rating, dimensions, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    event.identity_id,
    event.reporter_id,
    event.reporter_reputation,
    event.vertical_id,
    event.event_type,
    event.rating || null,
    event.dimensions || null,
    event.notes || null,
    createdAt
  );
}

/**
 * Check for abandoned connections and record abandonment events
 * Called periodically to track completion rates
 */
export function checkAbandonedConnections(db: Database): void {
  // Find candidates that reached CONNECTED (stage 5) but haven't had an outcome
  // reported within 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stmt = db.prepare(`
    SELECT c.id, c.user_a_token, c.user_b_token, c.vertical_id,
           c.stage_a, c.stage_b, c.updated_at
    FROM candidates c
    WHERE (c.stage_a >= 5 OR c.stage_b >= 5)
      AND c.stage_a < 6 AND c.stage_b < 6
      AND c.updated_at < ?
      AND NOT EXISTS (
        SELECT 1 FROM outcomes o WHERE o.candidate_id = c.id
      )
  `);

  const abandonedCandidates = stmt.all(thirtyDaysAgo.toISOString()) as any[];

  for (const candidate of abandonedCandidates) {
    // Record abandonment for both parties
    const userAReputation = computeReputation(db, candidate.user_a_token, candidate.vertical_id);
    const userBReputation = computeReputation(db, candidate.user_b_token, candidate.vertical_id);

    // Each user is both the "identity" and "reporter" for abandonment events
    // (abandonment is mutual responsibility)
    recordReputationEvent(db, {
      identity_id: candidate.user_a_token,
      reporter_id: candidate.user_b_token,
      reporter_reputation: userBReputation.score,
      vertical_id: candidate.vertical_id,
      event_type: "abandonment",
      notes: "No outcome reported within 30 days after CONNECTED",
    });

    recordReputationEvent(db, {
      identity_id: candidate.user_b_token,
      reporter_id: candidate.user_a_token,
      reporter_reputation: userAReputation.score,
      vertical_id: candidate.vertical_id,
      event_type: "abandonment",
      notes: "No outcome reported within 30 days after CONNECTED",
    });
  }
}