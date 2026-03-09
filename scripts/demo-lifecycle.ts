#!/usr/bin/env bun
/**
 * Schelling Protocol — Fort Collins Housing Full Lifecycle Demo
 *
 * Seeds 10 realistic Fort Collins rental listings, registers a seeker agent,
 * and runs the FULL lifecycle end-to-end:
 *   register → search → interest → inquire → commit → contract → deliver →
 *   accept_delivery → report → reputation
 *
 * Includes delegation model signals showing which dimensions have high vs low
 * agent confidence, and where the protocol recommends user review.
 *
 * Usage: bun run scripts/demo-lifecycle.ts
 */

const API = process.env.SCHELLING_API || "https://schellingprotocol.com/schelling";
// Use a unique run ID per execution for a clean cluster (avoids stale data from previous runs)
const RUN_ID = process.env.SCHELLING_CLUSTER_SUFFIX || `r${Date.now().toString(36)}`;
const CLUSTER = `housing.fortcollins.${RUN_ID}`;

// ─── Helpers ──────────────────────────────────────────────────────

async function api(operation: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${API}/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.code || data.error) {
    throw new Error(`API ${operation} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function divider(title: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(70)}\n`);
}

function step(n: number, title: string) {
  console.log(`\n┌─ Step ${n}: ${title}`);
  console.log(`│`);
}

function log(msg: string) {
  console.log(`│  ${msg}`);
}

function done(msg: string) {
  console.log(`│`);
  console.log(`└─ ✅ ${msg}\n`);
}

function warn(msg: string) {
  console.log(`│  ⚠️  ${msg}`);
}

// ─── Delegation Model (client-side computation per §15) ──────────

interface DelegationDimension {
  name: string;
  agent_confidence: number;
  dimension_decidability: number;
  signal_density: number;
  combined: number;
}

interface DelegationSummary {
  overall_confidence: number;
  match_ambiguity: number;
  high_confidence: DelegationDimension[];
  low_confidence: DelegationDimension[];
  recommendation: string;
  recommendation_strength: number;
}

function computeDelegation(
  preferences: Array<{ trait_key: string; agent_confidence?: number }>,
  candidateScores: number[],
): DelegationSummary {
  // Per §15: dimension_decidability priors for housing cluster
  const decidability: Record<string, number> = {
    price: 0.95,
    bedrooms: 0.92,
    neighborhood: 0.65,
    pet_policy: 0.88,
    parking: 0.85,
    type: 0.80,
    aesthetic: 0.35,
    "neighborhood.vibe": 0.30,
    laundry: 0.82,
    yard: 0.75,
  };

  // Signal density: for seeker with explicit preferences, high for stated dimensions
  const signalDensity: Record<string, number> = {
    price: 0.9,
    bedrooms: 0.9,
    neighborhood: 0.7,
    pet_policy: 0.95,
    parking: 0.4,
    type: 0.6,
    aesthetic: 0.3,
    "neighborhood.vibe": 0.2,
    laundry: 0.3,
    yard: 0.2,
  };

  const dimensions: DelegationDimension[] = preferences.map((p) => {
    const ac = p.agent_confidence ?? 0.5;
    const dd = decidability[p.trait_key] ?? 0.5;
    const sd = signalDensity[p.trait_key] ?? 0.3;
    const combined = ac * dd * sd;
    return {
      name: p.trait_key,
      agent_confidence: ac,
      dimension_decidability: dd,
      signal_density: sd,
      combined: Math.round(combined * 100) / 100,
    };
  });

  // Match ambiguity: variance in top candidate scores
  const topScores = candidateScores.slice(0, 5);
  const mean = topScores.reduce((a, b) => a + b, 0) / topScores.length;
  const variance = topScores.reduce((a, b) => a + (b - mean) ** 2, 0) / topScores.length;
  const matchAmbiguity = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 10));

  const overall = dimensions.reduce((sum, d) => sum + d.combined, 0) / dimensions.length;

  const high = dimensions.filter((d) => d.combined >= 0.5).sort((a, b) => b.combined - a.combined);
  const low = dimensions.filter((d) => d.combined < 0.5).sort((a, b) => a.combined - b.combined);

  // Recommendation per §15
  let recommendation: string;
  let strength: number;
  if (overall > 0.7 && matchAmbiguity < 0.5) {
    recommendation = "act_autonomously";
    strength = 0.85;
  } else if (overall > 0.5) {
    recommendation = "present_candidates_to_user";
    strength = 0.72;
  } else if (low.length > high.length) {
    recommendation = "seek_user_input_on_dimensions";
    strength = 0.65;
  } else {
    recommendation = "defer_to_user";
    strength = 0.80;
  }

  return {
    overall_confidence: Math.round(overall * 100) / 100,
    match_ambiguity: Math.round(matchAmbiguity * 100) / 100,
    high_confidence: high,
    low_confidence: low,
    recommendation,
    recommendation_strength: strength,
  };
}

