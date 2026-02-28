import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  TraitRecord,
  CandidateRecord,
  Trait,
} from "../types.js";
import {
  Stage,
  orderTokens,
  PROTOCOL_VERSION,
  normalizeString,
  jaccardSimilarity,
} from "../types.js";

// ─── NL Parser ─────────────────────────────────────────────────────
// Simple keyword-based intent parser: extracts cluster hints, trait-like
// key-value pairs, and structured patterns from natural language.

interface NLParseResult {
  cluster_id: string | null;
  traits: Trait[];
  keywords: string[];
}

const CLUSTER_KEYWORDS: Record<string, string> = {
  dating: "dating",
  date: "dating",
  romance: "dating",
  relationship: "dating",
  hire: "hiring",
  hiring: "hiring",
  job: "hiring",
  employ: "hiring",
  freelance: "freelance",
  gig: "freelance",
  contractor: "freelance",
  tutor: "tutoring",
  tutoring: "tutoring",
  teach: "tutoring",
  learn: "tutoring",
  mentor: "mentoring",
  mentoring: "mentoring",
  roommate: "housing",
  housing: "housing",
  apartment: "housing",
  rent: "housing",
  buy: "marketplace",
  sell: "marketplace",
  trade: "marketplace",
  marketplace: "marketplace",
};

const BUDGET_PATTERN = /budget\s*\$?\s*(\d+)(?:\s*[-–]\s*(\d+))?/i;
const LOCATION_PATTERN = /(?:location|city|in)\s*[:=]?\s*([A-Za-z\s]+?)(?:\.|,|$)/i;
const SKILL_PATTERN = /(?:skills?|expertise|proficient|experienced)\s*[:=]?\s*([^.;]+)/i;
const AVAILABILITY_PATTERN = /(?:available|availability)\s*[:=]?\s*([^.;]+)/i;

function parseIntent(intent: string): NLParseResult {
  const lower = intent.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 2);

  // Detect cluster from keywords
  let detectedCluster: string | null = null;
  for (const word of words) {
    if (CLUSTER_KEYWORDS[word]) {
      detectedCluster = CLUSTER_KEYWORDS[word];
      break;
    }
  }

  const traits: Trait[] = [];

  // Extract budget
  const budgetMatch = intent.match(BUDGET_PATTERN);
  if (budgetMatch) {
    if (budgetMatch[2]) {
      traits.push({
        key: "budget_range",
        value: `${budgetMatch[1]}-${budgetMatch[2]}`,
        value_type: "string",
        visibility: "public",
      });
    } else {
      traits.push({
        key: "budget",
        value: parseInt(budgetMatch[1], 10),
        value_type: "number",
        visibility: "public",
      });
    }
  }

  // Extract location
  const locationMatch = intent.match(LOCATION_PATTERN);
  if (locationMatch) {
    traits.push({
      key: "location",
      value: locationMatch[1].trim(),
      value_type: "string",
      visibility: "public",
    });
  }

  // Extract skills
  const skillMatch = intent.match(SKILL_PATTERN);
  if (skillMatch) {
    const skills = skillMatch[1]
      .split(/[,&]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (skills.length > 0) {
      traits.push({
        key: "skills",
        value: skills,
        value_type: "array",
        visibility: "public",
      });
    }
  }

  // Extract availability
  const availMatch = intent.match(AVAILABILITY_PATTERN);
  if (availMatch) {
    traits.push({
      key: "availability",
      value: availMatch[1].trim(),
      value_type: "string",
      visibility: "public",
    });
  }

  // If no traits were extracted, use the intent as a description trait
  if (traits.length === 0) {
    traits.push({
      key: "description",
      value: intent.slice(0, 500),
      value_type: "string",
      visibility: "public",
    });
  }

  // Keywords for search matching
  const stopWords = new Set([
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
    "her", "was", "one", "our", "out", "has", "his", "how", "its", "may",
    "who", "did", "get", "let", "say", "she", "too", "use", "with", "from",
    "that", "this", "will", "have", "been", "some", "them", "than",
    "looking", "want", "need", "find", "seeking",
  ]);

  const keywords = words.filter((w) => !stopWords.has(w) && w.length > 3);

  return { cluster_id: detectedCluster, traits, keywords };
}

// ─── Helper: create minimal registration ───────────────────────────

