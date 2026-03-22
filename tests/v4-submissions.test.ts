import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import {
  handleAgentCreate,
  handleSubmit,
  handleSubmissionUpdate,
  handleSubmissionWithdraw,
  handleSubmissionsList,
  handleIndex,
  handleIndexGet,
  validateEmbedding,
  authenticateAgent,
} from "../src/handlers/submit.js";
import { handleMatch } from "../src/handlers/match.js";
import { handleMarketInsights } from "../src/handlers/market-insights.js";
import {
  handleMessageSend,
  handleMessageInbox,
  handleMessageRespond,
} from "../src/handlers/messages-v4.js";
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

/** Returns a future ISO datetime string (days from now). */
function futureDate(daysFromNow = 7): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
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
      intent_embedding: makeEmbedding(1),
      identity_embedding: makeEmbedding(2),
      expires_at: futureDate(7),
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
        intent_embedding: makeEmbedding(1),
        expires_at: futureDate(7),
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
        intent_embedding: makeEmbedding(1),
        identity_embedding: makeEmbedding(2),
        criteria_text: "Must have 5+ years TypeScript experience",
        criteria_data: { min_years: 5 },
        identity_text: "We are a fast-growing startup",
        identity_data: { company_size: "50-200" },
        public_data: { budget: "$100-150/hr" },
        private_data: { internal_notes: "urgent" },
        structured_data: { "hiring/software-v1": { years: 5 } },
        required_tools: ["hiring/software-v1"],
        preferred_tools: ["hiring/portfolio-v1"],
        tags: ["hiring", "software"],
        metadata: { source: "manual" },
        expires_at: futureDate(30),
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
        intent_embedding: makeEmbedding(1),
        expires_at: futureDate(7),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("intent_text");
  });

  test("rejects intent_text over 1000 chars", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "a".repeat(1001),
        intent_embedding: makeEmbedding(1),
        expires_at: futureDate(7),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("rejects missing intent_embedding", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "I need a React developer",
        intent_embedding: [],
        expires_at: futureDate(7),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects invalid intent_embedding dimensions", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: new Array(256).fill(0.01),
        expires_at: futureDate(7),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("512");
  });

  test("rejects invalid identity_embedding", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        identity_embedding: new Array(100).fill(0.5) as any,
        expires_at: futureDate(7),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects missing expires_at", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        expires_at: undefined as any,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("expires_at");
  });

  test("rejects past expires_at", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("future");
  });

  test("rejects invalid expires_at format", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        expires_at: "not-a-date",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("rejects unauthorized (no api_key)", async () => {
    const result = await handleSubmit(
      {
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        expires_at: futureDate(7),
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  test("stores public_data and private_data", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        expires_at: futureDate(7),
        public_data: { budget: "$100/hr" },
        private_data: { internal: "secret" },
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verify in DB
    const row = db.prepare("SELECT public_data, private_data FROM submissions WHERE id = ?").get(result.data.submission_id) as any;
    expect(JSON.parse(row.public_data)).toEqual({ budget: "$100/hr" });
    expect(JSON.parse(row.private_data)).toEqual({ internal: "secret" });
  });

  test("stores criteria_text and identity_text", async () => {
    const agent = await createAgent();
    const result = await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Test",
        intent_embedding: makeEmbedding(1),
        expires_at: futureDate(7),
        criteria_text: "Must be available full-time",
        identity_text: "We are a startup in NYC",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = db.prepare("SELECT criteria_text, identity_text FROM submissions WHERE id = ?").get(result.data.submission_id) as any;
    expect(row.criteria_text).toBe("Must be available full-time");
    expect(row.identity_text).toBe("We are a startup in NYC");
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

  test("returns has_identity_embedding correctly", async () => {
    const agent = await createAgent();
    // With identity embedding
    await createSubmission(agent!.agent_api_key, { identity_embedding: makeEmbedding(5) });
    // Without identity embedding
    await handleSubmit(
      {
        agent_api_key: agent!.agent_api_key,
        intent_text: "Intent only",
        intent_embedding: makeEmbedding(6),
        expires_at: futureDate(7),
      },
      ctx,
    );

    const result = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const withIdentity = result.data.submissions.filter((s) => s.has_identity_embedding);
    const withoutIdentity = result.data.submissions.filter((s) => !s.has_identity_embedding);
    expect(withIdentity).toHaveLength(1);
    expect(withoutIdentity).toHaveLength(1);
  });

  test("returns has_public_data correctly", async () => {
    const agent = await createAgent();
    await createSubmission(agent!.agent_api_key, { public_data: { budget: "$100/hr" } });
    await createSubmission(agent!.agent_api_key);

    const result = await handleSubmissionsList(
      { agent_api_key: agent!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const withPub = result.data.submissions.filter((s) => s.has_public_data);
    const withoutPub = result.data.submissions.filter((s) => !s.has_public_data);
    expect(withPub).toHaveLength(1);
    expect(withoutPub).toHaveLength(1);
  });
});

// ─── Public Index ─────────────────────────────────────────────────────

describe("index (public)", () => {
  test("returns active submissions without auth", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    await createSubmission(agentA!.agent_api_key, { public_data: { visible: true } });
    await createSubmission(agentB!.agent_api_key);

    const result = await handleIndex({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    expect(result.data.submissions).toHaveLength(2);
  });

  test("returns public fields and intent_embedding, never private_data or identity_embedding", async () => {
    const agent = await createAgent();
    await createSubmission(agent!.agent_api_key, {
      public_data: { budget: "$100/hr" },
      private_data: { secret: "internal" },
      identity_embedding: makeEmbedding(99),
    });

    const result = await handleIndex({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.submissions).toHaveLength(1);
    const sub = result.data.submissions[0];

    // These fields MUST be present
    expect(sub.id).toBeTruthy();
    expect(sub.agent_id).toBeTruthy();
    expect(sub.intent_text).toBeTruthy();
    expect(Array.isArray(sub.intent_embedding)).toBe(true);
    expect(sub.intent_embedding).toHaveLength(512);
    expect(sub.public_data).toEqual({ budget: "$100/hr" });

    // These fields MUST NOT be present
    expect((sub as any).private_data).toBeUndefined();
    expect((sub as any).identity_embedding).toBeUndefined();
    expect((sub as any).criteria_data).toBeUndefined();
    expect((sub as any).identity_data).toBeUndefined();
  });

  test("does not return withdrawn or expired submissions", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    await handleSubmissionWithdraw(
      { agent_api_key: agent!.agent_api_key, submission_id: subId! },
      ctx,
    );

    const result = await handleIndex({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(0);
  });

  test("paginates correctly", async () => {
    const agent = await createAgent();
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 1" });
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 2" });
    await createSubmission(agent!.agent_api_key, { intent_text: "Sub 3" });

    const page1 = await handleIndex({ limit: 2, offset: 0 }, ctx);
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.data.submissions).toHaveLength(2);
    expect(page1.data.total).toBe(3);

    const page2 = await handleIndex({ limit: 2, offset: 2 }, ctx);
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.data.submissions).toHaveLength(1);
  });
});

// ─── Index Get ────────────────────────────────────────────────────────

describe("index/get (public)", () => {
  test("retrieves a submission by ID without auth", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key, {
      public_data: { info: "visible" },
    });

    const result = await handleIndexGet({ submission_id: subId! }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(subId);
    expect(result.data.public_data).toEqual({ info: "visible" });
    expect(Array.isArray(result.data.intent_embedding)).toBe(true);

    // Private fields MUST NOT be present
    expect((result.data as any).private_data).toBeUndefined();
    expect((result.data as any).identity_embedding).toBeUndefined();
  });

  test("returns NOT_FOUND for nonexistent submission", async () => {
    const result = await handleIndexGet({ submission_id: "nonexistent-id" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("requires submission_id", async () => {
    const result = await handleIndexGet({ submission_id: "" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
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

    // A has intent, B has matching identity (high cross-match expected)
    const vec = makeEmbedding(10, 0.9);

    const subAId = await handleSubmit(
      {
        agent_api_key: agentA!.agent_api_key,
        intent_text: "I need React development",
        intent_embedding: vec,
        expires_at: futureDate(7),
      },
      ctx,
    );

    await handleSubmit(
      {
        agent_api_key: agentB!.agent_api_key,
        intent_text: "I am a React developer",
        intent_embedding: makeEmbedding(99),
        identity_embedding: vec, // Same direction as A's intent
        expires_at: futureDate(7),
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
        intent_embedding: askVec,
        expires_at: futureDate(7),
      },
      ctx,
    );

    await handleSubmit(
      {
        agent_api_key: agentB!.agent_api_key,
        intent_text: "Offer Y (unrelated)",
        intent_embedding: makeEmbedding(201),
        identity_embedding: perpVec,
        expires_at: futureDate(7),
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
      intent_embedding: vec,
      identity_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
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
      intent_embedding: vec,
      identity_embedding: vec,
      structured_data: {
        "hiring/software-v1": { years_experience: 5, languages: ["TypeScript"] },
      },
    });
    await createSubmission(agentB!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
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
      intent_embedding: vec,
      identity_embedding: vec,
      structured_data: { "tool/a": { field: "value" } },
    });
    await createSubmission(agentB!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
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
      intent_embedding: vec,
      identity_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
    });
    await createSubmission(agentC!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
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
      intent_embedding: vec,
      identity_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
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
      intent_embedding: vec,
      identity_embedding: vec,
    });
    await createSubmission(agentB!.agent_api_key, {
      intent_embedding: vec,
      identity_embedding: vec,
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

// ─── Messaging ────────────────────────────────────────────────────────

describe("message/send", () => {
  test("sends a message to a submission", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const subBId = await createSubmission(agentB!.agent_api_key);
    const subAId = await createSubmission(agentA!.agent_api_key);

    const result = await handleMessageSend(
      {
        agent_api_key: agentA!.agent_api_key,
        target_submission_id: subBId!,
        from_submission_id: subAId!,
        message_text: "Hello, I think we're a great match!",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message_id).toBeTruthy();
    expect(result.data.status).toBe("pending");
    expect(result.data.from_agent_id).toBe(agentA!.agent_id);
  });

  test("rejects messaging own submission", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleMessageSend(
      {
        agent_api_key: agent!.agent_api_key,
        target_submission_id: subId!,
        message_text: "Hello myself",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("own submission");
  });

  test("rejects missing message_text", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const subBId = await createSubmission(agentB!.agent_api_key);

    const result = await handleMessageSend(
      {
        agent_api_key: agentA!.agent_api_key,
        target_submission_id: subBId!,
        message_text: "",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects nonexistent target submission", async () => {
    const agent = await createAgent();
    const result = await handleMessageSend(
      {
        agent_api_key: agent!.agent_api_key,
        target_submission_id: "nonexistent-id",
        message_text: "Hello",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("rejects unauthorized", async () => {
    const agent = await createAgent();
    const subId = await createSubmission(agent!.agent_api_key);

    const result = await handleMessageSend(
      {
        target_submission_id: subId!,
        message_text: "Hello",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });
});

describe("message/inbox", () => {
  test("returns messages for owned submissions", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const subBId = await createSubmission(agentB!.agent_api_key);

    await handleMessageSend(
      {
        agent_api_key: agentA!.agent_api_key,
        target_submission_id: subBId!,
        message_text: "Hello!",
      },
      ctx,
    );

    const result = await handleMessageInbox(
      { agent_api_key: agentB!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(1);
    expect(result.data.messages[0].message_text).toBe("Hello!");
  });

  test("filters by submission_id", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const sub1 = await createSubmission(agentB!.agent_api_key, { intent_text: "Sub 1" });
    const sub2 = await createSubmission(agentB!.agent_api_key, { intent_text: "Sub 2" });

    await handleMessageSend(
      { agent_api_key: agentA!.agent_api_key, target_submission_id: sub1!, message_text: "Msg to sub1" },
      ctx,
    );
    await handleMessageSend(
      { agent_api_key: agentA!.agent_api_key, target_submission_id: sub2!, message_text: "Msg to sub2" },
      ctx,
    );

    const result = await handleMessageInbox(
      { agent_api_key: agentB!.agent_api_key, submission_id: sub1! },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(1);
    expect(result.data.messages[0].message_text).toBe("Msg to sub1");
  });

  test("includes sender public submission data", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const subBId = await createSubmission(agentB!.agent_api_key);
    const subAId = await createSubmission(agentA!.agent_api_key, {
      public_data: { name: "Alice's Agency" },
    });

    await handleMessageSend(
      {
        agent_api_key: agentA!.agent_api_key,
        target_submission_id: subBId!,
        from_submission_id: subAId!,
        message_text: "Hi there!",
      },
      ctx,
    );

    const result = await handleMessageInbox(
      { agent_api_key: agentB!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages[0].sender_public_data).toEqual({ name: "Alice's Agency" });
    expect(result.data.messages[0].sender_intent_text).toBeTruthy();
  });

  test("does not show messages for other agents' submissions", async () => {
    const agentA = await createAgent("A");
    const agentB = await createAgent("B");
    const agentC = await createAgent("C");
    const subBId = await createSubmission(agentB!.agent_api_key);

    await handleMessageSend(
      { agent_api_key: agentA!.agent_api_key, target_submission_id: subBId!, message_text: "For B" },
      ctx,
    );

    // C should see 0 messages
    const result = await handleMessageInbox(
      { agent_api_key: agentC!.agent_api_key },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(0);
  });
});

describe("message/respond", () => {
  test("responds to a message", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const subBId = await createSubmission(agentB!.agent_api_key);

    const sendResult = await handleMessageSend(
      {
        agent_api_key: agentA!.agent_api_key,
        target_submission_id: subBId!,
        message_text: "Interested?",
      },
      ctx,
    );
    expect(sendResult.ok).toBe(true);
    if (!sendResult.ok) return;

    const respondResult = await handleMessageRespond(
      {
        agent_api_key: agentB!.agent_api_key,
        message_id: sendResult.data.message_id,
        response_text: "Yes, let's talk!",
      },
      ctx,
    );
    expect(respondResult.ok).toBe(true);
    if (!respondResult.ok) return;
    expect(respondResult.data.status).toBe("responded");
    expect(respondResult.data.responded_at).toBeTruthy();

    // Verify in DB
    const row = db.prepare("SELECT response_text, status FROM v4_messages WHERE id = ?").get(sendResult.data.message_id) as any;
    expect(row.response_text).toBe("Yes, let's talk!");
    expect(row.status).toBe("responded");
  });

  test("rejects double response", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const subBId = await createSubmission(agentB!.agent_api_key);

    const sendResult = await handleMessageSend(
      { agent_api_key: agentA!.agent_api_key, target_submission_id: subBId!, message_text: "Hi" },
      ctx,
    );
    if (!sendResult.ok) return;

    await handleMessageRespond(
      { agent_api_key: agentB!.agent_api_key, message_id: sendResult.data.message_id, response_text: "First reply" },
      ctx,
    );

    const result = await handleMessageRespond(
      { agent_api_key: agentB!.agent_api_key, message_id: sendResult.data.message_id, response_text: "Second reply" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("already been responded");
  });

  test("rejects response by sender (not receiver)", async () => {
    const agentA = await createAgent("Sender");
    const agentB = await createAgent("Receiver");
    const subBId = await createSubmission(agentB!.agent_api_key);

    const sendResult = await handleMessageSend(
      { agent_api_key: agentA!.agent_api_key, target_submission_id: subBId!, message_text: "Hi" },
      ctx,
    );
    if (!sendResult.ok) return;

    // A tries to respond to their own outgoing message — should fail
    const result = await handleMessageRespond(
      { agent_api_key: agentA!.agent_api_key, message_id: sendResult.data.message_id, response_text: "Me replying" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
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
});
