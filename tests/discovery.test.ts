import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { handleListVerticals } from "../src/handlers/list-verticals.js";
import { handleOnboard } from "../src/handlers/onboard.js";
import { handleServerInfo } from "../src/handlers/server-info.js";
import { handleRegister } from "../src/handlers/register.js";
import { initVerticalRegistry } from "../src/verticals/registry.js";

describe("Phase 5: Discovery, Onboarding & Observability", () => {
  let db: Database;
  let ctx: HandlerContext;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    initVerticalRegistry(); // Initialize the vertical registry
    ctx = { db };
  });

  describe("schelling.verticals", () => {
    test("returns correct vertical list with stats", async () => {
      // Register a user in matchmaking to test live stats
      const registerResult = await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "matchmaking",
          embedding: Array(50).fill(0.1),
          city: "San Francisco",
          age_range: "25-34",
          intent: ["romance"],
        },
        ctx
      );
      expect(registerResult.ok).toBe(true);

      const result = await handleListVerticals({}, ctx);
      expect(result.ok).toBe(true);
      
      const data = result.data!;
      expect(data.protocol_version).toBe("schelling-2.0");
      expect(Array.isArray(data.verticals)).toBe(true);
      expect(data.verticals.length).toBeGreaterThan(0);

      // Check matchmaking vertical exists with expected structure
      const matchmaking = data.verticals.find(v => v.id === "matchmaking");
      expect(matchmaking).toBeDefined();
      expect(matchmaking!.display_name).toBe("Romantic Matchmaking");
      expect(matchmaking!.description).toContain("personality embedding");
      expect(matchmaking!.version).toBe("2.0");
      expect(Array.isArray(matchmaking!.roles)).toBe(true);
      expect(matchmaking!.roles.length).toBeGreaterThan(0);
      expect(matchmaking!.user_count).toBe(1); // We registered one user
      expect(typeof matchmaking!.active_candidates).toBe("number");

      // Check marketplace vertical exists
      const marketplace = data.verticals.find(v => v.id === "marketplace");
      expect(marketplace).toBeDefined();
      expect(marketplace!.display_name).toBe("Buy/Sell Marketplace");
      expect(marketplace!.roles.length).toBe(2); // seller, buyer
    });
  });

  describe("schelling.onboard", () => {
    test("returns collection guide for matchmaking", async () => {
      const result = await handleOnboard({ vertical_id: "matchmaking" }, ctx);
      expect(result.ok).toBe(true);

      const data = result.data!;
      expect(data.vertical_id).toBe("matchmaking");
      expect(data.vertical_name).toBe("Romantic Matchmaking");
      expect(Array.isArray(data.required_fields)).toBe(true);
      expect(data.required_fields).toContain("embedding");
      expect(data.required_fields).toContain("city");
      expect(Array.isArray(data.optional_fields)).toBe(true);
      expect(data.collection_strategies).toBeDefined();
      expect(data.collection_strategies.embedding_generation).toBeDefined();
      expect(data.collection_strategies.embedding_generation.minimum_hours).toBe(10);
      expect(Array.isArray(data.red_flags)).toBe(true);
      expect(data.red_flags).toContain("user_requests_embedding_manipulation");
      expect(data.minimum_interaction_hours).toBe(10);
      expect(data.roles).toBeDefined();
    });

    test("returns collection guide for marketplace", async () => {
      const result = await handleOnboard({ vertical_id: "marketplace" }, ctx);
      expect(result.ok).toBe(true);

      const data = result.data!;
      expect(data.vertical_id).toBe("marketplace");
      expect(data.vertical_name).toBe("Buy/Sell Marketplace");
      expect(data.collection_strategies).toBeDefined();
      expect(data.collection_strategies.seller_onboarding).toBeDefined();
      expect(data.collection_strategies.buyer_onboarding).toBeDefined();
      expect(data.collection_strategies.seller_onboarding.photo_requirements).toBeDefined();
      expect(Array.isArray(data.red_flags)).toBe(true);
      expect(data.red_flags).toContain("unrealistic_item_descriptions");
      expect(data.roles).toBeDefined();
    });

    test("handles invalid vertical_id", async () => {
      const result = await handleOnboard({ vertical_id: "nonexistent" }, ctx);
      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("INVALID_INPUT");
      expect(result.error!.message).toContain("Unknown vertical_id");
    });

    test("handles missing vertical_id", async () => {
      const result = await handleOnboard({} as any, ctx);
      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("INVALID_INPUT");
      expect(result.error!.message).toContain("vertical_id is required");
    });
  });

  describe("schelling.server_info", () => {
    test("returns correct server metadata", async () => {
      // Register some test data to get non-zero stats
      await handleRegister(
        {
          protocol_version: "schelling-2.0",
          vertical_id: "matchmaking",
          embedding: Array(50).fill(0.1),
          city: "San Francisco",
          age_range: "25-34",
          intent: ["romance"],
        },
        ctx
      );

      const result = await handleServerInfo({}, ctx);
      expect(result.ok).toBe(true);

      const data = result.data!;
      expect(data.protocol_version).toBe("schelling-2.0");
      expect(data.server_version).toBe("2.0.0-phase5");
      expect(Array.isArray(data.supported_verticals)).toBe(true);
      expect(data.supported_verticals).toContain("matchmaking");
      expect(data.supported_verticals).toContain("marketplace");
      expect(typeof data.total_users).toBe("number");
      expect(data.total_users).toBeGreaterThanOrEqual(1);
      expect(typeof data.total_candidates).toBe("number");
      expect(typeof data.uptime_seconds).toBe("number");
      expect(data.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.capabilities)).toBe(true);
      expect(data.capabilities).toContain("MCP");
      expect(data.capabilities).toContain("REST");
      expect(data.capabilities).toContain("progressive_disclosure");
      expect(data.capabilities).toContain("reputation_system");
      expect(data.server_name).toBe("Schelling Protocol Node");
      expect(data.federation_enabled).toBe(false);
      expect(typeof data.rate_limits).toBe("object");
      expect(typeof data.rate_limits.search).toBe("number");
    });
  });

  describe("REST API equivalence", () => {
    test("REST endpoints would return same results as MCP operations", async () => {
      // This is a placeholder for REST API testing
      // In a full test, we would start the REST server and make HTTP requests
      // to verify that the responses match the MCP responses
      
      // For now, we just verify that the handlers work consistently
      const verticalsResult = await handleListVerticals({}, ctx);
      const onboardResult = await handleOnboard({ vertical_id: "matchmaking" }, ctx);
      const serverInfoResult = await handleServerInfo({}, ctx);

      expect(verticalsResult.ok).toBe(true);
      expect(onboardResult.ok).toBe(true);
      expect(serverInfoResult.ok).toBe(true);

      // The REST transport should return the same data structure
      // just wrapped in HTTP responses with appropriate status codes
      expect(verticalsResult.data).toBeDefined();
      expect(onboardResult.data).toBeDefined();
      expect(serverInfoResult.data).toBeDefined();
    });
  });

  describe("Logger functionality", () => {
    test("logger produces valid JSON", () => {
      // Mock console.log to capture output
      const originalLog = console.log;
      let capturedLog = "";
      
      console.log = (message: string) => {
        capturedLog = message;
      };

      try {
        // Use the logger directly
        const { logger } = require("../src/core/logger.js");
        logger.logOperation(
          "test_operation",
          123.45,
          "ok",
          "test_token_12345",
          "matchmaking",
          { test_field: "test_value", user_count: 42 }
        );

        // Verify it's valid JSON
        expect(() => JSON.parse(capturedLog)).not.toThrow();
        
        const parsed = JSON.parse(capturedLog);
        expect(parsed.operation).toBe("test_operation");
        expect(parsed.latency_ms).toBe(123.45);
        expect(parsed.result).toBe("ok");
        expect(parsed.vertical).toBe("matchmaking");
        expect(parsed.identity_hash).toBeDefined();
        expect(parsed.identity_hash.length).toBe(16); // First 16 chars of SHA256
        expect(parsed.timestamp).toBeDefined();
        expect(parsed.metadata).toBeDefined();
        expect(parsed.metadata.user_count).toBe(42);
        
        // Ensure no PII leaked through
        expect(capturedLog).not.toContain("test_token_12345");
      } finally {
        console.log = originalLog;
      }
    });

    test("logger scrubs PII from metadata", () => {
      const originalLog = console.log;
      let capturedLog = "";
      
      console.log = (message: string) => {
        capturedLog = message;
      };

      try {
        const { logger } = require("../src/core/logger.js");
        logger.logOperation(
          "test_operation",
          100,
          "ok",
          undefined,
          "matchmaking",
          {
            name: "John Doe", // Should be scrubbed
            email: "john@example.com", // Should be scrubbed
            user_count: 42, // Should be kept
            operation_id: "op123", // Should be kept
            stage: 2, // Should be kept
            compatibility_score: 0.85 // Should be kept
          }
        );

        const parsed = JSON.parse(capturedLog);
        expect(parsed.metadata.name).toBeUndefined();
        expect(parsed.metadata.email).toBeUndefined();
        expect(parsed.metadata.user_count).toBe(42);
        expect(parsed.metadata.operation_id).toBe("op123");
        expect(parsed.metadata.stage).toBe(2);
        expect(parsed.metadata.compatibility_score).toBe(0.85);
      } finally {
        console.log = originalLog;
      }
    });
  });
});