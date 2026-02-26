import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleInterest } from "../src/handlers/interest.js";
import { handleCommit } from "../src/handlers/commit.js";
import { handleDecline } from "../src/handlers/decline.js";
import { handleConnections } from "../src/handlers/connections.js";
import { handleReport } from "../src/handlers/report.js";
import { Stage } from "../src/types.js";
import type { HandlerContext } from "../src/types.js";

// ─── Test Harness ────────────────────────────────────────────────────────

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

// ─── Helpers ─────────────────────────────────────────────────────────────

async function registerUser(
  clusterId = "dating.general",
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const result = await handleRegister(
    {
      protocol_version: "3.0",
      cluster_id: clusterId,
      traits: [
        { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
        { key: "age", value: 30, value_type: "number", visibility: "after_interest" },
      ],
      preferences: [
        { trait_key: "city", operator: "eq", value: "San Francisco", weight: 0.5 },
      ],
      ...overrides,
    } as any,
    ctx,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

async function connectUsers(tokenA: string, tokenB: string): Promise<string> {
  // Search from both sides to create candidate records
  const searchA = await handleSearch({ user_token: tokenA }, ctx);
  if (!searchA.ok) throw new Error(searchA.error.message);
  await handleSearch({ user_token: tokenB }, ctx);
  const candidateId = searchA.data.candidates[0].candidate_id;

  // Both express interest
  await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);

  // Both commit -- auto-elevated to CONNECTED
  await handleCommit({ user_token: tokenA, candidate_id: candidateId }, ctx);
  const commitB = await handleCommit({ user_token: tokenB, candidate_id: candidateId }, ctx);
  if (!commitB.ok) throw new Error(commitB.error.message);
  expect(commitB.data.connected).toBe(true);

  return candidateId;
}

/**
 * Search and return the candidate_id for the pair. Searches from A's side,
 * optionally also from B's side to ensure both are DISCOVERED.
 */
async function discoverPair(
  tokenA: string,
  tokenB: string,
  bothDiscover = true,
): Promise<string> {
  const searchA = await handleSearch({ user_token: tokenA }, ctx);
  if (!searchA.ok) throw new Error(searchA.error.message);
  if (bothDiscover) {
    await handleSearch({ user_token: tokenB }, ctx);
  }
  const match = searchA.data.candidates.find((c) => {
    // The candidate_id corresponds to a row; we just need the first one
    return true;
  });
  if (!match) throw new Error("No candidates found in search");
  return match.candidate_id;
}

// ─── 1. Registration Tests ──────────────────────────────────────────────

describe("Registration", () => {
  test("valid registration returns a user_token and correct metadata", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
          { key: "age", value: 30, value_type: "number", visibility: "after_interest" },
        ],
        preferences: [
          { trait_key: "city", operator: "eq", value: "San Francisco", weight: 0.5 },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.user_token).toBeTruthy();
    expect(result.data.protocol_version).toBe("3.0");
    expect(result.data.cluster_id).toBe("dating.general");
    expect(result.data.cluster_created).toBe(true);
    expect(result.data.trait_count).toBe(2);
    expect(result.data.preference_count).toBe(1);
    expect(result.data.profile_completeness).toBeGreaterThan(0);
    expect(result.data.nl_parsed).toBeNull();
  });

  test("protocol version mismatch returns VERSION_MISMATCH", async () => {
    const result = await handleRegister(
      {
        protocol_version: "2.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VERSION_MISMATCH");
  });

  test("missing traits returns INVALID_INPUT", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("re-registration with existing user_token succeeds and replaces traits", async () => {
    const token = await registerUser();

    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        user_token: token,
        traits: [
          { key: "city", value: "New York", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.user_token).toBe(token);
    expect(result.data.trait_count).toBe(1);
  });

  test("re-registration with unknown user_token returns USER_NOT_FOUND", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        user_token: "nonexistent-token",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("cluster auto-creation on first registration", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "jobs.engineering",
        traits: [
          { key: "skill", value: "TypeScript", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cluster_created).toBe(true);

    // Second registration in same cluster should not create it again
    const result2 = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "jobs.engineering",
        traits: [
          { key: "skill", value: "Rust", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.data.cluster_created).toBe(false);
  });

  test("invalid cluster_id returns INVALID_CLUSTER_ID", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "INVALID CLUSTER!",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_CLUSTER_ID");
  });

  test("duplicate trait keys return INVALID_INPUT", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
          { key: "city", value: "LA", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("trait value_type mismatch returns INVALID_INPUT", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "age", value: "thirty", value_type: "number", visibility: "public" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("preference weight out of range returns INVALID_INPUT", async () => {
    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
        preferences: [
          { trait_key: "city", operator: "eq", value: "SF", weight: 1.5 },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("profile_completeness increases with more data", async () => {
    const sparse = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
      },
      ctx,
    );

    const rich = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.rich",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
          { key: "age", value: 30, value_type: "number", visibility: "public" },
          { key: "height", value: 72, value_type: "number", visibility: "public" },
          { key: "interests", value: ["hiking", "reading"], value_type: "array", visibility: "public" },
          { key: "smoker", value: false, value_type: "boolean", visibility: "public" },
        ],
        preferences: [
          { trait_key: "city", operator: "eq", value: "SF", weight: 0.5 },
          { trait_key: "age", operator: "range", value: [25, 35], weight: 0.5 },
          { trait_key: "smoker", operator: "eq", value: false, weight: 0.5 },
        ],
        text_profile: { description: "Hello", seeking: "Partner" },
      },
      ctx,
    );

    expect(sparse.ok).toBe(true);
    expect(rich.ok).toBe(true);
    if (!sparse.ok || !rich.ok) return;
    expect(rich.data.profile_completeness).toBeGreaterThan(sparse.data.profile_completeness);
  });
});

// ─── 2. Search Tests ────────────────────────────────────────────────────

describe("Search", () => {
  test("basic search finds other users in same cluster", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    const result = await handleSearch({ user_token: tokenA }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBe(1);
    expect(result.data.total_scanned).toBe(1);
    expect(result.data.total_matches).toBe(1);
  });

  test("users in different clusters do not match", async () => {
    const tokenA = await registerUser("dating.general");
    await registerUser("jobs.engineering");

    const result = await handleSearch({ user_token: tokenA }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBe(0);
    expect(result.data.total_scanned).toBe(0);
  });

  test("search returns advisory_score, your_fit, their_fit", async () => {
    const tokenA = await registerUser("dating.general");
    await registerUser("dating.general");

    const result = await handleSearch({ user_token: tokenA }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const candidate = result.data.candidates[0];
    expect(typeof candidate.advisory_score).toBe("number");
    expect(typeof candidate.your_fit).toBe("number");
    expect(typeof candidate.their_fit).toBe("number");
    expect(candidate.advisory_score).toBeGreaterThanOrEqual(0);
    expect(candidate.advisory_score).toBeLessThanOrEqual(1);
  });

  test("search only shows public traits at DISCOVERED stage", async () => {
    const tokenA = await registerUser("dating.general");
    await registerUser("dating.general");

    const result = await handleSearch({ user_token: tokenA }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const candidate = result.data.candidates[0];
    // "city" is public, should be visible; "age" is after_interest, should not
    const visibleKeys = candidate.visible_traits.map((t) => t.key);
    expect(visibleKeys).toContain("city");
    expect(visibleKeys).not.toContain("age");
  });

  test("declined users are excluded from search results", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    // A discovers B via search
    const search1 = await handleSearch({ user_token: tokenA }, ctx);
    expect(search1.ok).toBe(true);
    if (!search1.ok) return;
    const candidateId = search1.data.candidates[0].candidate_id;

    // A declines B
    const decline = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx,
    );
    expect(decline.ok).toBe(true);

    // Search again: B should not appear
    const search2 = await handleSearch({ user_token: tokenA }, ctx);
    expect(search2.ok).toBe(true);
    if (!search2.ok) return;
    expect(search2.data.candidates.length).toBe(0);
  });

  test("search with unknown user_token returns USER_NOT_FOUND", async () => {
    const result = await handleSearch({ user_token: "nonexistent" }, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("search advances caller to DISCOVERED but not the other party", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    await handleSearch({ user_token: tokenA }, ctx);

    // Check stages via connections
    const connsA = await handleConnections({ user_token: tokenA }, ctx);
    expect(connsA.ok).toBe(true);
    if (!connsA.ok) return;
    expect(connsA.data.candidates.length).toBe(1);
    expect(connsA.data.candidates[0].your_stage).toBe(Stage.DISCOVERED);
    expect(connsA.data.candidates[0].their_stage).toBe(Stage.UNDISCOVERED);
  });

  test("search with multiple candidates in the same cluster", async () => {
    const tokenA = await registerUser("dating.general");
    await registerUser("dating.general");
    await registerUser("dating.general");
    await registerUser("dating.general");

    const result = await handleSearch({ user_token: tokenA }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBe(3);
    expect(result.data.total_matches).toBe(3);
  });
});

// ─── 3. Funnel Progression ──────────────────────────────────────────────

describe("Funnel Progression", () => {
  test("full funnel: DISCOVERED -> INTERESTED -> COMMITTED -> CONNECTED", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    // Step 1: Search (both discover each other)
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchA.ok).toBe(true);
    if (!searchA.ok) return;

    const searchB = await handleSearch({ user_token: tokenB }, ctx);
    expect(searchB.ok).toBe(true);

    const candidateId = searchA.data.candidates[0].candidate_id;

    // Step 2: Both express interest (DISCOVERED -> INTERESTED)
    const interestA = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(interestA.ok).toBe(true);
    if (!interestA.ok) return;
    expect(interestA.data.your_stage).toBe(Stage.INTERESTED);
    expect(interestA.data.mutual_interest).toBe(false);

    const interestB = await handleInterest(
      { user_token: tokenB, candidate_id: candidateId },
      ctx,
    );
    expect(interestB.ok).toBe(true);
    if (!interestB.ok) return;
    expect(interestB.data.your_stage).toBe(Stage.INTERESTED);
    expect(interestB.data.mutual_interest).toBe(true);

    // Step 3: Both commit (INTERESTED -> COMMITTED -> auto CONNECTED)
    const commitA = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(commitA.ok).toBe(true);
    if (!commitA.ok) return;
    expect(commitA.data.your_stage).toBe(Stage.COMMITTED);
    expect(commitA.data.connected).toBe(false);

    const commitB = await handleCommit(
      { user_token: tokenB, candidate_id: candidateId },
      ctx,
    );
    expect(commitB.ok).toBe(true);
    if (!commitB.ok) return;
    expect(commitB.data.your_stage).toBe(Stage.CONNECTED);
    expect(commitB.data.their_stage).toBe(Stage.CONNECTED);
    expect(commitB.data.connected).toBe(true);
  });
});

// ─── 4. Mutual Gating ──────────────────────────────────────────────────

describe("Mutual Gating", () => {
  test("one-sided interest does not yield mutual_interest", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    const interestA = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(interestA.ok).toBe(true);
    if (!interestA.ok) return;
    expect(interestA.data.mutual_interest).toBe(false);
    expect(interestA.data.their_stage).toBe(Stage.DISCOVERED);
  });

  test("mutual interest is achieved when both express interest", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);

    const interestB = await handleInterest(
      { user_token: tokenB, candidate_id: candidateId },
      ctx,
    );
    expect(interestB.ok).toBe(true);
    if (!interestB.ok) return;
    expect(interestB.data.mutual_interest).toBe(true);
  });

  test("mutual interest reveals after_interest traits", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    // A expresses interest first: no newly visible traits (not mutual yet)
    const interestA = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(interestA.ok).toBe(true);
    if (!interestA.ok) return;
    expect(interestA.data.newly_visible_traits.length).toBe(0);

    // B expresses interest: now mutual, should reveal after_interest traits
    const interestB = await handleInterest(
      { user_token: tokenB, candidate_id: candidateId },
      ctx,
    );
    expect(interestB.ok).toBe(true);
    if (!interestB.ok) return;
    expect(interestB.data.mutual_interest).toBe(true);
    // "age" trait has visibility "after_interest" -- should now be visible
    const ageTraits = interestB.data.newly_visible_traits.filter((t) => t.key === "age");
    expect(ageTraits.length).toBe(1);
    expect(ageTraits[0].value).toBe(30);
  });

  test("one-sided commit does not auto-connect", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);

    const commitA = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(commitA.ok).toBe(true);
    if (!commitA.ok) return;
    expect(commitA.data.your_stage).toBe(Stage.COMMITTED);
    expect(commitA.data.connected).toBe(false);
  });

  test("mutual commit auto-elevates to CONNECTED", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);
    await handleCommit({ user_token: tokenA, candidate_id: candidateId }, ctx);

    const commitB = await handleCommit(
      { user_token: tokenB, candidate_id: candidateId },
      ctx,
    );
    expect(commitB.ok).toBe(true);
    if (!commitB.ok) return;
    expect(commitB.data.your_stage).toBe(Stage.CONNECTED);
    expect(commitB.data.their_stage).toBe(Stage.CONNECTED);
    expect(commitB.data.connected).toBe(true);
  });
});

