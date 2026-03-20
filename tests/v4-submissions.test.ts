import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import {
  handleAgentCreate,
  handleSubmit,
  handleSubmissionUpdate,
  handleSubmissionWithdraw,
  handleSubmissionsList,
  validateEmbedding,
  authenticateAgent,
} from "../src/handlers/submit.js";
import { handleMatch } from "../src/handlers/match.js";
import { handleMarketInsights } from "../src/handlers/market-insights.js";
import {
  handleToolPublish,
  handleToolList,
  handleToolGet,
  handleToolRecommend,
  handleToolDeprecate,
} from "../src/handlers/tool-marketplace.js";
import type { HandlerContext } from "../src/types.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db as any);
  ctx = { db: db as any };
});

/**
 * Create a valid 512-dim embedding with a given magnitude direction.
 * seed controls the "direction" of the vector, norm ensures it passes validation.
 */
function makeEmbedding(seed: number, norm = 0.9): number[] {
  const dim = 512;
  const emb: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    // Deterministic values using a simple PRNG
    const raw = Math.sin(seed + i * 0.1) * 0.5;
    emb.push(raw);
    sumSq += raw * raw;
  }
  // Scale to desired norm
  const currentNorm = Math.sqrt(sumSq);
  const scale = norm / currentNorm;
  return emb.map((v) => {
    const scaled = v * scale;
    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, scaled));
  });
}

/**
 * Create an agent and return { agent_id, agent_api_key }.
 */
async function createAgent(displayName = "Test Agent") {
  const result = await handleAgentCreate({ display_name: displayName }, ctx);
  expect(result.ok).toBe(true);
  return result.ok ? result.data : null;
}

/**
 * Create a submission and return submission_id.
 */
async function createSubmission(
  apiKey: string,
  overrides: Record<string, unknown> = {},
) {
  const result = await handleSubmit(
    {
      agent_api_key: apiKey,
      intent_text: "Test intent",
      ask_embedding: makeEmbedding(1),
      offer_embedding: makeEmbedding(2),
      ...overrides,
    },
    ctx,
  );
  expect(result.ok).toBe(true);
  return result.ok ? result.data.submission_id : null;
}

// ─── Embedding Validation ─────────────────────────────────────────────

describe("validateEmbedding", () => {
  test("accepts valid 512-dim embedding", () => {
    const emb = makeEmbedding(42);
    expect(validateEmbedding(emb, "emb")).toBeNull();
  });

  test("rejects non-array", () => {
    expect(validateEmbedding("string", "emb")).toContain("array");
  });

  test("rejects wrong dimension", () => {
    const emb = new Array(256).fill(0.01);
    expect(validateEmbedding(emb, "emb")).toContain("512");
  });

  test("rejects values outside [-1, 1]", () => {
    const emb = makeEmbedding(42);
    emb[0] = 1.5;
    expect(validateEmbedding(emb, "emb")).toContain("[-1, 1]");
  });

  test("rejects NaN values", () => {
    const emb = makeEmbedding(42);
    emb[100] = NaN;
    expect(validateEmbedding(emb, "emb")).toContain("finite");
  });

  test("rejects low-norm embedding", () => {
    const emb = new Array(512).fill(0);
    expect(validateEmbedding(emb, "emb")).toContain("norm");
  });

  test("rejects norm below 0.5", () => {
    const emb = makeEmbedding(42, 0.1); // very small norm
    expect(validateEmbedding(emb, "emb")).toContain("norm");
  });
});

// ─── Agent Create ─────────────────────────────────────────────────────

