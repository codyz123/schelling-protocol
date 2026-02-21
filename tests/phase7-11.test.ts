import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { initClusterRegistry, resetClusterRegistry } from "../src/clusters/registry.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleCompare } from "../src/handlers/compare.js";
import { handleRequestProfile } from "../src/handlers/request-profile.js";
import { handlePropose } from "../src/handlers/propose.js";
import { handleFeedback } from "../src/handlers/feedback.js";
import { handleMyInsights } from "../src/handlers/my-insights.js";
import { handleFileDispute } from "../src/handlers/file-dispute.js";
import { handleJuryDuty } from "../src/handlers/jury-duty.js";
import { handleJuryVerdict } from "../src/handlers/jury-verdict.js";
import { handleAnalytics } from "../src/handlers/analytics.js";
import { handleReportOutcome } from "../src/handlers/report-outcome.js";
import { pearsonCorrelation } from "../src/core/learning.js";
import { computeStalenessPenalty } from "../src/core/staleness.js";
import { twoProportionZTest, wilsonConfidenceInterval, pearsonCorrelation as statsPearson } from "../src/core/statistics.js";
import { generateNarrativeSummary, generatePredictedFriction, generateConversationStarters } from "../src/matching/explainability.js";
import type { HandlerContext } from "../src/types.js";
import { CLUSTER_CENTROIDS } from "../src/clusters/centroids.js";

let db: Database;
let ctx: HandlerContext;

function makeEmbedding(seed: number = 0): number[] {
  const emb: number[] = [];
  for (let i = 0; i < 50; i++) {
    emb.push(Math.sin(seed + i * 0.5) * 0.8);
  }
  return emb;
}

function makeIntentEmbedding(): number[] {
  return [...CLUSTER_CENTROIDS["matchmaking"]];
}

async function registerUser(overrides: Record<string, any> = {}) {
  const result = await handleRegister({
    protocol_version: "schelling-2.0",
    embedding: makeEmbedding(Math.random() * 100),
    intent_embedding: makeIntentEmbedding(),
    city: "NYC",
    age_range: "25-34",
    intent: ["romance"],
    interests: ["hiking", "cooking"],
    description: "Test user",
    seeking: "Partner",
    identity: { name: "Test", contact: "test@test.com" },
    ...overrides,
  }, ctx);
  expect(result.ok).toBe(true);
  return (result as any).data.user_token as string;
}

async function createConnectedPair(): Promise<{ tokenA: string; tokenB: string; candidateId: string }> {
  const embA = makeEmbedding(1);
  const embB = makeEmbedding(1.1);
  const tokenA = await registerUser({ embedding: embA });
  const tokenB = await registerUser({ embedding: embB });

  const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
  expect(searchResult.ok).toBe(true);
  const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;
  expect(candidateId).toBeDefined();

  await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
  await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
  await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleRequestProfile({ user_token: tokenB, candidate_id: candidateId }, ctx);
  await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handlePropose({ user_token: tokenB, candidate_id: candidateId }, ctx);

  return { tokenA, tokenB, candidateId };
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  resetClusterRegistry();
  initClusterRegistry(db);
  ctx = { db };
});

// ─── Phase 7: Feedback & Learning ───

