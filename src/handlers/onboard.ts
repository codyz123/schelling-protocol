import type { HandlerContext, HandlerResult } from "../types.js";
import { PROTOCOL_VERSION } from "../types.js";
import { getFeatures, generateNextSteps, getLegacyFeatureDescriptions } from "../features.js";

// ─── Input / Output types ────────────────────────────────────────────

export interface OnboardInput {
  natural_language: string;
  cluster_hint?: string;
  role_hint?: string;
}

interface ClusterMatch {
  cluster_id: string;
  display_name: string | null;
  confidence: number;
}

interface SuggestedRole {
  role_id: string;
  confidence: number;
}

interface ParsedTrait {
  key: string;
  value: string | number;
  value_type: "string" | "number";
  visibility: "public";
  source: "nl_extracted";
}

interface SuggestedAdditionalTrait {
  trait_key: string;
  display_name: string | null;
  prompt: string | null;
  frequency: number;
}

interface RegistrationTemplate {
  protocol_version: string;
  cluster_id: string;
  role: string | null;
  traits: Array<{
    key: string;
    value: string | number;
    value_type: "string" | "number";
    visibility: "public";
  }>;
  preferences: unknown[];
  intents: string[];
}

interface OnboardOutput {
  suggested_cluster: {
    cluster_id: string;
    display_name: string | null;
    confidence: number;
    alternatives: ClusterMatch[];
  };
  suggested_role: SuggestedRole | null;
  parsed_traits: ParsedTrait[];
  parsed_preferences: unknown[];
  additional_traits_suggested: SuggestedAdditionalTrait[];
  registration_template: RegistrationTemplate;
  clarification_needed: null;
  cluster_priors: Record<string, unknown>;
  next_steps: {
    step: number;
    action: string;
    description: string;
    endpoint?: string;
  }[];
  features: {
    core_protocol: string;
    agent_cards: string;
    serendipity: string;
    mcp_server: string;
    sdks: string;
    community: string;
  };
}

// ─── Keyword → cluster mapping ───────────────────────────────────────

interface ClusterRule {
  cluster_id: string;
  score: number;
  role?: string;
}

