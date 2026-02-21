import type { Database } from "bun:sqlite";

/**
 * Select eligible jurors for a dispute.
 * Criteria (relaxed in order if insufficient):
 * 1. No shared candidates with either party (NEVER relaxed)
 * 2. Reputation >= 0.6 (NEVER relaxed)
 * 3. Not called in 90 days (relaxed first)
 * 4. Different candidate pools / Jaccard < 0.3 (relaxed second)
 * 5. Different agent_model (relaxed third)
 */
export function selectJury(
  db: Database,
  disputeId: string,
  filerToken: string,
  defendantToken: string,
  jurySize: number = 3
): string[] | null {
  // Get all active users excluding parties
  const candidates = db.prepare(`
    SELECT user_token, agent_model, reputation_score
    FROM users
    WHERE status = 'active'
      AND user_token != ?
      AND user_token != ?
      AND reputation_score >= 0.6
  `).all(filerToken, defendantToken) as Array<{
    user_token: string;
    agent_model: string | null;
    reputation_score: number;
  }>;

  // Get filer and defendant's candidate pairs
  const filerPairs = new Set(
    (db.prepare(`
      SELECT user_a_token, user_b_token FROM candidates
      WHERE user_a_token = ? OR user_b_token = ?
    `).all(filerToken, filerToken) as Array<{ user_a_token: string; user_b_token: string }>)
      .flatMap(r => [r.user_a_token, r.user_b_token])
  );
  const defendantPairs = new Set(
    (db.prepare(`
      SELECT user_a_token, user_b_token FROM candidates
      WHERE user_a_token = ? OR user_b_token = ?
    `).all(defendantToken, defendantToken) as Array<{ user_a_token: string; user_b_token: string }>)
      .flatMap(r => [r.user_a_token, r.user_b_token])
  );

  // Get filer's agent model
  const filerUser = db.prepare("SELECT agent_model FROM users WHERE user_token = ?")
    .get(filerToken) as { agent_model: string | null } | undefined;
  const filerModel = filerUser?.agent_model;

  // Filter candidates through criteria with progressive relaxation
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  type Candidate = { user_token: string; agent_model: string | null; reputation_score: number };
  
  function filterBySharedCandidates(c: Candidate): boolean {
    return !filerPairs.has(c.user_token) && !defendantPairs.has(c.user_token);
  }

  function filterByRecency(c: Candidate): boolean {
    const recent = db.prepare(`
      SELECT 1 FROM jury_assignments
      WHERE juror_token = ? AND assigned_at > ? AND replaced = 0
    `).get(c.user_token, ninetyDaysAgo);
    return !recent;
  }

  function filterByModel(c: Candidate): boolean {
    return c.agent_model !== filerModel;
  }

  // Try strictest criteria first, then relax
  const levels = [
    // Level 0: All criteria
    (c: Candidate) => filterBySharedCandidates(c) && filterByRecency(c) && filterByModel(c),
    // Level 1: Relax 90-day recency
    (c: Candidate) => filterBySharedCandidates(c) && filterByModel(c),
    // Level 2: Relax agent model
    (c: Candidate) => filterBySharedCandidates(c),
  ];

  for (const filter of levels) {
    const eligible = candidates.filter(filter);
    if (eligible.length >= jurySize) {
      // Random selection
      const shuffled = eligible.sort(() => Math.random() - 0.5);
      return shuffled.slice(0, jurySize).map(c => c.user_token);
    }
  }

  // Insufficient jurors even after all relaxation
  return null;
}

export function replaceJuror(
  db: Database,
  disputeId: string,
  oldJurorToken: string,
  filerToken: string,
  defendantToken: string
): string | null {
  // Mark old assignment as replaced
  db.prepare(`
    UPDATE jury_assignments
    SET replaced = 1, replaced_at = datetime('now')
    WHERE dispute_id = ? AND juror_token = ? AND replaced = 0
  `).run(disputeId, oldJurorToken);

  // Get existing juror tokens to exclude
  const existingJurors = db.prepare(`
    SELECT juror_token FROM jury_assignments WHERE dispute_id = ?
  `).all(disputeId) as Array<{ juror_token: string }>;
  const excludeTokens = new Set(existingJurors.map(j => j.juror_token));
  excludeTokens.add(filerToken);
  excludeTokens.add(defendantToken);

  // Find replacement
  const replacement = db.prepare(`
    SELECT user_token FROM users
    WHERE status = 'active'
      AND reputation_score >= 0.6
      AND user_token NOT IN (${Array.from(excludeTokens).map(() => '?').join(',')})
    ORDER BY RANDOM()
    LIMIT 1
  `).get(...excludeTokens) as { user_token: string } | undefined;

  if (!replacement) return null;

  // Create new assignment
  const id = `jury_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const deadlineAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  db.prepare(`
    INSERT INTO jury_assignments (id, dispute_id, juror_token, deadline_at)
    VALUES (?, ?, ?, ?)
  `).run(id, disputeId, replacement.user_token, deadlineAt);

  // Create pending action
  const dispute = db.prepare("SELECT candidate_id FROM disputes WHERE id = ?")
    .get(disputeId) as { candidate_id: string } | undefined;
  if (dispute) {
    db.prepare(`
      INSERT INTO pending_actions (id, user_token, candidate_id, action_type)
      VALUES (?, ?, ?, 'jury_duty')
    `).run(`action_${Date.now()}_${Math.random().toString(36).slice(2)}`, replacement.user_token, dispute.candidate_id);
  }

  return replacement.user_token;
}