function createMinimalUser(
  db: Database,
  clusterId: string,
  traits: Trait[],
): string {
  const userToken = randomUUID();

  db.prepare(
    `INSERT INTO users (
      user_token, protocol_version, cluster_id,
      funnel_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'bilateral', 'active', datetime('now'), datetime('now'))`,
  ).run(userToken, PROTOCOL_VERSION, clusterId);

  // Ensure cluster exists
  const existingCluster = db
    .prepare("SELECT cluster_id FROM clusters WHERE cluster_id = ?")
    .get(clusterId) as { cluster_id: string } | undefined;

  if (!existingCluster) {
    db.prepare(
      `INSERT INTO clusters (
        cluster_id, display_name, population, phase, created_at, last_activity
      ) VALUES (?, ?, 0, 'nascent', datetime('now'), datetime('now'))`,
    ).run(clusterId, clusterId);
  }

  db.prepare(
    "UPDATE clusters SET population = population + 1, last_activity = datetime('now') WHERE cluster_id = ?",
  ).run(clusterId);

  // Insert traits
  const insertTrait = db.prepare(
    `INSERT INTO traits (
      id, user_token, key, value, value_type, visibility, verification,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'unverified', datetime('now'), datetime('now'))`,
  );

  for (const trait of traits) {
    insertTrait.run(
      randomUUID(),
      userToken,
      trait.key,
      JSON.stringify(trait.value),
      trait.value_type,
      trait.visibility ?? "public",
    );
  }

  return userToken;
}

// ─── Helper: compute basic trait overlap score ─────────────────────

function computeTraitOverlap(
  traitsA: TraitRecord[],
  traitsB: TraitRecord[],
): number {
  if (traitsA.length === 0 || traitsB.length === 0) return 0.3;

  const keysA = new Set(traitsA.map((t) => t.key));
  const keysB = new Set(traitsB.map((t) => t.key));

  let overlap = 0;
  let total = 0;

  for (const key of keysA) {
    if (keysB.has(key)) {
      const rawA = traitsA.find((t) => t.key === key)?.value;
      const rawB = traitsB.find((t) => t.key === key)?.value;
      const valA = parseTraitValue(rawA ?? "");
      const valB = parseTraitValue(rawB ?? "");
      if (typeof valA === "string" && typeof valB === "string") {
        const normA = normalizeString(valA);
        const normB = normalizeString(valB);
        if (normA === normB) {
          overlap += 1.0;
        } else {
          const jaccard = jaccardSimilarity(valA, valB);
          overlap += jaccard > 0 ? 0.3 + 0.7 * jaccard : 0.3;
        }
      } else {
        overlap += valA === valB ? 1.0 : 0.3;
      }
    }
    total++;
  }

  return total > 0 ? overlap / total : 0.3;
}

function parseTraitValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ─── handleQuickSeek ───────────────────────────────────────────────

export interface QuickSeekInput {
  user_token?: string;
  intent: string;
  cluster_id?: string;
  constraints?: Record<string, unknown>;
  max_results?: number;
  auto_advance?: boolean;
  deadline?: string;
  budget?: number;
}

export interface QuickSeekSearchResult {
  user_token_hash: string;
  score: number;
  matching_traits: string[];
  candidate_id?: string;
}

export interface QuickSeekOutput {
  user_token: string;
  cluster_id: string;
  candidates: QuickSeekSearchResult[];
  total_matches: number;
  auto_advanced: string[];
  nl_parsed: NLParseResult;
  registration_created: boolean;
}

