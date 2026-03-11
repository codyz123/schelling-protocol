import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { initAgentCardsTables, handleCardsRoute } from "../src/handlers/cards.js";
import type { HandlerContext } from "../src/types.js";

let db: Database;
let ctx: HandlerContext;

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

function makeReq(method: string, path: string, body?: unknown, authToken?: string): Request {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function route(method: string, path: string, body?: unknown, authToken?: string) {
  const req = makeReq(method, path, body, authToken);
  const url = new URL(req.url);
  return handleCardsRoute(req, url, ctx, corsHeaders);
}

async function createCard(overrides: Record<string, unknown> = {}) {
  const res = await route("POST", "/api/cards", {
    slug: "test-agent",
    display_name: "Test Agent",
    ...overrides,
  });
  expect(res).not.toBeNull();
  const data = await res!.json();
  expect(res!.status).toBe(201);
  return data as { slug: string; api_key: string; card: Record<string, any> };
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db as any);
  initAgentCardsTables(db as any);
  ctx = { db: db as any };
});

// ─── Create Card ─────────────────────────────────────────────────────

describe("POST /api/cards", () => {
  test("creates card and returns api_key", async () => {
    const { slug, api_key, card } = await createCard();
    expect(slug).toBe("test-agent");
    expect(api_key).toMatch(/^[0-9a-f]{64}$/);
    expect(card.display_name).toBe("Test Agent");
    expect(card.api_key_hash).toBeUndefined();
    expect(card.contact_email).toBeUndefined();
    expect(card.is_freelancer).toBe(false);
  });

  test("returns 400 when display_name missing", async () => {
    const res = await route("POST", "/api/cards", { slug: "my-agent" });
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.message).toContain("display_name");
  });

  test("returns 400 when slug missing", async () => {
    const res = await route("POST", "/api/cards", { display_name: "Agent" });
    expect(res!.status).toBe(400);
  });

  test("returns 400 for invalid slug pattern (leading hyphen)", async () => {
    const res = await route("POST", "/api/cards", { slug: "-bad-slug", display_name: "Agent" });
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.message).toContain("slug");
  });

  test("returns 400 for slug that is too short", async () => {
    const res = await route("POST", "/api/cards", { slug: "ab", display_name: "Agent" });
    expect(res!.status).toBe(400);
  });

  test("returns 400 for reserved slug", async () => {
    const res = await route("POST", "/api/cards", { slug: "admin", display_name: "Agent" });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("reserved");
  });

  test("returns 409 for duplicate slug", async () => {
    await createCard();
    const res = await route("POST", "/api/cards", { slug: "test-agent", display_name: "Other" });
    expect(res!.status).toBe(409);
  });

  test("stores skills as JSON and returns parsed", async () => {
    const { card } = await createCard({ slug: "skilled-agent", skills: ["react", "node"] });
    expect(card.skills).toEqual(["react", "node"]);
  });

  test("creates a users row for marketplace bridge", async () => {
    const { card } = await createCard();
    const user = db.prepare("SELECT * FROM users WHERE user_token = ?").get(card.registration_id);
    expect(user).not.toBeNull();
  });

  test("is_freelancer flag works", async () => {
    const { card } = await createCard({ slug: "freelancer-a", is_freelancer: true });
    expect(card.is_freelancer).toBe(true);
  });
});

// ─── List Cards ──────────────────────────────────────────────────────

