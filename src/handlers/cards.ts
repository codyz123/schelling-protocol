import { randomUUID } from "node:crypto";
import type { HandlerContext } from "../types.js";
import type { DatabaseConnection } from "../db/interface.js";

// ─── Constants ───────────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

const RESERVED_SLUGS = new Set([
  "admin", "api", "create", "directory", "freelance",
  "dashboard", "settings", "health", "status", "docs", "demo",
  "anthropic", "openai", "google", "microsoft", "meta", "amazon",
  "apple", "nvidia", "deepmind", "mistral", "cohere", "huggingface",
]);

// Cluster used for card-backed user rows (no real cluster row needed — no FK constraint)
const CARDS_CLUSTER = "agent.cards";

// ─── Table Init ──────────────────────────────────────────────────────

export function initAgentCardsTables(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_cards (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      registration_id TEXT,
      display_name TEXT NOT NULL,
      tagline TEXT,
      bio TEXT,
      offers TEXT,
      needs TEXT,
      skills TEXT,
      hourly_rate_min_cents INTEGER,
      hourly_rate_max_cents INTEGER,
      availability TEXT DEFAULT 'available',
      timezone TEXT,
      contact_email TEXT,
      website TEXT,
      avatar_url TEXT,
      social_links TEXT,
      preferences TEXT,
      api_key_hash TEXT NOT NULL,
      is_freelancer INTEGER DEFAULT 0,
      webhook_url TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_cards_slug ON agent_cards(slug);
    CREATE INDEX IF NOT EXISTS idx_agent_cards_freelancer ON agent_cards(is_freelancer) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS coordination_requests (
      id TEXT PRIMARY KEY,
      target_card_slug TEXT NOT NULL REFERENCES agent_cards(slug),
      from_name TEXT,
      from_email TEXT,
      from_card_slug TEXT,
      intent TEXT NOT NULL,
      message TEXT,
      budget_cents INTEGER,
      status TEXT DEFAULT 'pending',
      response_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_coord_requests_target ON coordination_requests(target_card_slug);
  `);
  // Add new columns for existing DBs (idempotent — ALTER TABLE fails if column already exists)
  for (const stmt of [
    "ALTER TABLE agent_cards ADD COLUMN card_type TEXT",
    "ALTER TABLE agent_cards ADD COLUMN verified INTEGER DEFAULT 0",
  ]) {
    try { db.exec(stmt); } catch { /* column already exists */ }
  }
}

// ─── Auth Helper ─────────────────────────────────────────────────────

// Dummy hash for constant-time comparison when card doesn't exist (prevents timing-based slug enumeration)
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$0000000000000000$0000000000000000000000000000000000000000000";

async function authenticateCard(
  db: DatabaseConnection,
  slug: string,
  authHeader: string | null,
): Promise<Record<string, any> | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const card = db.prepare(
    "SELECT * FROM agent_cards WHERE slug = ? AND deleted_at IS NULL",
  ).get(slug) as Record<string, any> | undefined;
  // Always run verify to prevent timing-based slug enumeration
  const hashToCheck = card?.api_key_hash ?? DUMMY_HASH;
  const valid = await Bun.password.verify(token, hashToCheck).catch(() => false);
  return valid && card ? card : null;
}

// ─── Response Helpers ────────────────────────────────────────────────

function publicCard(card: Record<string, any>): Record<string, any> {
  const { api_key_hash, contact_email, webhook_url, ...pub } = card;
  for (const field of ["offers", "needs", "skills", "social_links", "preferences"]) {
    if (typeof pub[field] === "string") {
      try { pub[field] = JSON.parse(pub[field]); } catch { /* leave as-is */ }
    }
  }
  pub.is_freelancer = pub.is_freelancer === 1 || pub.is_freelancer === true;
  return pub;
}

// ─── Route Handler ───────────────────────────────────────────────────

export async function handleCardsRoute(
  req: Request,
  url: URL,
  ctx: HandlerContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const method = req.method;
  const path = url.pathname;

  if (!path.startsWith("/api/cards")) return null;

  const json = (data: unknown, status = 200): Response =>
    Response.json(data, { status, headers: corsHeaders });

  const err = (message: string, status = 400, code = "INVALID_INPUT"): Response =>
    Response.json({ code, message }, { status, headers: corsHeaders });

  // Parse /api/cards[/:slug[/(request|requests|rotate-key)[/:reqId]]]
  const match = path.match(
    /^\/api\/cards(?:\/([^/]+)(?:\/(request|requests|rotate-key)(?:\/([^/]+))?)?)?$/,
  );
  if (!match) return null;

  // Normalize slug to lowercase (DB stores lowercase, URLs should be case-insensitive)
  const [, rawSlugFromUrl, subpath, reqId] = match;
  const slug = rawSlugFromUrl?.toLowerCase();

  // ── POST /api/cards — Create card ────────────────────────────────
  if (method === "POST" && !slug) {
    let body: any;
    try { body = await req.json(); } catch { return err("Invalid JSON body"); }

    const displayName = body.display_name?.trim();
    if (!displayName) return err("display_name is required");

    const rawSlug = body.slug?.trim();
    if (!rawSlug) return err("slug is required");

    const normalizedSlug = String(rawSlug).toLowerCase();
    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return err(
        "slug must be 3-30 characters: lowercase letters, digits, and hyphens only, no leading/trailing hyphens",
      );
    }
    if (RESERVED_SLUGS.has(normalizedSlug)) {
      return err(`slug "${normalizedSlug}" is reserved`);
    }

    // Field length validation
    if (displayName.length > 100) return err("display_name must be 100 characters or less");
    if (body.tagline && body.tagline.length > 200) return err("tagline must be 200 characters or less");
    if (body.bio && body.bio.length > 1000) return err("bio must be 1000 characters or less");
    if (body.skills != null) {
      const skillsArr = Array.isArray(body.skills) ? body.skills : [];
      if (skillsArr.length > 20) return err("skills must have 20 or fewer items");
      for (const s of skillsArr) {
        if (typeof s === "string" && s.length > 50) return err("each skill must be 50 characters or less");
      }
    }

    // Check both live and soft-deleted cards — slug is globally unique (column constraint)
    const existing = ctx.db
      .prepare("SELECT id, deleted_at FROM agent_cards WHERE slug = ?")
      .get(normalizedSlug) as { id: string; deleted_at: string | null } | undefined;
    if (existing) {
      const msg = existing.deleted_at
        ? `slug "${normalizedSlug}" was previously used and is not available for reuse`
        : `slug "${normalizedSlug}" is already taken`;
      return err(msg, 409, "CONFLICT");
    }

    // Generate API key: 32 random bytes as hex
    const apiKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
    const apiKeyHash = await Bun.password.hash(apiKey);
    const id = randomUUID();
    const userToken = randomUUID();

    const run = ctx.db.transaction(() => {
      // Bridge: create users row so marketplace tools can use this card's identity
      ctx.db.prepare(
        `INSERT INTO users (user_token, cluster_id, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`,
      ).run(userToken, CARDS_CLUSTER);

      ctx.db.prepare(`
        INSERT INTO agent_cards (
          id, slug, registration_id, display_name, tagline, bio,
          offers, needs, skills,
          hourly_rate_min_cents, hourly_rate_max_cents,
          availability, timezone, contact_email, website, avatar_url,
          social_links, preferences, api_key_hash, is_freelancer, webhook_url,
          card_type,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?,
          datetime('now'), datetime('now')
        )
      `).run(
        id, normalizedSlug, userToken, displayName,
        body.tagline ?? null, body.bio ?? null,
        body.offers != null ? JSON.stringify(body.offers) : null,
        body.needs != null ? JSON.stringify(body.needs) : null,
        body.skills != null ? JSON.stringify(body.skills) : null,
        body.hourly_rate_min_cents ?? null,
        body.hourly_rate_max_cents ?? null,
        body.availability ?? "available",
        body.timezone ?? null,
        body.contact_email ?? null,
        body.website ?? null,
        body.avatar_url ?? null,
        body.social_links != null ? JSON.stringify(body.social_links) : null,
        body.preferences != null ? JSON.stringify(body.preferences) : null,
        apiKeyHash,
        body.is_freelancer ? 1 : 0,
        body.webhook_url ?? null,
        body.card_type ?? null,
      );
    });

    try {
      run();
    } catch (e: any) {
      return err(e.message, 500, "INTERNAL_ERROR");
    }

    const card = ctx.db
      .prepare("SELECT * FROM agent_cards WHERE id = ?")
      .get(id) as Record<string, any>;
    return json({ slug: normalizedSlug, api_key: apiKey, card: publicCard(card) }, 201);
  }

  // ── GET /api/cards — List cards ──────────────────────────────────
  if (method === "GET" && !slug) {
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["deleted_at IS NULL"];
    const params: any[] = [];

    const freelancerParam = url.searchParams.get("is_freelancer");
    if (freelancerParam !== null) {
      conditions.push("is_freelancer = ?");
      params.push(freelancerParam === "1" ? 1 : 0);
    }

    const availabilityParam = url.searchParams.get("availability");
    if (availabilityParam) {
      conditions.push("availability = ?");
      params.push(availabilityParam);
    }

    const skillsParam = url.searchParams.get("skills");
    if (skillsParam) {
      for (const skill of skillsParam.split(",").map(s => s.trim()).filter(Boolean)) {
        // Escape LIKE wildcards to prevent unintended matches
        const escaped = skill.replace(/[%_]/g, "\\$&");
        conditions.push("skills LIKE ? ESCAPE '\\'");
        params.push(`%${escaped}%`);
      }
    }

    const where = conditions.join(" AND ");
    const baseQuery = `SELECT * FROM agent_cards WHERE ${where}`;
    const countQuery = `SELECT COUNT(*) as c FROM agent_cards WHERE ${where}`;

    const cards = ctx.db
      .prepare(`${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, any>[];
    const total = (ctx.db.prepare(countQuery).get(...params) as any)?.c ?? 0;

    return json({
      cards: cards.map(publicCard),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }

  // Remaining routes all need a slug
  if (!slug) return null;

  // ── GET /api/cards/:slug — Get card ──────────────────────────────
  if (method === "GET" && !subpath) {
    const card = ctx.db
      .prepare("SELECT * FROM agent_cards WHERE slug = ? AND deleted_at IS NULL")
      .get(slug) as Record<string, any> | undefined;
    if (!card) return err(`Card "${slug}" not found`, 404, "NOT_FOUND");
    return json(publicCard(card));
  }

  // ── PUT /api/cards/:slug — Update card ───────────────────────────
  if (method === "PUT" && !subpath) {
    const authed = await authenticateCard(ctx.db, slug, req.headers.get("Authorization"));
    if (!authed) return err("Unauthorized", 401, "UNAUTHORIZED");

    let body: any;
    try { body = await req.json(); } catch { return err("Invalid JSON body"); }

    // Field length validation
    if (body.display_name && body.display_name.length > 100) return err("display_name must be 100 characters or less");
    if (body.tagline && body.tagline.length > 200) return err("tagline must be 200 characters or less");
    if (body.bio && body.bio.length > 1000) return err("bio must be 1000 characters or less");
    if (body.skills != null) {
      const skillsArr = Array.isArray(body.skills) ? body.skills : [];
      if (skillsArr.length > 20) return err("skills must have 20 or fewer items");
      for (const s of skillsArr) {
        if (typeof s === "string" && s.length > 50) return err("each skill must be 50 characters or less");
      }
    }

    const UPDATABLE_SCALAR = new Set([
      "display_name", "tagline", "bio", "availability", "timezone",
      "contact_email", "website", "avatar_url", "is_freelancer", "webhook_url",
      "hourly_rate_min_cents", "hourly_rate_max_cents", "card_type",
    ]);
    const UPDATABLE_JSON = new Set(["offers", "needs", "skills", "social_links", "preferences"]);
    // Strip immutable fields
    const { slug: _s, id: _i, api_key_hash: _k, registration_id: _r, created_at: _c, deleted_at: _d, ...updates } = body;

    const fields: string[] = [];
    const vals: any[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (UPDATABLE_SCALAR.has(key)) {
        fields.push(`${key} = ?`);
        vals.push(key === "is_freelancer" ? (val ? 1 : 0) : val);
      } else if (UPDATABLE_JSON.has(key)) {
        fields.push(`${key} = ?`);
        vals.push(val != null ? JSON.stringify(val) : null);
      }
    }

    if (fields.length === 0) return err("No updatable fields provided");

    fields.push("updated_at = datetime('now')");
    vals.push(slug);

    ctx.db
      .prepare(`UPDATE agent_cards SET ${fields.join(", ")} WHERE slug = ?`)
      .run(...vals);

    const updated = ctx.db
      .prepare("SELECT * FROM agent_cards WHERE slug = ?")
      .get(slug) as Record<string, any>;
    return json(publicCard(updated));
  }

  // ── DELETE /api/cards/:slug — Soft delete ────────────────────────
  if (method === "DELETE" && !subpath) {
    const authed = await authenticateCard(ctx.db, slug, req.headers.get("Authorization"));
    if (!authed) return err("Unauthorized", 401, "UNAUTHORIZED");

    ctx.db.prepare(
      "UPDATE agent_cards SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE slug = ?",
    ).run(slug);

    return json({ ok: true, message: `Card "${slug}" deleted` });
  }

  // ── POST /api/cards/:slug/request — Create coordination request ──
  if (method === "POST" && subpath === "request") {
    const card = ctx.db
      .prepare("SELECT id FROM agent_cards WHERE slug = ? AND deleted_at IS NULL")
      .get(slug);
    if (!card) return err(`Card "${slug}" not found`, 404, "NOT_FOUND");

    let body: any;
    try { body = await req.json(); } catch { return err("Invalid JSON body"); }

    if (!body.intent?.trim()) return err("intent is required");

    const requestId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO coordination_requests (
        id, target_card_slug, from_name, from_email, from_card_slug,
        intent, message, budget_cents, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).run(
      requestId, slug,
      body.from_name ?? null,
      body.from_email ?? null,
      body.from_card_slug ?? null,
      body.intent.trim(),
      body.message ?? null,
      body.budget_cents ?? null,
    );

    const request = ctx.db
      .prepare("SELECT * FROM coordination_requests WHERE id = ?")
      .get(requestId);
    return json({ request }, 201);
  }

  // ── GET /api/cards/:slug/requests — List requests ────────────────
  if (method === "GET" && subpath === "requests") {
    const authed = await authenticateCard(ctx.db, slug, req.headers.get("Authorization"));
    if (!authed) return err("Unauthorized", 401, "UNAUTHORIZED");

    const requests = ctx.db
      .prepare(
        "SELECT * FROM coordination_requests WHERE target_card_slug = ? ORDER BY created_at DESC",
      )
      .all(slug);
    return json({ requests });
  }

  // ── POST /api/cards/:slug/rotate-key — Rotate API key ───────────
  if (method === "POST" && subpath === "rotate-key") {
    const authed = await authenticateCard(ctx.db, slug, req.headers.get("Authorization"));
    if (!authed) return err("Unauthorized", 401, "UNAUTHORIZED");

    const newApiKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
    const newApiKeyHash = await Bun.password.hash(newApiKey);

    ctx.db.prepare(
      "UPDATE agent_cards SET api_key_hash = ?, updated_at = datetime('now') WHERE slug = ?",
    ).run(newApiKeyHash, slug);

    return json({ api_key: newApiKey });
  }

  // ── PUT /api/cards/:slug/requests/:id — Update request status ────
  if (method === "PUT" && subpath === "requests" && reqId) {
    const authed = await authenticateCard(ctx.db, slug, req.headers.get("Authorization"));
    if (!authed) return err("Unauthorized", 401, "UNAUTHORIZED");

    const request = ctx.db
      .prepare("SELECT * FROM coordination_requests WHERE id = ? AND target_card_slug = ?")
      .get(reqId, slug);
    if (!request) return err("Request not found", 404, "NOT_FOUND");

    let body: any;
    try { body = await req.json(); } catch { return err("Invalid JSON body"); }

    const validStatuses = ["accepted", "declined"];
    if (!body.status || !validStatuses.includes(body.status)) {
      return err(`status must be one of: ${validStatuses.join(", ")}`);
    }

    ctx.db.prepare(`
      UPDATE coordination_requests
      SET status = ?, response_message = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(body.status, body.response_message ?? null, reqId);

    const updated = ctx.db
      .prepare("SELECT * FROM coordination_requests WHERE id = ?")
      .get(reqId);
    return json({ request: updated });
  }

  return null;
}
