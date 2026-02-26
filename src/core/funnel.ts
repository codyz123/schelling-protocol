import type { Database } from "bun:sqlite";
import { Stage } from "../types.js";
import type { CandidateRecord, HandlerResult } from "../types.js";

// ─── v3 Funnel: 4 stages ────────────────────────────────────────────
// DISCOVERED(1) → INTERESTED(2) → COMMITTED(3) → CONNECTED(4)
//
// Key invariants:
// 1. Stages only advance (except withdraw: COMMITTED/CONNECTED → INTERESTED)
// 2. No stage skipping
// 3. CONNECTED requires BOTH at COMMITTED — server auto-elevates
// 4. Idempotent: calling at or past target is a no-op

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

const STAGE_TRANSITIONS: FunnelTransition[] = [
  { from_stage: Stage.UNDISCOVERED, to_stage: Stage.DISCOVERED },
  { from_stage: Stage.DISCOVERED, to_stage: Stage.INTERESTED },
  { from_stage: Stage.INTERESTED, to_stage: Stage.COMMITTED },
  {
    from_stage: Stage.COMMITTED,
    to_stage: Stage.CONNECTED,
    requires_mutual: true,
    mutual_stage_threshold: Stage.COMMITTED,
  },
];

export function isValidTransition(fromStage: number, toStage: number): boolean {
  if (fromStage === toStage) return true; // idempotent
  if (toStage <= fromStage) return false;
  return STAGE_TRANSITIONS.some(
    (t) => t.from_stage <= fromStage && t.to_stage === toStage,
  );
}

export function canAdvanceToStage(
  candidate: CandidateRecord,
  callerToken: string,
  targetStage: number,
): FunnelResult<boolean> {
  const side = callerToken === candidate.user_a_token ? "a" : "b";
  const currentStage = side === "a" ? candidate.stage_a : candidate.stage_b;
  const otherStage = side === "a" ? candidate.stage_b : candidate.stage_a;

  if (!isValidTransition(currentStage, targetStage)) {
    return {
      ok: false,
      error: {
        code: "STAGE_VIOLATION",
        message: `Cannot advance from stage ${currentStage} to stage ${targetStage}`,
      },
    };
  }

  // Check mutual requirements
  const transition = STAGE_TRANSITIONS.find((t) => t.to_stage === targetStage);
  if (transition?.requires_mutual && transition.mutual_stage_threshold) {
    if (otherStage < transition.mutual_stage_threshold) {
      return {
        ok: false,
        error: {
          code: "MUTUAL_REQUIRED",
          message: `Other party must reach stage ${transition.mutual_stage_threshold} first`,
        },
      };
    }
  }

  return { ok: true, data: true };
}

export function advanceStage(
  db: Database,
  candidateId: string,
  callerToken: string,
  targetStage: number,
): FunnelResult<{ stage_a: number; stage_b: number }> {
  const candidate = db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(candidateId) as CandidateRecord | undefined;

  if (!candidate) {
    return {
      ok: false,
      error: { code: "CANDIDATE_NOT_FOUND", message: "Candidate not found" },
    };
  }

  if (
    callerToken !== candidate.user_a_token &&
    callerToken !== candidate.user_b_token
  ) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Not authorized for this candidate pair",
      },
    };
  }

  const canAdvance = canAdvanceToStage(candidate, callerToken, targetStage);
  if (!canAdvance.ok) {
    return canAdvance as FunnelResult<{ stage_a: number; stage_b: number }>;
  }

  const side = callerToken === candidate.user_a_token ? "a" : "b";
  const currentStage = side === "a" ? candidate.stage_a : candidate.stage_b;

  // Idempotent advancement
  const newStage = Math.max(currentStage, targetStage);

  const updateField = side === "a" ? "stage_a" : "stage_b";
  db.prepare(
    `UPDATE candidates SET ${updateField} = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(newStage, candidateId);

  // Check for auto-elevation to CONNECTED (both at COMMITTED)
  const updated = db
    .prepare("SELECT * FROM candidates WHERE id = ?")
    .get(candidateId) as CandidateRecord;

  if (
    updated.stage_a >= Stage.COMMITTED &&
    updated.stage_b >= Stage.COMMITTED &&
    (updated.stage_a < Stage.CONNECTED || updated.stage_b < Stage.CONNECTED)
  ) {
    db.prepare(
      "UPDATE candidates SET stage_a = ?, stage_b = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(Stage.CONNECTED, Stage.CONNECTED, candidateId);

    return {
      ok: true,
      data: { stage_a: Stage.CONNECTED, stage_b: Stage.CONNECTED },
    };
  }

  return {
    ok: true,
    data: { stage_a: updated.stage_a, stage_b: updated.stage_b },
  };
}

export function getStageNames(): Record<number, string> {
  return {
    [Stage.UNDISCOVERED]: "UNDISCOVERED",
    [Stage.DISCOVERED]: "DISCOVERED",
    [Stage.INTERESTED]: "INTERESTED",
    [Stage.COMMITTED]: "COMMITTED",
    [Stage.CONNECTED]: "CONNECTED",
  };
}

export function getStageName(stage: number): string {
  const names = getStageNames();
  return names[stage] || `UNKNOWN_STAGE_${stage}`;
}

/** Check if an idempotency key has been used before */
export function checkIdempotency<T>(
  db: Database,
  idempotency_key: string,
): HandlerResult<T> | null {
  const existing = db
    .prepare("SELECT response FROM idempotency_keys WHERE key = ?")
    .get(idempotency_key) as { response: string } | undefined;

  if (existing) {
    return JSON.parse(existing.response);
  }
  return null;
}

/** Record an idempotency key and response */
export function recordIdempotency<T>(
  db: Database,
  idempotency_key: string,
  operation: string,
  user_token: string,
  result: HandlerResult<T>,
): void {
  db.prepare(
    `INSERT INTO idempotency_keys (key, operation, user_token, response, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(idempotency_key, operation, user_token, JSON.stringify(result));
}