describe("GET /api/cards", () => {
  test("returns empty list initially", async () => {
    const res = await route("GET", "/api/cards");
    const data = await res!.json();
    expect(data.cards).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  test("lists created cards", async () => {
    await createCard({ slug: "agent-a" });
    await createCard({ slug: "agent-b" });
    const res = await route("GET", "/api/cards");
    const data = await res!.json();
    expect(data.cards).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
  });

  test("pagination works", async () => {
    await createCard({ slug: "agent-one" });
    await createCard({ slug: "agent-two" });
    const res = await route("GET", "/api/cards?page=1&limit=1");
    const data = await res!.json();
    expect(data.cards).toHaveLength(1);
    expect(data.pagination.pages).toBe(2);
  });

  test("filter by is_freelancer", async () => {
    await createCard({ slug: "freelancer-b", is_freelancer: true });
    await createCard({ slug: "not-freelancer" });
    const res = await route("GET", "/api/cards?is_freelancer=1");
    const data = await res!.json();
    expect(data.cards).toHaveLength(1);
    expect(data.cards[0].slug).toBe("freelancer-b");
  });

  test("filter by availability", async () => {
    await createCard({ slug: "available-agent", availability: "available" });
    await createCard({ slug: "busy-agent", availability: "busy" });
    const res = await route("GET", "/api/cards?availability=busy");
    const data = await res!.json();
    expect(data.cards).toHaveLength(1);
    expect(data.cards[0].slug).toBe("busy-agent");
  });

  test("strips private fields from list", async () => {
    await createCard();
    const res = await route("GET", "/api/cards");
    const data = await res!.json();
    expect(data.cards[0].api_key_hash).toBeUndefined();
    expect(data.cards[0].contact_email).toBeUndefined();
  });
});

// ─── Get Card ────────────────────────────────────────────────────────

describe("GET /api/cards/:slug", () => {
  test("returns card by slug", async () => {
    await createCard();
    const res = await route("GET", "/api/cards/test-agent");
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.slug).toBe("test-agent");
    expect(data.api_key_hash).toBeUndefined();
  });

  test("returns 404 for missing card", async () => {
    const res = await route("GET", "/api/cards/nonexistent");
    expect(res!.status).toBe(404);
  });
});

// ─── Update Card ─────────────────────────────────────────────────────

describe("PUT /api/cards/:slug", () => {
  test("updates card with valid api key", async () => {
    const { api_key } = await createCard();
    const res = await route("PUT", "/api/cards/test-agent", { tagline: "Updated!" }, api_key);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.tagline).toBe("Updated!");
  });

  test("returns 401 with wrong api key", async () => {
    await createCard();
    const res = await route("PUT", "/api/cards/test-agent", { tagline: "Hack" }, "wrong-key");
    expect(res!.status).toBe(401);
  });

  test("returns 401 with no auth", async () => {
    await createCard();
    const res = await route("PUT", "/api/cards/test-agent", { tagline: "Hack" });
    expect(res!.status).toBe(401);
  });

  test("returns 400 with no updatable fields", async () => {
    const { api_key } = await createCard();
    const res = await route("PUT", "/api/cards/test-agent", { slug: "newslug" }, api_key);
    expect(res!.status).toBe(400);
  });

  test("cannot change slug or id", async () => {
    const { api_key, card } = await createCard();
    await route("PUT", "/api/cards/test-agent", { slug: "new-slug", display_name: "Updated" }, api_key);
    const res = await route("GET", "/api/cards/test-agent");
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.id).toBe(card.id);
  });

  test("updates JSON fields like skills", async () => {
    const { api_key } = await createCard({ slug: "skill-agent" });
    const res = await route("PUT", "/api/cards/skill-agent", { skills: ["rust", "go"] }, api_key);
    const data = await res!.json();
    expect(data.skills).toEqual(["rust", "go"]);
  });
});

// ─── Delete Card ─────────────────────────────────────────────────────

describe("DELETE /api/cards/:slug", () => {
  test("soft-deletes card", async () => {
    const { api_key } = await createCard();
    const res = await route("DELETE", "/api/cards/test-agent", undefined, api_key);
    expect(res!.status).toBe(200);
    const getRes = await route("GET", "/api/cards/test-agent");
    expect(getRes!.status).toBe(404);
  });

  test("returns 401 without auth", async () => {
    await createCard();
    const res = await route("DELETE", "/api/cards/test-agent");
    expect(res!.status).toBe(401);
  });
});

// ─── Coordination Requests ────────────────────────────────────────────

