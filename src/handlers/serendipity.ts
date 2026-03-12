import { randomUUID } from "node:crypto";
import type { HandlerContext } from "../types.js";
import type { DatabaseConnection } from "../db/interface.js";
import { authenticateBySlug } from "./auth.js";

// ─── Types ────────────────────────────────────────────────────────────

interface SignalRecord {
  id: string;
  card_id: string;
  needs: string;
  offers: string;
  interests: string;
  personality: string;
  context: string;
  needs_embedding: Buffer;
  offers_embedding: Buffer;
  profile_embedding: Buffer;
  summary: string;
  cadence: string;
  created_at: string;
  expires_at: string;
}

// ─── Table Init ───────────────────────────────────────────────────────

export function initSerendipityTables(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS serendipity_signals (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      needs TEXT,
      offers TEXT,
      interests TEXT,
      personality TEXT,
      context TEXT,
      needs_embedding BLOB,
      offers_embedding BLOB,
      profile_embedding BLOB,
      summary TEXT,
      cadence TEXT DEFAULT 'daily',
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES agent_cards(id)
    );
    CREATE INDEX IF NOT EXISTS idx_serendipity_signals_card ON serendipity_signals(card_id);
    CREATE INDEX IF NOT EXISTS idx_serendipity_signals_expires ON serendipity_signals(expires_at);

    CREATE TABLE IF NOT EXISTS serendipity_matches (
      id TEXT PRIMARY KEY,
      signal_a_id TEXT NOT NULL,
      signal_b_id TEXT NOT NULL,
      card_a_id TEXT NOT NULL,
      card_b_id TEXT NOT NULL,
      score REAL NOT NULL,
      score_breakdown TEXT,
      match_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      a_opted_in INTEGER DEFAULT 0,
      b_opted_in INTEGER DEFAULT 0,
      revealed_at TEXT,
      rejected_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_serendipity_matches_status ON serendipity_matches(status);
    CREATE INDEX IF NOT EXISTS idx_serendipity_matches_card_a ON serendipity_matches(card_a_id);
    CREATE INDEX IF NOT EXISTS idx_serendipity_matches_card_b ON serendipity_matches(card_b_id);

    CREATE TABLE IF NOT EXISTS serendipity_rejections (
      card_a_id TEXT NOT NULL,
      card_b_id TEXT NOT NULL,
      rejected_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (card_a_id, card_b_id)
    );
  `);
}

// ─── Embedding Helpers ────────────────────────────────────────────────

export function embedToBlob(embedding: number[]): Buffer {
  const buf = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buf.writeFloatLE(embedding[i], i * 4);
  }
  return buf;
}

export function blobToEmbed(blob: Buffer | Uint8Array): number[] {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const result: number[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    result.push(buf.readFloatLE(i));
  }
  return result;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Matching Engine ──────────────────────────────────────────────────

export function runMatching(db: DatabaseConnection, newSignal: SignalRecord): void {
  // Rate limit: max 3 active matches per card per TTL
  const existingCount = (db.prepare(`
    SELECT COUNT(*) as c FROM serendipity_matches
    WHERE (card_a_id = ? OR card_b_id = ?)
    AND status IN ('pending', 'revealed')
  `).get(newSignal.card_id, newSignal.card_id) as { c: number }).c;

  const maxNewMatches = Math.max(0, 3 - existingCount);
  if (maxNewMatches === 0) return;

  // Load all non-expired signals (excluding self)
  const allSignals = db.prepare(`
    SELECT * FROM serendipity_signals
    WHERE expires_at > datetime('now')
    AND card_id != ?
  `).all(newSignal.card_id) as SignalRecord[];

  // Check rejection history — skip previously rejected pairs
  const rejections = new Set<string>();
  const rejRows = db.prepare(`
    SELECT card_b_id as other_card_id FROM serendipity_rejections WHERE card_a_id = ?
    UNION
    SELECT card_a_id as other_card_id FROM serendipity_rejections WHERE card_b_id = ?
  `).all(newSignal.card_id, newSignal.card_id) as Array<{ other_card_id: string }>;
  for (const r of rejRows) {
    rejections.add(r.other_card_id);
  }

  // Check existing active matches — don't duplicate
  const activeMatches = new Set<string>();
  const activeRows = db.prepare(`
    SELECT card_a_id, card_b_id FROM serendipity_matches
    WHERE (card_a_id = ? OR card_b_id = ?)
    AND status IN ('pending', 'revealed')
  `).all(newSignal.card_id, newSignal.card_id) as Array<{ card_a_id: string; card_b_id: string }>;
  for (const m of activeRows) {
    activeMatches.add(m.card_a_id === newSignal.card_id ? m.card_b_id : m.card_a_id);
  }

  const newNeedsEmb = blobToEmbed(newSignal.needs_embedding);
  const newOffersEmb = blobToEmbed(newSignal.offers_embedding);
  const newProfileEmb = blobToEmbed(newSignal.profile_embedding);
  const newInterests = JSON.parse(newSignal.interests || "[]") as string[];
  const newContext = JSON.parse(newSignal.context || "{}");

  const candidates: Array<{
    signal: SignalRecord;
    score: number;
    breakdown: Record<string, number>;
    matchType: string;
  }> = [];

  for (const other of allSignals) {
    if (rejections.has(other.card_id)) continue;
    if (activeMatches.has(other.card_id)) continue;

    const otherNeedsEmb = blobToEmbed(other.needs_embedding);
    const otherOffersEmb = blobToEmbed(other.offers_embedding);
    const otherProfileEmb = blobToEmbed(other.profile_embedding);
    const otherInterests = JSON.parse(other.interests || "[]") as string[];
    const otherContext = JSON.parse(other.context || "{}");

    // Cross-match: my needs↔their offers, their needs↔my offers
    const myNeedsTheirOffers = cosineSimilarity(newNeedsEmb, otherOffersEmb);
    const theirNeedsMyOffers = cosineSimilarity(otherNeedsEmb, newOffersEmb);
    const complementarity = (myNeedsTheirOffers + theirNeedsMyOffers) / 2;

    // Interest overlap: Jaccard on tags + cosine on profile embeddings
    const allInterests = new Set([...newInterests, ...otherInterests]);
    const interIntersect = newInterests.filter(i => otherInterests.includes(i)).length;
    const jaccardInterest = allInterests.size > 0 ? interIntersect / allInterests.size : 0;
    const profileSim = cosineSimilarity(newProfileEmb, otherProfileEmb);
    const interestScore = (jaccardInterest + profileSim) / 2;

    // Context compatibility
    let contextScore = 0.5; // base
    if (newContext.timezone && otherContext.timezone &&
        newContext.timezone === otherContext.timezone) {
      contextScore += 0.25;
    }
    if (newContext.location && otherContext.location &&
        newContext.location.split(",")[0] === otherContext.location.split(",")[0]) {
      contextScore += 0.25;
    }
    contextScore = Math.min(contextScore, 1.0);

    // Serendipity bonus: high scores across multiple unrelated dimensions
    const serendipityBonus = (complementarity > 0.3 && interestScore > 0.3) ? 0.10 : 0;

    // Composite score
    const composite =
      complementarity * 0.40 +
      interestScore * 0.20 +
      profileSim * 0.15 +
      contextScore * 0.15 +
      serendipityBonus;

    // Match type classification
    let matchType = "complementary";
    if (complementarity > 0.5) matchType = "need_offer";
    else if (interestScore > 0.6 && complementarity < 0.3) matchType = "interest";
    else if (composite > 0.5 && complementarity < 0.4 && interestScore < 0.4) matchType = "serendipity";

    if (composite >= 0.45) {
      candidates.push({
        signal: other,
        score: composite,
        breakdown: { complementarity, interest: interestScore, similarity: profileSim, context: contextScore, serendipity: serendipityBonus },
        matchType,
      });
    }
  }

  // Take top N candidates (respecting rate limit)
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, maxNewMatches);

  // Create match records (14-day expiration)
  for (const candidate of topCandidates) {
    const matchId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    db.prepare(`
      INSERT INTO serendipity_matches
      (id, signal_a_id, signal_b_id, card_a_id, card_b_id, score, score_breakdown, match_type, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      matchId,
      newSignal.id,
      candidate.signal.id,
      newSignal.card_id,
      candidate.signal.card_id,
      candidate.score,
      JSON.stringify(candidate.breakdown),
      candidate.matchType,
      expiresAt.toISOString().replace("T", " ").slice(0, 19),
    );
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────

export function cleanupExpiredSerendipity(db: DatabaseConnection): void {
  // Remove signals for soft-deleted cards
  db.prepare(`
    DELETE FROM serendipity_signals
    WHERE card_id IN (SELECT id FROM agent_cards WHERE deleted_at IS NOT NULL)
  `).run();

  // Delete expired signals
  db.prepare(`DELETE FROM serendipity_signals WHERE expires_at < datetime('now')`).run();

  // Expire unanswered matches
  db.prepare(`
    UPDATE serendipity_matches
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < datetime('now')
  `).run();
}

// ─── Response Formatters ──────────────────────────────────────────────

function formatSignal(signal: SignalRecord): Record<string, any> {
  return {
    id: signal.id,
    card_id: signal.card_id,
    needs: tryParse(signal.needs, []),
    offers: tryParse(signal.offers, []),
    interests: tryParse(signal.interests, []),
    personality: tryParse(signal.personality, {}),
    context: tryParse(signal.context, {}),
    needs_embedding: blobToEmbed(signal.needs_embedding),
    offers_embedding: blobToEmbed(signal.offers_embedding),
    profile_embedding: blobToEmbed(signal.profile_embedding),
    summary: signal.summary,
    cadence: signal.cadence,
    created_at: signal.created_at,
    expires_at: signal.expires_at,
  };
}

function tryParse(val: string | null | undefined, fallback: any): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function formatMatchForCard(
  match: Record<string, any>,
  cardId: string,
  db: DatabaseConnection,
): Record<string, any> {
  const yourSide = match.card_a_id === cardId ? "a" : "b";
  const otherCardId = yourSide === "a" ? match.card_b_id : match.card_a_id;
  const otherSignalId = yourSide === "a" ? match.signal_b_id : match.signal_a_id;

  const otherSignal = db.prepare(
    "SELECT * FROM serendipity_signals WHERE id = ?",
  ).get(otherSignalId) as SignalRecord | undefined;

  const result: Record<string, any> = {
    id: match.id,
    score: match.score,
    score_breakdown: tryParse(match.score_breakdown, {}),
    match_type: match.match_type,
    status: match.status,
    created_at: match.created_at,
    expires_at: match.expires_at,
    your_side: yourSide,
    you_opted_in: yourSide === "a" ? match.a_opted_in === 1 : match.b_opted_in === 1,
    other_opted_in: yourSide === "a" ? match.b_opted_in === 1 : match.a_opted_in === 1,
  };

  if (otherSignal) {
    // Return other side's dimensions WITHOUT their card_id (privacy-preserving)
    result.other_signal = {
      needs: tryParse(otherSignal.needs, []),
      offers: tryParse(otherSignal.offers, []),
      interests: tryParse(otherSignal.interests, []),
      personality: tryParse(otherSignal.personality, {}),
      context: tryParse(otherSignal.context, {}),
      summary: otherSignal.summary,
    };
  }

  // Only reveal identity if both sides opted in
  if (match.status === "revealed") {
    const otherCard = db.prepare(
      "SELECT slug FROM agent_cards WHERE id = ?",
    ).get(otherCardId) as { slug: string } | undefined;
    if (otherCard) {
      result.revealed_card_slug = otherCard.slug;
      result.revealed_card_url = `https://schellingprotocol.com/cards/${otherCard.slug}`;
      result.revealed_at = match.revealed_at;
    }
  }

  return result;
}

// ─── Route Handler ────────────────────────────────────────────────────

export async function handleSerendipityRoute(
  req: Request,
  url: URL,
  ctx: HandlerContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const method = req.method;
  const path = url.pathname;

  if (!path.startsWith("/api/serendipity")) return null;

  const json = (data: unknown, status = 200): Response =>
    Response.json(data, { status, headers: corsHeaders });

  const err = (message: string, status = 400, code = "INVALID_INPUT"): Response =>
    Response.json({ code, message }, { status, headers: corsHeaders });

  // Auth helper: requires ?card=slug query param + Bearer token
  const requireAuth = async (): Promise<Record<string, any> | null> => {
    const cardSlug = url.searchParams.get("card");
    if (!cardSlug) return null;
    return authenticateBySlug(ctx.db, cardSlug, req.headers.get("Authorization"));
  };

  // ── Signal routes: /api/serendipity/signals/:id ───────────────────
  const signalMatch = path.match(/^\/api\/serendipity\/signals\/([^/]+)$/);

  if (signalMatch) {
    const signalId = signalMatch[1];

    // GET /api/serendipity/signals/mine — get your current signal
    if (method === "GET" && signalId === "mine") {
      const card = await requireAuth();
      if (!card) return err("Unauthorized", 401, "UNAUTHORIZED");

      const signal = ctx.db.prepare(
        "SELECT * FROM serendipity_signals WHERE card_id = ?",
      ).get(card.id) as SignalRecord | undefined;

      if (!signal) return err("No active signal found", 404, "NOT_FOUND");
      return json(formatSignal(signal));
    }

    // PUT /api/serendipity/signals/:id — publish or update signal
    if (method === "PUT") {
      const card = await requireAuth();
      if (!card) return err("Unauthorized", 401, "UNAUTHORIZED");

      // Guard against oversized payloads (256-dim embeddings × 3 + metadata ≈ 50KB max)
      const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
      if (contentLength > 100_000) {
        return err("Request body too large (max 100KB)", 413, "PAYLOAD_TOO_LARGE");
      }

      let body: any;
      try { body = await req.json(); } catch { return err("Invalid JSON body"); }

      // Validate embeddings (must be arrays of exactly 256 finite numbers)
      const validateEmbedding = (emb: any, name: string): string | null => {
        if (!Array.isArray(emb) || emb.length !== 256) return `${name} must be an array of exactly 256 floats`;
        for (let i = 0; i < emb.length; i++) {
          if (typeof emb[i] !== "number" || !Number.isFinite(emb[i])) {
            return `${name}[${i}] must be a finite number`;
          }
        }
        return null;
      };
      for (const [emb, name] of [
        [body.needs_embedding, "needs_embedding"],
        [body.offers_embedding, "offers_embedding"],
        [body.profile_embedding, "profile_embedding"],
      ] as const) {
        const embErr = validateEmbedding(emb, name);
        if (embErr) return err(embErr);
      }

      // Validate field lengths
      if (body.needs != null) {
        if (!Array.isArray(body.needs) || body.needs.length > 20) {
          return err("needs must be an array of 20 or fewer items");
        }
      }
      if (body.offers != null) {
        if (!Array.isArray(body.offers) || body.offers.length > 20) {
          return err("offers must be an array of 20 or fewer items");
        }
      }
      if (body.interests != null) {
        if (!Array.isArray(body.interests) || body.interests.length > 30) {
          return err("interests must be an array of 30 or fewer items");
        }
      }
      if (body.summary != null && body.summary.length > 2000) {
        return err("summary must be 2000 characters or less");
      }

      const ttlDays = body.ttl_days ?? 7;
      if (typeof ttlDays !== "number" || ttlDays < 1 || ttlDays > 30) {
        return err("ttl_days must be a number between 1 and 30");
      }

      const cadence = body.cadence ?? "daily";
      if (!["daily", "weekly"].includes(cadence)) {
        return err("cadence must be 'daily' or 'weekly'");
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Math.round(ttlDays));
      const expiresAtStr = expiresAt.toISOString().replace("T", " ").slice(0, 19);

      // One signal per card: expire pending matches referencing old signal, then delete it
      const oldSignal = ctx.db.prepare(
        "SELECT id FROM serendipity_signals WHERE card_id = ?",
      ).get(card.id) as { id: string } | undefined;
      if (oldSignal) {
        ctx.db.prepare(`
          UPDATE serendipity_matches
          SET status = 'expired'
          WHERE (signal_a_id = ? OR signal_b_id = ?) AND status = 'pending'
        `).run(oldSignal.id, oldSignal.id);
      }
      ctx.db.prepare("DELETE FROM serendipity_signals WHERE card_id = ?").run(card.id);

      // Check if this signal ID is already taken by another card
      const existingSignal = ctx.db.prepare(
        "SELECT card_id FROM serendipity_signals WHERE id = ?",
      ).get(signalId) as { card_id: string } | undefined;
      if (existingSignal) {
        return err("Signal ID already exists. Use a different UUID.", 409, "CONFLICT");
      }

      ctx.db.prepare(`
        INSERT INTO serendipity_signals
        (id, card_id, needs, offers, interests, personality, context,
         needs_embedding, offers_embedding, profile_embedding,
         summary, cadence, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        signalId,
        card.id,
        body.needs != null ? JSON.stringify(body.needs) : "[]",
        body.offers != null ? JSON.stringify(body.offers) : "[]",
        body.interests != null ? JSON.stringify(body.interests) : "[]",
        body.personality != null ? JSON.stringify(body.personality) : "{}",
        body.context != null ? JSON.stringify(body.context) : "{}",
        embedToBlob(body.needs_embedding),
        embedToBlob(body.offers_embedding),
        embedToBlob(body.profile_embedding),
        body.summary ?? null,
        cadence,
        expiresAtStr,
      );

      const newSignal = ctx.db.prepare(
        "SELECT * FROM serendipity_signals WHERE id = ?",
      ).get(signalId) as SignalRecord;

      // Trigger matching engine synchronously
      runMatching(ctx.db, newSignal);

      return json({ ok: true, signal: formatSignal(newSignal) }, 201);
    }

    // DELETE /api/serendipity/signals/:id — withdraw signal
    if (method === "DELETE") {
      const card = await requireAuth();
      if (!card) return err("Unauthorized", 401, "UNAUTHORIZED");

      const signal = ctx.db.prepare(
        "SELECT * FROM serendipity_signals WHERE id = ? AND card_id = ?",
      ).get(signalId, card.id) as SignalRecord | undefined;

      if (!signal) return err("Signal not found", 404, "NOT_FOUND");

      // Cancel pending matches for this signal
      ctx.db.prepare(`
        UPDATE serendipity_matches
        SET status = 'expired'
        WHERE (signal_a_id = ? OR signal_b_id = ?) AND status = 'pending'
      `).run(signalId, signalId);

      ctx.db.prepare("DELETE FROM serendipity_signals WHERE id = ?").run(signalId);

      return json({ ok: true, message: "Signal withdrawn" });
    }
  }

  // ── Match routes: /api/serendipity/matches[/:id] ──────────────────
  const matchesRouteMatch = path.match(/^\/api\/serendipity\/matches(?:\/([^/]+))?$/);

  if (matchesRouteMatch) {
    const matchId = matchesRouteMatch[1];

    // GET /api/serendipity/matches — list your matches
    if (method === "GET" && !matchId) {
      const card = await requireAuth();
      if (!card) return err("Unauthorized", 401, "UNAUTHORIZED");

      const statusFilter = url.searchParams.get("status");
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
      const conditions = ["(card_a_id = ? OR card_b_id = ?)"];
      const params: any[] = [card.id, card.id];

      if (statusFilter) {
        conditions.push("status = ?");
        params.push(statusFilter);
      }

      const where = conditions.join(" AND ");
      const total = (ctx.db.prepare(
        `SELECT COUNT(*) as c FROM serendipity_matches WHERE ${where}`,
      ).get(...params) as { c: number }).c;

      const matches = ctx.db.prepare(`
        SELECT * FROM serendipity_matches
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Record<string, any>[];

      return json({
        matches: matches.map(m => formatMatchForCard(m, card.id, ctx.db)),
        total,
        limit,
        offset,
      });
    }

    // GET /api/serendipity/matches/:id — single match detail
    if (method === "GET" && matchId) {
      const card = await requireAuth();
      if (!card) return err("Unauthorized", 401, "UNAUTHORIZED");

      const match = ctx.db.prepare(
        "SELECT * FROM serendipity_matches WHERE id = ? AND (card_a_id = ? OR card_b_id = ?)",
      ).get(matchId, card.id, card.id) as Record<string, any> | undefined;

      if (!match) return err("Match not found", 404, "NOT_FOUND");

      return json(formatMatchForCard(match, card.id, ctx.db));
    }

    // PUT /api/serendipity/matches/:id — respond to match (yes/no)
    if (method === "PUT" && matchId) {
      const card = await requireAuth();
      if (!card) return err("Unauthorized", 401, "UNAUTHORIZED");

      const match = ctx.db.prepare(
        "SELECT * FROM serendipity_matches WHERE id = ? AND (card_a_id = ? OR card_b_id = ?)",
      ).get(matchId, card.id, card.id) as Record<string, any> | undefined;

      if (!match) return err("Match not found", 404, "NOT_FOUND");
      if (match.status !== "pending") return err("Match is no longer pending", 400, "INVALID_STATE");

      let body: any;
      try { body = await req.json(); } catch { return err("Invalid JSON body"); }

      const { decision } = body;
      if (!["yes", "no", "not_now"].includes(decision)) {
        return err("decision must be 'yes', 'no', or 'not_now'");
      }

      const yourSide = match.card_a_id === card.id ? "a" : "b";
      const otherCardId = yourSide === "a" ? match.card_b_id : match.card_a_id;

      // "not_now" — defer without rejecting. Match stays pending, extends expiry by 14 days.
      if (decision === "not_now") {
        ctx.db.prepare(`
          UPDATE serendipity_matches
          SET expires_at = datetime('now', '+14 days')
          WHERE id = ?
        `).run(matchId);
        return json({ deferred: true, message: "Match saved for later. It will stay available for 14 more days." });
      }

      if (decision === "no") {
        ctx.db.prepare(`
          UPDATE serendipity_matches
          SET status = 'rejected', rejected_at = datetime('now')
          WHERE id = ?
        `).run(matchId);

        // Record rejection in both directions to prevent re-matching
        const insertRej = ctx.db.prepare(
          "INSERT OR IGNORE INTO serendipity_rejections (card_a_id, card_b_id) VALUES (?, ?)",
        );
        insertRej.run(card.id, otherCardId);
        insertRej.run(otherCardId, card.id);

        return json({ rejected: true });
      }

      // decision === "yes": set opted-in flag
      const optInField = yourSide === "a" ? "a_opted_in" : "b_opted_in";
      ctx.db.prepare(`UPDATE serendipity_matches SET ${optInField} = 1 WHERE id = ?`).run(matchId);

      const updated = ctx.db.prepare(
        "SELECT * FROM serendipity_matches WHERE id = ?",
      ).get(matchId) as Record<string, any>;

      // Both sides opted in → reveal
      if (updated.a_opted_in === 1 && updated.b_opted_in === 1) {
        ctx.db.prepare(`
          UPDATE serendipity_matches
          SET status = 'revealed', revealed_at = datetime('now')
          WHERE id = ?
        `).run(matchId);

        const otherCard = ctx.db.prepare(
          "SELECT slug FROM agent_cards WHERE id = ?",
        ).get(otherCardId) as { slug: string } | undefined;

        return json({
          revealed: true,
          card_slug: otherCard?.slug ?? null,
          card_url: otherCard ? `https://schellingprotocol.com/cards/${otherCard.slug}` : null,
        });
      }

      return json({ revealed: false, message: "Waiting for the other side to respond" });
    }
  }

  return null;
}
