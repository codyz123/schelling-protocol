import { describe, expect, test, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { initAgentCardsTables, handleCardsRoute } from "../src/handlers/cards.js";
import {
  initSerendipityTables,
  handleSerendipityRoute,
  cleanupExpiredSerendipity,
  cosineSimilarity,
  embedToBlob,
  blobToEmbed,
} from "../src/handlers/serendipity.js";
import type { HandlerContext } from "../src/types.js";

let db: Database;
let ctx: HandlerContext;

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

// ─── Test Helpers ─────────────────────────────────────────────────────

/** Generate a 256-float embedding with a 1 at hotIndex and 0s elsewhere */
function makeEmb(hotIndex = 0): number[] {
  const emb = new Array(256).fill(0);
  emb[hotIndex] = 1;
  return emb;
}

/** Generate a 256-float uniform embedding */
function uniformEmb(value = 0.5): number[] {
  return new Array(256).fill(value);
}

function makeCardReq(method: string, path: string, body?: unknown, authToken?: string): Request {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeSerReq(method: string, path: string, body?: unknown, authToken?: string): Request {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function cardRoute(method: string, path: string, body?: unknown, authToken?: string) {
  const req = makeCardReq(method, path, body, authToken);
  const url = new URL(req.url);
  return handleCardsRoute(req, url, ctx, corsHeaders);
}

async function serRoute(method: string, path: string, body?: unknown, authToken?: string) {
  const req = makeSerReq(method, path, body, authToken);
  const url = new URL(req.url);
  return handleSerendipityRoute(req, url, ctx, corsHeaders);
}

async function createCard(slug: string, extra: Record<string, unknown> = {}) {
  const res = await cardRoute("POST", "/api/cards", {
    slug,
    display_name: `Agent ${slug}`,
    ...extra,
  });
  expect(res).not.toBeNull();
  const data = await res!.json();
  expect(res!.status).toBe(201);
  return data as { slug: string; api_key: string; card: Record<string, any> };
}

interface SignalBody {
  needs?: any[];
  offers?: any[];
  interests?: string[];
  personality?: Record<string, string>;
  context?: Record<string, string>;
  needs_embedding?: number[];
  offers_embedding?: number[];
  profile_embedding?: number[];
  summary?: string;
  ttl_days?: number;
  cadence?: string;
}

function defaultSignalBody(overrides: SignalBody = {}): SignalBody {
  return {
    needs: [{ tag: "react-developer", weight: 0.9, context: "building dashboard" }],
    offers: [{ tag: "design", weight: 0.8, context: "10 years UX" }],
    interests: ["hiking", "stoicism"],
    personality: { style: "async", energy: "high", collaboration: "collaborative" },
    context: { location: "Denver, CO", timezone: "America/Denver", stage: "solo", industry: "tech" },
    needs_embedding: makeEmb(0),
    offers_embedding: makeEmb(1),
    profile_embedding: makeEmb(2),
    summary: "A test signal summary.",
    ...overrides,
  };
}

async function publishSignal(
  cardSlug: string,
  apiKey: string,
  overrides: SignalBody = {},
): Promise<{ res: Response | null; signalId: string }> {
  const signalId = randomUUID();
  const body = defaultSignalBody(overrides);
  const res = await serRoute(
    "PUT",
    `/api/serendipity/signals/${signalId}?card=${cardSlug}`,
    body,
    apiKey,
  );
  return { res, signalId };
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db as any);
  initAgentCardsTables(db as any);
  initSerendipityTables(db as any);
  ctx = { db: db as any };
});

// ─── 1. Signal CRUD ───────────────────────────────────────────────────

describe("Signal CRUD", () => {
  test("publish signal and get 201", async () => {
    const { api_key } = await createCard("crud-test");
    const { res } = await publishSignal("crud-test", api_key);
    expect(res!.status).toBe(201);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.signal.card_id).toBeDefined();
    expect(data.signal.needs_embedding).toHaveLength(256);
  });

  test("GET /signals/mine returns current signal", async () => {
    const { api_key } = await createCard("mine-test");
    const { signalId } = await publishSignal("mine-test", api_key);

    const res = await serRoute("GET", `/api/serendipity/signals/mine?card=mine-test`, undefined, api_key);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.id).toBe(signalId);
    expect(data.summary).toBe("A test signal summary.");
  });

  test("GET /signals/mine returns 404 if no signal", async () => {
    const { api_key } = await createCard("no-signal");
    const res = await serRoute("GET", `/api/serendipity/signals/mine?card=no-signal`, undefined, api_key);
    expect(res!.status).toBe(404);
  });

  test("DELETE /signals/:id withdraws signal", async () => {
    const { api_key } = await createCard("delete-test");
    const { signalId } = await publishSignal("delete-test", api_key);

    const delRes = await serRoute(
      "DELETE",
      `/api/serendipity/signals/${signalId}?card=delete-test`,
      undefined,
      api_key,
    );
    expect(delRes!.status).toBe(200);
    const data = await delRes!.json();
    expect(data.ok).toBe(true);

    // Signal should be gone
    const mineRes = await serRoute("GET", `/api/serendipity/signals/mine?card=delete-test`, undefined, api_key);
    expect(mineRes!.status).toBe(404);
  });

  test("DELETE /signals/:id cancels pending matches", async () => {
    const { api_key: keyA } = await createCard("del-a");
    const { api_key: keyB } = await createCard("del-b");

    // Publish complementary signals so a match is created
    await publishSignal("del-a", keyA, { needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2) });
    await publishSignal("del-b", keyB, { needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2) });

    // Verify match exists
    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=del-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    const matchId = matches[0].id;

    // Delete signal A
    const card = db.prepare("SELECT * FROM agent_cards WHERE slug = 'del-a'").get() as any;
    const signal = db.prepare("SELECT * FROM serendipity_signals WHERE card_id = ?").get(card.id) as any;
    await serRoute("DELETE", `/api/serendipity/signals/${signal.id}?card=del-a`, undefined, keyA);

    // Match should be expired/cancelled
    const match = db.prepare("SELECT status FROM serendipity_matches WHERE id = ?").get(matchId) as any;
    expect(match.status).toBe("expired");
  });
});

