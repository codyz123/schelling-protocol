import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleClusterInfo } from "../src/handlers/clusters.js";
import { handleUpdate } from "../src/handlers/update.js";
import { handleReport } from "../src/handlers/report.js";
import { handleInterest } from "../src/handlers/interest.js";
import { handleCommit } from "../src/handlers/commit.js";

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

async function registerUser(overrides = {}) {
  const result = await handleRegister(
    {
      protocol_version: "3.0",
      cluster_id: "housing.general",
      traits: [
        { key: "name", value: "Test User", value_type: "string", visibility: "public" },
        { key: "price", value: 1500, value_type: "number", visibility: "public" },
        { key: "style", value: "modern", value_type: "string", visibility: "public" },
      ],
      preferences: [],
      identity: { name: "Test User", contact: "test@example.com" },
      ...overrides,
    } as any,
    ctx,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

// ─── Preference agent_confidence and source ─────────────────────────

describe("delegation: preference fields", () => {
  test("preferences store agent_confidence and source", async () => {
    const token = await registerUser({
      preferences: [
        {
          trait_key: "price",
          operator: "lte",
          value: 2000,
          weight: 0.8,
          agent_confidence: 0.95,
          source: "user_stated",
        },
        {
          trait_key: "style",
          operator: "eq",
          value: "modern",
          weight: 0.5,
          agent_confidence: 0.3,
          source: "user_inferred",
        },
      ],
    });

    const rows = db
      .prepare("SELECT trait_key, agent_confidence, source FROM preferences WHERE user_token = ?")
      .all(token) as any[];

    expect(rows.length).toBe(2);
    const priceRow = rows.find((r: any) => r.trait_key === "price");
    const styleRow = rows.find((r: any) => r.trait_key === "style");
    expect(priceRow.agent_confidence).toBe(0.95);
    expect(priceRow.source).toBe("user_stated");
    expect(styleRow.agent_confidence).toBe(0.3);
    expect(styleRow.source).toBe("user_inferred");
  });

  test("preferences default agent_confidence to 0.5 and source to agent_default", async () => {
    const token = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.8 },
      ],
    });

    const row = db
      .prepare("SELECT agent_confidence, source FROM preferences WHERE user_token = ?")
      .get(token) as any;

    expect(row.agent_confidence).toBe(0.5);
    expect(row.source).toBe("agent_default");
  });

  test("update preserves agent_confidence and source on upsert", async () => {
    const token = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.8, agent_confidence: 0.4 },
      ],
    });

    await handleUpdate(
      {
        user_token: token,
        preferences: [
          {
            trait_key: "price",
            operator: "lte",
            value: 2500,
            weight: 0.9,
            agent_confidence: 0.95,
            source: "user_stated",
          },
        ],
      } as any,
      ctx,
    );

    const row = db
      .prepare("SELECT agent_confidence, source, value FROM preferences WHERE user_token = ? AND trait_key = 'price'")
      .get(token) as any;

    expect(row.agent_confidence).toBe(0.95);
    expect(row.source).toBe("user_stated");
  });
});

// ─── Search delegation enrichment ───────────────────────────────────