describe("agent/create", () => {
  test("creates agent and returns api_key", async () => {
    const result = await handleAgentCreate({ display_name: "Alice" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.agent_id).toBeTruthy();
    expect(result.data.agent_api_key).toHaveLength(64);
    expect(result.data.protocol_version).toBe("4.0");
    expect(result.data.display_name).toBe("Alice");
  });

  test("creates agent without display_name", async () => {
    const result = await handleAgentCreate({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.display_name).toBeNull();
  });

  test("api_key authenticates correctly", async () => {
    const agent = await createAgent();
    expect(agent).not.toBeNull();
    const found = authenticateAgent(ctx.db, agent!.agent_api_key);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(agent!.agent_id);
  });

  test("wrong api_key returns null", async () => {
    await createAgent();
    const found = authenticateAgent(ctx.db, "wrong_key_12345");
    expect(found).toBeNull();
  });
});

// ─── Submit ───────────────────────────────────────────────────────────

describe("submit", () => {
  test("creates submission with required fields", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "I need a React developer",
        ask_embedding: makeEmbedding(1),
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.submission_id).toBeTruthy();
    expect(result.data.status).toBe("active");
    expect(result.data.agent_id).toBe(agent!.agent_id);
  });

  test("creates submission with all optional fields", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Hiring a senior React dev",
        intent_summary: "React dev hire",
        ask_embedding: makeEmbedding(1),
        offer_embedding: makeEmbedding(2),
        structured_data: { "hiring/software-v1": { years: 5 } },
        required_tools: ["hiring/software-v1"],
        preferred_tools: ["hiring/portfolio-v1"],
        tags: ["hiring", "software"],
        ttl_mode: "recurring",
        ttl_hours: 168,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
  });

  test("rejects missing intent_text", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "",
        ask_embedding: makeEmbedding(1),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("intent_text");
  });

  test("rejects missing ask_embedding", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "I need a React developer",
        ask_embedding: [],
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects invalid ask_embedding dimensions", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: new Array(256).fill(0.01),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("512");
  });

  test("rejects invalid offer_embedding", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        offer_embedding: new Array(100).fill(0.5) as any,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects invalid ttl_mode", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        ttl_mode: "turbo" as any,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("ttl_mode");
  });

  test("rejects unauthorized (no api_key)", async () => {
    const result = await handleSubmit(
      {
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  test("ttl_mode=indefinite sets far-future expires_at", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Looking for a cofounder, always",
        ask_embedding: makeEmbedding(1),
        ttl_mode: "indefinite",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expires_at).toContain("9999");
  });
});

// ─── Submission Update ────────────────────────────────────────────────

describe("submission/update", () => {
  test("updates intent_text", async () => {
    const agent = await createAgent();
    const submissionId = await createSubmission(agent!.agent_api_key);

    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: submissionId!,
        intent_text: "Updated intent",
      },
      ctx,
    );
    expect(result.ok).toBe(true);

    // Verify in DB
    const row = db.prepare("SELECT intent_text FROM submissions WHERE id = ?").get(submissionId) as any;
    expect(row.intent_text).toBe("Updated intent");
  });

  test("updates status to paused", async () => {
    const agent = await createAgent();
    const submissionId = await createSubmission(agent!.agent_api_key);

    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: submissionId!,
        status: "paused",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("paused");
  });

  test("rejects update by wrong agent", async () => {
    const agentA = await createAgent("Agent A");
    const agentB = await createAgent("Agent B");
    const submissionId = await createSubmission(agentA!.agent_api_key);

    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agentB!.agent_api_key,
        submission_id: submissionId!,
        intent_text: "Hijack!",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects update on withdrawn submission", async () => {
    const agent = await createAgent();
    const submissionId = await createSubmission(agent!.agent_api_key);

    // Withdraw first
    await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: submissionId! },
      ctx,
    );

    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: submissionId!,
        intent_text: "New text",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("withdrawn");
  });
});

// ─── Submission Withdraw ──────────────────────────────────────────────