describe("POST /api/cards/:slug/request", () => {
  test("creates coordination request", async () => {
    await createCard();
    const res = await route("POST", "/api/cards/test-agent/request", {
      intent: "collaborate",
      from_name: "Alice",
      message: "Let's work together",
      budget_cents: 10000,
    });
    expect(res!.status).toBe(201);
    const data = await res!.json();
    expect(data.request.intent).toBe("collaborate");
    expect(data.request.status).toBe("pending");
    expect(data.request.budget_cents).toBe(10000);
  });

  test("returns 400 without intent", async () => {
    await createCard();
    const res = await route("POST", "/api/cards/test-agent/request", { from_name: "Alice" });
    expect(res!.status).toBe(400);
  });

  test("returns 404 for missing card", async () => {
    const res = await route("POST", "/api/cards/ghost/request", { intent: "help" });
    expect(res!.status).toBe(404);
  });
});

describe("GET /api/cards/:slug/requests", () => {
  test("lists requests with valid auth", async () => {
    const { api_key } = await createCard();
    await route("POST", "/api/cards/test-agent/request", { intent: "request-1" });
    await route("POST", "/api/cards/test-agent/request", { intent: "request-2" });
    const res = await route("GET", "/api/cards/test-agent/requests", undefined, api_key);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.requests).toHaveLength(2);
  });

  test("returns 401 without auth", async () => {
    await createCard();
    const res = await route("GET", "/api/cards/test-agent/requests");
    expect(res!.status).toBe(401);
  });
});

describe("PUT /api/cards/:slug/requests/:id", () => {
  test("accepts a coordination request", async () => {
    const { api_key } = await createCard();
    const reqRes = await route("POST", "/api/cards/test-agent/request", { intent: "work together" });
    const { request } = await reqRes!.json();

    const res = await route(
      "PUT",
      `/api/cards/test-agent/requests/${request.id}`,
      { status: "accepted", response_message: "Sounds great!" },
      api_key,
    );
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.request.status).toBe("accepted");
    expect(data.request.response_message).toBe("Sounds great!");
  });

  test("declines a request", async () => {
    const { api_key } = await createCard();
    const reqRes = await route("POST", "/api/cards/test-agent/request", { intent: "work" });
    const { request } = await reqRes!.json();

    const res = await route(
      "PUT",
      `/api/cards/test-agent/requests/${request.id}`,
      { status: "declined" },
      api_key,
    );
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.request.status).toBe("declined");
  });

  test("returns 400 for invalid status", async () => {
    const { api_key } = await createCard();
    const reqRes = await route("POST", "/api/cards/test-agent/request", { intent: "work" });
    const { request } = await reqRes!.json();

    const res = await route(
      "PUT",
      `/api/cards/test-agent/requests/${request.id}`,
      { status: "hacked" },
      api_key,
    );
    expect(res!.status).toBe(400);
  });

  test("returns 404 for nonexistent request", async () => {
    const { api_key } = await createCard();
    const res = await route(
      "PUT",
      "/api/cards/test-agent/requests/nonexistent-id",
      { status: "accepted" },
      api_key,
    );
    expect(res!.status).toBe(404);
  });

  test("returns 401 without auth", async () => {
    const { } = await createCard();
    const res = await route("PUT", "/api/cards/test-agent/requests/some-id", { status: "accepted" });
    expect(res!.status).toBe(401);
  });
});

// ─── Slug Case Insensitivity ──────────────────────────────────────────