describe("delegation: search response enrichment", () => {
  test("search results include delegation_confidence and dimension_confidence", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.8, agent_confidence: 0.9 },
        { trait_key: "style", operator: "eq", value: "modern", weight: 0.5, agent_confidence: 0.3 },
      ],
    });

    await registerUser({
      traits: [
        { key: "name", value: "Candidate", value_type: "string", visibility: "public" },
        { key: "price", value: 1200, value_type: "number", visibility: "public" },
        { key: "style", value: "modern", value_type: "string", visibility: "public" },
      ],
    });

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const candidate = result.data.candidates[0];
    expect(candidate).toBeDefined();
    expect(typeof candidate.delegation_confidence).toBe("number");
    expect(candidate.delegation_confidence).toBeGreaterThanOrEqual(0);
    expect(candidate.delegation_confidence).toBeLessThanOrEqual(1);

    expect(candidate.dimension_confidence).toBeDefined();
    expect(candidate.dimension_confidence.price).toBeDefined();
    expect(candidate.dimension_confidence.style).toBeDefined();

    expect(candidate.dimension_confidence.price.agent_confidence).toBe(0.9);
    expect(candidate.dimension_confidence.style.agent_confidence).toBe(0.3);

    for (const dim of ["price", "style"]) {
      const dc = candidate.dimension_confidence[dim];
      expect(typeof dc.agent_confidence).toBe("number");
      expect(typeof dc.dimension_decidability).toBe("number");
      expect(typeof dc.signal_density).toBe("number");
      expect(typeof dc.combined).toBe("number");
      const expected = dc.agent_confidence * dc.dimension_decidability * dc.signal_density;
      expect(dc.combined).toBeCloseTo(expected, 3);
    }
  });

  test("search response includes delegation_summary", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.8, agent_confidence: 0.9 },
      ],
    });

    await registerUser({
      traits: [
        { key: "name", value: "Candidate", value_type: "string", visibility: "public" },
        { key: "price", value: 1200, value_type: "number", visibility: "public" },
      ],
    });

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ds = result.data.delegation_summary;
    expect(ds).toBeDefined();
    expect(typeof ds.overall_delegation_confidence).toBe("number");
    expect(typeof ds.match_ambiguity).toBe("number");
    expect(Array.isArray(ds.high_confidence_dimensions)).toBe(true);
    expect(Array.isArray(ds.low_confidence_dimensions)).toBe(true);
    expect(["act_autonomously", "present_candidates_to_user", "seek_user_input_on_dimensions", "defer_to_user"]).toContain(ds.recommendation);
    expect(typeof ds.recommendation_strength).toBe("number");
    expect(ds.recommendation_strength).toBeGreaterThanOrEqual(0);
    expect(ds.recommendation_strength).toBeLessThanOrEqual(1);
  });

  test("match_ambiguity is high when candidates have similar scores", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.5 },
      ],
    });

    for (let i = 0; i < 5; i++) {
      await registerUser({
        traits: [
          { key: "name", value: `Candidate ${i}`, value_type: "string", visibility: "public" },
          { key: "price", value: 1500 + i * 10, value_type: "number", visibility: "public" },
        ],
      });
    }

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.delegation_summary.match_ambiguity).toBeGreaterThan(0.5);
  });

  test("match_ambiguity is low with single candidate", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.5 },
      ],
    });

    await registerUser({
      traits: [
        { key: "name", value: "Only Candidate", value_type: "string", visibility: "public" },
        { key: "price", value: 1200, value_type: "number", visibility: "public" },
      ],
    });

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.delegation_summary.match_ambiguity).toBeLessThanOrEqual(0.2);
  });

  test("delegation does not affect advisory_score ranking", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.8, agent_confidence: 0.1 },
      ],
    });

    await registerUser({
      traits: [
        { key: "name", value: "Good", value_type: "string", visibility: "public" },
        { key: "price", value: 1000, value_type: "number", visibility: "public" },
      ],
    });

    await registerUser({
      traits: [
        { key: "name", value: "Ok", value_type: "string", visibility: "public" },
        { key: "price", value: 1800, value_type: "number", visibility: "public" },
      ],
    });

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.candidates.length).toBe(2);
    expect(result.data.candidates[0].advisory_score).toBeGreaterThanOrEqual(
      result.data.candidates[1].advisory_score,
    );
  });
});

// ─── Cluster delegation priors ──────────────────────────────────────