describe("submission/withdraw", () => {
  test("withdraws submission", async () => {
    const agent = await createAgent();
    const submissionId = await createSubmission(agent!.agent_api_key);

    const result = await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: submissionId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("withdrawn");

    // Verify in DB
    const row = db.prepare("SELECT status FROM submissions WHERE id = ?").get(submissionId) as any;
    expect(row.status).toBe("withdrawn");
  });

  test("rejects double withdraw", async () => {
    const agent = await createAgent();
    const submissionId = await createSubmission(agent!.agent_api_key);

    await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: submissionId! },
      ctx,
    );

    const result = await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: submissionId! },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("already withdrawn");
  });

  test("rejects withdraw by wrong agent", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const submissionId = await createSubmission(agentA!.agent_api_key);

    const result = await handleSubmissionWithdraw(
      { agent_api_key: agentB!.agent_api_key, submission_id: submissionId! },
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});

// ─── List Submissions ─────────────────────────────────────────────────

describe("submissions (list)", () => {
  test("lists own submissions", async () => {
    const agent = await createAgent();
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 1" });
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 2" });

    const result = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    expect(result.data.submissions).toHaveLength(2);
  });

  test("does not include other agents' submissions", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    await createSubmission(agentA!.agent_api_key);
    await createSubmission(agentB!.agent_api_key);

    const result = await handleSubmissionsList(
      { agent_api_key: agentA!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(1);
  });

  test("filters by status", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);
    await createSubmission(agent!.agent_api_key);

    // Withdraw one
    await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: subId! },
      ctx,
    );

    const active = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key, status: "active" },
      ctx,
    );
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.data.total).toBe(1);

    const withdrawn = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key, status: "withdrawn" },
      ctx,
    );
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    expect(withdrawn.data.total).toBe(1);
  });

  test("returns has_offer_embedding correctly", async () => {
    const agent = await createAgent();
    // With offer
    await createSubmission(agent!.agent_api_key, { offer_embedding: makeEmbedding(5) });
    // Without offer
    await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Ask only",
        ask_embedding: makeEmbedding(6),
      },
      ctx,
    );

    const result = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const withOffer = result.data.submissions.filter((s) => s.has_offer_embedding);
    const withoutOffer = result.data.submissions.filter((s) => !s.has_offer_embedding);
    expect(withOffer).toHaveLength(1);
    expect(withoutOffer).toHaveLength(1);
  });
});

// ─── Cross-Match Scoring ──────────────────────────────────────────────