function printDelegation(del: DelegationSummary) {
  log(`📊 Delegation Model Signals (§15):`);
  log(`   Overall delegation confidence: ${del.overall_confidence}`);
  log(`   Match ambiguity: ${del.match_ambiguity}`);
  log(`   Recommendation: "${del.recommendation}" (strength: ${del.recommendation_strength})`);
  log(``);
  log(`   🟢 High-confidence dimensions (agent can decide autonomously):`);
  for (const d of del.high_confidence) {
    log(`      ${d.name.padEnd(20)} combined=${d.combined}  (agent=${d.agent_confidence}, decidability=${d.dimension_decidability}, signal=${d.signal_density})`);
  }
  log(`   🟡 Low-confidence dimensions (recommend user review):`);
  for (const d of del.low_confidence) {
    log(`      ${d.name.padEnd(20)} combined=${d.combined}  (agent=${d.agent_confidence}, decidability=${d.dimension_decidability}, signal=${d.signal_density})`);
  }
}

// ─── Listing Data ─────────────────────────────────────────────────

interface ListingDef {
  alias: string;
  description: string;
  traits: Array<{ key: string; value: any; value_type: string; visibility?: string }>;
  afterInterestTraits?: Array<{ key: string; value: any; value_type: string }>;
}

const listings: ListingDef[] = [
  {
    alias: "Old Town Modern 2BR",
    description: "Modern 2BR apartment in Old Town Fort Collins. Open floor plan, quartz countertops, in-unit W/D. Dogs welcome ($250 pet deposit). 1 parking spot. $1,350/mo. Available April 1.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "price", value: 1350, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "parking", value: "1 spot", value_type: "string" },
      { key: "laundry", value: "in-unit", value_type: "string" },
      { key: "available_date", value: "2026-04-01", value_type: "string" },
    ],
    afterInterestTraits: [
      { key: "pet_deposit", value: 250, value_type: "number" },
      { key: "lease_terms", value: "12 or 6 month", value_type: "string" },
      { key: "landlord_contact", value: "listings@oldtownflats.com", value_type: "string" },
    ],
  },
  {
    alias: "Midtown Loft 2BR",
    description: "Stylish 2BR loft in Midtown near Whole Foods. 15-ft ceilings, exposed brick, modern finishes. Dogs under 50lb allowed. Bike storage. $1,275/mo. Available March 15.",
    traits: [
      { key: "type", value: "loft", value_type: "string" },
      { key: "neighborhood", value: "Midtown", value_type: "string" },
      { key: "price", value: 1275, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "dogs-under-50lb", value_type: "string" },
      { key: "parking", value: "street", value_type: "string" },
      { key: "laundry", value: "in-building", value_type: "string" },
      { key: "available_date", value: "2026-03-15", value_type: "string" },
    ],
    afterInterestTraits: [
      { key: "pet_deposit", value: 300, value_type: "number" },
      { key: "lease_terms", value: "12 month only", value_type: "string" },
    ],
  },
  {
    alias: "Old Town Classic 1BR",
    description: "Charming 1BR in historic Old Town building. Hardwood floors, claw-foot tub. No pets. Walk to restaurants. $950/mo.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "price", value: 950, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "aesthetic", value: "classic", value_type: "string" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
      { key: "parking", value: "street", value_type: "string" },
      { key: "laundry", value: "in-building", value_type: "string" },
    ],
  },
  {
    alias: "Campus West Townhouse 2BR",
    description: "2BR townhouse near CSU. Rustic feel with modern kitchen. Small patio, 2 parking spots. Dogs OK. $1,400/mo.",
    traits: [
      { key: "type", value: "townhouse", value_type: "string" },
      { key: "neighborhood", value: "Campus West", value_type: "string" },
      { key: "price", value: 1400, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "rustic", value_type: "string" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "parking", value: "2 spots", value_type: "string" },
      { key: "yard", value: "small patio", value_type: "string" },
    ],
  },
  {
    alias: "Timberline Modern 3BR",
    description: "Spacious 3BR apartment in Timberline area. New construction, smart home features, EV charging. All pets welcome. Garage + 1 spot. $2,100/mo.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Timberline", value_type: "string" },
      { key: "price", value: 2100, value_type: "number" },
      { key: "bedrooms", value: 3, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "all-pets", value_type: "string" },
      { key: "parking", value: "garage + 1 spot", value_type: "string" },
      { key: "laundry", value: "in-unit", value_type: "string" },
    ],
  },
  {
    alias: "Harmony Studio",
    description: "Cozy studio near Harmony corridor. Recently updated, good natural light. Cats only. 1 parking spot. $875/mo.",
    traits: [
      { key: "type", value: "studio", value_type: "string" },
      { key: "neighborhood", value: "Harmony", value_type: "string" },
      { key: "price", value: 875, value_type: "number" },
      { key: "bedrooms", value: 0, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "cats-only", value_type: "string" },
      { key: "parking", value: "1 spot", value_type: "string" },
    ],
  },
  {
    alias: "Midtown Classic 2BR",
    description: "2BR apartment in Midtown. Classic layout, tree-lined street, close to Spring Creek Trail. Dogs welcome. Off-street parking. $1,150/mo.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Midtown", value_type: "string" },
      { key: "price", value: 1150, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "classic", value_type: "string" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "parking", value: "off-street", value_type: "string" },
      { key: "laundry", value: "in-unit", value_type: "string" },
    ],
  },
  {
    alias: "Old Town Rustic 2BR",
    description: "2BR cottage-style in Old Town with original brick, wood beams. Fenced yard, dog-friendly neighborhood. W/D hookups. $1,475/mo.",
    traits: [
      { key: "type", value: "cottage", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "price", value: 1475, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "rustic", value_type: "string" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "parking", value: "driveway", value_type: "string" },
      { key: "yard", value: "fenced yard", value_type: "string" },
    ],
  },
  {
    alias: "Campus West Budget 1BR",
    description: "Affordable 1BR near CSU campus. Basic but clean. No pets. Shared laundry. 1 parking spot. $825/mo.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Campus West", value_type: "string" },
      { key: "price", value: 825, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "aesthetic", value: "classic", value_type: "string" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
      { key: "parking", value: "1 spot", value_type: "string" },
      { key: "laundry", value: "shared", value_type: "string" },
    ],
  },
  {
    alias: "Timberline Family 4BR",
    description: "Large 4BR house in quiet Timberline neighborhood. 2-car garage, big backyard, updated kitchen. All pets welcome. $2,450/mo.",
    traits: [
      { key: "type", value: "house", value_type: "string" },
      { key: "neighborhood", value: "Timberline", value_type: "string" },
      { key: "price", value: 2450, value_type: "number" },
      { key: "bedrooms", value: 4, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "all-pets", value_type: "string" },
      { key: "parking", value: "2-car garage", value_type: "string" },
      { key: "yard", value: "large backyard", value_type: "string" },
      { key: "laundry", value: "in-unit", value_type: "string" },
    ],
  },
];