describe("delegation: cluster priors", () => {
  test("cluster_info returns default delegation_priors for new clusters", async () => {
    await registerUser();

    const result = await handleClusterInfo({ cluster_id: "housing.general" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const priors = result.data.delegation_priors;
    expect(priors).toBeDefined();
    expect(priors.typical_agent_autonomy).toBe(0.5);
    expect(priors.dimension_decidability).toEqual({});
    expect(priors.dimensions_typically_requiring_review).toEqual([]);
    expect(priors.sample_size).toBe(0);
  });
});

// ─── Report delegation_metadata ─────────────────────────────────────

describe("delegation: report with delegation_metadata", () => {
  async function setupConnectedPair() {
    const userA = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.5, agent_confidence: 0.9 },
        { trait_key: "style", operator: "eq", value: "modern", weight: 0.5, agent_confidence: 0.3 },
      ],
    });

    const userB = await registerUser({
      traits: [
        { key: "name", value: "B", value_type: "string", visibility: "public" },
        { key: "price", value: 1200, value_type: "number", visibility: "public" },
        { key: "style", value: "modern", value_type: "string", visibility: "public" },
      ],
    });

    // Both users must search to advance to DISCOVERED stage
    const searchA = await handleSearch({ user_token: userA }, ctx);
    if (!searchA.ok) throw new Error("search A failed");
    const candidateId = searchA.data.candidates[0].candidate_id;

    // B also needs to search to discover A
    await handleSearch({ user_token: userB }, ctx);

    await handleInterest({ user_token: userA, candidate_id: candidateId } as any, ctx);
    await handleInterest({ user_token: userB, candidate_id: candidateId } as any, ctx);
    await handleCommit({ user_token: userA, candidate_id: candidateId } as any, ctx);
    await handleCommit({ user_token: userB, candidate_id: candidateId } as any, ctx);

    return { userA, userB, candidateId };
  }

  test("report accepts delegation_metadata", async () => {
    const { userA, candidateId } = await setupConnectedPair();

    const result = await handleReport(
      {
        user_token: userA,
        candidate_id: candidateId,
        outcome: "positive",
        delegation_metadata: {
          agent_decided_dimensions: ["price"],
          user_reviewed_dimensions: ["style"],
          user_overrode_agent: false,
        },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reported).toBe(true);
  });

  test("report with delegation_metadata updates cluster priors", async () => {
    const { userA, candidateId } = await setupConnectedPair();

    await handleReport(
      {
        user_token: userA,
        candidate_id: candidateId,
        outcome: "positive",
        delegation_metadata: {
          agent_decided_dimensions: ["price"],
          user_reviewed_dimensions: ["style"],
          user_overrode_agent: false,
        },
      },
      ctx,
    );

    const clusterResult = await handleClusterInfo({ cluster_id: "housing.general" }, ctx);
    expect(clusterResult.ok).toBe(true);
    if (!clusterResult.ok) return;

    const priors = clusterResult.data.delegation_priors;
    expect(priors.sample_size).toBe(1);
    expect(priors.dimension_decidability.price).toBeGreaterThan(0.5);
    expect(priors.dimension_decidability.style).toBeDefined();
  });

  test("delegation_metadata is stored in outcomes", async () => {
    const { userA, candidateId } = await setupConnectedPair();

    await handleReport(
      {
        user_token: userA,
        candidate_id: candidateId,
        outcome: "positive",
        delegation_metadata: {
          agent_decided_dimensions: ["price"],
          user_reviewed_dimensions: ["style"],
          user_overrode_agent: true,
        },
      },
      ctx,
    );

    const row = db
      .prepare("SELECT delegation_metadata FROM outcomes WHERE candidate_id = ? AND reporter_token = ?")
      .get(candidateId, userA) as any;

    expect(row.delegation_metadata).toBeDefined();
    const meta = JSON.parse(row.delegation_metadata);
    expect(meta.agent_decided_dimensions).toEqual(["price"]);
    expect(meta.user_overrode_agent).toBe(true);
  });

  test("report without delegation_metadata still works", async () => {
    const { userA, candidateId } = await setupConnectedPair();

    const result = await handleReport(
      {
        user_token: userA,
        candidate_id: candidateId,
        outcome: "positive",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
  });

  test("cluster priors update with EMA over multiple reports", async () => {
    const pair1 = await setupConnectedPair();
    await handleReport(
      {
        user_token: pair1.userA,
        candidate_id: pair1.candidateId,
        outcome: "positive",
        delegation_metadata: {
          agent_decided_dimensions: ["price"],
          user_reviewed_dimensions: [],
          user_overrode_agent: false,
        },
      },
      ctx,
    );

    const result1 = await handleClusterInfo({ cluster_id: "housing.general" }, ctx);
    if (!result1.ok) throw new Error("cluster info failed");
    const priors1 = result1.data.delegation_priors;

    await handleReport(
      {
        user_token: pair1.userB,
        candidate_id: pair1.candidateId,
        outcome: "positive",
        delegation_metadata: {
          agent_decided_dimensions: ["price"],
          user_reviewed_dimensions: [],
          user_overrode_agent: false,
        },
      },
      ctx,
    );

    const result2 = await handleClusterInfo({ cluster_id: "housing.general" }, ctx);
    if (!result2.ok) throw new Error("cluster info failed");
    const priors2 = result2.data.delegation_priors;

    expect(priors2.sample_size).toBe(2);
    expect(priors2.dimension_decidability.price).toBeGreaterThanOrEqual(
      priors1.dimension_decidability.price,
    );
  });
});

// ─── Signal density ─────────────────────────────────────────────────

describe("delegation: signal density", () => {
  test("signal_density starts low for new users", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.5 },
      ],
    });

    await registerUser({
      traits: [
        { key: "name", value: "Candidate", value_type: "string", visibility: "public" },
        { key: "price", value: 1200, value_type: "number", visibility: "public" },
      ],
    });

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dc = result.data.candidates[0].dimension_confidence.price;
    expect(dc.signal_density).toBeGreaterThan(0);
    expect(dc.signal_density).toBeLessThan(1);
  });
});

