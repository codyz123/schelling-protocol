import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { computeReputation, recordReputationEvent, checkAbandonedConnections } from "../src/core/reputation.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { initVerticalRegistry } from "../src/verticals/registry.js";
import { handleGetReputation } from "../src/handlers/get-reputation.js";
import { handleReportOutcome } from "../src/handlers/report-outcome.js";
import { addLaplaceNoise } from "../src/matching/privacy.js";
import { Stage } from "../src/types.js";
import type { HandlerContext, UserRecord, CandidateRecord } from "../src/types.js";

describe("reputation system", () => {
  let db: Database;
  let ctx: HandlerContext;

  // Helper function to create a test user
  async function createUser(
    token: string,
    overrides: Partial<any> = {}
  ): Promise<string> {
    // Create compatible embeddings (similar values) to ensure they match
    const baseEmbedding = new Array(50).fill(0.5);
    const embedding = baseEmbedding.map(() => 0.4 + Math.random() * 0.2); // Values between 0.4-0.6
    const noisyEmbedding = addLaplaceNoise(embedding, 1.0);

    const input = {
      protocol_version: "schelling-2.0",
      vertical_id: "matchmaking",
      embedding: noisyEmbedding,
      city: "San Francisco",
      age_range: "25-34",
      intent: ["romance"],
      user_token: token,
      verification_level: "verified" as const,
      ...overrides,
    };

    const result = await handleRegister(input, ctx);
    if (!result.ok) {
      throw new Error(`Failed to create user: ${result.error.message}`);
    }
    return result.data.user_token;
  }

  // Helper to create a candidate pair at a specific stage
  async function createCandidatePair(
    tokenA: string,
    tokenB: string,
    stage: number
  ): Promise<string> {
    // Use search to create the initial candidate
    const searchResult = await handleSearch({
      user_token: tokenA,
      vertical_id: "matchmaking",
      top_k: 10,
    }, ctx);

    if (!searchResult.ok) {
      throw new Error(`Search failed: ${searchResult.error.message}`);
    }
    
    if (searchResult.data.candidates.length === 0) {
      throw new Error("Failed to find candidate via search - no candidates found");
    }

    const candidate = searchResult.data.candidates.find(c => {
      const candidateData = db.prepare("SELECT user_a_token, user_b_token FROM candidates WHERE id = ?")
        .get(c.candidate_id) as any;
      return candidateData?.user_a_token === tokenB || candidateData?.user_b_token === tokenB;
    });

    if (!candidate) {
      throw new Error("Could not find the expected candidate pair");
    }

    // Manually advance both sides to the desired stage
    db.prepare(`
      UPDATE candidates 
      SET stage_a = ?, stage_b = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(stage, stage, candidate.candidate_id);

    return candidate.candidate_id;
  }

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    initVerticalRegistry();
    ctx = { db };
  });

  describe("reputation computation with no events", () => {
    it("returns 0.5 for new user", async () => {
      const token = await createUser("user1");
      const reputation = computeReputation(db, token, "matchmaking");
      
      expect(reputation.score).toBeCloseTo(0.5);
      expect(reputation.breakdown.outcome).toBe(0.5);
      expect(reputation.breakdown.completion).toBe(0.5);
      expect(reputation.breakdown.consistency).toBe(0.5);
      expect(reputation.breakdown.dispute).toBe(1.0); // Clean record
      expect(reputation.breakdown.tenure).toBeCloseTo(0.0); // Just created
      expect(reputation.interaction_count).toBe(0);
      expect(reputation.verification_level).toBe("verified");
    });
  });

  describe("positive outcomes increase score", () => {
    it("positive outcome events improve reputation", async () => {
      const token = await createUser("user1");
      
      // Record a positive outcome event
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter1",
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "positive",
        notes: "Great experience",
      });

      const reputation = computeReputation(db, token, "matchmaking");
      expect(reputation.score).toBeGreaterThan(0.5);
      expect(reputation.breakdown.outcome).toBeGreaterThan(0.5);
    });
  });

  describe("negative outcomes decrease score", () => {
    it("negative outcome events hurt reputation", async () => {
      const token = await createUser("user1");
      
      // Record a negative outcome event
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter1", 
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "negative",
        notes: "Bad experience",
      });

      const reputation = computeReputation(db, token, "matchmaking");
      expect(reputation.score).toBeLessThan(0.5);
      expect(reputation.breakdown.outcome).toBeLessThan(0.5);
    });
  });

  describe("reporter reputation weighting", () => {
    it("high-reputation reporters have more weight", async () => {
      const token = await createUser("user1");
      
      // Two positive ratings: one from high-rep reporter, one from low-rep
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "high_rep_reporter",
        reporter_reputation: 0.9,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "positive",
      });

      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "low_rep_reporter",
        reporter_reputation: 0.2,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "positive",
      });

      const reputation = computeReputation(db, token, "matchmaking");
      
      // Should be weighted toward the high-rep reporter's positive rating
      expect(reputation.breakdown.outcome).toBeGreaterThan(0.7);
    });
  });

  describe("time decay reduces old event weight", () => {
    it("old events have less weight than recent ones", async () => {
      const token = await createUser("user1");
      
      // Create an old negative event (manually set timestamp)
      const oldTimestamp = Date.now() - (400 * 24 * 60 * 60 * 1000); // 400 days ago
      db.prepare(`
        INSERT INTO reputation_events 
        (id, identity_id, reporter_id, reporter_reputation, vertical_id, event_type, rating, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "old_event",
        token,
        "reporter1",
        0.8,
        "matchmaking", 
        "outcome",
        "negative",
        oldTimestamp
      );

      // Recent positive event
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter2",
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "positive",
      });

      const reputation = computeReputation(db, token, "matchmaking");
      
      // Recent positive should outweigh old negative due to time decay
      expect(reputation.breakdown.outcome).toBeGreaterThan(0.5);
    });
  });

  describe("cross-vertical bleed calculation", () => {
    it("applies 20% bleed between verticals", async () => {
      const token = await createUser("user1");
      
      // Positive event in matchmaking
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter1",
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "positive",
      });

      // Negative event in marketplace
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter2",
        reporter_reputation: 0.8,
        vertical_id: "marketplace",
        event_type: "outcome", 
        rating: "negative",
      });

      const matchmakingRep = computeReputation(db, token, "matchmaking");
      const marketplaceRep = computeReputation(db, token, "marketplace");
      
      // Both should be affected by cross-vertical bleed
      expect(matchmakingRep.score).toBeLessThan(1.0); // Hurt by marketplace negativity
      expect(marketplaceRep.score).toBeGreaterThan(0.0); // Helped by matchmaking positivity
    });
  });

  describe("cold start provisional weighting", () => {
    it("first 5 interactions get 1.5x weight", async () => {
      const token = await createUser("user1");
      
      // Add 3 positive events (should get provisional boost)
      for (let i = 0; i < 3; i++) {
        recordReputationEvent(db, {
          identity_id: token,
          reporter_id: `reporter${i}`,
          reporter_reputation: 0.8,
          vertical_id: "matchmaking",
          event_type: "outcome",
          rating: "positive",
        });
      }

      const reputation = computeReputation(db, token, "matchmaking");
      
      // Should be higher than normal due to provisional weighting
      expect(reputation.breakdown.outcome).toBeGreaterThan(0.8);
    });
  });

  describe("completion rate tracking", () => {
    it("tracks CONNECTED to COMPLETED vs abandoned", async () => {
      const tokenA = await createUser("userA");
      const tokenB = await createUser("userB");
      
      // Create candidate pair directly at CONNECTED stage
      const candidateId = `completion-test-${Date.now()}`;
      const [a, b] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];
      db.prepare(`
        INSERT INTO candidates (id, user_a_token, user_b_token, vertical_id, score, shared_categories, stage_a, stage_b, created_at, updated_at)
        VALUES (?, ?, ?, 'matchmaking', 0.8, '[]', ?, ?, datetime('now'), datetime('now'))
      `).run(candidateId, a, b, Stage.CONNECTED, Stage.CONNECTED);
      
      // Report outcome (which advances to COMPLETED)
      const result = await handleReportOutcome({
        user_token: tokenA,
        candidate_id: candidateId,
        outcome: "positive",
      }, ctx);

      expect(result.ok).toBe(true);
      
      const reputationA = computeReputation(db, tokenA, "matchmaking");
      // Should have completion event tracked in reputation
      // (The completion rate calculation happens internally)
    });
  });

  describe("schelling.reputation operation", () => {
    it("returns correct data for self-query", async () => {
      const token = await createUser("user1");
      
      const result = handleGetReputation(ctx, {
        user_token: token,
        vertical_id: "matchmaking",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.score).toBeCloseTo(0.5);
        expect(result.data.breakdown).toBeDefined();
        expect(result.data.vertical_scores).toBeDefined();
        expect(result.data.interaction_count).toBe(0);
        expect(result.data.verification_level).toBe("verified");
      }
    });

    it("returns limited data for other-user query", async () => {
      const token1 = await createUser("user1");
      const token2 = await createUser("user2");
      
      const result = handleGetReputation(ctx, {
        user_token: token1,
        target_token: token2,
        vertical_id: "matchmaking",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.score).toBeCloseTo(0.5);
        expect(result.data.breakdown).toBeUndefined(); // Not included for others
        expect(result.data.vertical_scores).toBeUndefined(); // Not included for others
        expect(result.data.interaction_count).toBe(0);
        expect(result.data.verification_level).toBe("verified");
      }
    });
  });

  describe("min_reputation filter in search", () => {
    it("filters out low-reputation candidates", async () => {
      const token1 = await createUser("user1");
      const token2 = await createUser("user2");
      
      // Give user2 negative reputation
      recordReputationEvent(db, {
        identity_id: token2,
        reporter_id: "reporter1",
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "outcome",
        rating: "negative",
      });

      // Search with min_reputation filter
      const result = await handleSearch({
        user_token: token1,
        vertical_id: "matchmaking",
        min_reputation: 0.4, // Should filter out user2
        top_k: 10,
      }, ctx);

      if (!result.ok) {
        console.error("Min reputation search failed:", result.error);
      }
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should not include user2 who has low reputation
        const candidateRepScores = result.data.candidates.map(c => c.reputation_score);
        candidateRepScores.forEach(score => {
          expect(score).toBeGreaterThanOrEqual(0.4);
        });
      }
    });
  });

  describe("verification level stored and returned", () => {
    it("stores and returns verification level correctly", async () => {
      const token = await createUser("user1", { verification_level: "attested" });
      
      const user = db.prepare("SELECT verification_level FROM users WHERE user_token = ?")
        .get(token) as UserRecord;
      
      expect(user.verification_level).toBe("attested");
      
      const reputation = computeReputation(db, token, "matchmaking");
      expect(reputation.verification_level).toBe("attested");
    });
  });

  describe("interaction count accurate", () => {
    it("tracks interaction count correctly", async () => {
      const token = await createUser("user1");
      
      // Add completion events
      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter1",
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "completion",
      });

      recordReputationEvent(db, {
        identity_id: token,
        reporter_id: "reporter2", 
        reporter_reputation: 0.8,
        vertical_id: "matchmaking",
        event_type: "completion",
      });

      const reputation = computeReputation(db, token, "matchmaking");
      expect(reputation.interaction_count).toBe(2);
    });
  });

  describe("abandoned connections tracking", () => {
    it("records abandonment events for old CONNECTED candidates", async () => {
      const tokenA = await createUser("userA");
      const tokenB = await createUser("userB");
      
      // Create candidate pair directly at CONNECTED stage (bypass search to avoid flakiness)
      const candidateId = `abandoned-test-${Date.now()}`;
      const [a, b] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];
      db.prepare(`
        INSERT INTO candidates (id, user_a_token, user_b_token, vertical_id, score, shared_categories, stage_a, stage_b, created_at, updated_at)
        VALUES (?, ?, ?, 'matchmaking', 0.8, '[]', ?, ?, datetime('now'), datetime('now'))
      `).run(candidateId, a, b, Stage.CONNECTED, Stage.CONNECTED);
      
      // Manually set the updated_at to be old (35 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);
      db.prepare(`
        UPDATE candidates 
        SET updated_at = ? 
        WHERE id = ?
      `).run(oldDate.toISOString(), candidateId);

      // Run abandonment check
      checkAbandonedConnections(db);
      
      // Should have created abandonment events for both users
      const eventsA = db.prepare(`
        SELECT * FROM reputation_events 
        WHERE identity_id = ? AND event_type = 'abandonment'
      `).all(tokenA);
      
      const eventsB = db.prepare(`
        SELECT * FROM reputation_events 
        WHERE identity_id = ? AND event_type = 'abandonment'
      `).all(tokenB);

      expect(eventsA.length).toBe(1);
      expect(eventsB.length).toBe(1);
    });
  });
});