import type { Database } from "bun:sqlite";
import { Stage } from "../types.js";
import type { CandidateRecord } from "../types.js";

export interface FunnelTransition {
  from_stage: number;
  to_stage: number;
  requires_mutual?: boolean;
  mutual_stage_threshold?: number;
}

export interface FunnelError {
  code: string;
  message: string;
}

export type FunnelResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: FunnelError };

// Stage transition rules
const STAGE_TRANSITIONS: FunnelTransition[] = [
  { from_stage: Stage.UNDISCOVERED, to_stage: Stage.DISCOVERED },
  { from_stage: Stage.DISCOVERED, to_stage: Stage.EVALUATED },
  { 
    from_stage: Stage.EVALUATED, 
    to_stage: Stage.EXCHANGED, 
    requires_mutual: true, 
    mutual_stage_threshold: Stage.EVALUATED 
  },
  { from_stage: Stage.EXCHANGED, to_stage: Stage.COMMITTED },
  { from_stage: Stage.COMMITTED, to_stage: Stage.CONNECTED },
  { from_stage: Stage.CONNECTED, to_stage: Stage.COMPLETED },
];

export function isValidTransition(fromStage: number, toStage: number): boolean {
  // Allow staying at the same stage (idempotent operations)
  if (fromStage === toStage) return true;
  
  // Must be moving forward
  if (toStage <= fromStage) return false;
  
  // Check if direct transition exists
  return STAGE_TRANSITIONS.some(t => 
    t.from_stage <= fromStage && t.to_stage === toStage
  );
}

export function canAdvanceToStage(
  candidate: CandidateRecord,
  callerToken: string,
  targetStage: number
): FunnelResult<boolean> {
  const callerSide = callerToken === candidate.user_a_token ? "a" : "b";
  const otherSide = callerSide === "a" ? "b" : "a";
  
  const currentStage = callerSide === "a" ? candidate.stage_a : candidate.stage_b;
  const otherStage = otherSide === "a" ? candidate.stage_a : candidate.stage_b;
  
  // Check if transition is valid
  if (!isValidTransition(currentStage, targetStage)) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Cannot advance from stage ${currentStage} to stage ${targetStage}`
      }
    };
  }
  
  // Check mutual requirements
  const transition = STAGE_TRANSITIONS.find(t => t.to_stage === targetStage);
  if (transition?.requires_mutual && transition.mutual_stage_threshold) {
    if (otherStage < transition.mutual_stage_threshold) {
      return {
        ok: false,
        error: {
          code: "MUTUAL_REQUIRED",
          message: `Other party must reach stage ${transition.mutual_stage_threshold} first`
        }
      };
    }
  }
  
  return { ok: true, data: true };
}

export function advanceStage(
  db: Database,
  candidateId: string,
  callerToken: string,
  targetStage: number
): FunnelResult<{ stage_a: number; stage_b: number }> {
  const candidate = db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(candidateId) as CandidateRecord | undefined;
    
  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" }
    };
  }
  
  // Check authorization
  if (callerToken !== candidate.user_a_token && callerToken !== candidate.user_b_token) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Not authorized for this candidate pair" }
    };
  }
  
  const canAdvance = canAdvanceToStage(candidate, callerToken, targetStage);
  if (!canAdvance.ok) {
    return canAdvance as FunnelResult<{ stage_a: number; stage_b: number }>;
  }
  
  const callerSide = callerToken === candidate.user_a_token ? "a" : "b";
  const currentStage = callerSide === "a" ? candidate.stage_a : candidate.stage_b;
  
  // Use max() to ensure idempotent stage advancement
  const newStage = Math.max(currentStage, targetStage);
  
  // Update the database
  const updateField = callerSide === "a" ? "stage_a" : "stage_b";
  db.prepare(`UPDATE candidates SET ${updateField} = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(newStage, candidateId);
  
  // Check for automatic mutual advancement (COMMITTED -> CONNECTED)
  const updatedCandidate = db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(candidateId) as CandidateRecord;
    
  if (updatedCandidate.stage_a >= Stage.COMMITTED && 
      updatedCandidate.stage_b >= Stage.COMMITTED && 
      (updatedCandidate.stage_a < Stage.CONNECTED || updatedCandidate.stage_b < Stage.CONNECTED)) {
    
    // Both sides committed - automatically advance to CONNECTED
    db.prepare("UPDATE candidates SET stage_a = ?, stage_b = ?, updated_at = datetime('now') WHERE id = ?")
      .run(Stage.CONNECTED, Stage.CONNECTED, candidateId);
      
    return { 
      ok: true, 
      data: { stage_a: Stage.CONNECTED, stage_b: Stage.CONNECTED } 
    };
  }
  
  return { 
    ok: true, 
    data: { stage_a: updatedCandidate.stage_a, stage_b: updatedCandidate.stage_b } 
  };
}

export function getStageNames(): Record<number, string> {
  return {
    [Stage.UNDISCOVERED]: "UNDISCOVERED",
    [Stage.DISCOVERED]: "DISCOVERED", 
    [Stage.EVALUATED]: "EVALUATED",
    [Stage.EXCHANGED]: "EXCHANGED",
    [Stage.COMMITTED]: "COMMITTED",
    [Stage.CONNECTED]: "CONNECTED",
    [Stage.COMPLETED]: "COMPLETED"
  };
}

export function getStageName(stage: number): string {
  const names = getStageNames();
  return names[stage] || `UNKNOWN_STAGE_${stage}`;
}