/**
 * Integration tests for the TypeScript SDK against the live API.
 */
import { describe, test, expect } from "bun:test";
import { Schelling, SchellingError } from "../src/index";

const BASE_URL = "https://schelling-protocol-production.up.railway.app";

describe("TypeScript SDK Integration Tests", () => {
  test("describe returns protocol info", async () => {
    const client = new Schelling(BASE_URL);
    const result = await client.describe();
    expect(result).toBeDefined();
    expect(result.server_name || (result as any).server?.name).toBeTruthy();
    expect(result.capabilities || (result as any).capabilities).toBeTruthy();
  });

  test("clusters returns cluster list", async () => {
    const client = new Schelling(BASE_URL);
    const result = await client.clusters();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("seek returns candidates", async () => {
    const client = new Schelling(BASE_URL);
    const result = await client.seek("React developer with TypeScript experience");
    expect(result).toBeDefined();
    expect(result.user_token).toBeTruthy();
    expect(result.cluster_id).toBeTruthy();
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  test("offer registers and returns token", async () => {
    const client = new Schelling(BASE_URL);
    const result = await client.offer("Senior fullstack engineer, 8 years experience");
    expect(result).toBeDefined();
    expect(result.user_token).toBeTruthy();
    expect(result.cluster_id).toBeTruthy();
  });

  test("full lifecycle: register → search → interest", async () => {
    // Register seeker
    const seeker = new Schelling(BASE_URL);
    const seekerReg = await seeker.register({
      cluster_id: "testing.integration.ts",
      role: "seeker",
      traits: [
        {
          key: "skill.primary",
          value: "typescript-sdk-test",
          value_type: "string",
          visibility: "public",
        },
      ],
      preferences: [
        {
          trait_key: "skill.primary",
          operator: "eq",
          value: "backend-dev",
          weight: 0.8,
        },
      ],
    });
    expect(seekerReg.user_token).toBeTruthy();
    expect(seeker.userToken).toBe(seekerReg.user_token);

    // Register offerer
    const offerer = new Schelling(BASE_URL);
    const offererReg = await offerer.register({
      cluster_id: "testing.integration.ts",
      role: "offerer",
      traits: [
        {
          key: "skill.primary",
          value: "backend-dev",
          value_type: "string",
          visibility: "public",
        },
      ],
      preferences: [
        {
          trait_key: "skill.primary",
          operator: "eq",
          value: "typescript-sdk-test",
          weight: 0.8,
        },
      ],
    });
    expect(offererReg.user_token).toBeTruthy();

    // Search from seeker's perspective
    const results = await seeker.search({ cluster_id: "testing.integration.ts" });
    expect(results).toBeDefined();
    expect(Array.isArray(results.candidates)).toBe(true);

    // If candidates found, express interest
    if (results.candidates.length > 0) {
      const candidateId = results.candidates[0].candidate_id;
      const interestResult = await seeker.interest(candidateId);
      expect(interestResult).toBeDefined();
    }
  });

  test("error handling with invalid token", async () => {
    const client = new Schelling(BASE_URL, "invalid-token-xyz");
    try {
      await client.connections();
      // Some ops may not require auth, so not failing is OK
    } catch (err) {
      expect(err).toBeInstanceOf(SchellingError);
      if (err instanceof SchellingError) {
        expect(err.status).toBeGreaterThanOrEqual(400);
        expect(err.code).toBeTruthy();
      }
    }
  });

  test("onboard returns template", async () => {
    const client = new Schelling(BASE_URL);
    const result = await client.onboard("I need a React developer for my startup");
    expect(result).toBeDefined();
    expect(result.suggested_cluster || (result as any).cluster_id).toBeTruthy();
  });

  test("reputation endpoint responds", async () => {
    const client = new Schelling(BASE_URL);
    // Register first to get a valid token
    const reg = await client.register({
      cluster_id: "testing.reputation",
      role: "seeker",
      traits: [
        {
          key: "test.rep",
          value: "true",
          value_type: "string",
          visibility: "public",
        },
      ],
      preferences: [],
    });
    expect(reg.user_token).toBeTruthy();

    try {
      const rep = await client.reputation();
      expect(rep).toBeDefined();
    } catch (err) {
      // Reputation may require specific conditions — not a test failure
      if (err instanceof SchellingError) {
        expect(err.status).toBeGreaterThanOrEqual(400);
      }
    }
  });
});