// ─── 2. Validation ────────────────────────────────────────────────────

describe("Validation", () => {
  test("rejects embedding with wrong length (not 256)", async () => {
    const { api_key } = await createCard("val-emb");
    const { res } = await publishSignal("val-emb", api_key, {
      needs_embedding: new Array(128).fill(0),
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("needs_embedding");
  });

  test("rejects offers_embedding with wrong length", async () => {
    const { api_key } = await createCard("val-emb2");
    const { res } = await publishSignal("val-emb2", api_key, {
      offers_embedding: new Array(512).fill(0),
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("offers_embedding");
  });

  test("rejects profile_embedding with wrong length", async () => {
    const { api_key } = await createCard("val-emb3");
    const { res } = await publishSignal("val-emb3", api_key, {
      profile_embedding: [],
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("profile_embedding");
  });

  test("rejects too many needs (>20)", async () => {
    const { api_key } = await createCard("val-needs");
    const { res } = await publishSignal("val-needs", api_key, {
      needs: Array.from({ length: 21 }, (_, i) => ({ tag: `need-${i}`, weight: 0.5 })),
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("needs");
  });

  test("rejects too many offers (>20)", async () => {
    const { api_key } = await createCard("val-offers");
    const { res } = await publishSignal("val-offers", api_key, {
      offers: Array.from({ length: 21 }, (_, i) => ({ tag: `offer-${i}`, weight: 0.5 })),
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("offers");
  });

  test("rejects too many interests (>30)", async () => {
    const { api_key } = await createCard("val-interests");
    const { res } = await publishSignal("val-interests", api_key, {
      interests: Array.from({ length: 31 }, (_, i) => `interest-${i}`),
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("interests");
  });

  test("rejects summary over 2000 chars", async () => {
    const { api_key } = await createCard("val-summary");
    const { res } = await publishSignal("val-summary", api_key, {
      summary: "X".repeat(2001),
    });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("summary");
  });

  test("rejects ttl_days out of range", async () => {
    const { api_key } = await createCard("val-ttl");
    const { res } = await publishSignal("val-ttl", api_key, { ttl_days: 0 });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("ttl_days");

    const { res: res2 } = await publishSignal("val-ttl", api_key, { ttl_days: 31 });
    expect(res2!.status).toBe(400);
  });

  test("accepts exactly 20 needs, 30 interests", async () => {
    const { api_key } = await createCard("val-maxok");
    const { res } = await publishSignal("val-maxok", api_key, {
      needs: Array.from({ length: 20 }, (_, i) => ({ tag: `need-${i}`, weight: 0.5 })),
      interests: Array.from({ length: 30 }, (_, i) => `interest-${i}`),
    });
    expect(res!.status).toBe(201);
  });

  test("accepts summary at exactly 2000 chars", async () => {
    const { api_key } = await createCard("val-sum-ok");
    const { res } = await publishSignal("val-sum-ok", api_key, {
      summary: "S".repeat(2000),
    });
    expect(res!.status).toBe(201);
  });
});

// ─── 3. Auth ──────────────────────────────────────────────────────────

describe("Auth", () => {
  test("returns 401 without card query param", async () => {
    const signalId = randomUUID();
    const req = makeSerReq("PUT", `/api/serendipity/signals/${signalId}`, defaultSignalBody(), "some-key");
    const url = new URL(req.url);
    const res = await handleSerendipityRoute(req, url, ctx, corsHeaders);
    expect(res!.status).toBe(401);
  });

  test("returns 401 with wrong api key", async () => {
    await createCard("auth-test");
    const { res } = await publishSignal("auth-test", "wrong-key");
    expect(res!.status).toBe(401);
  });

  test("returns 401 with no Authorization header", async () => {
    await createCard("auth-noheader");
    const signalId = randomUUID();
    const req = makeSerReq("PUT", `/api/serendipity/signals/${signalId}?card=auth-noheader`, defaultSignalBody());
    const url = new URL(req.url);
    const res = await handleSerendipityRoute(req, url, ctx, corsHeaders);
    expect(res!.status).toBe(401);
  });

  test("GET /signals/mine returns 401 without auth", async () => {
    await createCard("auth-mine");
    const req = makeSerReq("GET", `/api/serendipity/signals/mine?card=auth-mine`);
    const url = new URL(req.url);
    const res = await handleSerendipityRoute(req, url, ctx, corsHeaders);
    expect(res!.status).toBe(401);
  });

  test("GET /matches returns 401 without auth", async () => {
    await createCard("auth-matches");
    const req = makeSerReq("GET", `/api/serendipity/matches?card=auth-matches`);
    const url = new URL(req.url);
    const res = await handleSerendipityRoute(req, url, ctx, corsHeaders);
    expect(res!.status).toBe(401);
  });
});

// ─── 4. One signal per card ───────────────────────────────────────────

describe("One signal per card", () => {
  test("second publish replaces first signal", async () => {
    const { api_key } = await createCard("one-signal");

    const { signalId: id1 } = await publishSignal("one-signal", api_key, { summary: "First" });
    const { signalId: id2 } = await publishSignal("one-signal", api_key, { summary: "Second" });

    // Only second signal should exist
    const mineRes = await serRoute("GET", `/api/serendipity/signals/mine?card=one-signal`, undefined, api_key);
    const data = await mineRes!.json();
    expect(data.id).toBe(id2);
    expect(data.summary).toBe("Second");

    // DB should have only one signal for this card
    const card = db.prepare("SELECT id FROM agent_cards WHERE slug = 'one-signal'").get() as any;
    const count = db.prepare("SELECT COUNT(*) as c FROM serendipity_signals WHERE card_id = ?").get(card.id) as any;
    expect(count.c).toBe(1);
  });
});

// ─── 5. Matching: complementary signals create match ─────────────────

describe("Matching Engine", () => {
  test("two complementary signals create a match", async () => {
    const { api_key: keyA } = await createCard("match-a");
    const { api_key: keyB } = await createCard("match-b");

    // Signal A: needs at dim 0, offers at dim 1
    await publishSignal("match-a", keyA, {
      needs_embedding: makeEmb(0),
      offers_embedding: makeEmb(1),
      profile_embedding: makeEmb(2),
    });

    // Signal B: needs at dim 1, offers at dim 0 — perfectly complementary
    await publishSignal("match-b", keyB, {
      needs_embedding: makeEmb(1),
      offers_embedding: makeEmb(0),
      profile_embedding: makeEmb(2),
    });

    // Check matches for card A
    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=match-a`, undefined, keyA);
    expect(matchRes!.status).toBe(200);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].status).toBe("pending");
    expect(matches[0].score).toBeGreaterThan(0.45);
  });

  test("non-complementary signals do not create a match", async () => {
    const { api_key: keyA } = await createCard("no-match-a");
    const { api_key: keyB } = await createCard("no-match-b");

    // Orthogonal embeddings → cosine similarity = 0
    await publishSignal("no-match-a", keyA, {
      needs_embedding: makeEmb(10),
      offers_embedding: makeEmb(11),
      profile_embedding: makeEmb(12),
    });
    await publishSignal("no-match-b", keyB, {
      needs_embedding: makeEmb(20),
      offers_embedding: makeEmb(21),
      profile_embedding: makeEmb(22),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=no-match-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    // context score alone = 0.5, so composite = 0.5*0.15 = 0.075 < 0.45
    expect(matches.length).toBe(0);
  });

  // ─── 6. Score verification ────────────────────────────────────────

  test("composite score formula matches expected calculation", () => {
    // Manually verify the scoring formula
    const aNeedsEmb = makeEmb(0);
    const aOffersEmb = makeEmb(1);
    const aProfileEmb = makeEmb(2);
    const bNeedsEmb = makeEmb(1);
    const bOffersEmb = makeEmb(0);
    const bProfileEmb = makeEmb(2);

    const myNeedsTheirOffers = cosineSimilarity(aNeedsEmb, bOffersEmb);
    const theirNeedsMyOffers = cosineSimilarity(bNeedsEmb, aOffersEmb);
    const complementarity = (myNeedsTheirOffers + theirNeedsMyOffers) / 2;
    expect(complementarity).toBeCloseTo(1.0, 3);

    const profileSim = cosineSimilarity(aProfileEmb, bProfileEmb);
    expect(profileSim).toBeCloseTo(1.0, 3);

    // No shared interests
    const jaccardInterest = 0;
    const interestScore = (jaccardInterest + profileSim) / 2;
    expect(interestScore).toBeCloseTo(0.5, 3);

    // No timezone/location match → contextScore = 0.5
    const contextScore = 0.5;
    const serendipityBonus = (complementarity > 0.3 && interestScore > 0.3) ? 0.10 : 0;
    expect(serendipityBonus).toBe(0.10);

    const composite =
      complementarity * 0.40 +
      interestScore * 0.20 +
      profileSim * 0.15 +
      contextScore * 0.15 +
      serendipityBonus;

    expect(composite).toBeCloseTo(0.40 + 0.10 + 0.15 + 0.075 + 0.10, 3);
    expect(composite).toBeGreaterThan(0.45);
  });

  // ─── 7. Cross-matching: needs↔offers bidirectional ────────────────

  test("needs↔offers cross-matching is bidirectional", () => {
    const aNeedsEmb = makeEmb(5);
    const bOffersEmb = makeEmb(5); // A's needs matches B's offers
    const bNeedsEmb = makeEmb(7);
    const aOffersEmb = makeEmb(7); // B's needs matches A's offers

    const myNeedsTheirOffers = cosineSimilarity(aNeedsEmb, bOffersEmb);
    const theirNeedsMyOffers = cosineSimilarity(bNeedsEmb, aOffersEmb);

    expect(myNeedsTheirOffers).toBeCloseTo(1.0, 3);
    expect(theirNeedsMyOffers).toBeCloseTo(1.0, 3);

    // Asymmetric case: one direction matches, other doesn't
    const cNeedsEmb = makeEmb(50);
    const dOffersEmb = makeEmb(50); // C's needs matches D's offers
    const dNeedsEmb = makeEmb(60);
    const cOffersEmb = makeEmb(61); // D's needs does NOT match C's offers

    const sim1 = cosineSimilarity(cNeedsEmb, dOffersEmb);
    const sim2 = cosineSimilarity(dNeedsEmb, cOffersEmb);
    expect(sim1).toBeCloseTo(1.0, 3);
    expect(sim2).toBeCloseTo(0.0, 3);
    const asymComp = (sim1 + sim2) / 2;
    expect(asymComp).toBeCloseTo(0.5, 3);
  });
});

// ─── 8. Rejection tracking ────────────────────────────────────────────

describe("Rejection tracking", () => {
  test("rejected pairs do not re-match on subsequent publishes", async () => {
    const { api_key: keyA } = await createCard("rej-a");
    const { api_key: keyB } = await createCard("rej-b");

    // Create complementary signals to generate a match
    await publishSignal("rej-a", keyA, {
      needs_embedding: makeEmb(0),
      offers_embedding: makeEmb(1),
      profile_embedding: makeEmb(2),
    });
    await publishSignal("rej-b", keyB, {
      needs_embedding: makeEmb(1),
      offers_embedding: makeEmb(0),
      profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=rej-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    const matchId = matches[0].id;

    // Card A rejects
    await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=rej-a`, { decision: "no" }, keyA);

    // Both re-publish signals
    await publishSignal("rej-a", keyA, {
      needs_embedding: makeEmb(0),
      offers_embedding: makeEmb(1),
      profile_embedding: makeEmb(2),
    });
    await publishSignal("rej-b", keyB, {
      needs_embedding: makeEmb(1),
      offers_embedding: makeEmb(0),
      profile_embedding: makeEmb(2),
    });

    // No new match should exist between rej-a and rej-b
    const newMatchRes = await serRoute("GET", `/api/serendipity/matches?card=rej-a`, undefined, keyA);
    const { matches: newMatches } = await newMatchRes!.json();
    const activeMatches = newMatches.filter((m: any) => m.status === "pending" || m.status === "revealed");
    expect(activeMatches.length).toBe(0);
  });

  test("rejection is recorded in both directions", async () => {
    const { api_key: keyA } = await createCard("rej-dir-a");
    const { api_key: keyB } = await createCard("rej-dir-b");

    await publishSignal("rej-dir-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("rej-dir-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=rej-dir-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=rej-dir-a`, { decision: "no" }, keyA);

    // Check rejections table has both directions
    const cardA = db.prepare("SELECT id FROM agent_cards WHERE slug = 'rej-dir-a'").get() as any;
    const cardB = db.prepare("SELECT id FROM agent_cards WHERE slug = 'rej-dir-b'").get() as any;

    const rej1 = db.prepare(
      "SELECT * FROM serendipity_rejections WHERE card_a_id = ? AND card_b_id = ?",
    ).get(cardA.id, cardB.id);
    const rej2 = db.prepare(
      "SELECT * FROM serendipity_rejections WHERE card_a_id = ? AND card_b_id = ?",
    ).get(cardB.id, cardA.id);

    expect(rej1).not.toBeNull();
    expect(rej2).not.toBeNull();
  });
});

// ─── 9. Duplicate prevention ──────────────────────────────────────────

describe("Duplicate prevention", () => {
  test("existing active match blocks new match for same pair", async () => {
    const { api_key: keyA } = await createCard("dup-a");
    const { api_key: keyB } = await createCard("dup-b");

    // First publish creates a match
    await publishSignal("dup-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("dup-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const beforeCount = (db.prepare("SELECT COUNT(*) as c FROM serendipity_matches").get() as any).c;
    expect(beforeCount).toBeGreaterThan(0);

    // Re-publish both signals — no new duplicate match should be created
    await publishSignal("dup-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("dup-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const afterCount = (db.prepare("SELECT COUNT(*) as c FROM serendipity_matches WHERE status IN ('pending','revealed')").get() as any).c;
    // Should still be 1 active match, not 2+
    expect(afterCount).toBe(beforeCount);
  });
});

// ─── 10. Rate limiting ────────────────────────────────────────────────

describe("Rate limiting: max 3 matches", () => {
  test("signal creates at most 3 matches", async () => {
    // Create 5 other complementary cards
    const others: string[] = [];
    for (let i = 0; i < 5; i++) {
      const slug = `rate-other-${i}`;
      const { api_key } = await createCard(slug);
      // Publish each with different profile embedding so they don't get deduplicated
      const { signalId } = await publishSignal(slug, api_key, {
        needs_embedding: makeEmb(1),    // wants what main card offers
        offers_embedding: makeEmb(0),   // offers what main card needs
        profile_embedding: makeEmb(i + 10),
      });
      others.push(slug);
    }

    // Main card publishes — should match all 5 but only create 3
    const { api_key: mainKey } = await createCard("rate-main");
    await publishSignal("rate-main", mainKey, {
      needs_embedding: makeEmb(0),
      offers_embedding: makeEmb(1),
      profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=rate-main`, undefined, mainKey);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeLessThanOrEqual(3);
    expect(matches.length).toBeGreaterThan(0);
  });
});

// ─── 11. Opt-in flow ─────────────────────────────────────────────────

describe("Opt-in flow", () => {
  test("single opt-in returns waiting", async () => {
    const { api_key: keyA } = await createCard("optin-a");
    const { api_key: keyB } = await createCard("optin-b");

    await publishSignal("optin-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("optin-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=optin-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    const matchId = matches[0].id;

    // Card A opts in
    const yesRes = await serRoute(
      "PUT",
      `/api/serendipity/matches/${matchId}?card=optin-a`,
      { decision: "yes" },
      keyA,
    );
    expect(yesRes!.status).toBe(200);
    const yesData = await yesRes!.json();
    expect(yesData.revealed).toBe(false);
    expect(yesData.message).toContain("Waiting");
  });

  test("mutual opt-in returns revealed with card slug", async () => {
    const { api_key: keyA } = await createCard("reveal-a");
    const { api_key: keyB } = await createCard("reveal-b");

    await publishSignal("reveal-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("reveal-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    // Find the match from A's perspective
    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=reveal-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    const matchId = matches[0].id;
    const aSide = matches[0].your_side; // A's side in the match

    // Both opt in (need to find the match from B's perspective too)
    await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=reveal-a`, { decision: "yes" }, keyA);
    const revealRes = await serRoute(
      "PUT",
      `/api/serendipity/matches/${matchId}?card=reveal-b`,
      { decision: "yes" },
      keyB,
    );

    expect(revealRes!.status).toBe(200);
    const revealData = await revealRes!.json();
    expect(revealData.revealed).toBe(true);
    // The revealed slug should be the OTHER card from B's perspective (which is reveal-a)
    expect(revealData.card_slug).toBeDefined();
    expect(typeof revealData.card_slug).toBe("string");
    expect(revealData.card_url).toContain("schellingprotocol.com/cards/");

    // Status should now be revealed
    const match = db.prepare("SELECT status FROM serendipity_matches WHERE id = ?").get(matchId) as any;
    expect(match.status).toBe("revealed");
  });

  test("match shows other_opted_in correctly", async () => {
    const { api_key: keyA } = await createCard("optin-check-a");
    const { api_key: keyB } = await createCard("optin-check-b");

    await publishSignal("optin-check-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("optin-check-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=optin-check-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    // Before any opt-in
    expect(matches[0].you_opted_in).toBe(false);
    expect(matches[0].other_opted_in).toBe(false);

    // B opts in
    await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=optin-check-b`, { decision: "yes" }, keyB);

    // A checks — should see other_opted_in = true
    const afterRes = await serRoute("GET", `/api/serendipity/matches/${matchId}?card=optin-check-a`, undefined, keyA);
    const afterData = await afterRes!.json();
    expect(afterData.other_opted_in).toBe(true);
    expect(afterData.you_opted_in).toBe(false);
  });
});

// ─── 12. Rejection flow ───────────────────────────────────────────────

describe("Rejection flow", () => {
  test("one side rejecting sets match status to rejected", async () => {
    const { api_key: keyA } = await createCard("rejflow-a");
    const { api_key: keyB } = await createCard("rejflow-b");

    await publishSignal("rejflow-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("rejflow-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=rejflow-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    const rejRes = await serRoute(
      "PUT",
      `/api/serendipity/matches/${matchId}?card=rejflow-a`,
      { decision: "no" },
      keyA,
    );
    expect(rejRes!.status).toBe(200);
    const rejData = await rejRes!.json();
    expect(rejData.rejected).toBe(true);

    const match = db.prepare("SELECT status FROM serendipity_matches WHERE id = ?").get(matchId) as any;
    expect(match.status).toBe("rejected");
  });

  test("cannot respond to already-rejected match", async () => {
    const { api_key: keyA } = await createCard("rej-done-a");
    const { api_key: keyB } = await createCard("rej-done-b");

    await publishSignal("rej-done-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("rej-done-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=rej-done-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=rej-done-a`, { decision: "no" }, keyA);

    // Try to respond again
    const res = await serRoute(
      "PUT",
      `/api/serendipity/matches/${matchId}?card=rej-done-b`,
      { decision: "yes" },
      keyB,
    );
    expect(res!.status).toBe(400);
  });

  test("invalid decision returns 400", async () => {
    const { api_key: keyA } = await createCard("inv-dec-a");
    const { api_key: keyB } = await createCard("inv-dec-b");

    await publishSignal("inv-dec-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("inv-dec-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=inv-dec-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    const res = await serRoute(
      "PUT",
      `/api/serendipity/matches/${matchId}?card=inv-dec-a`,
      { decision: "maybe" },
      keyA,
    );
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("decision");
  });
});

// ─── 13. Expiration ───────────────────────────────────────────────────

describe("Expiration", () => {
  test("cleanupExpiredSerendipity removes expired signals", async () => {
    const { api_key } = await createCard("exp-sig");
    const { signalId } = await publishSignal("exp-sig", api_key);

    // Manually expire the signal
    db.prepare("UPDATE serendipity_signals SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(signalId);

    cleanupExpiredSerendipity(db as any);

    const signal = db.prepare("SELECT * FROM serendipity_signals WHERE id = ?").get(signalId);
    expect(signal).toBeNull();
  });

  test("cleanupExpiredSerendipity expires pending matches past their deadline", async () => {
    const { api_key: keyA } = await createCard("exp-match-a");
    const { api_key: keyB } = await createCard("exp-match-b");

    await publishSignal("exp-match-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("exp-match-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=exp-match-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    const matchId = matches[0].id;

    // Expire the match
    db.prepare("UPDATE serendipity_matches SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(matchId);

    cleanupExpiredSerendipity(db as any);

    const match = db.prepare("SELECT status FROM serendipity_matches WHERE id = ?").get(matchId) as any;
    expect(match.status).toBe("expired");
  });

  test("GET /matches optionally filters by status", async () => {
    const { api_key: keyA } = await createCard("filter-a");
    const { api_key: keyB } = await createCard("filter-b");

    await publishSignal("filter-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("filter-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=filter-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    // Expire it
    db.prepare("UPDATE serendipity_matches SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(matchId);
    cleanupExpiredSerendipity(db as any);

    // Filter by pending — should be 0
    const pendingRes = await serRoute("GET", `/api/serendipity/matches?card=filter-a&status=pending`, undefined, keyA);
    const { matches: pending } = await pendingRes!.json();
    expect(pending.length).toBe(0);

    // Filter by expired — should have 1
    const expiredRes = await serRoute("GET", `/api/serendipity/matches?card=filter-a&status=expired`, undefined, keyA);
    const { matches: expired } = await expiredRes!.json();
    expect(expired.length).toBeGreaterThan(0);
  });
});

// ─── 14. Card deletion cascade ───────────────────────────────────────

describe("Card deletion cascade", () => {
  test("soft-deleting a card removes its signal on cleanup", async () => {
    const { api_key } = await createCard("cascade-del");
    const { signalId } = await publishSignal("cascade-del", api_key);

    // Soft-delete the card
    await cardRoute("DELETE", "/api/cards/cascade-del", undefined, api_key);

    // Signal should still be there before cleanup
    const before = db.prepare("SELECT * FROM serendipity_signals WHERE id = ?").get(signalId);
    expect(before).not.toBeNull();

    // Run cleanup
    cleanupExpiredSerendipity(db as any);

    // Signal should be gone
    const after = db.prepare("SELECT * FROM serendipity_signals WHERE id = ?").get(signalId);
    expect(after).toBeNull();
  });
});

// ─── 15. Self-match prevention ───────────────────────────────────────

describe("Self-match prevention", () => {
  test("signal never matches against same card_id", async () => {
    const { api_key } = await createCard("self-match");

    // Publish a signal — should not match itself
    await publishSignal("self-match", api_key, {
      needs_embedding: makeEmb(0),
      offers_embedding: makeEmb(0), // same as needs — would match self if allowed
      profile_embedding: makeEmb(0),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=self-match`, undefined, api_key);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBe(0);
  });
});

// ─── Embedding helpers ────────────────────────────────────────────────

describe("Embedding helpers", () => {
  test("embedToBlob and blobToEmbed roundtrip", () => {
    const original = Array.from({ length: 256 }, (_, i) => i * 0.001);
    const blob = embedToBlob(original);
    const recovered = blobToEmbed(blob);
    expect(recovered).toHaveLength(256);
    for (let i = 0; i < 256; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 3);
    }
  });

  test("cosineSimilarity of identical vectors is 1", () => {
    const v = makeEmb(3);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  test("cosineSimilarity of orthogonal vectors is 0", () => {
    const a = makeEmb(0);
    const b = makeEmb(1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  test("cosineSimilarity of zero vector is 0", () => {
    const zero = new Array(256).fill(0);
    const v = makeEmb(0);
    expect(cosineSimilarity(zero, v)).toBe(0);
  });
});

// ─── Match visibility ────────────────────────────────────────────────

describe("Match privacy", () => {
  test("match response does not expose other card's identity before reveal", async () => {
    const { api_key: keyA } = await createCard("priv-a");
    const { api_key: keyB } = await createCard("priv-b");

    await publishSignal("priv-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("priv-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=priv-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);

    const match = matches[0];
    // Should not have card identity
    expect(match.other_signal).toBeDefined();
    expect(match.other_signal.card_id).toBeUndefined();
    // Should not be revealed yet
    expect(match.revealed_card_slug).toBeUndefined();
    expect(match.revealed_card_url).toBeUndefined();
    // Should have signal dimensions
    expect(match.other_signal.needs).toBeDefined();
    expect(match.other_signal.offers).toBeDefined();
    expect(match.other_signal.summary).toBeDefined();
  });

  test("route returns null for non-serendipity paths", async () => {
    const req = new Request("http://localhost/api/cards");
    const url = new URL(req.url);
    const res = await handleSerendipityRoute(req, url, ctx, corsHeaders);
    expect(res).toBeNull();
  });
});

// ─── GET /matches/:id ─────────────────────────────────────────────────

describe("GET /matches/:id", () => {
  test("returns single match by id", async () => {
    const { api_key: keyA } = await createCard("single-match-a");
    const { api_key: keyB } = await createCard("single-match-b");

    await publishSignal("single-match-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("single-match-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const listRes = await serRoute("GET", `/api/serendipity/matches?card=single-match-a`, undefined, keyA);
    const { matches } = await listRes!.json();
    const matchId = matches[0].id;

    const res = await serRoute("GET", `/api/serendipity/matches/${matchId}?card=single-match-a`, undefined, keyA);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.id).toBe(matchId);
    expect(data.score_breakdown).toBeDefined();
  });

  test("returns 404 for match not belonging to card", async () => {
    const { api_key: keyA } = await createCard("cross-a");
    const { api_key: keyB } = await createCard("cross-b");
    const { api_key: keyC } = await createCard("cross-c");

    await publishSignal("cross-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("cross-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const listRes = await serRoute("GET", `/api/serendipity/matches?card=cross-a`, undefined, keyA);
    const { matches } = await listRes!.json();
    const matchId = matches[0].id;

    // Card C tries to access a match between A and B
    const res = await serRoute("GET", `/api/serendipity/matches/${matchId}?card=cross-c`, undefined, keyC);
    expect(res!.status).toBe(404);
  });
});

// ─── Bug fix tests ─────────────────────────────────────────────────

describe("Signal ID collision", () => {
  test("returns 409 if signal ID is taken by another card", async () => {
    const { api_key: keyA } = await createCard("collide-a");
    const { api_key: keyB } = await createCard("collide-b");

    // A publishes with a specific signal ID
    const sharedId = randomUUID();
    const resA = await serRoute(
      "PUT",
      `/api/serendipity/signals/${sharedId}?card=collide-a`,
      defaultSignalBody(),
      keyA,
    );
    expect(resA!.status).toBe(201);

    // B tries to use the same signal ID
    const resB = await serRoute(
      "PUT",
      `/api/serendipity/signals/${sharedId}?card=collide-b`,
      defaultSignalBody(),
      keyB,
    );
    expect(resB!.status).toBe(409);
  });
});

describe("Stale match cleanup on re-publish", () => {
  test("re-publishing signal expires old pending matches", async () => {
    const { api_key: keyA } = await createCard("stale-a");
    const { api_key: keyB } = await createCard("stale-b");

    await publishSignal("stale-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("stale-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    // Verify match exists
    const matchRes1 = await serRoute("GET", `/api/serendipity/matches?card=stale-a`, undefined, keyA);
    const { matches: before } = await matchRes1!.json();
    expect(before.length).toBeGreaterThan(0);
    const oldMatchId = before[0].id;

    // A re-publishes — old match should be expired
    await publishSignal("stale-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
      summary: "Updated signal",
    });

    const oldMatch = db.prepare("SELECT status FROM serendipity_matches WHERE id = ?").get(oldMatchId) as any;
    expect(oldMatch.status).toBe("expired");
  });
});

describe("Embedding type validation", () => {
  test("rejects NaN in embedding", async () => {
    const { api_key } = await createCard("nan-emb");
    const badEmb = new Array(256).fill(0);
    badEmb[42] = NaN;
    const { res } = await publishSignal("nan-emb", api_key, { needs_embedding: badEmb });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("needs_embedding[42]");
  });

  test("rejects string in embedding", async () => {
    const { api_key } = await createCard("str-emb");
    const badEmb: any[] = new Array(256).fill(0);
    badEmb[0] = "hello";
    const { res } = await publishSignal("str-emb", api_key, { offers_embedding: badEmb });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("offers_embedding[0]");
  });

  test("rejects Infinity in embedding", async () => {
    const { api_key } = await createCard("inf-emb");
    const badEmb = new Array(256).fill(0);
    badEmb[100] = Infinity;
    const { res } = await publishSignal("inf-emb", api_key, { profile_embedding: badEmb });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("profile_embedding[100]");
  });
});

describe("Matches pagination", () => {
  test("returns total count and respects limit/offset", async () => {
    const { api_key: keyA } = await createCard("page-a");
    const { api_key: keyB } = await createCard("page-b");

    await publishSignal("page-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("page-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const res = await serRoute("GET", `/api/serendipity/matches?card=page-a&limit=1&offset=0`, undefined, keyA);
    const data = await res!.json();
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.matches.length).toBeLessThanOrEqual(1);
    expect(data.limit).toBe(1);
    expect(data.offset).toBe(0);
  });
});

describe("Defer (not_now) flow", () => {
  test("not_now extends match expiry without rejecting", async () => {
    const { api_key: keyA } = await createCard("defer-a");
    const { api_key: keyB } = await createCard("defer-b");

    await publishSignal("defer-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("defer-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    // Get the match
    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=defer-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    expect(matches.length).toBeGreaterThan(0);
    const matchId = matches[0].id;
    const originalExpiry = db.prepare("SELECT expires_at FROM serendipity_matches WHERE id = ?").get(matchId) as any;

    // Defer the match
    const deferRes = await serRoute(
      "PUT",
      `/api/serendipity/matches/${matchId}?card=defer-a`,
      { decision: "not_now" },
      keyA,
    );
    expect(deferRes!.status).toBe(200);
    const deferData = await deferRes!.json();
    expect(deferData.deferred).toBe(true);

    // Match should still be pending with a valid future expiry
    const afterDefer = db.prepare("SELECT status, expires_at FROM serendipity_matches WHERE id = ?").get(matchId) as any;
    expect(afterDefer.status).toBe("pending");
    // Expiry should be at least 13 days from now (14 days minus test execution time)
    const thirteenDaysFromNow = Date.now() + 13 * 24 * 60 * 60 * 1000;
    expect(new Date(afterDefer.expires_at).getTime()).toBeGreaterThan(thirteenDaysFromNow);
  });

  test("deferred match can still be accepted later", async () => {
    const { api_key: keyA } = await createCard("deferacc-a");
    const { api_key: keyB } = await createCard("deferacc-b");

    await publishSignal("deferacc-a", keyA, {
      needs_embedding: makeEmb(0), offers_embedding: makeEmb(1), profile_embedding: makeEmb(2),
    });
    await publishSignal("deferacc-b", keyB, {
      needs_embedding: makeEmb(1), offers_embedding: makeEmb(0), profile_embedding: makeEmb(2),
    });

    const matchRes = await serRoute("GET", `/api/serendipity/matches?card=deferacc-a`, undefined, keyA);
    const { matches } = await matchRes!.json();
    const matchId = matches[0].id;

    // Defer first
    await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=deferacc-a`, { decision: "not_now" }, keyA);

    // Then accept
    const yesRes = await serRoute("PUT", `/api/serendipity/matches/${matchId}?card=deferacc-a`, { decision: "yes" }, keyA);
    expect(yesRes!.status).toBe(200);
    const yesData = await yesRes!.json();
    expect(yesData.revealed).toBe(false); // Other side hasn't opted in yet

    // Other side accepts
    const matchResB = await serRoute("GET", `/api/serendipity/matches?card=deferacc-b`, undefined, keyB);
    const matchesB = (await matchResB!.json()).matches;
    const bMatchId = matchesB[0].id;
    const revealRes = await serRoute("PUT", `/api/serendipity/matches/${bMatchId}?card=deferacc-b`, { decision: "yes" }, keyB);
    const revealData = await revealRes!.json();
    expect(revealData.revealed).toBe(true);
    expect(revealData.card_slug).toBe("deferacc-a");
  });
});