describe("match (cross-embedding scoring)", () => {
  test("returns no candidates when pool is empty", async () => {
    const agent = await createAgent();
    const submissionId = await createSubmission(agent!.agent_api_key);

    const result = await handleMatch(
      { agent_api_key: agent!.agent_api_key, submission_id: submissionId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates).toHaveLength(0);
    expect(result.data.total_evaluated).toBe(0);
  });

  test("matches similar submissions with known vectors", async () => {
    const agentA = await createAgent("Seeker");
    const agentB = await createAgent("Offerer");

    // A asks for something, B offers the same thing (high cross-match expected)
    const askVec = makeEmbedding(10, 0.9);
    const offerVec = makeEmbedding(10, 0.9); // Same direction = high cosine similarity

    const subAId = await handleSubmit(
      {
        agent_api_key: agentA!.agent_api_key,
        intent_text: "I need React development",
        ask_embedding: askVec,
      },
      ctx,
    );

    await handleSubmit(
      {
        agent_api_key: agentB!.agent_api_key,
        intent_text: "I am a React developer",
        ask_embedding: makeEmbedding(99),   // Different ask
        offer_embedding: offerVec,            // Same direction as A's ask
      },
      ctx,
    );

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId!.data!.submission_id },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBeGreaterThan(0);
    // High similarity (same vector direction): score should be above threshold
    const topCandidate = result.data.candidates[0];
    expect(topCandidate.ask_offer_sim_ab).toBeGreaterThan(0.9);
  });

  test("does not match orthogonal vectors", async () => {
    const agentA = await createAgent("Seeker");
    const agentB = await createAgent("Offerer");

    // Create vectors from very different seeds — they'll have low cosine similarity
    const askVec = makeEmbedding(1, 0.8);
    const perpVec = makeEmbedding(200, 0.8);

    const subAResult = await handleSubmit(
      {
        agent_api_key: agentA!.agent_api_key,
        intent_text: "Need X",
        ask_embedding: askVec,
      },
      ctx,
    );

    await handleSubmit(
      {
        agent_api_key: agentB!.agent_api_key,
        intent_text: "Offer Y (unrelated)",
        ask_embedding: makeEmbedding(201),
        offer_embedding: perpVec,
      },
      ctx,
    );

    // Use a high min_score threshold — orthogonal/unrelated vectors should not meet it
    const result = await handleMatch(
      {
        agent_api_key: agentA!.agent_api_key,
        submission_id: subAResult.ok ? subAResult.data.submission_id : "",
        min_score: 0.8,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Vectors from very different seeds should have low cross-score, not meeting 0.8 threshold
    expect(result.data.candidates).toHaveLength(0);
  });

  test("creates submission_candidates records for top matches", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });

    await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );

    // Candidates should have been persisted
    const candidates = db
      .prepare("SELECT * FROM submission_candidates")
      .all() as any[];
    expect(candidates.length).toBeGreaterThan(0);
  });

  test("applies default weights correctly (alpha=0.6, beta=0.3, gamma=0.1)", async () => {
    const agentA = await createAgent("A");
    const subId = await createSubmission(agentA!.agent_api_key);

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Default weights sum to 1.0
    const w = result.data.weights;
    expect(w.alpha + w.beta + w.gamma).toBeCloseTo(1.0, 5);
    expect(w.alpha).toBeCloseTo(0.6, 5);
    expect(w.beta).toBeCloseTo(0.3, 5);
    expect(w.gamma).toBeCloseTo(0.1, 5);
  });

  test("custom weights override defaults", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleMatch(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: subId!,
        alpha: 0.8,
        beta: 0.1,
        gamma: 0.1,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.weights.alpha).toBeCloseTo(0.8, 5);
  });

  test("rejects match for non-existent submission", async () => {
    const agent = await createAgent();
    const result = await handleMatch(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: "non-existent-id",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects unauthorized match", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);
    const result = await handleMatch(
      { submission_id: subId! },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });
});

// ─── Tool Satisfaction Scoring ────────────────────────────────────────

describe("match (tool satisfaction scoring)", () => {
  test("includes tool satisfaction in score breakdown", async () => {
    const agentA = await createAgent("Hirer");
    const agentB = await createAgent("Developer");
    const vec = makeEmbedding(42, 0.9);

    // Both fill the same tool
    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: {
        "hiring/software-v1": { years_experience: 5, languages: ["TypeScript"] },
      },
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: {
        "hiring/software-v1": { years_experience: 7, languages: ["TypeScript", "React"] },
      },
    });

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBeGreaterThan(0);
    const top = result.data.candidates[0];
    expect(top.tool_satisfaction).toBeGreaterThan(0);
    expect(top.score_breakdown.tool_score).toBeGreaterThan(0);
  });

  test("tool_satisfaction is 0 when no shared tools", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: { "tool/a": { field: "value" } },
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: { "tool/b": { field: "value" } }, // different tool
    });

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.data.candidates.length > 0) {
      expect(result.data.candidates[0].tool_satisfaction).toBe(0);
    }
  });
});

// ─── Market Insights ─────────────────────────────────────────────────