describe("slug case insensitivity", () => {
  test("GET with different case finds the card", async () => {
    await createCard({ slug: "my-agent" });
    const res = await route("GET", "/api/cards/MY-AGENT");
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.slug).toBe("my-agent");
  });

  test("PUT with different case authenticates correctly", async () => {
    const { api_key } = await createCard({ slug: "case-test" });
    const res = await route("PUT", "/api/cards/CASE-TEST", { tagline: "updated" }, api_key);
    expect(res!.status).toBe(200);
  });

  test("DELETE with different case works", async () => {
    const { api_key } = await createCard({ slug: "del-case" });
    const res = await route("DELETE", "/api/cards/DEL-CASE", undefined, api_key);
    expect(res!.status).toBe(200);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────

describe("edge cases", () => {
  test("coordination request to soft-deleted card returns 404", async () => {
    const { api_key } = await createCard({ slug: "deleted-card" });
    await route("DELETE", "/api/cards/deleted-card", undefined, api_key);
    const res = await route("POST", "/api/cards/deleted-card/request", { intent: "help" });
    expect(res!.status).toBe(404);
  });

  test("deleted slug gives clear conflict message on reuse attempt", async () => {
    const { api_key } = await createCard({ slug: "used-slug" });
    await route("DELETE", "/api/cards/used-slug", undefined, api_key);
    const res = await route("POST", "/api/cards", { slug: "used-slug", display_name: "New Card" });
    expect(res!.status).toBe(409);
    const data = await res!.json();
    expect(data.message).toContain("previously used");
  });

  test("skills filter with SQL LIKE wildcards doesn't over-match", async () => {
    await createCard({ slug: "go-dev", skills: ["go", "docker"] });
    await createCard({ slug: "golang-dev", skills: ["golang", "k8s"] });
    // Searching for exact "go" should match both (substring), but "%" shouldn't match everything
    const res = await route("GET", "/api/cards?skills=%25"); // URL-encoded %
    const data = await res!.json();
    expect(data.cards).toHaveLength(0); // % should be escaped, not treated as wildcard
  });

  test("auth returns 401 for deleted card (not confusing 500)", async () => {
    const { api_key } = await createCard({ slug: "ghost-card" });
    await route("DELETE", "/api/cards/ghost-card", undefined, api_key);
    const res = await route("PUT", "/api/cards/ghost-card", { tagline: "hack" }, api_key);
    expect(res!.status).toBe(401);
  });

  test("empty intent is rejected", async () => {
    await createCard({ slug: "intent-test" });
    const res = await route("POST", "/api/cards/intent-test/request", { intent: "   " });
    expect(res!.status).toBe(400);
  });

  test("very long display_name is rejected (now validates max 100)", async () => {
    const longName = "A".repeat(500);
    const res = await route("POST", "/api/cards", { slug: "long-name", display_name: longName });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("display_name");
  });
});

// ─── card_type field ─────────────────────────────────────────────────

describe("card_type field", () => {
  test("create card with card_type", async () => {
    const { card } = await createCard({ slug: "typed-agent", card_type: "agent" });
    expect(card.card_type).toBe("agent");
  });

  test("create card with human type", async () => {
    const { card } = await createCard({ slug: "typed-human", card_type: "human" });
    expect(card.card_type).toBe("human");
  });

  test("update card_type", async () => {
    const { api_key } = await createCard({ slug: "update-type", card_type: "agent" });
    const res = await route("PUT", "/api/cards/update-type", { card_type: "team" }, api_key);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.card_type).toBe("team");
  });

  test("card_type defaults to null if not set", async () => {
    const { card } = await createCard({ slug: "no-type" });
    expect(card.card_type == null).toBe(true);
  });

  test("verified is not settable via create", async () => {
    const { card } = await createCard({ slug: "verify-test", verified: 1 });
    // verified should be 0 (not settable via create)
    expect(card.verified).toBeFalsy();
  });
});

// ─── Field length validation ──────────────────────────────────────────

describe("field length validation", () => {
  test("display_name at exactly 100 chars is accepted", async () => {
    const name = "A".repeat(100);
    const res = await route("POST", "/api/cards", { slug: "exact-100", display_name: name });
    expect(res!.status).toBe(201);
  });

  test("display_name at 101 chars is rejected", async () => {
    const name = "A".repeat(101);
    const res = await route("POST", "/api/cards", { slug: "too-long-name", display_name: name });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("display_name");
  });

  test("tagline at 200 chars is accepted", async () => {
    const res = await route("POST", "/api/cards", { slug: "tagline-ok", display_name: "X", tagline: "T".repeat(200) });
    expect(res!.status).toBe(201);
  });

  test("tagline at 201 chars is rejected", async () => {
    const res = await route("POST", "/api/cards", { slug: "tagline-bad", display_name: "X", tagline: "T".repeat(201) });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("tagline");
  });

  test("bio at 1000 chars is accepted", async () => {
    const res = await route("POST", "/api/cards", { slug: "bio-ok", display_name: "X", bio: "B".repeat(1000) });
    expect(res!.status).toBe(201);
  });

  test("bio at 1001 chars is rejected", async () => {
    const res = await route("POST", "/api/cards", { slug: "bio-bad", display_name: "X", bio: "B".repeat(1001) });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("bio");
  });

  test("skills with 20 items is accepted", async () => {
    const skills = Array.from({ length: 20 }, (_, i) => `skill-${i}`);
    const res = await route("POST", "/api/cards", { slug: "skills-ok", display_name: "X", skills });
    expect(res!.status).toBe(201);
  });

  test("skills with 21 items is rejected", async () => {
    const skills = Array.from({ length: 21 }, (_, i) => `skill-${i}`);
    const res = await route("POST", "/api/cards", { slug: "skills-bad", display_name: "X", skills });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("skills");
  });

  test("skill item over 50 chars is rejected", async () => {
    const res = await route("POST", "/api/cards", { slug: "long-skill", display_name: "X", skills: ["s".repeat(51)] });
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("skill");
  });

  test("PUT also validates tagline length", async () => {
    const { api_key } = await createCard({ slug: "put-validate" });
    const res = await route("PUT", "/api/cards/put-validate", { tagline: "T".repeat(201) }, api_key);
    expect(res!.status).toBe(400);
    expect((await res!.json()).message).toContain("tagline");
  });

  test("PUT validates skills count", async () => {
    const { api_key } = await createCard({ slug: "put-skills-bad" });
    const skills = Array.from({ length: 21 }, (_, i) => `skill-${i}`);
    const res = await route("PUT", "/api/cards/put-skills-bad", { skills }, api_key);
    expect(res!.status).toBe(400);
  });
});

// ─── Rotate Key ───────────────────────────────────────────────────────

describe("POST /api/cards/:slug/rotate-key", () => {
  test("rotates key and returns new key", async () => {
    const { api_key } = await createCard({ slug: "rotate-card" });
    const res = await route("POST", "/api/cards/rotate-card/rotate-key", undefined, api_key);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.api_key).toBeDefined();
    expect(data.api_key).toMatch(/^[0-9a-f]{64}$/);
    expect(data.api_key).not.toBe(api_key);
  });

  test("old key no longer works after rotation", async () => {
    const { api_key } = await createCard({ slug: "rotate-invalidate" });
    await route("POST", "/api/cards/rotate-invalidate/rotate-key", undefined, api_key);
    // Old key should no longer authenticate
    const res = await route("PUT", "/api/cards/rotate-invalidate", { tagline: "hack" }, api_key);
    expect(res!.status).toBe(401);
  });

  test("new key works after rotation", async () => {
    const { api_key } = await createCard({ slug: "rotate-works" });
    const rotateRes = await route("POST", "/api/cards/rotate-works/rotate-key", undefined, api_key);
    const { api_key: newKey } = await rotateRes!.json();
    const res = await route("PUT", "/api/cards/rotate-works", { tagline: "updated" }, newKey);
    expect(res!.status).toBe(200);
  });

  test("returns 401 without auth", async () => {
    await createCard({ slug: "rotate-noauth" });
    const res = await route("POST", "/api/cards/rotate-noauth/rotate-key");
    expect(res!.status).toBe(401);
  });

  test("returns 401 with wrong key", async () => {
    await createCard({ slug: "rotate-wrongkey" });
    const res = await route("POST", "/api/cards/rotate-wrongkey/rotate-key", undefined, "bad-key");
    expect(res!.status).toBe(401);
  });
});

// ─── Reserved slug rejection (extended) ──────────────────────────────

describe("reserved slugs — AI companies", () => {
  const aiReserved = ["anthropic", "openai", "google", "microsoft", "meta", "amazon", "apple", "nvidia", "deepmind", "mistral", "cohere", "huggingface"];

  for (const slug of aiReserved) {
    test(`rejects reserved slug: ${slug}`, async () => {
      const res = await route("POST", "/api/cards", { slug, display_name: "Test" });
      expect(res!.status).toBe(400);
      expect((await res!.json()).message).toContain("reserved");
    });
  }
});

// ─── Route non-match ─────────────────────────────────────────────────

describe("route non-match", () => {
  test("returns null for non-cards path", async () => {
    const req = makeReq("GET", "/not-cards");
    const url = new URL(req.url);
    const res = await handleCardsRoute(req, url, ctx, corsHeaders);
    expect(res).toBeNull();
  });
});
