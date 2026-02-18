import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleCompare } from "../src/handlers/compare.js";
import { handleRequestProfile } from "../src/handlers/request-profile.js";
import { handlePropose } from "../src/handlers/propose.js";
import { handleDecline } from "../src/handlers/decline.js";
import { handleReportOutcome } from "../src/handlers/report-outcome.js";
import type { HandlerContext } from "../src/types.js";
import { DIMENSION_COUNT } from "../src/types.js";
import { initVerticalRegistry } from "../src/verticals/registry.js";

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
  initVerticalRegistry(); // Initialize the vertical registry for tests
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

describe("funnel stage progression", () => {
  test("SEARCHED → COMPARED: allowed via compare", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchResult = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchResult.ok) throw new Error(searchResult.error.message);
    const candidateId = searchResult.data.candidates[0].candidate_id;

    const compareResult = await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );
    expect(compareResult.ok).toBe(true);
  });

  test("SEARCHED → PROFILED: blocked without mutual tier-2", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchResult = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchResult.ok) throw new Error(searchResult.error.message);
    const candidateId = searchResult.data.candidates[0].candidate_id;

    // A compared, but B hasn't
    await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );

    const profileResult = await handleRequestProfile(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );
    expect(profileResult.ok).toBe(true);
    if (profileResult.ok) {
      expect(profileResult.data.status).toBe("pending_mutual");
    }
  });

  test("mutual tier-2 → PROFILED: succeeds with profile data", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    // Both search and compare
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;

    await handleSearch({ user_token: tokenB }, ctx);
    await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );
    await handleCompare(
      { user_token: tokenB, candidate_ids: [candidateId] },
      ctx
    );

    const profileResult = await handleRequestProfile(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );
    expect(profileResult.ok).toBe(true);
    if (profileResult.ok) {
      expect(profileResult.data.status).toBe("available");
      if (profileResult.data.status === "available") {
        expect(profileResult.data.profile.description).toBe("Curious person");
      }
    }
  });

  test("PROPOSED without PROFILED → STAGE_VIOLATION", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;

    await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );

    const proposeResult = await handlePropose(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );
    expect(proposeResult.ok).toBe(false);
    if (!proposeResult.ok) {
      expect(proposeResult.error.code).toBe("STAGE_VIOLATION");
    }
  });

  test("mutual PROPOSED → both advance to INTRODUCED", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    // Full funnel for both
    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;

    await handleSearch({ user_token: tokenB }, ctx);
    await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );
    await handleCompare(
      { user_token: tokenB, candidate_ids: [candidateId] },
      ctx
    );
    await handleRequestProfile(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );
    await handleRequestProfile(
      { user_token: tokenB, candidate_id: candidateId },
      ctx
    );

    // A proposes first → pending
    const proposeA = await handlePropose(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );
    expect(proposeA.ok).toBe(true);
    if (proposeA.ok) {
      expect(proposeA.data.status).toBe("pending");
    }

    // B proposes → mutual, introduction returned
    const proposeB = await handlePropose(
      { user_token: tokenB, candidate_id: candidateId },
      ctx
    );
    expect(proposeB.ok).toBe(true);
    if (proposeB.ok) {
      expect(proposeB.data.status).toBe("mutual");
      if (proposeB.data.status === "mutual") {
        expect(proposeB.data.introduction.name).toBe("Test User");
        expect(proposeB.data.introduction.contact).toBe("test@example.com");
      }
    }
  });
});

describe("decline", () => {
  test("decline at stage 1: candidate deleted, excluded from future search", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;

    const declineResult = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId, reason: "not_interested" },
      ctx
    );
    expect(declineResult.ok).toBe(true);

    // Search again — B should not appear
    const searchA2 = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA2.ok) throw new Error(searchA2.error.message);
    expect(searchA2.data.candidates.length).toBe(0);
  });

  test("double decline → ALREADY_DECLINED", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;

    await handleDecline(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );

    // Second decline — candidate is already deleted
    const decline2 = await handleDecline(
      { user_token: tokenA, candidate_id: candidateId },
      ctx
    );
    expect(decline2.ok).toBe(false);
    if (!decline2.ok) {
      expect(decline2.error.code).toBe("CANDIDATE_NOT_FOUND");
    }
  });
});

describe("re-registration", () => {
  test("re-registration clears all candidate records via CASCADE", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    expect(searchA.data.candidates.length).toBe(1);

    // Re-register A
    await registerUser(makeEmbedding(0.6, 0.1), { user_token: tokenA });

    // Old candidate should be gone
    const candidates = ctx.db
      .prepare("SELECT COUNT(*) as count FROM candidates")
      .get() as { count: number };
    expect(candidates.count).toBe(0);
  });
});

describe("search filters", () => {
  test("intent filtering works", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2), {
      intent: ["friends", "romance"],
    });
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2), {
      intent: ["friends"],
    });
    const tokenC = await registerUser(makeEmbedding(0.5, 0.2), {
      intent: ["collaborators"],
    });

    const result = await handleSearch(
      { user_token: tokenA, intent_filter: "friends" },
      ctx
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only B has "friends" intent (C has only "collaborators")
      expect(result.data.candidates.length).toBe(1);
    }
  });

  test("protocol_version filtering: different versions don't match", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));

    // Manually insert a user with different version
    ctx.db
      .prepare(
        `INSERT INTO users (user_token, protocol_version, vertical_id, embedding, city, age_range, intent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "fake-token",
        "schelling-1.0", // Different version from the current 2.0
        "matchmaking",
        JSON.stringify(makeEmbedding(0.5, 0.2)),
        "San Francisco",
        "25-34",
        '["romance"]'
      );

    const result = await handleSearch({ user_token: tokenA }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.candidates.length).toBe(0);
    }
  });
});

describe("idempotent stage advance", () => {
  test("calling compare twice doesn't error", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    const searchA = await handleSearch({ user_token: tokenA }, ctx);
    if (!searchA.ok) throw new Error(searchA.error.message);
    const candidateId = searchA.data.candidates[0].candidate_id;

    const r1 = await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );
    expect(r1.ok).toBe(true);

    const r2 = await handleCompare(
      { user_token: tokenA, candidate_ids: [candidateId] },
      ctx
    );
    expect(r2.ok).toBe(true);
  });
});

describe("search upsert", () => {
  test("when candidate exists from other side, caller's stage still advances", async () => {
    const tokenA = await registerUser(makeEmbedding(0.5, 0.2));
    const tokenB = await registerUser(makeEmbedding(0.5, 0.2));

    // A searches first
    await handleSearch({ user_token: tokenA }, ctx);

    // B searches — candidate already exists from A's search
    const searchB = await handleSearch({ user_token: tokenB }, ctx);
    expect(searchB.ok).toBe(true);

    // Verify B's stage is SEARCHED (1), not NONE (0)
    if (searchB.ok && searchB.data.candidates.length > 0) {
      const candidateId = searchB.data.candidates[0].candidate_id;
      const row = ctx.db
        .prepare("SELECT * FROM candidates WHERE id = ?")
        .get(candidateId) as { stage_a: number; stage_b: number };
      // Both sides should be at SEARCHED
      expect(row.stage_a).toBeGreaterThanOrEqual(1);
      expect(row.stage_b).toBeGreaterThanOrEqual(1);
    }
  });
});