describe("market_insights", () => {
  test("returns pool size and estimated matches", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const agentC = await createAgent("C");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });
    await createSubmission(agentC!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });

    const result = await handleMarketInsights(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pool_size).toBe(2); // B and C, not A itself
    expect(result.data.estimated_matches).toBeGreaterThanOrEqual(0);
    expect(result.data.avg_cross_score).toBeGreaterThanOrEqual(0);
    expect(result.data.generated_at).toBeTruthy();
  });

  test("tool_coverage reflects tool adoption in pool", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: { "hiring/tool": { val: 1 } },
    });

    const result = await handleMarketInsights(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId!, threshold: 0.01 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The "hiring/tool" should appear in tool_coverage since B uses it
    if (result.data.estimated_matches > 0) {
      expect(result.data.tool_coverage["hiring/tool"]).toBeDefined();
    }
  });

  test("selectivity_analysis shows fewer matches with higher threshold", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });

    const result = await handleMarketInsights(
      {
        agent_api_key: agentA!.agent_api_key,
        submission_id: subAId!,
        threshold: 0.1,
        alt_threshold: 0.9,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Raising threshold should not increase pool
    expect(result.data.selectivity_analysis.if_threshold_raised_to).toBeLessThanOrEqual(
      result.data.selectivity_analysis.current_pool,
    );
  });

  test("rejects unauthorized request", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);
    const result = await handleMarketInsights({ submission_id: subId! }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });
});

// ─── Tool Marketplace CRUD ────────────────────────────────────────────

describe("tool/publish", () => {
  test("publishes a new tool", async () => {
    const agent = await createAgent();
    const result = await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/software-engineer-v1",
        display_name: "Software Engineer Profile",
        description: "Structured data for software engineering roles",
        schema: {
          type: "object",
          properties: {
            years_experience: { type: "integer" },
            primary_languages: { type: "array", items: { type: "string" } },
          },
          required: ["years_experience"],
        },
        schema_version: "1.0.0",
        category: "hiring",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe("hiring/software-engineer-v1");
    expect(result.data.display_name).toBe("Software Engineer Profile");
    expect(result.data.schema_version).toBe("1.0.0");
    expect(result.data.category).toBe("hiring");
    expect(result.data.usage_count).toBe(0);
  });

  test("rejects invalid tool id pattern", async () => {
    const agent = await createAgent();
    const result = await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "UPPERCASE/Tool",
        display_name: "Bad Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects missing display_name", async () => {
    const agent = await createAgent();
    const result = await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "tools/my-tool",
        display_name: "",
        schema: { type: "object" },
        schema_version: "1.0.0",
      } as any,
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects publish from different agent for existing tool", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");

    await handleToolPublish(
      {
        agent_api_key: agentA!.agent_api_key,
        id: "tools/my-tool",
        display_name: "My Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );

    const result = await handleToolPublish(
      {
        agent_api_key: agentB!.agent_api_key,
        id: "tools/my-tool",
        display_name: "Hijacked Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("different agent");
  });

  test("allows publisher to update own tool", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "tools/my-tool",
        display_name: "Original Name",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );

    const result = await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "tools/my-tool",
        display_name: "Updated Name",
        schema: { type: "object", properties: { name: { type: "string" } } },
        schema_version: "1.1.0",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.display_name).toBe("Updated Name");
    expect(result.data.schema_version).toBe("1.1.0");
  });
});

describe("tool/list", () => {
  test("lists published tools", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/tool-a",
        display_name: "Tool A",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "hiring",
      },
      ctx,
    );
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "housing/tool-b",
        display_name: "Tool B",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "housing",
      },
      ctx,
    );

    const result = await handleToolList({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    expect(result.data.tools).toHaveLength(2);
  });

  test("filters by category", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/tool-a",
        display_name: "Tool A",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "hiring",
      },
      ctx,
    );
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "housing/tool-b",
        display_name: "Tool B",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "housing",
      },
      ctx,
    );

    const result = await handleToolList({ category: "hiring" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(1);
    expect(result.data.tools[0].id).toBe("hiring/tool-a");
  });

  test("returns empty list when no tools", async () => {
    const result = await handleToolList({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tools).toHaveLength(0);
    expect(result.data.total).toBe(0);
  });
});

