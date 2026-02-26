import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { Stage } from "../src/types.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleInterest } from "../src/handlers/interest.js";
import { handleCommit } from "../src/handlers/commit.js";
import { handleDescribe } from "../src/handlers/describe.js";
import { handleServerInfo } from "../src/handlers/server-info.js";
import { handleOnboard } from "../src/handlers/onboard.js";
import { handleClusters, handleClusterInfo } from "../src/handlers/clusters.js";
import { handleExport } from "../src/handlers/export.js";
import { handleDeleteAccount } from "../src/handlers/delete-account.js";

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

async function registerUser(overrides = {}) {
  const result = await handleRegister({
    protocol_version: "3.0",
    cluster_id: "dating.general",
    traits: [
      { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
      { key: "age", value: 30, value_type: "number", visibility: "after_interest" },
      { key: "name", value: "Test User", value_type: "string", visibility: "after_connect" },
    ],
    preferences: [
      { trait_key: "city", operator: "eq", value: "San Francisco", weight: 0.5 },
    ],
    identity: { name: "Test User", contact: "test@example.com" },
    ...overrides,
  } as any, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

async function connectUsers(tokenA: string, tokenB: string) {
  const searchA = await handleSearch({ user_token: tokenA }, ctx);
  if (!searchA.ok) throw new Error(searchA.error.message);
  await handleSearch({ user_token: tokenB }, ctx);
  const candidateId = searchA.data.candidates[0].candidate_id;
  await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);
  await handleCommit({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleCommit({ user_token: tokenB, candidate_id: candidateId }, ctx);
  return candidateId;
}

// ===========================================================================
// Discovery Tests
// ===========================================================================

describe("discovery: handleDescribe", () => {
  test("returns protocol info with correct version 3.0", async () => {
    const result = await handleDescribe({} as any, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;

    // Protocol metadata
    expect(data.protocol.name).toBe("Schelling Protocol");
    expect(data.protocol.version).toBe("3.0");
    expect(data.protocol.purpose).toBeTruthy();
    expect(data.protocol.how_it_works).toBeTruthy();

    // Key concepts should exist
    expect(data.protocol.key_concepts.trait).toBeTruthy();
    expect(data.protocol.key_concepts.preference).toBeTruthy();
    expect(data.protocol.key_concepts.cluster).toBeTruthy();
    expect(data.protocol.key_concepts.funnel).toBeTruthy();
    expect(data.protocol.key_concepts.funnel_modes).toBeTruthy();

    // Getting started
    expect(data.getting_started.steps).toBeInstanceOf(Array);
    expect(data.getting_started.steps.length).toBeGreaterThan(0);
    expect(data.getting_started.zero_config).toBeTruthy();

    // Capabilities
    expect(data.capabilities.natural_language).toBe(true);
    expect(data.capabilities.funnel_modes).toContain("bilateral");
    expect(data.capabilities.funnel_modes).toContain("broadcast");
    expect(data.capabilities.funnel_modes).toContain("group");
    expect(data.capabilities.funnel_modes).toContain("auction");

    // Server info
    expect(data.server.name).toBeTruthy();
    expect(data.server.version).toBeTruthy();

    // Clusters and tools sections exist
    expect(data.clusters).toBeDefined();
    expect(data.tools).toBeDefined();
  });
});

describe("discovery: handleServerInfo", () => {
  test("returns server info with correct protocol version and capabilities", async () => {
    // Register a couple of users to populate the database
    await registerUser();
    await registerUser();

    const result = await handleServerInfo({} as any, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;

    expect(data.protocol_version).toBe("3.0");
    expect(data.server_name).toBeTruthy();
    expect(data.server_version).toBeTruthy();

    // Cluster count should include the dating.general cluster
    expect(data.cluster_count).toBeGreaterThanOrEqual(1);

    // Capabilities
    expect(data.capabilities.natural_language).toBe(true);
    expect(data.capabilities.funnel_modes).toContain("bilateral");
    expect(data.capabilities.disputes).toBe(true);
    expect(data.capabilities.reputation).toBe(true);
    expect(data.capabilities.verification).toBe(true);
    expect(data.capabilities.data_export).toBe(true);

    // Rate limits
    expect(data.rate_limits.register_per_day).toBeGreaterThan(0);
    expect(data.rate_limits.search_per_hour).toBeGreaterThan(0);
  });
});

describe("discovery: handleOnboard", () => {
  test("returns onboarding template for a natural language description", async () => {
    const result = await handleOnboard({
      natural_language: "I'm looking for a romantic partner in San Francisco",
    }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;

    // Should suggest a dating cluster
    expect(data.suggested_cluster).toBeDefined();
    expect(data.suggested_cluster.cluster_id).toBeTruthy();
    expect(data.suggested_cluster.confidence).toBeGreaterThan(0);

    // Should have a registration template
    expect(data.registration_template).toBeDefined();
    expect(data.registration_template.protocol_version).toBe("3.0");
    expect(data.registration_template.cluster_id).toBeTruthy();

    // Parsed traits should include extracted info
    expect(data.parsed_traits).toBeInstanceOf(Array);
  });

  test("returns a template with cluster_hint", async () => {
    // First register a user to create the cluster in the DB
    await registerUser({ cluster_id: "dating.general" });

    const result = await handleOnboard({
      natural_language: "I want to find someone to date",
      cluster_hint: "dating.general",
    }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // When cluster_hint is provided and exists, it should be the primary suggestion
    expect(result.data.suggested_cluster.cluster_id).toBe("dating.general");
    expect(result.data.suggested_cluster.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("rejects empty natural_language input", async () => {
    const result = await handleOnboard({ natural_language: "" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});

describe("discovery: handleClusters", () => {
  test("lists clusters after registering users", async () => {
    await registerUser({ cluster_id: "dating.general" });
    await registerUser({ cluster_id: "hiring.engineering" });

    const result = await handleClusters({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.data.clusters.length).toBeGreaterThanOrEqual(2);
    expect(result.data.total).toBeGreaterThanOrEqual(2);

    const clusterIds = result.data.clusters.map((c) => c.cluster_id);
    expect(clusterIds).toContain("dating.general");
    expect(clusterIds).toContain("hiring.engineering");
  });

  test("returns empty list on fresh database", async () => {
    const result = await handleClusters({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.clusters.length).toBe(0);
    expect(result.data.total).toBe(0);
  });
});

describe("discovery: handleClusterInfo", () => {
  test("returns correct population and settings for a cluster", async () => {
    await registerUser({ cluster_id: "dating.general" });
    await registerUser({ cluster_id: "dating.general" });

    const result = await handleClusterInfo({ cluster_id: "dating.general" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;
    expect(data.cluster_id).toBe("dating.general");
    expect(data.population).toBe(2);
    expect(data.phase).toBeTruthy();
    expect(data.display_name).toBeTruthy();

    // Settings
    expect(typeof data.settings.symmetric).toBe("boolean");
    expect(typeof data.settings.age_restricted).toBe("boolean");
    expect(data.settings.default_funnel_mode).toBe("bilateral");

    // Suggested traits should be populated from registrations
    expect(data.suggested_traits.length).toBeGreaterThan(0);
    const traitKeys = data.suggested_traits.map((t) => t.trait_key);
    expect(traitKeys).toContain("city");
  });

  test("returns error for unknown cluster", async () => {
    const result = await handleClusterInfo({ cluster_id: "nonexistent.cluster" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("UNKNOWN_CLUSTER");
  });
});

// ===========================================================================
// Privacy Tests
// ===========================================================================

describe("privacy: handleExport", () => {
  test("exports all user data including profile, candidates, traits, preferences", async () => {
    const tokenA = await registerUser({
      identity: { name: "Alice", contact: "alice@example.com" },
    });
    const tokenB = await registerUser({
      identity: { name: "Bob", contact: "bob@example.com" },
    });

    // Create candidates by searching + expressing interest
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;
    await handleSearch({ user_token: tokenB }, ctx);
    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);

    // Export A's data
    const result = await handleExport({ user_token: tokenA }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;

    // Profile
    expect(data.profile.user).toBeDefined();
    expect(data.profile.user.user_token).toBe(tokenA);
    expect(data.profile.traits).toBeInstanceOf(Array);
    expect(data.profile.traits.length).toBeGreaterThan(0);
    expect(data.profile.preferences).toBeInstanceOf(Array);
    expect(data.profile.preferences.length).toBeGreaterThan(0);

    // Candidates
    expect(data.candidates).toBeInstanceOf(Array);
    expect(data.candidates.length).toBeGreaterThanOrEqual(1);

    // Other arrays should be present (may be empty)
    expect(data.messages).toBeInstanceOf(Array);
    expect(data.inquiries).toBeInstanceOf(Array);
    expect(data.contracts).toBeInstanceOf(Array);
    expect(data.deliveries).toBeInstanceOf(Array);
    expect(data.events).toBeInstanceOf(Array);
    expect(data.subscriptions).toBeInstanceOf(Array);

    // Reputation
    expect(data.reputation).toBeDefined();
    expect(typeof data.reputation.score).toBe("number");
    expect(data.reputation.events).toBeInstanceOf(Array);

    // Enforcement and verification arrays
    expect(data.enforcement).toBeInstanceOf(Array);
    expect(data.verification).toBeInstanceOf(Array);

    // Timestamp
    expect(data.exported_at).toBeTruthy();
  });

  test("export for new user returns empty arrays for optional data", async () => {
    const token = await registerUser();

    const result = await handleExport({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;

    // User profile should exist
    expect(data.profile.user).toBeDefined();
    expect(data.profile.traits.length).toBeGreaterThan(0); // traits from registration

    // No candidates, messages, etc. for a fresh user
    expect(data.candidates.length).toBe(0);
    expect(data.messages.length).toBe(0);
    expect(data.inquiries.length).toBe(0);
    expect(data.contracts.length).toBe(0);
    expect(data.deliveries.length).toBe(0);
    expect(data.events.length).toBe(0);
    expect(data.subscriptions.length).toBe(0);
    expect(data.reputation.events.length).toBe(0);
  });
});

describe("privacy: handleDeleteAccount", () => {
  test("requires correct confirmation string", async () => {
    const token = await registerUser();

    const result = await handleDeleteAccount({
      user_token: token,
      confirmation: "wrong_string",
    }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("CONFIRMATION_REQUIRED");
  });

  test("successfully deletes account with correct confirmation", async () => {
    const tokenA = await registerUser({
      identity: { name: "Alice", contact: "alice@example.com" },
    });
    const tokenB = await registerUser({
      identity: { name: "Bob", contact: "bob@example.com" },
    });

    // Create a candidate pair via search
    await handleSearch({ user_token: tokenA }, ctx);
    await handleSearch({ user_token: tokenB }, ctx);

    const result = await handleDeleteAccount({
      user_token: tokenA,
      confirmation: "PERMANENTLY_DELETE",
    }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const data = result.data;
    expect(data.deleted).toBe(true);
    expect(data.deleted_at).toBeTruthy();
    expect(data.cascade_summary).toBeDefined();
    expect(typeof data.cascade_summary.profiles).toBe("number");
    expect(typeof data.cascade_summary.candidates).toBe("number");
    expect(typeof data.cascade_summary.messages).toBe("number");
  });

  test("clears all data after deletion", async () => {
    const tokenA = await registerUser({
      identity: { name: "Alice", contact: "alice@example.com" },
    });
    const tokenB = await registerUser({
      identity: { name: "Bob", contact: "bob@example.com" },
    });

    // Build up data: search, interest, connect
    const candidateId = await connectUsers(tokenA, tokenB);

    // Verify data exists before deletion
    const userBefore = db
      .prepare("SELECT 1 FROM users WHERE user_token = ?")
      .get(tokenA);
    expect(userBefore).toBeDefined();

    const traitsBefore = db
      .prepare("SELECT COUNT(*) as count FROM traits WHERE user_token = ?")
      .get(tokenA) as { count: number };
    expect(traitsBefore.count).toBeGreaterThan(0);

    const candidatesBefore = db
      .prepare(
        "SELECT COUNT(*) as count FROM candidates WHERE user_a_token = ? OR user_b_token = ?",
      )
      .get(tokenA, tokenA) as { count: number };
    expect(candidatesBefore.count).toBeGreaterThan(0);

    // Delete account
    const deleteResult = await handleDeleteAccount({
      user_token: tokenA,
      confirmation: "PERMANENTLY_DELETE",
    }, ctx);
    expect(deleteResult.ok).toBe(true);

    // Verify cascade_summary counts
    if (!deleteResult.ok) throw new Error("unreachable");
    expect(deleteResult.data.cascade_summary.candidates).toBeGreaterThan(0);
    expect(deleteResult.data.cascade_summary.profiles).toBeGreaterThan(0);

    // Verify data is gone
    const userAfter = db
      .prepare("SELECT 1 FROM users WHERE user_token = ?")
      .get(tokenA);
    expect(userAfter).toBeNull();

    const traitsAfter = db
      .prepare("SELECT COUNT(*) as count FROM traits WHERE user_token = ?")
      .get(tokenA) as { count: number };
    expect(traitsAfter.count).toBe(0);

    const candidatesAfter = db
      .prepare(
        "SELECT COUNT(*) as count FROM candidates WHERE user_a_token = ? OR user_b_token = ?",
      )
      .get(tokenA, tokenA) as { count: number };
    expect(candidatesAfter.count).toBe(0);

    // Preferences gone
    const prefsAfter = db
      .prepare("SELECT COUNT(*) as count FROM preferences WHERE user_token = ?")
      .get(tokenA) as { count: number };
    expect(prefsAfter.count).toBe(0);
  });

  test("returns USER_NOT_FOUND for nonexistent user", async () => {
    const result = await handleDeleteAccount({
      user_token: "nonexistent-token",
      confirmation: "PERMANENTLY_DELETE",
    }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });
});