function matchKeywordsToCluster(text: string): ClusterRule[] {
  const lower = text.toLowerCase();
  const hits: ClusterRule[] = [];

  // Dating / relationships
  if (/\b(dat(e|ing)|romance|romantic|relationship|partner|girlfriend|boyfriend|love|soulmate)\b/.test(lower)) {
    hits.push({ cluster_id: "dating.general", score: 0.9 });
  }

  // Hiring / jobs — engineering
  if (/\b(front[\s-]?end|frontend|react|vue|angular|ui[\s-]developer)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.engineering.frontend", score: 0.9, role: "candidate" });
  }
  if (/\b(back[\s-]?end|backend|api|server[\s-]side|node|django|rails)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.engineering.backend", score: 0.85, role: "candidate" });
  }
  if (/\b(full[\s-]?stack|fullstack)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.engineering.fullstack", score: 0.9, role: "candidate" });
  }
  if (/\b(machine[\s-]?learning|ml[\s-]engineer|deep[\s-]learning|data[\s-]scientist|nlp|llm)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.engineering.ml", score: 0.9, role: "candidate" });
  }
  if (/\b(hire|hiring|recruit|looking[\s-]for[\s-]a[\s-]developer|job[\s-]posting|open[\s-]role|we[\s-]need[\s-]a)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.engineering", score: 0.6, role: "employer" });
  }
  if (/\b(developer|engineer|software|coding|programmer|tech[\s-]job|dev[\s-]role)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.engineering", score: 0.7, role: "candidate" });
  }

  // Trades / local services
  if (/\b(plumb(er|ing)|pipe|drain|faucet|water[\s-]heater)\b/.test(lower)) {
    hits.push({ cluster_id: "services.trades.plumbing", score: 0.9 });
  }
  if (/\b(electric(ian|al)|wiring|circuit|outlet|panel)\b/.test(lower)) {
    hits.push({ cluster_id: "services.trades.electrical", score: 0.9 });
  }
  if (/\b(carpenter|carpentry|woodwork|cabinet|custom[\s-]wood)\b/.test(lower)) {
    hits.push({ cluster_id: "services.trades.carpentry", score: 0.85 });
  }
  if (/\b(handyman|handywoman|odd[\s-]job|home[\s-]repair|fix[\s-]things)\b/.test(lower)) {
    hits.push({ cluster_id: "services.trades", score: 0.7 });
  }

  // Housing / roommates
  if (/\b(roommate|housemate|room[\s-]to[\s-]rent|shared[\s-]house|flatmate)\b/.test(lower)) {
    hits.push({ cluster_id: "housing.roommates", score: 0.9 });
  }
  if (/\b(apartment|condo|house[\s-]rent|lease|sublet|sublease)\b/.test(lower)) {
    hits.push({ cluster_id: "housing.rentals", score: 0.8 });
  }

  // Sports / social
  if (/\b(basketball|pickup[\s-]game|ball[\s-]game|hoops)\b/.test(lower)) {
    hits.push({ cluster_id: "social.sports.basketball", score: 0.9 });
  }
  if (/\b(soccer|football|futbol|pitch|striker|goalkeeper)\b/.test(lower)) {
    hits.push({ cluster_id: "social.sports.soccer", score: 0.9 });
  }
  if (/\b(tennis|pickleball|racket)\b/.test(lower)) {
    hits.push({ cluster_id: "social.sports.tennis", score: 0.85 });
  }
  if (/\b(running|marathon|5k|trail[\s-]run|jog)\b/.test(lower)) {
    hits.push({ cluster_id: "social.sports.running", score: 0.85 });
  }
  if (/\b(sport|game|play[\s-]with|workout[\s-]partner|gym[\s-]buddy|fitness[\s-]partner)\b/.test(lower)) {
    hits.push({ cluster_id: "social.sports", score: 0.6 });
  }

  // Marketplace / buy-sell
  if (/\b(sell(ing)?|for[\s-]sale|listing|furniture|electronics|used[\s-]item|buy[\s-]and[\s-]sell)\b/.test(lower)) {
    hits.push({ cluster_id: "marketplace.general", score: 0.8, role: "seller" });
  }
  if (/\b(buy(ing)?|looking[\s-]to[\s-]buy|want[\s-]to[\s-]purchase|need[\s-]a[\s-]used)\b/.test(lower)) {
    hits.push({ cluster_id: "marketplace.general", score: 0.75, role: "buyer" });
  }

  // Freelance / consulting
  if (/\b(freelance|freelancer|consultant|consulting|contract[\s-]work|remote[\s-]work|gig)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.freelance", score: 0.8 });
  }

  // Design
  if (/\b(design(er)?|ui[\s-]ux|graphic|figma|sketch[\s-]app|illustrat)\b/.test(lower)) {
    hits.push({ cluster_id: "hiring.design", score: 0.8, role: "candidate" });
  }

  return hits;
}

// ─── Trait extraction from NL ────────────────────────────────────────

