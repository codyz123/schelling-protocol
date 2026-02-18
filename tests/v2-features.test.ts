import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleCompare } from "../src/handlers/compare.js";
import { handleRequestProfile } from "../src/handlers/request-profile.js";
import { handlePropose } from "../src/handlers/propose.js";
import { handleWithdraw } from "../src/handlers/withdraw.js";
import { handleDecline } from "../src/handlers/decline.js";
import type { HandlerContext } from "../src/types.js";
import { Stage, DIMENSION_COUNT } from "../src/types.js";
import { initVerticalRegistry, getVertical, listVerticals } from "../src/verticals/registry.js";

function makeEmbedding(base: number, variance: number = 0): number[] {
  return new Array(DIMENSION_COUNT).fill(0).map((_, i) => {
    const v = base + (variance ? Math.sin(i) * variance : 0);
    return Math.max(-1, Math.min(1, v));
  });
}

let ctx: HandlerContext;

beforeEach(() => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  initSchema(db);
  initVerticalRegistry();
  ctx = { db };
});

async function registerUser(
  embedding: number[],
  overrides: Record<string, unknown> = {}
) {
  const result = await handleRegister(
    {
      protocol_version: "schelling-2.0",
      embedding,
      city: "San Francisco",
      age_range: "25-34",
      intent: ["romance"],
      interests: ["rock climbing", "coding"],
      values_text: "intellectual honesty",
      description: "Curious person",
      seeking: "Deep connection",
      identity: { name: "Test User", contact: "test@example.com" },
      ...overrides,
    },
    ctx
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

describe("v2 features", () => {
  describe("generalized funnel stages", () => {
    test("new stage names work correctly", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
      const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

      // Search should advance to DISCOVERED (stage 1)
      const searchResult = await handleSearch({ user_token: tokenA }, ctx);
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      const candidateId = searchResult.data.candidates[0]?.candidate_id;
      expect(candidateId).toBeDefined();

      // Determine which side tokenA is on (depends on lexicographic ordering)
      const candidateRow = ctx.db
        .prepare("SELECT user_a_token, stage_a, stage_b FROM candidates WHERE id = ?")
        .get(candidateId) as { user_a_token: string; stage_a: number; stage_b: number };
      const col = tokenA === candidateRow.user_a_token ? "stage_a" : "stage_b";

      // Check stage is DISCOVERED (1)
      const candidate1 = ctx.db
        .prepare(`SELECT ${col} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidate1.stage).toBe(Stage.DISCOVERED);

      // Compare should advance to EVALUATED (stage 2)  
      const compareResult = await handleCompare(
        { user_token: tokenA, candidate_ids: [candidateId] },
        ctx
      );
      expect(compareResult.ok).toBe(true);

      const candidate2 = ctx.db
        .prepare(`SELECT ${col} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidate2.stage).toBe(Stage.EVALUATED);

      // Mutual evaluation needed for profile exchange
      await handleCompare(
        { user_token: tokenB, candidate_ids: [candidateId] },
        ctx
      );

      // Request profile should advance to EXCHANGED (stage 3)
      const profileResult = await handleRequestProfile(
        { user_token: tokenA, candidate_id: candidateId },
        ctx
      );
      expect(profileResult.ok).toBe(true);

      const candidate3 = ctx.db
        .prepare(`SELECT ${col} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidate3.stage).toBe(Stage.EXCHANGED);

      // Propose should advance to COMMITTED (stage 4)
      const proposeResult = await handlePropose(
        { user_token: tokenA, candidate_id: candidateId },
        ctx
      );
      expect(proposeResult.ok).toBe(true);

      const candidate4 = ctx.db
        .prepare(`SELECT ${col} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidate4.stage).toBe(Stage.COMMITTED);
    });

    test("COMPLETED stage (6) reached after outcome reporting", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
      const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

      // Go through full funnel to CONNECTED
      await handleSearch({ user_token: tokenA }, ctx);
      const searchResult = await handleSearch({ user_token: tokenB }, ctx);
      if (!searchResult.ok) return;
      
      const candidateId = searchResult.data.candidates[0]?.candidate_id;
      if (!candidateId) return;

      await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
      await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
      await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
      await handleRequestProfile({ user_token: tokenB, candidate_id: candidateId }, ctx);
      await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);
      await handlePropose({ user_token: tokenB, candidate_id: candidateId }, ctx);

      // Should now be at CONNECTED (5)
      const candidate = ctx.db
        .prepare("SELECT user_a_token, stage_a, stage_b FROM candidates WHERE id = ?")
        .get(candidateId) as { user_a_token: string; stage_a: number; stage_b: number };
      expect(candidate.stage_a).toBe(Stage.CONNECTED);
      expect(candidate.stage_b).toBe(Stage.CONNECTED);

      // Determine which column corresponds to tokenA
      const colA = tokenA === candidate.user_a_token ? "stage_a" : "stage_b";

      // Report outcome should advance to COMPLETED (6)
      const { handleReportOutcome } = await import("../src/handlers/report-outcome.js");
      const outcomeResult = await handleReportOutcome({
        user_token: tokenA,
        candidate_id: candidateId,
        outcome: "positive",
        met_in_person: true
      }, ctx);
      expect(outcomeResult.ok).toBe(true);

      const candidateFinal = ctx.db
        .prepare(`SELECT ${colA} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidateFinal.stage).toBe(Stage.COMPLETED);
    });
  });

  describe("vertical registry", () => {
    test("matchmaking vertical is loaded", () => {
      const verticals = listVerticals();
      expect(verticals.length).toBeGreaterThan(0);
      
      const matchmaking = getVertical("matchmaking");
      expect(matchmaking).toBeDefined();
      expect(matchmaking?.display_name).toBe("Romantic Matchmaking");
      expect(matchmaking?.symmetric).toBe(true);
    });

    test("registration with vertical_id works", async () => {
      const result = await handleRegister({
        protocol_version: "schelling-2.0",
        vertical_id: "matchmaking",
        embedding: makeEmbedding(0.5),
        city: "San Francisco", 
        age_range: "25-34",
        intent: ["romance"]
      }, ctx);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Check user was created with correct vertical
      const user = ctx.db
        .prepare("SELECT vertical_id FROM users WHERE user_token = ?")
        .get(result.data.user_token) as { vertical_id: string };
      expect(user.vertical_id).toBe("matchmaking");
    });

    test("invalid vertical_id is handled gracefully", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5));
      
      const searchResult = await handleSearch({ 
        user_token: tokenA, 
        vertical_id: "nonexistent" 
      }, ctx);
      
      expect(searchResult.ok).toBe(false);
      if (!searchResult.ok) {
        expect(searchResult.error.code).toBe("INVALID_VERTICAL");
      }
    });
  });

  describe("deal-breaker filters", () => {
    test("hard filters exclude incompatible candidates", async () => {
      // Register user with no-smoking deal-breaker
      const tokenA = await registerUser(makeEmbedding(0.5), {
        deal_breakers: { no_smoking: true }
      });

      // Register smoker
      const tokenB = await registerUser(makeEmbedding(0.5), {
        deal_breakers: { smoking: true }
      });

      // A searches - should not find B due to smoking conflict
      const searchResult = await handleSearch({ user_token: tokenA }, ctx);
      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        // B should be filtered out
        expect(searchResult.data.candidates.length).toBe(0);
      }
    });

    test("compatible deal-breakers allow matching", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5), {
        deal_breakers: { no_pets: false }
      });

      const tokenB = await registerUser(makeEmbedding(0.5), {
        deal_breakers: { pets: true }
      });

      const searchResult = await handleSearch({ user_token: tokenA }, ctx);
      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.candidates.length).toBeGreaterThan(0);
      }
    });
  });

  describe("withdraw functionality", () => {
    test("can withdraw from COMMITTED stage", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
      const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

      // Progress to COMMITTED - need to complete full sequence
      await handleSearch({ user_token: tokenA }, ctx);
      const searchResultB = await handleSearch({ user_token: tokenB }, ctx);
      if (!searchResultB.ok) return;
      
      const candidateId = searchResultB.data.candidates[0]?.candidate_id;
      if (!candidateId) return;

      // Both need to compare first
      await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
      await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
      
      // Both need to request profile to establish mutual tier-2
      await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
      await handleRequestProfile({ user_token: tokenB, candidate_id: candidateId }, ctx);
      
      // A proposes (advances to COMMITTED)
      await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);

      // Determine which side tokenA is on
      const candidateRow = ctx.db
        .prepare("SELECT user_a_token FROM candidates WHERE id = ?")
        .get(candidateId) as { user_a_token: string };
      const col = tokenA === candidateRow.user_a_token ? "stage_a" : "stage_b";

      // Check A is now COMMITTED
      const candidate = ctx.db
        .prepare(`SELECT ${col} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidate.stage).toBe(Stage.COMMITTED);

      // A withdraws
      const withdrawResult = await handleWithdraw({
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Changed mind"
      }, ctx);
      
      expect(withdrawResult.ok).toBe(true);
      if (withdrawResult.ok) {
        expect(withdrawResult.data.withdrawn).toBe(true);
        expect(withdrawResult.data.new_stage).toBe(Stage.EXCHANGED);
      }

      // Check stage was reset to EXCHANGED
      const candidateAfter = ctx.db
        .prepare(`SELECT ${col} as stage FROM candidates WHERE id = ?`)
        .get(candidateId) as { stage: number };
      expect(candidateAfter.stage).toBe(Stage.EXCHANGED);
    });

    test("cannot withdraw from non-COMMITTED stages", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
      const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

      await handleSearch({ user_token: tokenA }, ctx);
      const searchResult = await handleSearch({ user_token: tokenB }, ctx);
      if (!searchResult.ok) return;
      
      const candidateId = searchResult.data.candidates[0]?.candidate_id;
      if (!candidateId) return;

      // Try to withdraw from DISCOVERED stage
      const withdrawResult = await handleWithdraw({
        user_token: tokenA,
        candidate_id: candidateId
      }, ctx);
      
      expect(withdrawResult.ok).toBe(false);
      if (!withdrawResult.ok) {
        expect(withdrawResult.error.code).toBe("STAGE_VIOLATION");
      }
    });
  });

  describe("idempotency", () => {
    test("idempotent registration with same key returns cached result", async () => {
      const idempotencyKey = "test-register-123";
      
      const result1 = await handleRegister({
        protocol_version: "schelling-2.0",
        embedding: makeEmbedding(0.5),
        city: "San Francisco",
        age_range: "25-34", 
        intent: ["romance"],
        idempotency_key: idempotencyKey
      }, ctx);
      
      expect(result1.ok).toBe(true);
      if (!result1.ok) return;
      
      const token1 = result1.data.user_token;

      // Same request with same idempotency key
      const result2 = await handleRegister({
        protocol_version: "schelling-2.0",
        embedding: makeEmbedding(0.7), // Different embedding
        city: "New York", // Different city
        age_range: "35-44", // Different age
        intent: ["friends"], // Different intent
        idempotency_key: idempotencyKey
      }, ctx);

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        // Should return cached result (same token)
        expect(result2.data.user_token).toBe(token1);
      }
    });

    test("idempotent search returns cached results", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5));
      const tokenB = await registerUser(makeEmbedding(0.5));
      
      const idempotencyKey = "test-search-123";

      const result1 = await handleSearch({
        user_token: tokenA,
        idempotency_key: idempotencyKey
      }, ctx);

      expect(result1.ok).toBe(true);
      if (!result1.ok) return;

      const result2 = await handleSearch({
        user_token: tokenA, 
        threshold: 0.9, // Different threshold
        idempotency_key: idempotencyKey
      }, ctx);

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        // Should return cached result (same candidates)
        expect(result2.data.candidates.length).toBe(result1.data.candidates.length);
        if (result2.data.candidates[0]) {
          expect(result2.data.candidates[0].candidate_id).toBe(result1.data.candidates[0]?.candidate_id);
        }
      }
    });

    test("withdraw idempotency works", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
      const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

      // Set up COMMITTED state
      await handleSearch({ user_token: tokenA }, ctx);
      const searchResult = await handleSearch({ user_token: tokenB }, ctx);
      if (!searchResult.ok) return;
      
      const candidateId = searchResult.data.candidates[0]?.candidate_id;
      if (!candidateId) return;

      await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
      await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
      await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
      await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);

      const idempotencyKey = "test-withdraw-123";
      
      const result1 = await handleWithdraw({
        user_token: tokenA,
        candidate_id: candidateId,
        idempotency_key: idempotencyKey
      }, ctx);

      expect(result1.ok).toBe(true);

      // Same withdraw request
      const result2 = await handleWithdraw({
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Different reason", // Different reason
        idempotency_key: idempotencyKey
      }, ctx);

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.data.withdrawn).toBe(true);
        expect(result2.data.new_stage).toBe(Stage.EXCHANGED);
      }
    });
  });

  describe("pending actions", () => {
    test("search returns pending actions", async () => {
      const tokenA = await registerUser(makeEmbedding(0.5));
      const tokenB = await registerUser(makeEmbedding(0.5));

      // First, create a real candidate by searching
      const initialSearch = await handleSearch({ user_token: tokenA }, ctx);
      expect(initialSearch.ok).toBe(true);
      if (!initialSearch.ok) return;
      
      const candidateId = initialSearch.data.candidates[0]?.candidate_id;
      if (!candidateId) return;

      // Create a pending action with the real candidate ID
      ctx.db.prepare(`
        INSERT INTO pending_actions (id, user_token, candidate_id, action_type)
        VALUES (?, ?, ?, ?)
      `).run("pending-123", tokenA, candidateId, "evaluate");

      const searchResult = await handleSearch({ user_token: tokenA }, ctx);
      expect(searchResult.ok).toBe(true);
      
      if (searchResult.ok && searchResult.data.pending_actions) {
        expect(searchResult.data.pending_actions.length).toBeGreaterThan(0);
        expect(searchResult.data.pending_actions[0].action_type).toBe("evaluate");
        expect(searchResult.data.pending_actions[0].candidate_id).toBe(candidateId);
      }
    });
  });
});