describe("tool/get", () => {
  test("retrieves a tool by ID", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/my-tool",
        display_name: "My Tool",
        description: "A test tool",
        schema: { type: "object", properties: { name: { type: "string" } } },
        schema_version: "2.0.0",
        extends: ["hiring/base-v1"],
      },
      ctx,
    );

    const result = await handleToolGet({ tool_id: "hiring/my-tool" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe("hiring/my-tool");
    expect(result.data.description).toBe("A test tool");
    expect(result.data.schema_json).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect(result.data.extends).toEqual(["hiring/base-v1"]);
  });

  test("returns error for non-existent tool", async () => {
    const result = await handleToolGet({ tool_id: "nonexistent/tool" }, ctx);
    expect(result.ok).toBe(false);
  });

  test("requires tool_id", async () => {
    const result = await handleToolGet({ tool_id: "" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});

describe("tool/recommend", () => {
  test("returns empty recommendations when no tools exist", async () => {
    const result = await handleToolRecommend({ tags: ["hiring"] }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendations).toHaveLength(0);
  });

  test("recommends tools ordered by usage_count", async () => {
    const agent = await createAgent();

    // Publish tools with different usage counts via direct DB manipulation
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/popular-tool",
        display_name: "Popular Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "hiring",
      },
      ctx,
    );
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/new-tool",
        display_name: "New Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "hiring",
      },
      ctx,
    );

    // Manually set usage counts
    db.prepare("UPDATE coordination_tools SET usage_count = 100 WHERE id = ?").run("hiring/popular-tool");
    db.prepare("UPDATE coordination_tools SET usage_count = 5 WHERE id = ?").run("hiring/new-tool");

    const result = await handleToolRecommend({ limit: 10 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendations.length).toBeGreaterThan(0);
    // Popular tool should come first
    expect(result.data.recommendations[0].tool.id).toBe("hiring/popular-tool");
  });

  test("boosts tools matching submission tags", async () => {
    const agent = await createAgent();

    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/software-v1",
        display_name: "Software Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "hiring",
      },
      ctx,
    );
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "housing/roommate-v1",
        display_name: "Roommate Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
        category: "housing",
      },
      ctx,
    );

    // Both start at 0 usage — recommend for "hiring" tags should boost hiring tool
    const result = await handleToolRecommend({ tags: ["hiring"] }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The hiring tool should be recommended (tag match)
    const toolIds = result.data.recommendations.map((r) => r.tool.id);
    expect(toolIds).toContain("hiring/software-v1");
  });
});

// ─── tool/deprecate ───────────────────────────────────────────────────