// ─── Seeker Profile ───────────────────────────────────────────────

const seekerPreferences = [
  { trait_key: "bedrooms", operator: "eq", value: 2, weight: 0.9, agent_confidence: 0.95 },
  { trait_key: "price", operator: "range", value: [1000, 1500], weight: 0.8, agent_confidence: 0.90 },
  { trait_key: "neighborhood", operator: "in", value: ["Old Town", "Midtown"], weight: 0.7, agent_confidence: 0.75 },
  { trait_key: "aesthetic", operator: "eq", value: "modern", weight: 0.5, agent_confidence: 0.35 },
  { trait_key: "pet_policy", operator: "in", value: ["dogs-ok", "dogs-under-50lb", "all-pets"], weight: 1.0, agent_confidence: 0.98 },
];

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  divider("🏠 Schelling Protocol — Fort Collins Housing Full Lifecycle Demo");
  console.log(`API: ${API}`);
  console.log(`Cluster: ${CLUSTER}`);
  console.log(`Date: ${new Date().toISOString()}`);

  // Track tokens
  const listingTokens: Map<string, string> = new Map();
  let seekerToken: string;

  // ────────────────────────────────────────────────────────────────
  // STEP 1: Seed listings
  // ────────────────────────────────────────────────────────────────
  step(1, "Seed 10 Fort Collins rental listings");

  for (const listing of listings) {
    // Combine public and after_interest traits
    const allTraits = [
      ...listing.traits.map((t) => ({ ...t, visibility: "public" })),
      ...(listing.afterInterestTraits || []).map((t) => ({
        ...t,
        visibility: "after_interest",
      })),
    ];

    const res = await api("register", {
      protocol_version: "3.0",
      cluster_id: CLUSTER,
      role: "landlord",
      traits: allTraits,
      preferences: [],
      intents: ["offer", listing.description],
    });

    listingTokens.set(listing.alias, res.user_token);
    log(`✅ ${listing.alias.padEnd(30)} → ${res.user_token.slice(0, 12)}...  (${res.trait_count} traits, completeness: ${res.profile_completeness})`);
  }

  done(`Seeded ${listings.length} listings in cluster "${CLUSTER}"`);

  // ────────────────────────────────────────────────────────────────
  // STEP 2: Register seeker agent
  // ────────────────────────────────────────────────────────────────
  step(2, "Register seeker agent (Cody)");

  const seekerRes = await api("register", {
    protocol_version: "3.0",
    cluster_id: CLUSTER,
    role: "tenant",
    traits: [
      { key: "budget_min", value: 1000, value_type: "number", visibility: "public" },
      { key: "budget_max", value: 1500, value_type: "number", visibility: "public" },
      { key: "desired_bedrooms", value: 2, value_type: "number", visibility: "public" },
      { key: "has_pet", value: "dog (medium, 35lb)", value_type: "string", visibility: "public" },
      { key: "preferred_neighborhoods", value: "Old Town, Midtown", value_type: "string", visibility: "public" },
      { key: "preferred_aesthetic", value: "modern", value_type: "string", visibility: "public" },
    ],
    preferences: seekerPreferences.map(({ agent_confidence, ...rest }) => rest),
    intents: [
      "seek",
      "Looking for 2BR apartment, $1000-1500/mo, Old Town or Midtown, modern aesthetic, must allow dogs",
    ],
    text_profile: {
      description: "Cody — software engineer relocating to Fort Collins",
      seeking: "2BR apartment with modern aesthetic in Old Town or Midtown, dog-friendly, $1000-1500/mo",
      interests: ["tech", "hiking", "coffee shops", "dogs"],
    },
    identity: { name: "Cody" },
  });

  seekerToken = seekerRes.user_token;
  log(`✅ Seeker registered: ${seekerToken.slice(0, 12)}...`);
  log(`   Traits: ${seekerRes.trait_count}, Preferences: ${seekerRes.preference_count}`);
  log(`   Profile completeness: ${seekerRes.profile_completeness}`);
  log(`   Cluster created: ${seekerRes.cluster_created}`);
  if (seekerRes.suggested_additions?.length > 0) {
    log(`   Suggested additions: ${seekerRes.suggested_additions.join(", ")}`);
  }
  done("Seeker agent registered");

  // ────────────────────────────────────────────────────────────────
  // STEP 3: Search for matches
  // ────────────────────────────────────────────────────────────────
  step(3, "Search for matching listings");

  const searchRes = await api("search", {
    user_token: seekerToken,
    cluster_id: CLUSTER,
    top_k: 10,
    threshold: 0.0,
  });

  log(`Scanned: ${searchRes.total_scanned} candidates`);
  log(`Matches above threshold: ${searchRes.total_matches}`);
  log(`Returned: ${searchRes.candidates.length} candidates`);
  log(``);

  // Sort by score (should already be sorted)
  const candidates = searchRes.candidates.sort(
    (a: any, b: any) => b.advisory_score - a.advisory_score,
  );

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const neighborhood = c.visible_traits.find((t: any) => t.key === "neighborhood")?.value || "?";
    const price = c.visible_traits.find((t: any) => t.key === "price")?.value || "?";
    const beds = c.visible_traits.find((t: any) => t.key === "bedrooms")?.value ?? "?";
    const type = c.visible_traits.find((t: any) => t.key === "type")?.value || "?";
    const aesthetic = c.visible_traits.find((t: any) => t.key === "aesthetic")?.value || "?";
    const petPolicy = c.visible_traits.find((t: any) => t.key === "pet_policy")?.value || "?";
    const rank = i + 1;

    log(`#${rank}  Score: ${c.advisory_score}  |  ${type} in ${neighborhood}  |  ${beds}BR  |  $${price}/mo  |  ${aesthetic}  |  pets: ${petPolicy}`);
    log(`     Your fit: ${c.your_fit}  |  Their fit: ${c.their_fit}  |  Rep: ${c.reputation_score}`);
    if (c.match_explanation) {
      log(`     ${c.match_explanation.summary}`);
    }
  }

  // Verify we got matches with scores > 0
  const matchesAboveZero = candidates.filter((c: any) => c.advisory_score > 0);
  if (matchesAboveZero.length === 0) {
    throw new Error("No matches with score > 0 found!");
  }
  log(``);
  log(`✓ ${matchesAboveZero.length} matches with advisory_score > 0`);

  // ── Delegation Model Signals ──────────────────────────────────
  const delegationResult = computeDelegation(
    seekerPreferences,
    candidates.map((c: any) => c.advisory_score),
  );
  log(``);
  printDelegation(delegationResult);

  done(`Search complete — ${candidates.length} candidates found`);

  // ────────────────────────────────────────────────────────────────
  // STEP 4: Express interest in top 3
  // ────────────────────────────────────────────────────────────────
  step(4, "Express interest in top 3 matches");

  const top3 = candidates.slice(0, 3);
  const interestResults: any[] = [];

  for (let i = 0; i < top3.length; i++) {
    const c = top3[i];
    const neighborhood = c.visible_traits.find((t: any) => t.key === "neighborhood")?.value;
    const price = c.visible_traits.find((t: any) => t.key === "price")?.value;

    // Seeker expresses interest
    const seekerInterest = await api("interest", {
      user_token: seekerToken,
      candidate_id: c.candidate_id,
    });

    log(`#${i + 1} Seeker → interest in ${neighborhood} ($${price}/mo)`);
    log(`   Your stage: ${seekerInterest.your_stage} (INTERESTED)  |  Their stage: ${seekerInterest.their_stage}`);
    log(`   Mutual interest: ${seekerInterest.mutual_interest}`);

    // Now the listing side also expresses interest (simulating bilateral flow)
    // First, the listing must search to advance to DISCOVERED on this candidate pair
    const listingToken = findListingTokenForCandidate(c, seekerToken, listingTokens);
    if (listingToken) {
      // Listing searches (advances its side to DISCOVERED)
      await api("search", {
        user_token: listingToken,
        cluster_id: CLUSTER,
        top_k: 10,
      });

      const listingInterest = await api("interest", {
        user_token: listingToken,
        candidate_id: c.candidate_id,
      });

      log(`   Listing → search + interest back`);
      log(`   Seeker stage: ${listingInterest.their_stage}  |  Listing stage: ${listingInterest.your_stage}`);
      log(`   Mutual interest: ${listingInterest.mutual_interest} ✓`);

      if (listingInterest.newly_visible_traits?.length > 0) {
        log(`   Newly visible traits (after_interest):`);
        for (const t of listingInterest.newly_visible_traits) {
          log(`     ${t.key}: ${JSON.stringify(t.value)}`);
        }
      }
    }

    interestResults.push({ ...c, listingToken });
  }

  done("Interest expressed in top 3 — bilateral interest established");

  // ────────────────────────────────────────────────────────────────
  // STEP 5: Inquire (ask questions about top match)
  // ────────────────────────────────────────────────────────────────
  step(5, "Inquire — ask questions about pet deposit & lease terms");

  const topMatch = interestResults[0];
  const topNeighborhood = topMatch.visible_traits.find((t: any) => t.key === "neighborhood")?.value;

  // Ask about pet deposit
  const q1 = await api("inquire", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
    action: "ask",
    question: "What is the pet deposit amount? Any breed or weight restrictions for dogs?",
    category: "dealbreakers",
    required: true,
  });
  log(`Asked (${q1.inquiry_id.slice(0, 8)}...): Pet deposit & restrictions`);
  log(`   Status: ${q1.status}`);

  // Ask about lease terms
  const q2 = await api("inquire", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
    action: "ask",
    question: "What lease terms are available? Is a 12-month lease standard? Any early termination clause?",
    category: "logistics",
  });
  log(`Asked (${q2.inquiry_id.slice(0, 8)}...): Lease terms & early termination`);
  log(`   Status: ${q2.status}`);

  // Listing answers both questions
  if (topMatch.listingToken) {
    const a1 = await api("inquire", {
      user_token: topMatch.listingToken,
      candidate_id: topMatch.candidate_id,
      action: "answer",
      inquiry_id: q1.inquiry_id,
      answer: "Pet deposit is $250, refundable. No breed restrictions. Weight limit is 75lb per dog, max 2 dogs.",
      confidence: 0.95,
      source: "human_confirmed",
    });
    log(`Answered (${q1.inquiry_id.slice(0, 8)}...): Pet deposit = $250, no breed restrictions, 75lb limit`);
    log(`   Status: ${a1.status}  |  Answered at: ${a1.answered_at}`);

    const a2 = await api("inquire", {
      user_token: topMatch.listingToken,
      candidate_id: topMatch.candidate_id,
      action: "answer",
      inquiry_id: q2.inquiry_id,
      answer: "12-month lease is standard. 6-month available at $100/mo premium. Early termination: 60-day notice + 1 month penalty.",
      confidence: 0.90,
      source: "human_confirmed",
    });
    log(`Answered (${q2.inquiry_id.slice(0, 8)}...): 12-mo standard, early term = 60 days + 1mo penalty`);
    log(`   Status: ${a2.status}  |  Answered at: ${a2.answered_at}`);
  }

  // List all inquiries for this candidate pair
  const inquiryList = await api("inquire", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
    action: "list",
  });
  log(``);
  log(`Total inquiries for this pair: ${inquiryList.inquiries.length}`);
  for (const inq of inquiryList.inquiries) {
    log(`  [${inq.status}] Q: ${inq.question.slice(0, 60)}...`);
    if (inq.answer) {
      log(`           A: ${inq.answer.slice(0, 60)}... (confidence: ${inq.answer_confidence}, source: ${inq.answer_source})`);
    }
  }

  done("Inquiries complete — pet deposit confirmed at $250, 12-month lease standard");

  // ────────────────────────────────────────────────────────────────
  // STEP 6: Commit to best match
  // ────────────────────────────────────────────────────────────────
  step(6, `Commit to best match: ${topNeighborhood}`);

  // Seeker commits
  const seekerCommit = await api("commit", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
  });
  log(`Seeker committed`);
  log(`   Your stage: ${seekerCommit.your_stage} (COMMITTED)  |  Their stage: ${seekerCommit.their_stage}`);
  log(`   Connected: ${seekerCommit.connected}`);

  // Listing commits
  if (topMatch.listingToken) {
    const listingCommit = await api("commit", {
      user_token: topMatch.listingToken,
      candidate_id: topMatch.candidate_id,
    });
    log(`Listing committed`);
    log(`   Your stage: ${listingCommit.your_stage}  |  Their stage: ${listingCommit.their_stage}`);
    log(`   Connected: ${listingCommit.connected} ← both sides committed!`);

    if (listingCommit.newly_visible_traits?.length > 0) {
      log(`   Newly visible traits (after_commit):`);
      for (const t of listingCommit.newly_visible_traits) {
        log(`     ${t.key}: ${JSON.stringify(t.value)}`);
      }
    }
  }

  done("Mutual commitment established — parties now CONNECTED");

  // ── Delegation check: commit decision ─────────────────────────
  log(`📊 Delegation note: Agent committed autonomously on high-confidence`);
  log(`   dimensions (price=${delegationResult.high_confidence.find(d => d.name === "price")?.combined ?? "N/A"}, `
    + `bedrooms=${delegationResult.high_confidence.find(d => d.name === "bedrooms")?.combined ?? "N/A"}, `
    + `pet_policy=${delegationResult.high_confidence.find(d => d.name === "pet_policy")?.combined ?? "N/A"}).`);
  log(`   Low-confidence dimension "aesthetic" (${delegationResult.low_confidence.find(d => d.name === "aesthetic")?.combined ?? "N/A"}) was`);
  log(`   acceptable (listing is "modern" = matches preference) but would`);
  log(`   normally warrant user review if ambiguous.`);

  // ────────────────────────────────────────────────────────────────
  // STEP 7: Propose contract (12-month lease)
  // ────────────────────────────────────────────────────────────────
  step(7, "Propose contract — 12-month lease");

  const contractRes = await api("contract", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
    action: "propose",
    type: "service",
    terms: {
      lease_type: "residential",
      duration_months: 12,
      monthly_rent: topMatch.visible_traits.find((t: any) => t.key === "price")?.value || 1350,
      pet_deposit: 250,
      security_deposit: 1350,
      move_in_date: "2026-04-01",
      utilities_included: false,
      pet_policy: "1 dog under 75lb, $250 refundable deposit",
      early_termination: "60-day notice + 1 month penalty",
      renewal: "Month-to-month after initial term at same rate",
    },
    milestones: [
      { milestone_id: "signing", description: "Lease signed by both parties", deadline: "2026-03-15" },
      { milestone_id: "deposit", description: "Security deposit + pet deposit paid", deadline: "2026-03-20" },
      { milestone_id: "move-in", description: "Keys delivered, move-in complete", deadline: "2026-04-01" },
    ],
  });

  log(`Contract proposed: ${contractRes.contract_id.slice(0, 12)}...`);
  log(`   Status: ${contractRes.status}`);
  log(`   Type: ${contractRes.type}`);
  log(`   Round: ${contractRes.round}`);
  log(`   Terms: $${contractRes.terms.monthly_rent}/mo, ${contractRes.terms.duration_months}-month lease`);
  log(`   Milestones: ${contractRes.milestones?.length || 0}`);
  log(`   Expires: ${contractRes.expires_at}`);

  // Listing accepts the contract
  if (topMatch.listingToken) {
    const acceptRes = await api("contract", {
      user_token: topMatch.listingToken,
      candidate_id: topMatch.candidate_id,
      action: "accept",
      contract_id: contractRes.contract_id,
    });
    log(`Contract accepted by listing`);
    log(`   Status: ${acceptRes.status}`);
    log(`   Accepted at: ${acceptRes.accepted_at}`);
  }

  done("Contract proposed and accepted — lease terms agreed");

  // ────────────────────────────────────────────────────────────────
  // STEP 8: Deliver (lease document)
  // ────────────────────────────────────────────────────────────────
  step(8, "Deliver — lease document");

  const deliverRes = await api("deliver", {
    user_token: topMatch.listingToken,
    contract_id: contractRes.contract_id,
    milestone_id: "signing",
    deliverable: {
      type: "url",
      content: "https://docs.oldtownflats.com/leases/2026/unit-204-lease.pdf",
      content_type: "application/pdf",
      filename: "lease-agreement-unit-204.pdf",
      metadata: {
        unit: "204",
        building: "Old Town Flats",
        address: "234 Linden St, Fort Collins, CO 80524",
        generated_at: new Date().toISOString(),
      },
    },
    message: "Here's the lease agreement for Unit 204. Please review and sign by March 15.",
  });

  log(`Delivery submitted: ${deliverRes.delivery_id.slice(0, 12)}...`);
  log(`   Contract: ${deliverRes.contract_id.slice(0, 12)}...`);
  log(`   Milestone: ${deliverRes.milestone_id}`);
  log(`   Status: ${deliverRes.status}`);
  log(`   Delivered at: ${deliverRes.delivered_at}`);
  log(`   Expires at: ${deliverRes.expires_at}`);

  done("Lease document delivered");

  // ────────────────────────────────────────────────────────────────
  // STEP 9: Accept delivery
  // ────────────────────────────────────────────────────────────────
  step(9, "Accept delivery — lease received and reviewed");

  const acceptDeliveryRes = await api("accept_delivery", {
    user_token: seekerToken,
    delivery_id: deliverRes.delivery_id,
    accepted: true,
    feedback: "Lease reviewed and signed. Looking forward to moving in April 1!",
    rating: 0.95,
  });

  log(`Delivery accepted: ${acceptDeliveryRes.delivery_id.slice(0, 12)}...`);
  log(`   Status: ${acceptDeliveryRes.status}`);
  log(`   Responded at: ${acceptDeliveryRes.responded_at}`);
  log(`   Contract status: ${acceptDeliveryRes.contract_status}`);
  log(`   Milestone status: ${acceptDeliveryRes.milestone_status || "N/A"}`);

  done("Delivery accepted — lease signed");

  // ────────────────────────────────────────────────────────────────
  // STEP 10: Report positive outcome
  // ────────────────────────────────────────────────────────────────
  step(10, "Report positive outcome");

  const reportRes = await api("report", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
    outcome: "positive",
    feedback: {
      comment: "Great experience! Listing was accurate, landlord was responsive, lease terms were fair.",
      would_recommend: true,
      delegation_metadata: {
        dimensions_decided_by_agent: ["price", "bedrooms", "pet_policy", "neighborhood"],
        dimensions_reviewed_by_user: ["aesthetic", "lease_terms"],
        user_overrode_agent: false,
      },
    },
  });

  log(`Outcome reported: ${reportRes.reported ? "✓" : "✗"}`);
  log(`   Reported at: ${reportRes.reported_at}`);
  log(`   Delegation metadata included: agent decided on 4 dimensions,`);
  log(`   user reviewed 2 dimensions, no overrides`);

  // Also report from listing side
  if (topMatch.listingToken) {
    const listingReport = await api("report", {
      user_token: topMatch.listingToken,
      candidate_id: topMatch.candidate_id,
      outcome: "positive",
      feedback: {
        comment: "Tenant was professional and responsive. Smooth process.",
        would_recommend: true,
      },
    });
    log(`Listing also reported positive: ${listingReport.reported ? "✓" : "✗"}`);
  }

  done("Positive outcomes reported by both parties");

  // ────────────────────────────────────────────────────────────────
  // STEP 11: Check reputation
  // ────────────────────────────────────────────────────────────────
  step(11, "Check reputation updates");

  // Check seeker's reputation
  const seekerRep = await api("reputation", {
    user_token: seekerToken,
  });
  log(`Seeker (Cody) reputation:`);
  log(`   Score: ${seekerRep.score}`);
  log(`   Interaction count: ${seekerRep.interaction_count}`);
  log(`   Positive rate: ${seekerRep.positive_rate}`);
  log(`   Verification level: ${seekerRep.verification_level}`);
  log(`   Deliverables — delivered: ${seekerRep.deliverable_stats.delivered}, accepted: ${seekerRep.deliverable_stats.accepted}, rejected: ${seekerRep.deliverable_stats.rejected}`);

  // Check listing's reputation via candidate_id
  const listingRep = await api("reputation", {
    user_token: seekerToken,
    candidate_id: topMatch.candidate_id,
  });
  log(``);
  log(`Listing (${topNeighborhood}) reputation:`);
  log(`   Score: ${listingRep.score}`);
  log(`   Interaction count: ${listingRep.interaction_count}`);
  log(`   Positive rate: ${listingRep.positive_rate}`);
  log(`   Verification level: ${listingRep.verification_level}`);
  log(`   Deliverables — delivered: ${listingRep.deliverable_stats.delivered}, accepted: ${listingRep.deliverable_stats.accepted}, rejected: ${listingRep.deliverable_stats.rejected}`);

  done("Reputation updated for both parties");

  // ────────────────────────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────────────────────────
  divider("📋 Full Lifecycle Summary");

  console.log(`Cluster: ${CLUSTER}`);
  console.log(`Listings seeded: ${listings.length}`);
  console.log(`Seeker: Cody (2BR, $1000-1500, Old Town/Midtown, modern, dogs)`);
  console.log(`Matches found: ${candidates.length} (${matchesAboveZero.length} with score > 0)`);
  console.log(`Top match: ${topNeighborhood} at $${topMatch.visible_traits.find((t: any) => t.key === "price")?.value}/mo (score: ${topMatch.advisory_score})`);
  console.log(`Interest: Top 3 (bilateral interest established)`);
  console.log(`Inquiries: 2 questions asked and answered`);
  console.log(`Commitment: Mutual → CONNECTED`);
  console.log(`Contract: 12-month lease proposed and accepted`);
  console.log(`Delivery: Lease document delivered and accepted`);
  console.log(`Outcome: Positive (both parties)`);
  console.log(`Reputation: Updated (seeker: ${seekerRep.score}, listing: ${listingRep.score})`);
  console.log(``);
  console.log(`Delegation Model:`);
  console.log(`  Overall confidence: ${delegationResult.overall_confidence}`);
  console.log(`  Recommendation: "${delegationResult.recommendation}" (strength: ${delegationResult.recommendation_strength})`);
  console.log(`  Agent-decidable: price, bedrooms, pet_policy`);
  console.log(`  User-review recommended: aesthetic, neighborhood.vibe`);
  console.log(``);
  console.log(`✅ FULL LIFECYCLE COMPLETE — All 11 stages validated`);
}