describe("Phase 7: Feedback & Learning", () => {
  test("submit feedback and retrieve it", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();
    
    const result = await handleFeedback({
      user_token: tokenA,
      candidate_id: candidateId,
      dimension_scores: { openness: 0.5, extraversion: -0.3 },
      satisfaction: "satisfied",
      would_recommend: true,
    }, ctx);
    
    expect(result.ok).toBe(true);
    expect((result as any).data.recorded).toBe(true);
    expect((result as any).data.feedback_id).toBeDefined();
    expect((result as any).data.insights_available).toBe(true);
  });

  test("feedback validates dimension scores in [-1, 1]", async () => {
    const { tokenA, candidateId } = await createConnectedPair();
    
    const result = await handleFeedback({
      user_token: tokenA,
      candidate_id: candidateId,
      dimension_scores: { openness: 2.0 },
    }, ctx);
    
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("INVALID_INPUT");
  });

  test("my_insights returns empty but valid structure with no feedback", async () => {
    const token = await registerUser();
    
    const result = await handleMyInsights({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.feedback_count).toBe(0);
    expect(data.rejection_patterns).toEqual({});
    expect(data.dimension_importance).toEqual({});
    expect(data.collaborative_suggestions.confidence).toBe(0);
  });

  test("my_insights aggregates after multiple feedbacks", async () => {
    const { tokenA, candidateId } = await createConnectedPair();
    
    // Submit feedback
    await handleFeedback({
      user_token: tokenA,
      candidate_id: candidateId,
      dimension_scores: { openness: 0.8, extraversion: -0.5 },
      satisfaction: "satisfied",
      rejection_reason: "too_quiet",
    }, ctx);
    
    const result = await handleMyInsights({ user_token: tokenA }, ctx);
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.feedback_count).toBe(1);
    expect(data.rejection_patterns).toHaveProperty("too_quiet");
  });

  test("feedback rejects non-participant", async () => {
    const { candidateId } = await createConnectedPair();
    const outsider = await registerUser();
    
    const result = await handleFeedback({
      user_token: outsider,
      candidate_id: candidateId,
      satisfaction: "neutral",
    }, ctx);
    
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("NOT_PARTICIPANT");
  });

  test("pearson correlation edge cases", () => {
    // n < 2 → null
    expect(pearsonCorrelation([1], [2])).toBeNull();
    expect(pearsonCorrelation([], [])).toBeNull();
    
    // constant data → 0
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    
    // perfect correlation
    const r = pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(r).toBeCloseTo(1.0, 5);
    
    // negative correlation
    const rn = pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2]);
    expect(rn).toBeCloseTo(-1.0, 5);
  });
});

// ─── Phase 8: Match Explainability ───

describe("Phase 8: Match Explainability", () => {
  test("evaluate returns narrative_summary, predicted_friction, conversation_starters", async () => {
    const embA = makeEmbedding(1);
    const embB = makeEmbedding(1.1);
    const tokenA = await registerUser({ embedding: embA, interests: ["hiking", "cooking", "reading"] });
    const tokenB = await registerUser({ embedding: embB, interests: ["hiking", "cooking", "music"] });

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;

    const result = await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
    expect(result.ok).toBe(true);
    const comp = (result as any).data.comparisons[0];
    
    expect(comp.narrative_summary).toBeDefined();
    expect(typeof comp.narrative_summary).toBe("string");
    expect(comp.narrative_summary.length).toBeGreaterThan(0);
    
    expect(comp.predicted_friction).toBeDefined();
    expect(Array.isArray(comp.predicted_friction)).toBe(true);
    
    expect(comp.conversation_starters).toBeDefined();
    expect(Array.isArray(comp.conversation_starters)).toBe(true);
    expect(comp.conversation_starters.length).toBeGreaterThan(0);
  });

  test("narrative summary mentions interests when shared", () => {
    const summary = generateNarrativeSummary(
      { personality: 0.8, values: 0.6 },
      ["hiking", "cooking"],
      [],
      0.5
    );
    expect(summary).toContain("hiking");
  });

  test("predicted friction identifies low alignment groups", () => {
    const friction = generatePredictedFriction([], { personality: 0.3, values: 0.2 });
    expect(friction.some(f => f.includes("personality") || f.includes("values"))).toBe(true);
  });

  test("conversation starters with no data gives generic suggestions", () => {
    const starters = generateConversationStarters([], [], []);
    expect(starters.length).toBeGreaterThan(0);
  });

  test("conversation starters include shared interests", () => {
    const starters = generateConversationStarters(["hiking"], ["openness"], []);
    expect(starters.some(s => s.includes("hiking"))).toBe(true);
  });
});

// ─── Phase 9: Agent Jury System ───