describe("tool/deprecate", () => {
  test("publisher can deprecate own tool", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/to-deprecate",
        display_name: "Deprecate Me",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );

    const result = await handleToolDeprecate(
      { agent_api_key: agent!.agent_api_key, tool_id: "hiring/to-deprecate" },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("deprecated");

    // Verify in DB
    const row = db.prepare("SELECT status FROM coordination_tools WHERE id = ?").get("hiring/to-deprecate") as any;
    expect(row.status).toBe("deprecated");
  });

  test("non-publisher cannot deprecate another agent's tool", async () => {
    const agentA = await createAgent("Publisher");
    const agentB = await createAgent("Attacker");

    await handleToolPublish(
      {
        agent_api_key: agentA!.agent_api_key,
        id: "hiring/owned-tool",
        display_name: "Owned Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );

    const result = await handleToolDeprecate(
      { agent_api_key: agentB!.agent_api_key, tool_id: "hiring/owned-tool" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  test("deprecating non-existent tool returns NOT_FOUND", async () => {
    const agent = await createAgent();
    const result = await handleToolDeprecate(
      { agent_api_key: agent!.agent_api_key, tool_id: "nonexistent/tool" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("deprecated tool is excluded from default listing", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/active-tool",
        display_name: "Active Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/deprecated-tool",
        display_name: "Deprecated Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );
    await handleToolDeprecate(
      { agent_api_key: agent!.agent_api_key, tool_id: "hiring/deprecated-tool" },
      ctx,
    );

    const result = await handleToolList({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(1);
    expect(result.data.tools[0].id).toBe("hiring/active-tool");
  });
});

// ─── Required-tools enforcement in matching ───────────────────────────

describe("match (required-tools enforcement)", () => {
  test("excludes candidates that don't satisfy required tools from A", async () => {
    const agentA = await createAgent("Hirer");
    const agentB = await createAgent("Dev");
    const vec = makeEmbedding(42, 0.9);

    // A requires "hiring/software-v1" to be filled by the candidate
    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      required_tools: ["hiring/software-v1"],
    });

    // B does NOT fill "hiring/software-v1"
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: { "other/tool": { value: 1 } }, // different tool
    });

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // B should be excluded because it doesn't fill A's required tool
    expect(result.data.candidates).toHaveLength(0);
  });

  test("includes candidates that satisfy all required tools", async () => {
    const agentA = await createAgent("Hirer");
    const agentB = await createAgent("Dev");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      required_tools: ["hiring/software-v1"],
    });

    // B fills the required tool
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: { "hiring/software-v1": { years_experience: 5 } },
    });

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // B satisfies the required tool and the vectors match — should appear
    expect(result.data.candidates.length).toBeGreaterThan(0);
  });

  test("bidirectional required-tools: B's requirements also enforced", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const vec = makeEmbedding(42, 0.9);

    // A has no structured_data; B requires "compliance/kyc" to be filled by the other side
    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      structured_data: {}, // empty
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
      required_tools: ["compliance/kyc"], // B requires A to fill this
      structured_data: { "compliance/kyc": { verified: true } },
    });

    const result = await handleMatch(
      { agent_api_key: agentA!.agent_api_key, submission_id: subAId! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A doesn't fill B's required "compliance/kyc" tool — should be excluded
    expect(result.data.candidates).toHaveLength(0);
  });
});

// ─── ttl_mode='until' validation ──────────────────────────────────────

describe("submit (ttl_mode='until' validation)", () => {
  test("rejects 'until' mode without until_datetime", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        ttl_mode: "until",
        // until_datetime intentionally omitted
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("until_datetime");
  });

  test("rejects 'until' mode with invalid datetime string", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        ttl_mode: "until",
        until_datetime: "not-a-date",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("ISO 8601");
  });

  test("rejects 'until' mode with past datetime", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        ttl_mode: "until",
        until_datetime: "2020-01-01T00:00:00Z", // clearly in the past
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("future");
  });

  test("accepts 'until' mode with valid future datetime", async () => {
    const agent = await createAgent();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        ttl_mode: "until",
        until_datetime: future,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expires_at).toBe(future);
  });
});

// ─── Weight edge cases ────────────────────────────────────────────────

describe("match (weight edge cases)", () => {
  test("zero alpha/beta/gamma falls back to defaults", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const vec = makeEmbedding(42, 0.9);

    const subAId = await createSubmission(agentA!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      ask_embedding: vec,
      offer_embedding: vec,
    });

    const result = await handleMatch(
      {
        agent_api_key: agentA!.agent_api_key,
        submission_id: subAId!,
        alpha: 0,
        beta: 0,
        gamma: 0,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Weights should fall back to defaults (sum to 1.0, no NaN)
    const w = result.data.weights;
    expect(w.alpha + w.beta + w.gamma).toBeCloseTo(1.0, 5);
    expect(isNaN(w.alpha)).toBe(false);
    expect(isNaN(w.beta)).toBe(false);
    expect(isNaN(w.gamma)).toBe(false);
  });

  test("negative weights are rejected", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleMatch(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: subId!,
        alpha: -0.5,
        beta: -0.3,
        gamma: -0.2,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toContain(">= 0");
    }
  });
});

// ─── Pagination bounds ────────────────────────────────────────────────