// ─── Helper: find listing token for a candidate ──────────────────

function findListingTokenForCandidate(
  candidate: any,
  seekerToken: string,
  listingTokens: Map<string, string>,
): string | null {
  // The candidate's visible_traits tell us which listing this is
  // We match by checking traits against our known listings
  const neighborhood = candidate.visible_traits.find((t: any) => t.key === "neighborhood")?.value;
  const price = candidate.visible_traits.find((t: any) => t.key === "price")?.value;
  const beds = candidate.visible_traits.find((t: any) => t.key === "bedrooms")?.value;
  const aesthetic = candidate.visible_traits.find((t: any) => t.key === "aesthetic")?.value;

  for (const listing of listings) {
    const lNeighborhood = listing.traits.find((t) => t.key === "neighborhood")?.value;
    const lPrice = listing.traits.find((t) => t.key === "price")?.value;
    const lBeds = listing.traits.find((t) => t.key === "bedrooms")?.value;
    const lAesthetic = listing.traits.find((t) => t.key === "aesthetic")?.value;

    if (lNeighborhood === neighborhood && lPrice === price && lBeds === beds && lAesthetic === aesthetic) {
      return listingTokens.get(listing.alias) || null;
    }
  }

  return null;
}

// ─── Run ──────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n❌ DEMO FAILED:", err.message);
  console.error(err);
  process.exit(1);
});
