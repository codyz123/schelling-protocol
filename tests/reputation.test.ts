import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { Stage } from "../src/types.js";
import { handleReputation } from "../src/handlers/reputation.js";
import { handleReport } from "../src/handlers/report.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleInterest } from "../src/handlers/interest.js";
import { handleCommit } from "../src/handlers/commit.js";

// ─── Test Helpers ──────────────────────────────────────────────────────

let db: Database;
let ctx: HandlerContext;

function freshDb(): Database {
  const d = new Database(":memory:");
  initSchema(d);
  return d;
}

async function registerUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const result = await handleRegister(
    {
      protocol_version: "3.0",
      cluster_id: "dating.general",
      traits: [
        { key: "city", value: "SF", value_type: "string", visibility: "public" },
      ],
      ...overrides,
    } as any,
    ctx,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

async function connectUsers(tokenA: string, tokenB: string): Promise<string> {
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

/**
 * Insert a reputation_event directly into the database.
 *
 * The reputation handler computes age via `Date.now() - evt.created_at`.
 * Since created_at is stored as TEXT in SQLite, JavaScript coerces it with
 * Number(). ISO date strings coerce to NaN, so time-decay never triggers
 * for those values. To test time-decay, pass a numeric epoch-ms string as
 * createdAt (e.g., `String(Date.now() - 400 * 86_400_000)`).
 */
function insertReputationEvent(
  database: Database,
  identityId: string,
  eventType: string,
  rating: string | null = null,
  createdAt?: string,
): void {
  database
    .prepare(
      `INSERT INTO reputation_events
         (id, identity_id, reporter_id, reporter_reputation, cluster_id, event_type, rating, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      identityId,
      "reporter1",
      0.8,
      "dating.general",
      eventType,
      rating,
      null,
      createdAt ?? new Date().toISOString(),
    );
}

/**
 * Retrieve the user_token (identity) column from the users table by token.
 * Used to get the internal identity for direct DB operations.
 */
function getUserIdentity(token: string): string {
  const row = db.prepare("SELECT user_token FROM users WHERE user_token = ?").get(token) as
    | { user_token: string }
    | undefined;
  if (!row) throw new Error(`User ${token} not found`);
  return row.user_token;
}

// ─── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  db = freshDb();
  ctx = { db };
});

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Reputation System", () => {
  // ── 1. New user default reputation ─────────────────────────────────

  test("new user has default score ~0.5, interaction_count 0", async () => {
    const token = await registerUser();

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBeCloseTo(0.5, 5);
    expect(result.data.interaction_count).toBe(0);
    expect(result.data.positive_rate).toBe(0);
    expect(result.data.dispute_history).toEqual({ filed: 0, lost: 0, won: 0 });
    expect(result.data.enforcement_history).toEqual([]);
    expect(result.data.deliverable_stats).toEqual({
      delivered: 0,
      accepted: 0,
      rejected: 0,
    });
    expect(typeof result.data.member_since).toBe("string");
  });

  // ── 2. Positive outcome improves score ─────────────────────────────

  test("positive outcome event increases score above 0.5", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "outcome", "positive");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // positive_outcome adds +0.05 → score = 0.55
    expect(result.data.score).toBeCloseTo(0.55, 5);
  });

  // ── 3. Negative outcome decreases score ────────────────────────────

  test("negative outcome event decreases score below 0.5", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "outcome", "negative");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // negative_outcome subtracts -0.08 → score = 0.42
    expect(result.data.score).toBeCloseTo(0.42, 5);
  });

  // ── 4. Multiple events accumulate ──────────────────────────────────

  test("positive + negative events produce net effect", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "negative");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 + 0.05 + (-0.08) = 0.47
    expect(result.data.score).toBeCloseTo(0.47, 5);
  });

  test("multiple positive events accumulate additively", async () => {
    const token = await registerUser();
    for (let i = 0; i < 5; i++) {
      insertReputationEvent(db, token, "outcome", "positive");
    }

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 + 5 * 0.05 = 0.75
    expect(result.data.score).toBeCloseTo(0.75, 5);
  });

  // ── 5. Time decay ─────────────────────────────────────────────────
  //
  // The reputation handler computes: ageMs = Date.now() - evt.created_at
  // Since created_at is TEXT in SQLite, we must store a numeric epoch-ms
  // string for the arithmetic to produce a valid number.

  test("events older than 1 year have impact halved", async () => {
    const token = await registerUser();
    const eighteenMonthsAgo = String(Date.now() - 548 * 24 * 60 * 60 * 1000);
    insertReputationEvent(db, token, "outcome", "positive", eighteenMonthsAgo);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 1-2 year decay: impact * 0.5 → 0.05 * 0.5 = 0.025 → score = 0.525
    expect(result.data.score).toBeCloseTo(0.525, 3);
  });

  test("events older than 2 years have impact quartered", async () => {
    const token = await registerUser();
    const threeYearsAgo = String(Date.now() - 1095 * 24 * 60 * 60 * 1000);
    insertReputationEvent(db, token, "outcome", "positive", threeYearsAgo);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // >2 year decay: impact * 0.25 → 0.05 * 0.25 = 0.0125 → score = 0.5125
    expect(result.data.score).toBeCloseTo(0.5125, 3);
  });

  test("recent events have full impact (no decay)", async () => {
    const token = await registerUser();
    const oneDayAgo = String(Date.now() - 1 * 24 * 60 * 60 * 1000);
    insertReputationEvent(db, token, "outcome", "positive", oneDayAgo);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Recent event: full impact 0.05 → score = 0.55
    expect(result.data.score).toBeCloseTo(0.55, 5);
  });

  test("mixed age events apply different decay factors", async () => {
    const token = await registerUser();

    // Recent positive: full impact +0.05
    const recent = String(Date.now() - 30 * 24 * 60 * 60 * 1000);
    insertReputationEvent(db, token, "outcome", "positive", recent);

    // 1.5-year-old positive: halved → +0.025
    const oldish = String(Date.now() - 548 * 24 * 60 * 60 * 1000);
    insertReputationEvent(db, token, "outcome", "positive", oldish);

    // 3-year-old positive: quartered → +0.0125
    const ancient = String(Date.now() - 1095 * 24 * 60 * 60 * 1000);
    insertReputationEvent(db, token, "outcome", "positive", ancient);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 + 0.05 + 0.025 + 0.0125 = 0.5875
    expect(result.data.score).toBeCloseTo(0.5875, 3);
  });

  // ── 6. Report creates reputation event ─────────────────────────────

  test("handleReport creates a reputation_event for the other party", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const reportResult = await handleReport(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        outcome: "positive",
      },
      ctx,
    );
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;
    expect(reportResult.data.reported).toBe(true);
    expect(typeof reportResult.data.reported_at).toBe("string");

    // The report should have created a reputation_event for tokenB
    // (the "other" party). The event_type inserted by handleReport is
    // `${outcome}_outcome`, i.e., "positive_outcome".
    const events = db
      .prepare("SELECT * FROM reputation_events WHERE identity_id = ?")
      .all(tokenB) as Array<{ event_type: string; rating: string; identity_id: string }>;

    expect(events.length).toBeGreaterThanOrEqual(1);

    const outcomeEvent = events.find((e) => e.event_type === "positive_outcome");
    expect(outcomeEvent).toBeDefined();
    expect(outcomeEvent!.rating).toBe("positive");
    expect(outcomeEvent!.identity_id).toBe(tokenB);
  });

  // ── 7. Double report blocked ───────────────────────────────────────

  test("second report for same candidate returns ALREADY_REPORTED", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
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

  // ── 8. Report requires CONNECTED ──────────────────────────────────

  test("report before CONNECTED returns STAGE_VIOLATION", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();

    // Search to create candidate pair, but do NOT advance through funnel
    const searchResult = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;

    const candidateId = searchResult.data.candidates[0].candidate_id;

    // At this point, tokenA is DISCOVERED and tokenB is UNDISCOVERED
    const reportResult = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );
    expect(reportResult.ok).toBe(false);
    if (reportResult.ok) return;
    expect(reportResult.error.code).toBe("STAGE_VIOLATION");
  });

  test("report at INTERESTED stage (not CONNECTED) returns STAGE_VIOLATION", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();

    const searchResult = await handleSearch({ user_token: tokenA }, ctx);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    await handleSearch({ user_token: tokenB }, ctx);

    const candidateId = searchResult.data.candidates[0].candidate_id;

    // Advance both to INTERESTED but not further
    await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);

    const reportResult = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );
    expect(reportResult.ok).toBe(false);
    if (reportResult.ok) return;
    expect(reportResult.error.code).toBe("STAGE_VIOLATION");
  });

  // ── 9. Interaction count tracks outcomes ───────────────────────────

  test("interaction_count reflects number of outcome events", async () => {
    const token = await registerUser();

    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "negative");
    insertReputationEvent(db, token, "outcome", "neutral");
    // Non-outcome events should NOT count
    insertReputationEvent(db, token, "contract_completed", null);
    insertReputationEvent(db, token, "deliverable_accepted", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.interaction_count).toBe(3);
  });

  // ── 10. Positive rate calculation ──────────────────────────────────

  test("positive_rate is fraction of positive outcomes among all outcomes", async () => {
    const token = await registerUser();

    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "negative");
    insertReputationEvent(db, token, "outcome", "neutral");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2 positive out of 4 outcomes = 0.5
    expect(result.data.positive_rate).toBeCloseTo(0.5, 5);
    expect(result.data.interaction_count).toBe(4);
  });

  test("positive_rate is 0 when no outcomes exist", async () => {
    const token = await registerUser();

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.positive_rate).toBe(0);
  });

  test("positive_rate is 1 when all outcomes are positive", async () => {
    const token = await registerUser();

    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "positive");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.positive_rate).toBeCloseTo(1.0, 5);
  });

  // ── 11. Contract events affect score ───────────────────────────────

  test("contract_completed event increases score by 0.05", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "contract_completed", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBeCloseTo(0.55, 5);
  });

  test("contract_terminated event decreases score by 0.04", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "contract_terminated", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.04 = 0.46
    expect(result.data.score).toBeCloseTo(0.46, 5);
  });

  test("contract_expired is treated same as contract_terminated (-0.04)", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "contract_expired", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.04 = 0.46
    expect(result.data.score).toBeCloseTo(0.46, 5);
  });

  // ── 12. Deliverable events affect score ────────────────────────────

  test("deliverable_accepted event increases score by 0.03", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "deliverable_accepted", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBeCloseTo(0.53, 5);
  });

  test("deliverable_rejected event decreases score by 0.02", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "deliverable_rejected", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.02 = 0.48
    expect(result.data.score).toBeCloseTo(0.48, 5);
  });

  // ── 13. Dispute events affect score ────────────────────────────────

  test("dispute event with negative rating decreases score by 0.15", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "dispute", "negative");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.15 = 0.35
    expect(result.data.score).toBeCloseTo(0.35, 5);
  });

  test("dispute event without negative rating has no impact", async () => {
    const token = await registerUser();
    // Dispute with null rating should not match the `rating === 'negative'` check
    insertReputationEvent(db, token, "dispute", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No impact → score stays at 0.5
    expect(result.data.score).toBeCloseTo(0.5, 5);
  });

  test("dispute event with positive rating has no impact", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "dispute", "positive");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBeCloseTo(0.5, 5);
  });

  // ── 14. Verification level derived from traits ─────────────────────

  test("verification_level reflects highest verification tier from traits", async () => {
    const token = await registerUser({
      traits: [
        {
          key: "city",
          value: "SF",
          value_type: "string",
          visibility: "public",
          verification: "self_verified",
        },
      ],
    });

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.verification_level).toBe("self_verified");
  });

  test("verification_level defaults to unverified when no traits have verification", async () => {
    const token = await registerUser();

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.verification_level).toBe("unverified");
  });

  test("verification_level picks the highest tier across multiple traits", async () => {
    const token = await registerUser({
      traits: [
        {
          key: "city",
          value: "SF",
          value_type: "string",
          visibility: "public",
          verification: "self_verified",
        },
        {
          key: "age",
          value: 30,
          value_type: "number",
          visibility: "public",
          verification: "authority_verified",
        },
      ],
    });

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.verification_level).toBe("authority_verified");
  });

  test("cross_verified is between self_verified and authority_verified", async () => {
    const token = await registerUser({
      traits: [
        {
          key: "city",
          value: "SF",
          value_type: "string",
          visibility: "public",
          verification: "self_verified",
        },
        {
          key: "age",
          value: 30,
          value_type: "number",
          visibility: "public",
          verification: "cross_verified",
        },
      ],
    });

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.verification_level).toBe("cross_verified");
  });

  // ── Additional event type coverage ─────────────────────────────────

  test("neutral outcome adds +0.01 to score", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "outcome", "neutral");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 + 0.01 = 0.51
    expect(result.data.score).toBeCloseTo(0.51, 5);
  });

  test("jury_majority event adds +0.02", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "jury_majority", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBeCloseTo(0.52, 5);
  });

  test("frivolous_filing event subtracts -0.10", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "frivolous_filing", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.10 = 0.40
    expect(result.data.score).toBeCloseTo(0.40, 5);
  });

  test("enforcement_warning subtracts -0.05", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "enforcement_warning", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.05 = 0.45
    expect(result.data.score).toBeCloseTo(0.45, 5);
  });

  test("enforcement_action subtracts -0.10", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "enforcement_action", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.10 = 0.40
    expect(result.data.score).toBeCloseTo(0.40, 5);
  });

  test("abandonment subtracts -0.03", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "abandonment", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 - 0.03 = 0.47
    expect(result.data.score).toBeCloseTo(0.47, 5);
  });

  test("completion adds +0.03", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "completion", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 + 0.03 = 0.53
    expect(result.data.score).toBeCloseTo(0.53, 5);
  });

  // ── Score clamping ─────────────────────────────────────────────────

  test("score is clamped to minimum 0.0", async () => {
    const token = await registerUser();

    // 8 dispute_lost events: 0.5 + 8 * (-0.15) = 0.5 - 1.2 = -0.7 → clamped to 0.0
    for (let i = 0; i < 8; i++) {
      insertReputationEvent(db, token, "dispute", "negative");
    }

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBe(0.0);
  });

  test("score is clamped to maximum 1.0", async () => {
    const token = await registerUser();

    // 20 positive outcomes: 0.5 + 20 * 0.05 = 0.5 + 1.0 = 1.5 → clamped to 1.0
    for (let i = 0; i < 20; i++) {
      insertReputationEvent(db, token, "outcome", "positive");
    }

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBe(1.0);
  });

  // ── Error handling ─────────────────────────────────────────────────

  test("handleReputation returns USER_NOT_FOUND for invalid token", async () => {
    const result = await handleReputation({ user_token: "nonexistent-token" }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  // ── Unknown event types produce no impact ──────────────────────────

  test("unknown event type has zero impact on score", async () => {
    const token = await registerUser();
    insertReputationEvent(db, token, "some_unknown_event", null);

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.score).toBeCloseTo(0.5, 5);
  });

  // ── Both parties can report independently ──────────────────────────

  test("both users in a candidate pair can independently report", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const reportA = await handleReport(
      { user_token: tokenA, candidate_id: candidateId, outcome: "positive" },
      ctx,
    );
    expect(reportA.ok).toBe(true);

    const reportB = await handleReport(
      { user_token: tokenB, candidate_id: candidateId, outcome: "negative" },
      ctx,
    );
    expect(reportB.ok).toBe(true);

    // A's report should create an event for B, B's report should create an event for A
    const eventsForA = db
      .prepare("SELECT * FROM reputation_events WHERE identity_id = ?")
      .all(tokenA) as Array<{ event_type: string }>;
    const eventsForB = db
      .prepare("SELECT * FROM reputation_events WHERE identity_id = ?")
      .all(tokenB) as Array<{ event_type: string }>;

    expect(eventsForA.some((e) => e.event_type === "negative_outcome")).toBe(true);
    expect(eventsForB.some((e) => e.event_type === "positive_outcome")).toBe(true);
  });

  // ── Comprehensive scenario ─────────────────────────────────────────

  test("complex scenario with mixed event types produces correct score", async () => {
    const token = await registerUser();

    // 3 positive outcomes: 3 * 0.05 = +0.15
    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "positive");
    insertReputationEvent(db, token, "outcome", "positive");

    // 1 negative outcome: -0.08
    insertReputationEvent(db, token, "outcome", "negative");

    // 1 contract completed: +0.05
    insertReputationEvent(db, token, "contract_completed", null);

    // 1 deliverable accepted: +0.03
    insertReputationEvent(db, token, "deliverable_accepted", null);

    // 1 dispute lost: -0.15
    insertReputationEvent(db, token, "dispute", "negative");

    const result = await handleReputation({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 0.5 + 0.15 - 0.08 + 0.05 + 0.03 - 0.15 = 0.5
    expect(result.data.score).toBeCloseTo(0.5, 5);
    expect(result.data.interaction_count).toBe(4);
    expect(result.data.positive_rate).toBeCloseTo(0.75, 5);
  });
});