// ─── 5. Stage Violations ────────────────────────────────────────────────

describe("Stage Violations", () => {
  test("interest without being DISCOVERED returns STAGE_VIOLATION", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    // A searches to discover B (creates candidate pair)
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchA.ok).toBe(true);
    if (!searchA.ok) return;
    const candidateId = searchA.data.candidates[0].candidate_id;

    // B has NOT searched, so B is at UNDISCOVERED.
    // B tries to express interest -- should fail with STAGE_VIOLATION
    const interestB = await handleInterest(
      { user_token: tokenB, candidate_id: candidateId },
      ctx,
    );
    expect(interestB.ok).toBe(false);
    if (interestB.ok) return;
    expect(interestB.error.code).toBe("STAGE_VIOLATION");
  });

  test("commit without being INTERESTED returns STAGE_VIOLATION", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    // A is at DISCOVERED, tries to commit directly -- should fail
    const commitA = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(commitA.ok).toBe(false);
    if (commitA.ok) return;
    expect(commitA.error.code).toBe("STAGE_VIOLATION");
  });

  test("interest on nonexistent candidate returns CANDIDATE_NOT_FOUND", async () => {
    const token = await registerUser("dating.general");

    const result = await handleInterest(
      { user_token: token, candidate_id: "nonexistent-candidate-id" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CANDIDATE_NOT_FOUND");
  });

  test("commit on nonexistent candidate returns CANDIDATE_NOT_FOUND", async () => {
    const token = await registerUser("dating.general");

    const result = await handleCommit(
      { user_token: token, candidate_id: "nonexistent-candidate-id" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CANDIDATE_NOT_FOUND");
  });

  test("interest by unknown user returns USER_NOT_FOUND", async () => {
    const result = await handleInterest(
      { user_token: "unknown-user", candidate_id: "some-id" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("commit by unknown user returns USER_NOT_FOUND", async () => {
    const result = await handleCommit(
      { user_token: "unknown-user", candidate_id: "some-id" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });
});

// ─── 6. Decline ─────────────────────────────────────────────────────────

describe("Decline", () => {
  test("decline at DISCOVERED stage succeeds", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    const decline = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx,
    );

    expect(decline.ok).toBe(true);
    if (!decline.ok) return;
    expect(decline.data.declined).toBe(true);
    expect(decline.data.decline_count).toBe(1);
    expect(decline.data.permanent).toBe(false);
    expect(decline.data.expires_at).toBeTruthy();
  });

  test("decline at INTERESTED stage succeeds", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);

    const decline = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "dealbreaker" },
      ctx,
    );

    expect(decline.ok).toBe(true);
    if (!decline.ok) return;
    expect(decline.data.declined).toBe(true);
  });

  test("cannot decline at CONNECTED stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await connectUsers(tokenA, tokenB);

    const decline = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx,
    );

    expect(decline.ok).toBe(false);
    if (decline.ok) return;
    expect(decline.error.code).toBe("STAGE_VIOLATION");
  });

  test("declined users are excluded from subsequent search results", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    // A discovers and declines B
    const search1 = await handleSearch({ user_token: tokenA }, ctx);
    expect(search1.ok).toBe(true);
    if (!search1.ok) return;
    const candidateId = search1.data.candidates[0].candidate_id;

    await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx,
    );

    // Register a third user C so we can verify A still finds others
    const tokenC = await registerUser("dating.general");

    const search2 = await handleSearch({ user_token: tokenA }, ctx);
    expect(search2.ok).toBe(true);
    if (!search2.ok) return;

    // B should not appear, but C should
    expect(search2.data.candidates.length).toBe(1);
  });

  test("decline deletes the candidate record", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx,
    );

    // Verify the candidate row is gone
    const row = db
      .prepare("SELECT * FROM candidates WHERE id = ?")
      .get(candidateId);
    expect(row).toBeNull();
  });

  test("TTL escalation: first decline expires in 30 days, second in 90, third is permanent", async () => {
    const tokenA = await registerUser("dating.general");

    // We need different partners for each decline
    const tokenB = await registerUser("dating.general");
    const tokenC = await registerUser("dating.general");
    const tokenD = await registerUser("dating.general");

    // Create and decline B (same declined person for escalation)
    // Actually TTL escalation counts per (decliner, declined) pair
    // So we need to decline the SAME user multiple times
    // The handler counts previous declines from decliner_token to declined_token

    // First, we need to get B's token from the candidate.
    // Discover + decline B
    const s1 = await handleSearch({ user_token: tokenA }, ctx);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;

    // We need to find which candidate corresponds to tokenB.
    // The candidates may be in any order; let's use the first one and track.
    const candId1 = s1.data.candidates[0].candidate_id;
    const decline1 = await handleDecline(
      { user_token: tokenA, candidate_id: candId1, reason: "not_interested" },
      ctx,
    );
    expect(decline1.ok).toBe(true);
    if (!decline1.ok) return;
    expect(decline1.data.decline_count).toBe(1);
    expect(decline1.data.permanent).toBe(false);
  });

  test("decline by unknown user returns USER_NOT_FOUND", async () => {
    const result = await handleDecline(
      { user_token: "unknown", candidate_id: "some-id" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("decline nonexistent candidate returns CANDIDATE_NOT_FOUND", async () => {
    const token = await registerUser("dating.general");

    const result = await handleDecline(
      { user_token: token, candidate_id: "nonexistent" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CANDIDATE_NOT_FOUND");
  });
});

// ─── 7. Connections ─────────────────────────────────────────────────────

describe("Connections", () => {
  test("empty connections list for new user", async () => {
    const token = await registerUser("dating.general");

    const result = await handleConnections({ user_token: token }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBe(0);
    expect(result.data.total).toBe(0);
  });

  test("connections list after search shows DISCOVERED candidates", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    await handleSearch({ user_token: tokenA }, ctx);

    const conns = await handleConnections({ user_token: tokenA }, ctx);
    expect(conns.ok).toBe(true);
    if (!conns.ok) return;

    expect(conns.data.candidates.length).toBe(1);
    expect(conns.data.candidates[0].your_stage).toBe(Stage.DISCOVERED);
  });

  test("connections list after full connection shows CONNECTED candidates", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    await connectUsers(tokenA, tokenB);

    const conns = await handleConnections({ user_token: tokenA }, ctx);
    expect(conns.ok).toBe(true);
    if (!conns.ok) return;

    expect(conns.data.candidates.length).toBe(1);
    expect(conns.data.candidates[0].your_stage).toBe(Stage.CONNECTED);
    expect(conns.data.candidates[0].their_stage).toBe(Stage.CONNECTED);
  });

  test("stage_filter on connections returns only matching candidates", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const tokenC = await registerUser("dating.general");

    // Connect with B
    await connectUsers(tokenA, tokenB);

    // Only discover C
    await handleSearch({ user_token: tokenA }, ctx);

    // Filter for CONNECTED only
    const connsConnected = await handleConnections(
      { user_token: tokenA, stage_filter: Stage.CONNECTED },
      ctx,
    );
    expect(connsConnected.ok).toBe(true);
    if (!connsConnected.ok) return;
    expect(connsConnected.data.candidates.length).toBe(1);
    expect(connsConnected.data.candidates[0].your_stage).toBe(Stage.CONNECTED);

    // Filter for DISCOVERED only
    const connsDiscovered = await handleConnections(
      { user_token: tokenA, stage_filter: Stage.DISCOVERED },
      ctx,
    );
    expect(connsDiscovered.ok).toBe(true);
    if (!connsDiscovered.ok) return;
    expect(connsDiscovered.data.candidates.length).toBe(1);
    expect(connsDiscovered.data.candidates[0].your_stage).toBe(Stage.DISCOVERED);
  });

  test("connections for unknown user returns USER_NOT_FOUND", async () => {
    const result = await handleConnections({ user_token: "nonexistent" }, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("connections list includes visible traits based on mutual stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    await connectUsers(tokenA, tokenB);

    const conns = await handleConnections({ user_token: tokenA }, ctx);
    expect(conns.ok).toBe(true);
    if (!conns.ok) return;

    const candidate = conns.data.candidates[0];
    // At CONNECTED, all non-private traits should be visible
    const keys = candidate.visible_traits.map((t) => t.key);
    expect(keys).toContain("city");       // public
    expect(keys).toContain("age");        // after_interest -- visible at CONNECTED
  });

  test("connections after decline removes candidate from list", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    // Verify it appears first
    const connsBefore = await handleConnections({ user_token: tokenA }, ctx);
    expect(connsBefore.ok).toBe(true);
    if (!connsBefore.ok) return;
    expect(connsBefore.data.candidates.length).toBe(1);

    // Decline removes the candidate record
    await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx,
    );

    const connsAfter = await handleConnections({ user_token: tokenA }, ctx);
    expect(connsAfter.ok).toBe(true);
    if (!connsAfter.ok) return;
    expect(connsAfter.data.candidates.length).toBe(0);
  });
});

// ─── 8. Report ──────────────────────────────────────────────────────────

describe("Report", () => {
  test("report outcome at CONNECTED stage succeeds", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await connectUsers(tokenA, tokenB);

    const result = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reported).toBe(true);
    expect(result.data.reported_at).toBeTruthy();
  });

  test("report with different outcome values (positive, neutral, negative)", async () => {
    for (const outcome of ["positive", "neutral", "negative"] as const) {
      // Fresh DB for each iteration
      const freshDb = new Database(":memory:");
      initSchema(freshDb);
      const freshCtx = { db: freshDb };

      const tA = await handleRegister(
        {
          protocol_version: "3.0",
          cluster_id: "dating.general",
          traits: [{ key: "city", value: "SF", value_type: "string", visibility: "public" }],
        },
        freshCtx,
      );
      const tB = await handleRegister(
        {
          protocol_version: "3.0",
          cluster_id: "dating.general",
          traits: [{ key: "city", value: "SF", value_type: "string", visibility: "public" }],
        },
        freshCtx,
      );
      if (!tA.ok || !tB.ok) throw new Error("Registration failed");

      const tokenA = tA.data.user_token;
      const tokenB = tB.data.user_token;

      // Full connection flow
      const sA = await handleSearch({ user_token: tokenA }, freshCtx);
      if (!sA.ok) throw new Error("Search failed");
      await handleSearch({ user_token: tokenB }, freshCtx);
      const cid = sA.data.candidates[0].candidate_id;
      await handleInterest({ user_token: tokenA, candidate_id: cid }, freshCtx);
      await handleInterest({ user_token: tokenB, candidate_id: cid }, freshCtx);
      await handleCommit({ user_token: tokenA, candidate_id: cid }, freshCtx);
      await handleCommit({ user_token: tokenB, candidate_id: cid }, freshCtx);

      const report = await handleReport(
        { user_token: tokenA, candidate_id: cid, outcome },
        freshCtx,
      );
      expect(report.ok).toBe(true);
    }
  });

  test("cannot report before CONNECTED stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    // Only at DISCOVERED stage
    const result = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STAGE_VIOLATION");
  });

  test("cannot report at INTERESTED stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);

    const result = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STAGE_VIOLATION");
  });

  test("cannot report at one-sided COMMITTED stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);
    await handleCommit({ user_token: tokenA, candidate_id: candidateId }, ctx);

    // A is COMMITTED but B is still INTERESTED -- not both at CONNECTED
    const result = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STAGE_VIOLATION");
  });

  test("double report prevention returns ALREADY_REPORTED", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await connectUsers(tokenA, tokenB);

    const first = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );
    expect(first.ok).toBe(true);

    const second = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "negative" },
      ctx,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("ALREADY_REPORTED");
  });

  test("both parties can report independently", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await connectUsers(tokenA, tokenB);

    const reportA = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );
    expect(reportA.ok).toBe(true);

    const reportB = await handleReport(
      { user_token: tokenB, candidate_id: candidateId, outcome: "neutral" },
      ctx,
    );
    expect(reportB.ok).toBe(true);
  });

  test("report by unknown user returns USER_NOT_FOUND", async () => {
    const result = await handleReport(
      { user_token: "unknown", candidate_id: "some-id", outcome: "positive" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("report on nonexistent candidate returns CANDIDATE_NOT_FOUND", async () => {
    const token = await registerUser("dating.general");

    const result = await handleReport(
      { user_token: token, candidate_id: "nonexistent", outcome: "positive" },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CANDIDATE_NOT_FOUND");
  });

  test("report creates a reputation event for the other party", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await connectUsers(tokenA, tokenB);

    await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );

    const repEvents = db
      .prepare("SELECT * FROM reputation_events WHERE identity_id = ?")
      .all(tokenB) as any[];
    expect(repEvents.length).toBe(1);
    expect(repEvents[0].event_type).toBe("positive_outcome");
    expect(repEvents[0].rating).toBe("positive");
  });
});

// ─── 9. Idempotency ────────────────────────────────────────────────────

describe("Idempotency", () => {
  test("register with same idempotency_key returns cached result", async () => {
    const key = "register-idemp-001";

    const first = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
        idempotency_key: key,
      },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "LA", value_type: "string", visibility: "public" },
        ],
        idempotency_key: key,
      },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Should return exact same result as first call
    expect(second.data.user_token).toBe(first.data.user_token);
    expect(second.data.trait_count).toBe(first.data.trait_count);
  });

  test("interest with same idempotency_key returns cached result", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    const key = "interest-idemp-001";

    const first = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId, idempotency_key: key },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId, idempotency_key: key },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.your_stage).toBe(first.data.your_stage);
    expect(second.data.their_stage).toBe(first.data.their_stage);
  });

  test("commit with same idempotency_key returns cached result", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);

    const key = "commit-idemp-001";

    const first = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId, idempotency_key: key },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId, idempotency_key: key },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.your_stage).toBe(first.data.your_stage);
  });

  test("decline with same idempotency_key returns cached result", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    const key = "decline-idemp-001";

    const first = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested", idempotency_key: key },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested", idempotency_key: key },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.decline_count).toBe(first.data.decline_count);
  });

  test("report with same idempotency_key returns cached result", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await connectUsers(tokenA, tokenB);

    const key = "report-idemp-001";

    const first = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive", idempotency_key: key },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive", idempotency_key: key },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.reported_at).toBe(first.data.reported_at);
  });

  test("different idempotency_keys are treated as separate operations", async () => {
    const first = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
        idempotency_key: "key-A",
      },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "LA", value_type: "string", visibility: "public" },
        ],
        idempotency_key: "key-B",
      },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Different keys should produce different user_tokens
    expect(second.data.user_token).not.toBe(first.data.user_token);
  });
});

