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

// ─── Route non-match ─────────────────────────────────────────────────

describe("route non-match", () => {
  test("returns null for non-cards path", async () => {
    const req = makeReq("GET", "/not-cards");
    const url = new URL(req.url);
    const res = await handleCardsRoute(req, url, ctx, corsHeaders);
    expect(res).toBeNull();
  });
});