function extractTraitsFromText(text: string): ParsedTrait[] {
  const traits: ParsedTrait[] = [];

  // Dollar amount → hourly_rate or price
  const rateMatch = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:\/\s*hr?|per\s+hour)?/i);
  if (rateMatch) {
    traits.push({
      key: "work.hourly_rate_usd",
      value: parseFloat(rateMatch[1]),
      value_type: "number",
      visibility: "public",
      source: "nl_extracted",
    });
  }

  // Years of experience — "5 years", "5yr", "5+ years"
  const expMatch = text.match(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)?/i);
  if (expMatch) {
    traits.push({
      key: "work.years_experience",
      value: parseInt(expMatch[1], 10),
      value_type: "number",
      visibility: "public",
      source: "nl_extracted",
    });
  }

  // City names — simple known city list
  const CITIES = [
    "new york", "nyc", "los angeles", "la", "chicago", "houston", "phoenix",
    "philadelphia", "san antonio", "san diego", "dallas", "san jose",
    "austin", "jacksonville", "fort worth", "columbus", "charlotte",
    "indianapolis", "san francisco", "sf", "seattle", "denver", "boston",
    "nashville", "portland", "miami", "atlanta", "london", "toronto",
    "berlin", "paris", "sydney", "amsterdam", "singapore", "tokyo",
  ];
  const lowerText = text.toLowerCase();
  for (const city of CITIES) {
    const cityRegex = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (cityRegex.test(lowerText)) {
      // Use the canonical capitalized form
      const displayCity = city
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      traits.push({
        key: "location.city",
        value: displayCity,
        value_type: "string",
        visibility: "public",
        source: "nl_extracted",
      });
      break;
    }
  }

  // Remote preference
  if (/\b(remote|remote[\s-]only|work[\s-]from[\s-]home|wfh)\b/i.test(text)) {
    traits.push({
      key: "work.remote",
      value: "remote",
      value_type: "string",
      visibility: "public",
      source: "nl_extracted",
    });
  } else if (/\b(on[\s-]?site|in[\s-]?person|in[\s-]?office)\b/i.test(text)) {
    traits.push({
      key: "work.remote",
      value: "onsite",
      value_type: "string",
      visibility: "public",
      source: "nl_extracted",
    });
  }

  return traits;
}

// ─── Cluster norm lookup ─────────────────────────────────────────────

interface NormRow {
  trait_key: string;
  display_name: string | null;
  prompt: string | null;
  frequency: number;
}

function fetchClusterNorms(
  clusterId: string,
  ctx: HandlerContext
): SuggestedAdditionalTrait[] {
  const rows = ctx.db
    .prepare(
      `SELECT trait_key, display_name, prompt, frequency
       FROM cluster_norms
       WHERE cluster_id = ?
       ORDER BY frequency DESC
       LIMIT 10`
    )
    .all(clusterId) as NormRow[];

  return rows.map((r) => ({
    trait_key: r.trait_key,
    display_name: r.display_name,
    prompt: r.prompt,
    frequency: r.frequency,
  }));
}

// ─── Resolve cluster from hits + DB ─────────────────────────────────

interface ClusterRow {
  cluster_id: string;
  display_name: string | null;
}

function resolveCluster(
  hits: ClusterRule[],
  clusterHint: string | undefined,
  ctx: HandlerContext
): { primary: ClusterMatch; alternatives: ClusterMatch[] } {
  // Sort hits descending by score, deduplicate by cluster_id
  const seen = new Set<string>();
  const deduped: ClusterRule[] = [];
  for (const h of hits.sort((a, b) => b.score - a.score)) {
    if (!seen.has(h.cluster_id)) {
      seen.add(h.cluster_id);
      deduped.push(h);
    }
  }

  // If caller provided a cluster_hint, check DB for it
  if (clusterHint) {
    const row = ctx.db
      .prepare("SELECT cluster_id, display_name FROM clusters WHERE cluster_id = ?")
      .get(clusterHint) as ClusterRow | undefined;
    if (row) {
      const alternatives = deduped
        .filter((h) => h.cluster_id !== clusterHint)
        .slice(0, 3)
        .map((h) => {
          const dbRow = ctx.db
            .prepare("SELECT cluster_id, display_name FROM clusters WHERE cluster_id = ?")
            .get(h.cluster_id) as ClusterRow | undefined;
          return {
            cluster_id: h.cluster_id,
            display_name: dbRow?.display_name ?? null,
            confidence: h.score,
          };
        });
      return {
        primary: { cluster_id: row.cluster_id, display_name: row.display_name, confidence: 0.95 },
        alternatives,
      };
    }
  }

  // Use top keyword hit, or fall back to a generic cluster
  const topHit = deduped[0] ?? { cluster_id: "general", score: 0.3 };
  const dbRow = ctx.db
    .prepare("SELECT cluster_id, display_name FROM clusters WHERE cluster_id = ?")
    .get(topHit.cluster_id) as ClusterRow | undefined;

  const alternatives = deduped
    .slice(1, 4)
    .map((h) => {
      const altRow = ctx.db
        .prepare("SELECT cluster_id, display_name FROM clusters WHERE cluster_id = ?")
        .get(h.cluster_id) as ClusterRow | undefined;
      return {
        cluster_id: h.cluster_id,
        display_name: altRow?.display_name ?? null,
        confidence: h.score,
      };
    });

  return {
    primary: {
      cluster_id: topHit.cluster_id,
      display_name: dbRow?.display_name ?? null,
      confidence: topHit.score,
    },
    alternatives,
  };
}