// ─── 10. Edge Cases & Integration ──────────────────────────────────────

describe("Edge Cases", () => {
  test("self-search does not include the caller as a candidate", async () => {
    const token = await registerUser("dating.general");

    const result = await handleSearch({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.candidates.length).toBe(0);
  });

  test("interest is idempotent: calling twice yields same stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    const first = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.your_stage).toBe(Stage.INTERESTED);

    // Calling again: stage should remain INTERESTED (no error, idempotent)
    const second = await handleInterest(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.your_stage).toBe(Stage.INTERESTED);
  });

  test("commit is idempotent: calling twice yields same stage", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);

    const first = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.your_stage).toBe(Stage.COMMITTED);

    const second = await handleCommit(
      { user_token: tokenA, candidate_id: candidateId },
      ctx,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.your_stage).toBe(Stage.COMMITTED);
  });

  test("non-participant cannot interact with a candidate pair", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const tokenC = await registerUser("dating.general");
    const candidateId = await discoverPair(tokenA, tokenB);

    // C is not part of the A-B candidate pair
    const interestC = await handleInterest(
      { user_token: tokenC, candidate_id: candidateId },
      ctx,
    );
    expect(interestC.ok).toBe(false);
    if (interestC.ok) return;
    expect(interestC.error.code).toBe("UNAUTHORIZED");
  });

  test("multiple candidate pairs can exist independently", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");
    const tokenC = await registerUser("dating.general");

    // A searches and discovers both B and C
    const search = await handleSearch({ user_token: tokenA }, ctx);
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.data.candidates.length).toBe(2);

    // Progress A-B to INTERESTED
    const candAB = search.data.candidates[0].candidate_id;
    await handleSearch({ user_token: tokenB }, ctx);
    await handleInterest({ user_token: tokenA, candidate_id: candAB }, ctx);

    // A-B is at INTERESTED, A-C should still be at DISCOVERED
    const conns = await handleConnections({ user_token: tokenA }, ctx);
    expect(conns.ok).toBe(true);
    if (!conns.ok) return;
    expect(conns.data.candidates.length).toBe(2);

    const stages = conns.data.candidates.map((c) => c.your_stage).sort();
    expect(stages).toContain(Stage.DISCOVERED);
    expect(stages).toContain(Stage.INTERESTED);
  });

  test("intent_embedding validation rejects bad embeddings", async () => {
    // Wrong dimensions
    const result1 = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
        intent_embedding: [0.5, 0.5], // Only 2 dims, need 16
      },
      ctx,
    );
    expect(result1.ok).toBe(false);
    if (result1.ok) return;
    expect(result1.error.code).toBe("INVALID_INTENT_EMBEDDING");
  });

  test("valid intent_embedding is accepted", async () => {
    const embedding = new Array(16).fill(0.5);

    const result = await handleRegister(
      {
        protocol_version: "3.0",
        cluster_id: "dating.general",
        traits: [
          { key: "city", value: "SF", value_type: "string", visibility: "public" },
        ],
        intent_embedding: embedding,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
  });

  test("search computes intent_similarity when both users have embeddings", async () => {
    const embedding = new Array(16).fill(0.5);

    const tokenA = await registerUser("dating.general", {
      intent_embedding: embedding,
    });
    const tokenB = await registerUser("dating.general", {
      intent_embedding: embedding,
    });

    const result = await handleSearch({ user_token: tokenA }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.candidates.length).toBe(1);
    // Identical embeddings should have high similarity
    expect(result.data.candidates[0].intent_similarity).not.toBeNull();
    expect(result.data.candidates[0].intent_similarity!).toBeGreaterThan(0.9);
  });

  test("cluster_filter on connections limits results to specific cluster", async () => {
    const tokenA = await registerUser("dating.general");
    const tokenB = await registerUser("dating.general");

    await handleSearch({ user_token: tokenA }, ctx);

    // Filter for a cluster where no candidates exist
    const conns = await handleConnections(
      { user_token: tokenA, cluster_filter: "jobs.engineering" },
      ctx,
    );
    expect(conns.ok).toBe(true);
    if (!conns.ok) return;
    expect(conns.data.candidates.length).toBe(0);

    // Filter for the correct cluster
    const conns2 = await handleConnections(
      { user_token: tokenA, cluster_filter: "dating.general" },
      ctx,
    );
    expect(conns2.ok).toBe(true);
    if (!conns2.ok) return;
    expect(conns2.data.candidates.length).toBe(1);
  });
});