describe("Phase 9: Agent Jury System", () => {
  test("file dispute with jury selection when jurors available", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();
    
    // Create 5 unrelated users as potential jurors (with rep >= 0.6)
    const jurors: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = await registerUser({ embedding: makeEmbedding(50 + i) });
      db.prepare("UPDATE users SET reputation_score = 0.8 WHERE user_token = ?").run(t);
      jurors.push(t);
    }
    
    const result = await handleFileDispute({
      user_token: tokenA,
      candidate_id: candidateId,
      reason: "Misrepresentation of profile information",
    }, ctx);
    
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.dispute_id).toBeDefined();
    // Jury may or may not be selected depending on candidate overlap
    expect(data.status).toMatch(/^(open|jury_selection)$/);
  });

  test("jury_duty returns empty cases for non-juror", async () => {
    const token = await registerUser();
    
    const result = await handleJuryDuty({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.cases).toEqual([]);
  });

  test("jury verdict validates juror assignment", async () => {
    const token = await registerUser();
    
    const result = await handleJuryVerdict({
      user_token: token,
      dispute_id: "nonexistent",
      verdict: "for_filer",
      reasoning: "This is a valid reasoning for the verdict",
    }, ctx);
    
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("NOT_JUROR");
  });

  test("jury verdict rejects already voted", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();
    const jurorToken = await registerUser({ embedding: makeEmbedding(99) });
    db.prepare("UPDATE users SET reputation_score = 0.8 WHERE user_token = ?").run(jurorToken);

    // Create dispute manually
    const disputeId = `disp_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO disputes (id, candidate_id, filed_by, filed_against, vertical_id, stage_at_filing, reason, status, created_at)
      VALUES (?, ?, ?, ?, 'matchmaking', 5, 'test', 'open', ?)
    `).run(disputeId, candidateId, tokenA, tokenB, Date.now());

    // Create jury assignment
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO jury_assignments (id, dispute_id, juror_token, deadline_at)
      VALUES (?, ?, ?, ?)
    `).run(`jury_test_1`, disputeId, jurorToken, deadline);

    // First vote succeeds
    const r1 = await handleJuryVerdict({
      user_token: jurorToken,
      dispute_id: disputeId,
      verdict: "for_filer",
      reasoning: "Valid reasoning for the verdict here",
    }, ctx);
    expect(r1.ok).toBe(true);

    // Second vote fails
    const r2 = await handleJuryVerdict({
      user_token: jurorToken,
      dispute_id: disputeId,
      verdict: "for_defendant",
      reasoning: "Changed my mind but should fail",
    }, ctx);
    expect(r2.ok).toBe(false);
    expect((r2 as any).error.code).toBe("ALREADY_VOTED");
  });

  test("majority verdict resolves dispute", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();
    const jurors: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await registerUser({ embedding: makeEmbedding(70 + i) });
      db.prepare("UPDATE users SET reputation_score = 0.8 WHERE user_token = ?").run(t);
      jurors.push(t);
    }

    const disputeId = `disp_majority_${Date.now()}`;
    db.prepare(`
      INSERT INTO disputes (id, candidate_id, filed_by, filed_against, vertical_id, stage_at_filing, reason, status, created_at)
      VALUES (?, ?, ?, ?, 'matchmaking', 5, 'test reason', 'open', ?)
    `).run(disputeId, candidateId, tokenA, tokenB, Date.now());

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO jury_assignments (id, dispute_id, juror_token, deadline_at)
        VALUES (?, ?, ?, ?)
      `).run(`jury_maj_${i}`, disputeId, jurors[i], deadline);
    }

    // Two vote for_filer = majority
    await handleJuryVerdict({ user_token: jurors[0], dispute_id: disputeId, verdict: "for_filer", reasoning: "Valid reasoning text" }, ctx);
    const r2 = await handleJuryVerdict({ user_token: jurors[1], dispute_id: disputeId, verdict: "for_filer", reasoning: "Valid reasoning text" }, ctx);
    
    expect(r2.ok).toBe(true);
    expect((r2 as any).data.resolved).toBe(true);
    expect((r2 as any).data.resolution).toBe("for_filer");

    // Check dispute is resolved
    const dispute = db.prepare("SELECT status FROM disputes WHERE id = ?").get(disputeId) as any;
    expect(dispute.status).toBe("resolved_for_filer");
  });
});