// ─── Infer role from hits + role_hint ────────────────────────────────

function inferRole(
  hits: ClusterRule[],
  roleHint: string | undefined
): SuggestedRole | null {
  if (roleHint) {
    return { role_id: roleHint, confidence: 0.95 };
  }
  const topWithRole = hits.find((h) => h.role != null);
  if (topWithRole?.role) {
    return { role_id: topWithRole.role, confidence: 0.7 };
  }
  return null;
}

// ─── handleOnboard ───────────────────────────────────────────────────

export async function handleOnboard(
  input: OnboardInput,
  ctx: HandlerContext
): Promise<HandlerResult<OnboardOutput>> {
  try {
    if (!input.natural_language || typeof input.natural_language !== "string" || input.natural_language.trim() === "") {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "natural_language is required and must be a non-empty string.",
        },
      };
    }

    const text = input.natural_language.trim();
    const hits = matchKeywordsToCluster(text);
    const parsedTraits = extractTraitsFromText(text);

    const { primary, alternatives } = resolveCluster(hits, input.cluster_hint, ctx);
    const suggestedRole = inferRole(hits, input.role_hint);

    const additionalTraitsSuggested = fetchClusterNorms(primary.cluster_id, ctx);

    // Filter out traits already parsed from NL
    const parsedKeys = new Set(parsedTraits.map((t) => t.key));
    const filteredAdditional = additionalTraitsSuggested.filter(
      (t) => !parsedKeys.has(t.trait_key)
    );

    const registrationTemplate: RegistrationTemplate = {
      protocol_version: PROTOCOL_VERSION,
      cluster_id: primary.cluster_id,
      role: suggestedRole?.role_id ?? null,
      traits: parsedTraits.map(({ source: _source, ...rest }) => rest),
      preferences: [],
      intents: [],
    };

    // Get dynamic features and next steps
    const featureRegistry = await getFeatures(ctx);
    const nextSteps = generateNextSteps(featureRegistry.features);
    const legacyFeatures = getLegacyFeatureDescriptions();
    
    // Build features object from registry
    const features = {
      core_protocol: "",
      agent_cards: "",
      serendipity: "",
      mcp_server: "",
      sdks: "",
      community: "",
    };
    
    for (const feature of featureRegistry.features) {
      if (feature.id in features) {
        (features as any)[feature.id] = feature.description;
      }
    }
    
    // Fill any missing features with legacy descriptions
    for (const [key, value] of Object.entries(legacyFeatures)) {
      if (key in features && !(features as any)[key]) {
        (features as any)[key] = value;
      }
    }

    const output: OnboardOutput = {
      suggested_cluster: {
        cluster_id: primary.cluster_id,
        display_name: primary.display_name,
        confidence: primary.confidence,
        alternatives,
      },
      suggested_role: suggestedRole,
      parsed_traits: parsedTraits,
      parsed_preferences: [],
      additional_traits_suggested: filteredAdditional,
      registration_template: registrationTemplate,
      clarification_needed: null,
      cluster_priors: {},
      next_steps: nextSteps.length > 0 ? nextSteps : [
        {
          step: 1,
          action: "Register on the protocol",
          description: "You just completed this step! Your registration template is ready above.",
          endpoint: "POST /schelling/register"
        }
      ],
      features,
    };

    return { ok: true, data: output };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
