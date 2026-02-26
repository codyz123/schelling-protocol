import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { Stage } from "../src/types.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleInterest } from "../src/handlers/interest.js";
import { handleCommit } from "../src/handlers/commit.js";
import { handleConnections } from "../src/handlers/connections.js";
import { handleReport } from "../src/handlers/report.js";
import { handleDecline } from "../src/handlers/decline.js";

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

// ---------------------------------------------------------------------------
// Full Lifecycle
// ---------------------------------------------------------------------------

describe("v3 integration: full lifecycle", () => {
  test("complete flow: register -> search -> interest -> commit -> connected -> report -> re-register", async () => {
    // ── 1. Register user A ─────────────────────────────────────────
    const tokenA = await registerUser({
      identity: { name: "Alice", contact: "alice@example.com" },
    });
    expect(tokenA).toBeTruthy();

    // ── 2. Register user B (same cluster) ──────────────────────────
    const tokenB = await registerUser({
      identity: { name: "Bob", contact: "bob@example.com" },
      traits: [
        { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
        { key: "age", value: 28, value_type: "number", visibility: "after_interest" },
        { key: "name", value: "Bob", value_type: "string", visibility: "after_connect" },
      ],
    });
    expect(tokenB).toBeTruthy();

    // ── 3. Register user C (different cluster) ─────────────────────
    const tokenC = await registerUser({
      cluster_id: "hiring.engineering",
      identity: { name: "Charlie", contact: "charlie@example.com" },
      traits: [
        { key: "city", value: "New York", value_type: "string", visibility: "public" },
      ],
      preferences: [],
    });
    expect(tokenC).toBeTruthy();

    // ── 4. A searches -> finds B but NOT C ─────────────────────────
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchA.ok).toBe(true);
    if (!searchA.ok) throw new Error("unreachable");

    const candidateTokens = searchA.data.candidates.map((c) => c.candidate_id);
    expect(searchA.data.candidates.length).toBeGreaterThanOrEqual(1);

    // Verify C is not among the candidates (different cluster)
    // C's user_token should not appear in any candidate pair
    const allPairsForA = db
      .prepare("SELECT * FROM candidates WHERE user_a_token = ? OR user_b_token = ?")
      .all(tokenA, tokenA) as any[];
    const pairedTokensForA = allPairsForA.flatMap((c: any) => [c.user_a_token, c.user_b_token]);
    expect(pairedTokensForA).not.toContain(tokenC);

    // ── 5. B searches -> finds A ───────────────────────────────────
    const searchB = await handleSearch({ user_token: tokenB }, ctx);
    expect(searchB.ok).toBe(true);
    if (!searchB.ok) throw new Error("unreachable");
    expect(searchB.data.candidates.length).toBeGreaterThanOrEqual(1);

    // ── 6. A expresses interest -> not yet mutual ──────────────────
    const candidateId = searchA.data.candidates[0].candidate_id;

    const interestA = await handleInterest({
      user_token: tokenA,
      candidate_id: candidateId,
    }, ctx);
    expect(interestA.ok).toBe(true);
    if (!interestA.ok) throw new Error("unreachable");
    expect(interestA.data.mutual_interest).toBe(false);
    expect(interestA.data.your_stage).toBe(Stage.INTERESTED);

    // ── 7. B expresses interest -> mutual interest ─────────────────
    const interestB = await handleInterest({
      user_token: tokenB,
      candidate_id: candidateId,
    }, ctx);
    expect(interestB.ok).toBe(true);
    if (!interestB.ok) throw new Error("unreachable");
    expect(interestB.data.mutual_interest).toBe(true);
    // After mutual interest, after_interest traits are newly visible
    expect(interestB.data.newly_visible_traits.length).toBeGreaterThan(0);
    // The "age" trait (after_interest) should now be visible
    const ageTrait = interestB.data.newly_visible_traits.find((t) => t.key === "age");
    expect(ageTrait).toBeDefined();

    // ── 8. A commits -> not connected yet (B hasn't committed) ─────
    const commitA = await handleCommit({
      user_token: tokenA,
      candidate_id: candidateId,
    }, ctx);
    expect(commitA.ok).toBe(true);
    if (!commitA.ok) throw new Error("unreachable");
    expect(commitA.data.their_stage).toBe(Stage.INTERESTED);
    expect(commitA.data.connected).toBe(false);

    // ── 9. B commits -> auto-elevated to CONNECTED ─────────────────
    const commitB = await handleCommit({
      user_token: tokenB,
      candidate_id: candidateId,
    }, ctx);
    expect(commitB.ok).toBe(true);
    if (!commitB.ok) throw new Error("unreachable");
    expect(commitB.data.connected).toBe(true);
    expect(commitB.data.your_stage).toBe(Stage.CONNECTED);
    expect(commitB.data.their_stage).toBe(Stage.CONNECTED);

    // after_connect traits ("name") should now be visible
    const nameTrait = commitB.data.newly_visible_traits.find((t) => t.key === "name");
    expect(nameTrait).toBeDefined();

    // ── 10. Check connections for A -> includes B ──────────────────
    const connectionsA = await handleConnections({
      user_token: tokenA,
      stage_filter: Stage.CONNECTED,
    }, ctx);
    expect(connectionsA.ok).toBe(true);
    if (!connectionsA.ok) throw new Error("unreachable");
    expect(connectionsA.data.candidates.length).toBe(1);
    expect(connectionsA.data.candidates[0].your_stage).toBe(Stage.CONNECTED);
    expect(connectionsA.data.candidates[0].their_stage).toBe(Stage.CONNECTED);

    // ── 11. A reports positive outcome -> success ──────────────────
    const reportA = await handleReport({
      user_token: tokenA,
      candidate_id: candidateId,
      outcome: "positive",
    }, ctx);
    expect(reportA.ok).toBe(true);
    if (!reportA.ok) throw new Error("unreachable");
    expect(reportA.data.reported).toBe(true);

    // ── 12. A tries to report again -> ALREADY_REPORTED ────────────
    const reportAgain = await handleReport({
      user_token: tokenA,
      candidate_id: candidateId,
      outcome: "positive",
    }, ctx);
    expect(reportAgain.ok).toBe(false);
    if (reportAgain.ok) throw new Error("unreachable");
    expect(reportAgain.error.code).toBe("ALREADY_REPORTED");

    // ── 13. A re-registers (with user_token) -> old data cleared ───
    const reRegA = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "dating.general",
      user_token: tokenA,
      traits: [
        { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
      ],
      preferences: [],
      identity: { name: "Alice", contact: "alice@example.com" },
    } as any, ctx);
    expect(reRegA.ok).toBe(true);
    if (!reRegA.ok) throw new Error("unreachable");
    // Re-registration should return the same token
    expect(reRegA.data.user_token).toBe(tokenA);

    // ── 14. A searches again -> B available again ──────────────────
    const searchA2 = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchA2.ok).toBe(true);
    if (!searchA2.ok) throw new Error("unreachable");
    // B should appear in results (previous candidate was from the old registration)
    expect(searchA2.data.candidates.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Cluster Isolation
// ---------------------------------------------------------------------------

describe("v3 integration: cluster isolation", () => {
  test("search only returns users in the same cluster", async () => {
    const tokenA = await registerUser({ cluster_id: "dating.general" });
    const tokenB = await registerUser({ cluster_id: "dating.general" });
    const tokenC = await registerUser({
      cluster_id: "hiring.engineering",
      traits: [
        { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
      ],
    });

    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchA.ok).toBe(true);
    if (!searchA.ok) throw new Error("unreachable");

    // Should find B, not C
    expect(searchA.data.total_matches).toBeGreaterThanOrEqual(1);

    // Verify C is absent from the candidate pairs
    const pairsA = db
      .prepare("SELECT * FROM candidates WHERE user_a_token = ? OR user_b_token = ?")
      .all(tokenA, tokenA) as any[];
    const paired = pairsA.flatMap((c: any) => [c.user_a_token, c.user_b_token]);
    expect(paired).toContain(tokenB);
    expect(paired).not.toContain(tokenC);
  });
});

// ---------------------------------------------------------------------------
// Decline Removes Candidate
// ---------------------------------------------------------------------------

describe("v3 integration: decline", () => {
  test("decline removes candidate from future search", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();

    // A searches and finds B
    const search1 = await handleSearch({ user_token: tokenA }, ctx);
    expect(search1.ok).toBe(true);
    if (!search1.ok) throw new Error("unreachable");
    expect(search1.data.candidates.length).toBe(1);

    const candidateId = search1.data.candidates[0].candidate_id;

    // A declines B
    const decline = await handleDecline({
      user_token: tokenA,
      candidate_id: candidateId,
    }, ctx);
    expect(decline.ok).toBe(true);
    if (!decline.ok) throw new Error("unreachable");
    expect(decline.data.declined).toBe(true);

    // A searches again -> B no longer appears
    const search2 = await handleSearch({ user_token: tokenA }, ctx);
    expect(search2.ok).toBe(true);
    if (!search2.ok) throw new Error("unreachable");
    expect(search2.data.candidates.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Progressive Disclosure
// ---------------------------------------------------------------------------

describe("v3 integration: progressive disclosure", () => {
  test("traits are revealed progressively based on mutual stage", async () => {
    const tokenA = await registerUser({
      identity: { name: "Alice", contact: "alice@example.com" },
    });
    const tokenB = await registerUser({
      identity: { name: "Bob", contact: "bob@example.com" },
      traits: [
        { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
        { key: "age", value: 28, value_type: "number", visibility: "after_interest" },
        { key: "name", value: "Bob", value_type: "string", visibility: "after_connect" },
      ],
    });

    // ── At DISCOVERED stage: only public traits visible ────────────
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchA.ok).toBe(true);
    if (!searchA.ok) throw new Error("unreachable");

    const candidateFromSearch = searchA.data.candidates[0];
    const searchTraitKeys = candidateFromSearch.visible_traits.map((t) => t.key);
    expect(searchTraitKeys).toContain("city");
    expect(searchTraitKeys).not.toContain("age");
    expect(searchTraitKeys).not.toContain("name");

    // B also discovers A
    await handleSearch({ user_token: tokenB }, ctx);
    const candidateId = candidateFromSearch.candidate_id;

    // ── At INTERESTED stage: after_interest traits become visible ──
    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
    const interestB = await handleInterest({
      user_token: tokenB,
      candidate_id: candidateId,
    }, ctx);
    expect(interestB.ok).toBe(true);
    if (!interestB.ok) throw new Error("unreachable");

    // B should now see A's after_interest traits as newly_visible
    // And A should see B's after_interest traits via connections check
    const connectionsA = await handleConnections({
      user_token: tokenA,
      stage_filter: Stage.INTERESTED,
    }, ctx);
    expect(connectionsA.ok).toBe(true);
    if (!connectionsA.ok) throw new Error("unreachable");

    const connectionTraitKeys = connectionsA.data.candidates[0].visible_traits.map((t) => t.key);
    // Public + after_interest should be visible
    expect(connectionTraitKeys).toContain("city");
    expect(connectionTraitKeys).toContain("age");
    // after_connect should NOT be visible yet
    expect(connectionTraitKeys).not.toContain("name");

    // ── At CONNECTED stage: after_connect traits become visible ────
    await handleCommit({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleCommit({ user_token: tokenB, candidate_id: candidateId }, ctx);

    const connectionsA2 = await handleConnections({
      user_token: tokenA,
      stage_filter: Stage.CONNECTED,
    }, ctx);
    expect(connectionsA2.ok).toBe(true);
    if (!connectionsA2.ok) throw new Error("unreachable");

    const connectedTraitKeys = connectionsA2.data.candidates[0].visible_traits.map((t) => t.key);
    // All non-private traits should now be visible
    expect(connectedTraitKeys).toContain("city");
    expect(connectedTraitKeys).toContain("age");
    expect(connectedTraitKeys).toContain("name");
  });
});