export async function handleQuickSeek(
  input: QuickSeekInput,
  ctx: HandlerContext,
): Promise<HandlerResult<QuickSeekOutput>> {
  // ── Validate input ──────────────────────────────────────────────
  if (!input.intent || typeof input.intent !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "intent is required" },
    };
  }

  if (input.intent.length > 2000) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "intent must be 2000 characters or less" },
    };
  }

  const maxResults = Math.min(Math.max(input.max_results ?? 5, 1), 20);
  const autoAdvance = input.auto_advance ?? false;

  // ── Parse intent ────────────────────────────────────────────────
  const parsed = parseIntent(input.intent);
  const clusterId = input.cluster_id ?? parsed.cluster_id ?? "general";

  // ── Resolve or create user ──────────────────────────────────────
  let userToken = input.user_token ?? null;
  let registrationCreated = false;

  if (userToken) {
    const existing = ctx.db
      .prepare("SELECT user_token, status FROM users WHERE user_token = ?")
      .get(userToken) as { user_token: string; status: string } | undefined;

    if (!existing) {
      return {
        ok: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      };
    }
  } else {
    // Create temporary registration
    try {
      userToken = createMinimalUser(ctx.db, clusterId, parsed.traits);
      registrationCreated = true;
    } catch (err: unknown) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  // ── Search for matches ──────────────────────────────────────────
  const candidateUsers = ctx.db
    .prepare(
      `SELECT * FROM users
       WHERE cluster_id = ?
         AND status = 'active'
         AND user_token != ?
       LIMIT 200`,
    )
    .all(clusterId, userToken) as UserRecord[];

  // Load caller traits
  const callerTraits = ctx.db
    .prepare("SELECT * FROM traits WHERE user_token = ?")
    .all(userToken) as TraitRecord[];

  // Score candidates
  interface ScoredMatch {
    user: UserRecord;
    score: number;
    matchingTraits: string[];
  }

  const scored: ScoredMatch[] = [];

  for (const candidate of candidateUsers) {
    const candidateTraits = ctx.db
      .prepare("SELECT * FROM traits WHERE user_token = ?")
      .all(candidate.user_token) as TraitRecord[];

    const overlap = computeTraitOverlap(callerTraits, candidateTraits);

    // Find matching trait keys
    const callerKeys = new Set(callerTraits.map((t) => t.key));
    const matchingTraits = candidateTraits
      .filter((t) => callerKeys.has(t.key))
      .map((t) => t.key);

    scored.push({
      user: candidate,
      score: overlap,
      matchingTraits,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, maxResults);

  // ── Auto-advance and create candidate pairs ─────────────────────
  const autoAdvanced: string[] = [];
  const searchResults: QuickSeekSearchResult[] = [];

  for (const match of topMatches) {
    const { a, b } = orderTokens(userToken, match.user.user_token);
    const callerIsA = userToken === a;

    // Check if candidate pair already exists
    let candidateRow = ctx.db
      .prepare(
        "SELECT * FROM candidates WHERE user_a_token = ? AND user_b_token = ? AND cluster_id = ?",
      )
      .get(a, b, clusterId) as CandidateRecord | undefined;

    if (autoAdvance) {
      if (!candidateRow) {
        const candidateId = randomUUID();
        ctx.db
          .prepare(
            `INSERT INTO candidates (
              id, user_a_token, user_b_token, cluster_id, funnel_mode,
              score, fit_a, fit_b, stage_a, stage_b,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'bilateral', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          )
          .run(
            candidateId,
            a,
            b,
            clusterId,
            match.score,
            callerIsA ? match.score : 0.5,
            callerIsA ? 0.5 : match.score,
            callerIsA ? Stage.INTERESTED : Stage.UNDISCOVERED,
            callerIsA ? Stage.UNDISCOVERED : Stage.INTERESTED,
          );

        autoAdvanced.push(candidateId);
        candidateRow = ctx.db
          .prepare("SELECT * FROM candidates WHERE id = ?")
          .get(candidateId) as CandidateRecord | undefined;
      } else {
        // Advance caller to INTERESTED if below
        const stageCol = callerIsA ? "stage_a" : "stage_b";
        const currentStage = callerIsA ? candidateRow.stage_a : candidateRow.stage_b;

        if (currentStage < Stage.INTERESTED) {
          ctx.db
            .prepare(
              `UPDATE candidates SET ${stageCol} = ?, updated_at = datetime('now') WHERE id = ?`,
            )
            .run(Stage.INTERESTED, candidateRow.id);
          autoAdvanced.push(candidateRow.id);
        }
      }
    }

    // Hash token for privacy
    let hash = 0;
    for (let i = 0; i < match.user.user_token.length; i++) {
      const char = match.user.user_token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const tokenHash = Math.abs(hash).toString(16).padStart(8, "0");

    searchResults.push({
      user_token_hash: tokenHash,
      score: Math.round(match.score * 100) / 100,
      matching_traits: match.matchingTraits,
      candidate_id: candidateRow?.id,
    });
  }

  return {
    ok: true,
    data: {
      user_token: userToken,
      cluster_id: clusterId,
      candidates: searchResults,
      total_matches: scored.length,
      auto_advanced: autoAdvanced,
      nl_parsed: parsed,
      registration_created: registrationCreated,
    },
  };
}

// ─── handleQuickOffer ──────────────────────────────────────────────

export interface QuickOfferInput {
  user_token?: string;
  intent: string;
  cluster_id?: string;
  traits?: Trait[];
  available_until?: string;
  auto_subscribe?: boolean;
  notification_threshold?: number;
}

export interface QuickOfferOutput {
  user_token: string;
  cluster_id: string;
  profile_completeness: number;
  subscription_id: string | null;
  existing_matches: number;
  nl_parsed: NLParseResult;
  registration_created: boolean;
}

export async function handleQuickOffer(
  input: QuickOfferInput,
  ctx: HandlerContext,
): Promise<HandlerResult<QuickOfferOutput>> {
  // ── Validate input ──────────────────────────────────────────────
  if (!input.intent || typeof input.intent !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "intent is required" },
    };
  }

  if (input.intent.length > 2000) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "intent must be 2000 characters or less" },
    };
  }

  const autoSubscribe = input.auto_subscribe ?? true;
  const notificationThreshold = input.notification_threshold ?? 0.5;

  // ── Parse intent ────────────────────────────────────────────────
  const parsed = parseIntent(input.intent);
  const clusterId = input.cluster_id ?? parsed.cluster_id ?? "general";

  // Merge parsed traits with explicit traits
  const allTraits = [...parsed.traits, ...(input.traits ?? [])];

  // ── Resolve or create user ──────────────────────────────────────
  let userToken = input.user_token ?? null;
  let registrationCreated = false;

  if (userToken) {
    const existing = ctx.db
      .prepare("SELECT user_token FROM users WHERE user_token = ?")
      .get(userToken) as { user_token: string } | undefined;

    if (!existing) {
      return {
        ok: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      };
    }
  } else {
    try {
      userToken = createMinimalUser(ctx.db, clusterId, allTraits);
      registrationCreated = true;
    } catch (err: unknown) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  // ── Auto-subscribe ──────────────────────────────────────────────
  let subscriptionId: string | null = null;

  if (autoSubscribe) {
    subscriptionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    const createdAtStr = now.toISOString().replace("T", " ").slice(0, 19);
    const expiresAtStr = expiresAt.toISOString().replace("T", " ").slice(0, 19);

    ctx.db
      .prepare(
        `INSERT INTO subscriptions (
          subscription_id, user_token, cluster_filter,
          threshold, max_notifications_per_day, notification_count,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, 10, 0, ?, ?)`,
      )
      .run(
        subscriptionId,
        userToken,
        clusterId,
        notificationThreshold,
        createdAtStr,
        expiresAtStr,
      );
  }

  // ── Find existing matches ───────────────────────────────────────
  const existingMatches = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) as count FROM users
         WHERE cluster_id = ? AND status = 'active' AND user_token != ?`,
      )
      .get(clusterId, userToken) as { count: number }
  ).count;

  // ── Profile completeness ────────────────────────────────────────
  const traitCount = (
    ctx.db
      .prepare("SELECT COUNT(*) as count FROM traits WHERE user_token = ?")
      .get(userToken) as { count: number }
  ).count;

  const prefCount = (
    ctx.db
      .prepare("SELECT COUNT(*) as count FROM preferences WHERE user_token = ?")
      .get(userToken) as { count: number }
  ).count;

  let completeness = 0;
  completeness += Math.min(traitCount / 5, 1) * 0.4;
  completeness += Math.min(prefCount / 3, 1) * 0.2;
  completeness = Math.min(Math.round(completeness * 100) / 100, 1.0);

  return {
    ok: true,
    data: {
      user_token: userToken,
      cluster_id: clusterId,
      profile_completeness: completeness,
      subscription_id: subscriptionId,
      existing_matches: existingMatches,
      nl_parsed: parsed,
      registration_created: registrationCreated,
    },
  };
}

// ─── handleQuickMatch ──────────────────────────────────────────────

export interface QuickMatchInput {
  seek: {
    intent: string;
    traits?: Trait[];
    preferences?: import("../types.js").Preference[];
    cluster_id?: string;
  };
  offer: {
    intent: string;
    traits?: Trait[];
    cluster_id?: string;
  };
  auto_connect?: boolean;
}

export interface QuickMatchOutput {
  matched: boolean;
  seek_token: string;
  offer_token: string;
  cluster_id: string;
  advisory_score: number;
  candidate_id: string;
  connected: boolean;
  seek_parsed: NLParseResult;
  offer_parsed: NLParseResult;
}

export async function handleQuickMatch(
  input: QuickMatchInput,
  ctx: HandlerContext,
): Promise<HandlerResult<QuickMatchOutput>> {
  // ── Validate input ──────────────────────────────────────────────
  if (!input.seek?.intent || typeof input.seek.intent !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "seek.intent is required" },
    };
  }

  if (!input.offer?.intent || typeof input.offer.intent !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "offer.intent is required" },
    };
  }

  if (input.seek.intent.length > 2000 || input.offer.intent.length > 2000) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "intent must be 2000 characters or less" },
    };
  }

  const autoConnect = input.auto_connect ?? false;

  // ── Parse both intents ──────────────────────────────────────────
  const seekParsed = parseIntent(input.seek.intent);
  const offerParsed = parseIntent(input.offer.intent);

  // Resolve cluster
  const seekCluster = input.seek.cluster_id ?? seekParsed.cluster_id;
  const offerCluster = input.offer.cluster_id ?? offerParsed.cluster_id;

  // Check cluster compatibility
  if (seekCluster && offerCluster && seekCluster !== offerCluster) {
    return {
      ok: false,
      error: {
        code: "INCOMPATIBLE_CLUSTERS",
        message: `Seek cluster "${seekCluster}" does not match offer cluster "${offerCluster}"`,
      },
    };
  }

  const clusterId = seekCluster ?? offerCluster ?? "general";

  // ── Register both sides ─────────────────────────────────────────
  const seekTraits = [...seekParsed.traits, ...(input.seek.traits ?? [])];
  const offerTraits = [...offerParsed.traits, ...(input.offer.traits ?? [])];

  let seekToken: string;
  let offerToken: string;

  try {
    seekToken = createMinimalUser(ctx.db, clusterId, seekTraits);
    offerToken = createMinimalUser(ctx.db, clusterId, offerTraits);
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // ── Compute advisory score ──────────────────────────────────────
  const seekTraitRows = ctx.db
    .prepare("SELECT * FROM traits WHERE user_token = ?")
    .all(seekToken) as TraitRecord[];

  const offerTraitRows = ctx.db
    .prepare("SELECT * FROM traits WHERE user_token = ?")
    .all(offerToken) as TraitRecord[];

  const advisoryScore = computeTraitOverlap(seekTraitRows, offerTraitRows);
  const matched = advisoryScore > 0;

  // ── Create candidate pair ───────────────────────────────────────
  const { a, b } = orderTokens(seekToken, offerToken);
  const seekIsA = seekToken === a;
  const candidateId = randomUUID();

  // Check if auto_connect is valid (all traits must be public)
  let connected = false;

  if (autoConnect && matched) {
    const allPublic = [...seekTraitRows, ...offerTraitRows].every(
      (t) => t.visibility === "public",
    );

    if (!allPublic) {
      // Cannot auto-connect due to progressive disclosure
      // Still create the pair but at a lower stage
    } else {
      connected = true;
    }
  }

  const finalStage = connected ? Stage.CONNECTED : Stage.DISCOVERED;

  ctx.db
    .prepare(
      `INSERT INTO candidates (
        id, user_a_token, user_b_token, cluster_id, funnel_mode,
        score, fit_a, fit_b, stage_a, stage_b,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'bilateral', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(
      candidateId,
      a,
      b,
      clusterId,
      advisoryScore,
      seekIsA ? advisoryScore : 0.5,
      seekIsA ? 0.5 : advisoryScore,
      finalStage,
      finalStage,
    );

  return {
    ok: true,
    data: {
      matched,
      seek_token: seekToken,
      offer_token: offerToken,
      cluster_id: clusterId,
      advisory_score: Math.round(advisoryScore * 100) / 100,
      candidate_id: candidateId,
      connected,
      seek_parsed: seekParsed,
      offer_parsed: offerParsed,
    },
  };
}
