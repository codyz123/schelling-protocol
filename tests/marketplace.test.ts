import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleNegotiate } from "../src/handlers/negotiate.js";
import { initVerticalRegistry } from "../src/verticals/registry.js";
import { computeMarketplaceMatch } from "../src/verticals/marketplace/scoring.js";

describe("marketplace vertical", () => {
  let db: Database;
  let ctx: HandlerContext;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    initVerticalRegistry();
    ctx = { db };
  });

  describe("seller/buyer registration", () => {
    it("should register a seller with marketplace data", async () => {
      const result = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          condition: "like-new",
          price_range: {
            min_acceptable: 800,
            asking_price: 1000,
          },
          location: "San Francisco, CA",
          description: "Selling my MacBook Pro",
        },
        ctx
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user_token).toBeDefined();

        // Verify data is stored correctly
        const user = db
          .prepare("SELECT * FROM users WHERE user_token = ?")
          .get(result.data.user_token) as any;

        expect(user.vertical_id).toBe("marketplace");
        expect(user.role).toBe("seller");
        expect(user.status).toBe("active");

        const marketplaceData = JSON.parse(user.marketplace_data);
        expect(marketplaceData.category).toBe("electronics");
        expect(marketplaceData.condition).toBe("like-new");
        expect(marketplaceData.price_range.asking).toBe(1000);
      }
    });

    it("should register a buyer with marketplace data", async () => {
      const result = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "buyer",
          embedding: [0],
          city: "Oakland",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          budget: {
            max_price: 900,
            preferred_price: 750,
          },
          location: "Oakland, CA",
          description: "Looking for a MacBook",
        },
        ctx
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const user = db
          .prepare("SELECT * FROM users WHERE user_token = ?")
          .get(result.data.user_token) as any;

        expect(user.role).toBe("buyer");
        const marketplaceData = JSON.parse(user.marketplace_data);
        expect(marketplaceData.budget.max).toBe(900);
      }
    });

    it("should reject registration with invalid role", async () => {
      const result = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "invalid_role",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
        },
        ctx
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_ROLE");
      }
    });
  });

  describe("asymmetric search", () => {
    it("should allow buyers to search for sellers", async () => {
      // Register a seller
      const sellerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          condition: "good",
          price_range: {
            min_acceptable: 400,
            asking_price: 500,
          },
          location: "San Francisco, CA",
        },
        ctx
      );

      // Register a buyer
      const buyerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "buyer",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          budget: {
            max_price: 600,
            preferred_price: 450,
          },
          location: "San Francisco, CA",
        },
        ctx
      );

      expect(sellerResult.ok).toBe(true);
      expect(buyerResult.ok).toBe(true);

      if (sellerResult.ok && buyerResult.ok) {
        // Buyer searches for sellers
        const searchResult = await handleSearch(
          {
            user_token: buyerResult.data.user_token,
            vertical_id: "marketplace",
            top_k: 10,
            threshold: 0.1,
          },
          ctx
        );

        expect(searchResult.ok).toBe(true);
        if (searchResult.ok) {
          expect(searchResult.data.candidates.length).toBe(1);
          expect(searchResult.data.candidates[0].compatibility_score).toBeGreaterThan(0);
        }
      }
    });

    it("should prevent same-role matches", async () => {
      // Register two sellers
      const seller1Result = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          condition: "new",
          price_range: { asking_price: 1000 },
          location: "San Francisco, CA",
        },
        ctx
      );

      const seller2Result = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace", 
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          condition: "new",
          price_range: { asking_price: 900 },
          location: "San Francisco, CA",
        },
        ctx
      );

      expect(seller1Result.ok && seller2Result.ok).toBe(true);

      if (seller1Result.ok && seller2Result.ok) {
        // Seller searches - should not find other sellers
        const searchResult = await handleSearch(
          {
            user_token: seller1Result.data.user_token,
            vertical_id: "marketplace",
          },
          ctx
        );

        expect(searchResult.ok).toBe(true);
        if (searchResult.ok) {
          expect(searchResult.data.candidates.length).toBe(0);
        }
      }
    });
  });

  describe("marketplace scoring", () => {
    it("should calculate price overlap correctly", () => {
      const listing = {
        category: "electronics",
        condition: "good" as const,
        price_range: { min_acceptable: 400, asking_price: 500 },
        location: "San Francisco, CA",
        description: "Test item"
      };

      const preference = {
        category: "electronics",
        budget: { max_price: 600, preferred_price: 500 },
        location: "San Francisco, CA",
      };

      const result = computeMarketplaceMatch(listing, preference);

      expect(result.overall_score).toBeGreaterThan(0.6);
      expect(result.price_overlap_score).toBeGreaterThanOrEqual(0.5);
      expect(result.category_match_score).toBe(1.0);
      expect(result.location_proximity_score).toBe(1.0);
    });

    it("should reject when no price overlap", () => {
      const listing = {
        category: "electronics",
        condition: "good" as const,
        price_range: { min_acceptable: 800, asking_price: 1000 },
        location: "San Francisco, CA", 
        description: "Expensive item"
      };

      const preference = {
        category: "electronics", 
        budget: { max_price: 600 },
        location: "San Francisco, CA",
      };

      const result = computeMarketplaceMatch(listing, preference);

      expect(result.price_overlap_score).toBeLessThanOrEqual(0.5);
      expect(result.overall_score).toBeLessThan(0.9);
    });
  });

  describe("negotiation flow", () => {
    it("should handle proposal/counteroffer/accept flow", async () => {
      // Set up seller and buyer
      const sellerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "furniture",
          condition: "good",
          price_range: { min_acceptable: 300, asking_price: 400 },
          location: "San Francisco, CA",
        },
        ctx
      );

      const buyerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "buyer",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "furniture",
          budget: { max_price: 450, preferred_price: 350 },
          location: "San Francisco, CA",
        },
        ctx
      );

      expect(sellerResult.ok && buyerResult.ok).toBe(true);

      if (sellerResult.ok && buyerResult.ok) {
        // Create candidate pair
        const searchResult = await handleSearch(
          {
            user_token: buyerResult.data.user_token,
            vertical_id: "marketplace",
            threshold: 0.1,
          },
          ctx
        );

        expect(searchResult.ok).toBe(true);
        const candidateId = searchResult.data!.candidates[0].candidate_id;

        // Advance both to EXCHANGED stage (stage 3) manually for testing
        db.prepare("UPDATE candidates SET stage_a = 3, stage_b = 3 WHERE id = ?").run(candidateId);

        // Round 1: Buyer makes initial offer
        const offer1 = await handleNegotiate(
          {
            user_token: buyerResult.data.user_token,
            candidate_id: candidateId,
            proposal: { price: 320, notes: "Cash offer, pickup available" },
          },
          ctx
        );

        expect(offer1.ok).toBe(true);
        if (offer1.ok) {
          expect(offer1.data.round).toBe(1);
          expect(offer1.data.status).toBe("proposed");
        }

        // Round 2: Seller counteroffers
        const counteroffer = await handleNegotiate(
          {
            user_token: sellerResult.data.user_token,
            candidate_id: candidateId,
            proposal: { price: 380, notes: "Best I can do" },
          },
          ctx
        );

        expect(counteroffer.ok).toBe(true);
        if (counteroffer.ok) {
          expect(counteroffer.data.round).toBe(2);
        }

        // Round 3: Buyer accepts
        const accept = await handleNegotiate(
          {
            user_token: buyerResult.data.user_token,
            candidate_id: candidateId,
            accept: true,
          },
          ctx
        );

        expect(accept.ok).toBe(true);
        if (accept.ok) {
          expect(accept.data.status).toBe("accepted");
        }

        // Verify both parties are now committed
        const finalCandidate = db
          .prepare("SELECT * FROM candidates WHERE id = ?")
          .get(candidateId) as any;

        expect(finalCandidate.stage_a).toBe(4); // COMMITTED
        expect(finalCandidate.stage_b).toBe(4); // COMMITTED
      }
    });
  });

  describe("pause/delist functionality", () => {
    it("should exclude paused users from search", async () => {
      // Register active seller
      const activeSellerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          condition: "good",
          price_range: { asking_price: 500 },
          location: "San Francisco, CA",
          status: "active",
        },
        ctx
      );

      // Register paused seller
      const pausedSellerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "seller",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          condition: "good",
          price_range: { asking_price: 500 },
          location: "San Francisco, CA",
          status: "paused",
        },
        ctx
      );

      // Register buyer
      const buyerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "marketplace",
          role: "buyer",
          embedding: [0],
          city: "San Francisco",
          age_range: "25-34",
          intent: ["collaborators"],
          category: "electronics",
          budget: { max_price: 600 },
          location: "San Francisco, CA",
        },
        ctx
      );

      expect(activeSellerResult.ok && pausedSellerResult.ok && buyerResult.ok).toBe(true);

      if (buyerResult.ok) {
        // Buyer searches - should only find active seller
        const searchResult = await handleSearch(
          {
            user_token: buyerResult.data.user_token,
            vertical_id: "marketplace",
            threshold: 0.1,
          },
          ctx
        );

        expect(searchResult.ok).toBe(true);
        if (searchResult.ok) {
          expect(searchResult.data.candidates.length).toBe(1); // Only active seller
        }
      }
    });
  });
});