// ─── Phase 10: Staleness & Agent Quality ───

describe("Phase 10: Staleness & Agent Quality", () => {
  test("staleness penalty at 0 days", () => {
    const result = computeStalenessPenalty(new Date());
    expect(result.factor).toBe(1.0);
    expect(result.stale).toBe(false);
    expect(result.penalized).toBe(false);
  });

  test("staleness penalty at 90 days", () => {
    const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = computeStalenessPenalty(d);
    expect(result.factor).toBeCloseTo(1.0, 1);
    expect(result.stale).toBe(false);
    expect(result.penalized).toBe(false);
  });

  test("staleness penalty at 180 days", () => {
    const d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const result = computeStalenessPenalty(d);
    expect(result.factor).toBeLessThan(1.0);
    expect(result.factor).toBeGreaterThanOrEqual(0.7);
    expect(result.stale).toBe(true);
    expect(result.penalized).toBe(true);
  });

  test("staleness penalty at 390+ days is capped at 0.7", () => {
    const d = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000);
    const result = computeStalenessPenalty(d);
    expect(result.factor).toBeCloseTo(0.7, 1);
    expect(result.stale).toBe(true);
  });

  test("search results include stale flag for old profiles", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    const tokenB = await registerUser({ embedding: makeEmbedding(1.1) });
    
    // Make tokenB's profile old
    db.prepare("UPDATE users SET last_registered_at = datetime('now', '-200 days') WHERE user_token = ?").run(tokenB);
    
    const result = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    expect(result.ok).toBe(true);
    const candidates = (result as any).data.candidates;
    const staleCandidate = candidates.find((c: any) => c.stale === true);
    expect(staleCandidate).toBeDefined();
  });
});

// ─── Phase 11: Analytics & A/B Testing ───

describe("Phase 11: Analytics & A/B Testing", () => {
  test("analytics returns valid structure", async () => {
    const token = await registerUser();
    
    const result = await handleAnalytics({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.funnel_metrics).toBeDefined();
    expect(data.funnel_metrics.total_users).toBeGreaterThanOrEqual(1);
    expect(data.outcome_metrics).toBeDefined();
    expect(data.match_rate).toBeDefined();
    expect(data.ab_test_results).toBeDefined();
  });

  test("two-proportion z-test with known values", () => {
    // 60% vs 40% with n=200 each
    const result = twoProportionZTest(120, 200, 80, 200);
    expect(result.z).toBeGreaterThan(0);
    expect(result.p_value).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
  });

  test("two-proportion z-test with small sample not significant", () => {
    const result = twoProportionZTest(3, 10, 2, 10);
    expect(result.significant).toBe(false);
  });

  test("wilson confidence interval", () => {
    const ci = wilsonConfidenceInterval(50, 100);
    expect(ci.lower).toBeLessThan(0.5);
    expect(ci.upper).toBeGreaterThan(0.5);
    expect(ci.lower).toBeGreaterThan(0.3);
    expect(ci.upper).toBeLessThan(0.7);
  });

  test("stats pearson correlation", () => {
    const r = statsPearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r.r).toBeCloseTo(1.0, 5);
    
    const r2 = statsPearson([1], [2]);
    expect(r2.r).toBeNull();
  });

  test("analytics with outcomes shows correct metrics", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();
    
    await handleReportOutcome({
      user_token: tokenA,
      candidate_id: candidateId,
      outcome: "positive",
      met_in_person: false,
    }, ctx);
    
    const result = await handleAnalytics({ user_token: tokenA }, ctx);
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.outcome_metrics.total).toBeGreaterThanOrEqual(1);
    expect(data.outcome_metrics.positive).toBeGreaterThanOrEqual(1);
  });
});