// ─── All values in range ────────────────────────────────────────────

describe("delegation: value ranges", () => {
  test("all delegation values are in [0, 1]", async () => {
    const seeker = await registerUser({
      preferences: [
        { trait_key: "price", operator: "lte", value: 2000, weight: 0.8, agent_confidence: 0.95 },
        { trait_key: "style", operator: "eq", value: "modern", weight: 0.3, agent_confidence: 0.1 },
      ],
    });

    for (let i = 0; i < 3; i++) {
      await registerUser({
        traits: [
          { key: "name", value: `C${i}`, value_type: "string", visibility: "public" },
          { key: "price", value: 1000 + i * 200, value_type: "number", visibility: "public" },
          { key: "style", value: i === 0 ? "modern" : "traditional", value_type: "string", visibility: "public" },
        ],
      });
    }

    const result = await handleSearch({ user_token: seeker }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const c of result.data.candidates) {
      expect(c.delegation_confidence).toBeGreaterThanOrEqual(0);
      expect(c.delegation_confidence).toBeLessThanOrEqual(1);
      for (const [_, dc] of Object.entries(c.dimension_confidence)) {
        expect(dc.agent_confidence).toBeGreaterThanOrEqual(0);
        expect(dc.agent_confidence).toBeLessThanOrEqual(1);
        expect(dc.dimension_decidability).toBeGreaterThanOrEqual(0);
        expect(dc.dimension_decidability).toBeLessThanOrEqual(1);
        expect(dc.signal_density).toBeGreaterThanOrEqual(0);
        expect(dc.signal_density).toBeLessThanOrEqual(1);
        expect(dc.combined).toBeGreaterThanOrEqual(0);
        expect(dc.combined).toBeLessThanOrEqual(1);
      }
    }

    const ds = result.data.delegation_summary;
    expect(ds.overall_delegation_confidence).toBeGreaterThanOrEqual(0);
    expect(ds.overall_delegation_confidence).toBeLessThanOrEqual(1);
    expect(ds.match_ambiguity).toBeGreaterThanOrEqual(0);
    expect(ds.match_ambiguity).toBeLessThanOrEqual(1);
    expect(ds.recommendation_strength).toBeGreaterThanOrEqual(0);
    expect(ds.recommendation_strength).toBeLessThanOrEqual(1);
  });
});