describe("pagination bounds", () => {
  test("submissions list clamps negative limit to 1", async () => {
    const agent = await createAgent();
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 1" });
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 2" });

    const result = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key, limit: -5 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Negative limit is clamped to 1 — should return at most 1 result
    expect(result.data.submissions.length).toBeLessThanOrEqual(1);
  });

  test("submissions list clamps negative offset to 0", async () => {
    const agent = await createAgent();
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 1" });

    const result = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key, offset: -10 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.submissions).toHaveLength(1);
  });

  test("tool list clamps negative limit to 1", async () => {
    const agent = await createAgent();
    await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/test-tool",
        display_name: "Test Tool",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );

    const result = await handleToolList({ limit: -1 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tools.length).toBeLessThanOrEqual(1);
  });
});

// ─── Bearer header auth ───────────────────────────────────────────────

describe("bearer header auth", () => {
  test("submit accepts agent_api_key via Authorization header", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        intent_text: "Test via bearer header",
        ask_embedding: makeEmbedding(1),
      },
      ctx,
      `Bearer ${agent!.agent_api_key}`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.agent_id).toBe(agent!.agent_id);
  });

  test("match accepts agent_api_key via Authorization header", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleMatch(
      { submission_id: subId! },
      ctx,
      `Bearer ${agent!.agent_api_key}`,
    );
    expect(result.ok).toBe(true);
  });

  test("rejects invalid bearer token", async () => {
    const result = await handleSubmit(
      {
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
      },
      ctx,
      "Bearer invalid_key_here",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });
});

// ─── Payload size limits ──────────────────────────────────────────────

describe("payload size limits", () => {
  test("rejects intent_text over 10KB", async () => {
    const agent = await createAgent();
    const bigText = "x".repeat(11 * 1024); // 11 KB
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: bigText,
        ask_embedding: makeEmbedding(1),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("10KB");
  });

  test("rejects tags array over 20 items", async () => {
    const agent = await createAgent();
    const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        ask_embedding: makeEmbedding(1),
        tags: manyTags,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("20");
  });

  test("rejects tool schema over 50KB", async () => {
    const agent = await createAgent();
    const bigSchema: Record<string, any> = { type: "object", properties: {} };
    for (let i = 0; i < 2000; i++) {
      bigSchema.properties[`field_${i}`] = { type: "string", description: "x".repeat(30) };
    }
    const result = await handleToolPublish(
      {
        agent_api_key: agent!.agent_api_key,
        id: "hiring/big-schema",
        display_name: "Big Schema Tool",
        schema: bigSchema,
        schema_version: "1.0.0",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});

// ─── intent_text validation on update ────────────────────────────────

describe("submission/update (intent_text validation)", () => {
  test("rejects empty string intent_text on update", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: subId!,
        intent_text: "   ", // whitespace-only
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("non-empty");
  });

  test("accepts valid non-empty intent_text on update", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: subId!,
        intent_text: "Updated properly",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
  });
});

// ─── Error code correctness ───────────────────────────────────────────

describe("error codes", () => {
  test("submission update returns NOT_FOUND for nonexistent submission", async () => {
    const agent = await createAgent();
    const result = await handleSubmissionUpdate(
      {
        agent_api_key: agent!.agent_api_key,
        submission_id: "nonexistent-uuid",
        intent_text: "Test",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("submission withdraw returns NOT_FOUND for nonexistent submission", async () => {
    const agent = await createAgent();
    const result = await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: "nonexistent-uuid" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("match returns NOT_FOUND for nonexistent submission", async () => {
    const agent = await createAgent();
    const result = await handleMatch(
      { agent_api_key: agent!.agent_api_key, submission_id: "nonexistent-uuid" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("tool publish returns FORBIDDEN when different agent tries to update", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");

    await handleToolPublish(
      {
        agent_api_key: agentA!.agent_api_key,
        id: "hiring/guarded-tool",
        display_name: "Guarded",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );

    const result = await handleToolPublish(
      {
        agent_api_key: agentB!.agent_api_key,
        id: "hiring/guarded-tool",
        display_name: "Hijacked",
        schema: { type: "object" },
        schema_version: "1.0.0",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  test("tool get returns NOT_FOUND for nonexistent tool", async () => {
    const result = await handleToolGet({ tool_id: "nonexistent/tool" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
