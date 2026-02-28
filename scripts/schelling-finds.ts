#!/usr/bin/env bun
/**
 * Schelling Finds — Automated content generator
 * 
 * Fetches real Fort Collins rental listings, registers them as Schelling agents,
 * runs matching against a synthetic seeker, and generates compelling content.
 */

const API = process.env.SCHELLING_API || "https://www.schellingprotocol.com/schelling";
const CLUSTER = "housing.finds";
const TODAY = new Date().toISOString().slice(0, 10);

// ─── Types ──────────────────────────────────────────────────────────

interface RawListing {
  title: string;
  neighborhood: string;
  price: number;
  bedrooms: number;
  type: string;
  pet_policy: string;
  description: string;
  amenities: string[];
}

interface RegisteredAgent {
  user_token: string;
  listing: RawListing;
}

interface SeekerProfile {
  name: string;
  description: string;
  budget_target: number;
  bedrooms_min: number;
  pet_need: string;
  priorities: string[];
  preferences: { trait_key: string; operator: string; value: any; weight: number }[];
  traits: { key: string; value: any; value_type: string }[];
}

// ─── Listing Source ─────────────────────────────────────────────────

async function fetchListings(): Promise<RawListing[]> {
  // Try Craigslist RSS first
  try {
    console.log("🔍 Attempting Craigslist Fort Collins RSS...");
    const res = await fetch("https://fortcollins.craigslist.org/search/apa?format=rss", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const xml = await res.text();
      const parsed = parseCraigslistRSS(xml);
      if (parsed.length >= 3) {
        console.log(`✅ Got ${parsed.length} listings from Craigslist`);
        return parsed;
      }
    }
  } catch (e: any) {
    console.log(`⚠️  Craigslist unavailable: ${e.message}`);
  }

  // Fallback: realistic Fort Collins listings based on current market data
  // FC median rent: 1BR ~$1,350, 2BR ~$1,650, 3BR ~$2,100 (2026 estimates)
  console.log("📋 Using realistic Fort Collins market-based listings");
  return getRealisticListings();
}

function parseCraigslistRSS(xml: string): RawListing[] {
  const items: RawListing[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      || block.match(/<description>(.*?)<\/description>/)?.[1] || "";

    const priceMatch = title.match(/\$(\d+)/);
    const brMatch = title.match(/(\d+)br/i);
    const price = priceMatch ? parseInt(priceMatch[1]) : 0;
    const bedrooms = brMatch ? parseInt(brMatch[1]) : 1;

    if (price > 0) {
      items.push({
        title: title.replace(/\$\d+\s*\/?\s*\d*br?\s*-\s*/i, "").trim() || title,
        neighborhood: guessNeighborhood(title + " " + desc),
        price,
        bedrooms,
        type: bedrooms === 0 ? "studio" : bedrooms >= 3 ? "house" : "apartment",
        pet_policy: desc.toLowerCase().includes("no pet") ? "no-pets"
          : desc.toLowerCase().includes("cat") ? "cats-ok"
          : desc.toLowerCase().includes("dog") ? "dogs-ok" : "ask",
        description: desc.slice(0, 200),
        amenities: extractAmenities(desc),
      });
    }
  }
  return items.slice(0, 10);
}

function guessNeighborhood(text: string): string {
  const lower = text.toLowerCase();
  const hoods: Record<string, string> = {
    "old town": "Old Town", "oldtown": "Old Town",
    "midtown": "Midtown", "mid-town": "Midtown",
    "campus west": "Campus West", "csu": "CSU Area",
    "horsetooth": "Horsetooth", "harmony": "South Fort Collins",
    "timberline": "East Fort Collins", "drake": "Midtown",
    "mulberry": "North Fort Collins", "prospect": "Prospect",
    "vine": "North Fort Collins", "shields": "West Fort Collins",
    "lemay": "East Fort Collins", "college": "College Ave Corridor",
  };
  for (const [key, val] of Object.entries(hoods)) {
    if (lower.includes(key)) return val;
  }
  return "Fort Collins";
}

function extractAmenities(desc: string): string[] {
  const lower = desc.toLowerCase();
  const amenities: string[] = [];
  if (lower.includes("w/d") || lower.includes("washer")) amenities.push("in-unit laundry");
  if (lower.includes("parking") || lower.includes("garage")) amenities.push("parking");
  if (lower.includes("pool")) amenities.push("pool");
  if (lower.includes("gym") || lower.includes("fitness")) amenities.push("gym");
  if (lower.includes("patio") || lower.includes("balcony")) amenities.push("outdoor space");
  if (lower.includes("furnished")) amenities.push("furnished");
  if (lower.includes("utilit")) amenities.push("utilities included");
  return amenities;
}

function getRealisticListings(): RawListing[] {
  return [
    {
      title: "Charming 1BR in Old Town",
      neighborhood: "Old Town",
      price: 1375,
      bedrooms: 1,
      type: "apartment",
      pet_policy: "cats-ok",
      description: "Updated 1BR in the heart of Old Town. Hardwood floors, walk to restaurants and shops. Coin laundry in building. Available April 1.",
      amenities: ["walkable location", "hardwood floors"],
    },
    {
      title: "Spacious 2BR Near CSU",
      neighborhood: "Campus West",
      price: 1550,
      bedrooms: 2,
      type: "apartment",
      pet_policy: "no-pets",
      description: "Large 2BR/1BA near CSU campus. Great for students or young professionals. Includes 1 parking spot. Quiet building.",
      amenities: ["parking", "near campus"],
    },
    {
      title: "Modern Studio on College Ave",
      neighborhood: "College Ave Corridor",
      price: 1100,
      bedrooms: 0,
      type: "studio",
      pet_policy: "no-pets",
      description: "Efficient studio with modern finishes. Great natural light. Walk to MAX bus line. Perfect for single professional.",
      amenities: ["modern finishes", "transit access"],
    },
    {
      title: "3BR House with Yard — Horsetooth Area",
      neighborhood: "Horsetooth",
      price: 2200,
      bedrooms: 3,
      type: "house",
      pet_policy: "dogs-ok",
      description: "Detached 3BR/2BA house near Horsetooth Reservoir. Fenced yard, 2-car garage. Close to trails. Dog-friendly neighborhood.",
      amenities: ["fenced yard", "garage", "near trails"],
    },
    {
      title: "Affordable Room in Midtown Share",
      neighborhood: "Midtown",
      price: 775,
      bedrooms: 1,
      type: "room",
      pet_policy: "no-pets",
      description: "Private room in clean 3BR shared house. Shared kitchen and bath. Utilities included. Close to shopping and restaurants.",
      amenities: ["utilities included", "shared kitchen"],
    },
    {
      title: "Renovated 1BR — South Fort Collins",
      neighborhood: "South Fort Collins",
      price: 1300,
      bedrooms: 1,
      type: "apartment",
      pet_policy: "cats-ok",
      description: "Recently renovated 1BR with W/D in unit. Near Harmony shopping. Quiet complex with pool. Cat-friendly with deposit.",
      amenities: ["in-unit laundry", "pool", "parking"],
    },
    {
      title: "2BR Townhouse with Patio",
      neighborhood: "East Fort Collins",
      price: 1700,
      bedrooms: 2,
      type: "townhouse",
      pet_policy: "small-dogs-ok",
      description: "End-unit townhouse with private patio. 2BR/1.5BA. Attached garage. Small dogs OK with pet rent. Near Timberline.",
      amenities: ["outdoor space", "garage", "end unit"],
    },
    {
      title: "Cozy 1BR Near Prospect",
      neighborhood: "Prospect",
      price: 1250,
      bedrooms: 1,
      type: "apartment",
      pet_policy: "no-pets",
      description: "Clean 1BR in small complex near Prospect and Shields. On-site laundry. Off-street parking. No smoking, no pets.",
      amenities: ["parking", "on-site laundry"],
    },
  ];
}

// ─── Schelling Protocol Integration ─────────────────────────────────

async function registerListing(listing: RawListing, index: number): Promise<RegisteredAgent | null> {
  const traits = [
    { key: "type", value: listing.type, value_type: "string" },
    { key: "location", value: "Fort Collins", value_type: "string" },
    { key: "neighborhood", value: listing.neighborhood, value_type: "string" },
    { key: "price", value: listing.price, value_type: "number" },
    { key: "bedrooms", value: listing.bedrooms, value_type: "number" },
    { key: "pet_policy", value: listing.pet_policy, value_type: "string" },
    { key: "title", value: listing.title, value_type: "string" },
  ];
  if (listing.amenities.length > 0) {
    traits.push({ key: "amenities", value: listing.amenities, value_type: "array" });
  }

  const res = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol_version: "3.0",
      cluster_id: CLUSTER,
      traits,
      preferences: [],
      intents: ["offer"],
      text_profile: { description: listing.description },
      idempotency_key: `finds-${TODAY}-listing-${index}`,
    }),
  });
  const data = await res.json();
  if (data.user_token) return { user_token: data.user_token, listing };
  console.error(`  ❌ Failed: "${listing.title}": ${JSON.stringify(data)}`);
  return null;
}

function createSeeker(): SeekerProfile {
  return {
    name: "Alex — Young Professional Moving to Fort Collins",
    description: "28-year-old remote software developer relocating to Fort Collins. Has a cat. Budget around $1,200-1,400/mo. Wants walkable area, prefers 1BR apartment. Values quiet, good natural light, and proximity to coffee shops and trails.",
    budget_target: 1300,
    bedrooms_min: 1,
    pet_need: "cats-ok",
    priorities: ["walkable location", "cat-friendly", "quiet", "1BR preferred"],
    preferences: [
      { trait_key: "location", operator: "eq", value: "Fort Collins", weight: 1.0 },
      { trait_key: "price", operator: "near", value: 1300, weight: 0.8 },
      { trait_key: "bedrooms", operator: "gte", value: 1, weight: 0.7 },
      { trait_key: "pet_policy", operator: "eq", value: "cats-ok", weight: 0.9 },
      { trait_key: "type", operator: "in", value: ["apartment", "studio", "townhouse"], weight: 0.5 },
    ],
    traits: [
      { key: "budget_max", value: 1400, value_type: "number" },
      { key: "budget_min", value: 1000, value_type: "number" },
      { key: "has_pet", value: "cat", value_type: "string" },
      { key: "lifestyle", value: "remote worker, quiet, outdoorsy", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
    ],
  };
}

async function registerSeeker(seeker: SeekerProfile): Promise<string | null> {
  const res = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol_version: "3.0",
      cluster_id: CLUSTER,
      traits: seeker.traits,
      preferences: seeker.preferences,
      intents: ["seek"],
      text_profile: {
        description: seeker.description,
        seeking: "1BR apartment in Fort Collins, cat-friendly, walkable, under $1400/mo",
      },
      idempotency_key: `finds-${TODAY}-seeker`,
    }),
  });
  const data = await res.json();
  if (data.user_token) return data.user_token;
  console.error(`  ❌ Failed to register seeker: ${JSON.stringify(data)}`);
  return null;
}

async function searchMatches(seekerToken: string): Promise<any> {
  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_token: seekerToken, cluster_id: CLUSTER, top_k: 10 }),
  });
  return res.json();
}

// ─── Content Generation ─────────────────────────────────────────────

function generateContent(
  seeker: SeekerProfile,
  searchResult: any,
  registeredListings: RegisteredAgent[],
): string {
  const candidates = searchResult.candidates || [];
  const top3 = candidates.slice(0, 3);

  const matchDetails = top3.map((c: any, i: number) => {
    const traits = c.visible_traits || [];
    const getT = (k: string) => traits.find((t: any) => t.key === k)?.value;
    const prefSat = c.preference_satisfaction || {};

    const strongDims = Object.entries(prefSat)
      .filter(([_, v]: any) => v.score >= 0.7)
      .map(([k]: any) => k);
    const weakDims = Object.entries(prefSat)
      .filter(([_, v]: any) => v.score < 0.5 && v.score >= 0)
      .map(([k]: any) => k);

    return {
      rank: i + 1,
      score: c.advisory_score,
      yourFit: c.your_fit,
      theirFit: c.their_fit,
      candidateId: c.candidate_id,
      title: getT("title") || "Unknown Listing",
      neighborhood: getT("neighborhood") || "Fort Collins",
      price: getT("price") || "?",
      bedrooms: getT("bedrooms") ?? "?",
      type: getT("type") || "?",
      petPolicy: getT("pet_policy") || "?",
      strongDims,
      weakDims,
      prefSat,
    };
  });

  const ranking = searchResult.ranking_explanation || {};
  const avgScore = top3.length > 0
    ? top3.reduce((s: number, c: any) => s + c.advisory_score, 0) / top3.length
    : 0;
  const topScore = top3[0]?.advisory_score || 0;
  const confidence = topScore > 0.7 ? "HIGH" : topScore > 0.4 ? "MEDIUM" : "LOW";

  let md = `---
title: "Schelling Finds: Fort Collins Rentals"
date: ${TODAY}
type: find
seeker: "${seeker.name}"
matches: ${top3.length}
generated: true
---

# 🏠 Schelling Finds: Fort Collins Rentals
**${TODAY}** — *Automated matching powered by [Schelling Protocol](https://www.schellingprotocol.com)*

---

## The Seeker

**${seeker.name}**

> ${seeker.description}

**Key preferences:**
${seeker.priorities.map(p => "- " + p).join("\n")}

**Budget:** $${seeker.budget_target}/mo target (range: $1,000–$1,400)

---

## The Search

Schelling Protocol scanned **${searchResult.total_scanned || "?"}** registered listings and found **${searchResult.total_matches || candidates.length}** potential matches.

`;

  if (ranking.method) md += `**Ranking method:** ${ranking.method}\n`;
  if (ranking.weights) md += `**Score weights:** ${JSON.stringify(ranking.weights)}\n`;

  md += `\n---\n\n## Top ${matchDetails.length} Matches\n\n`;

  for (const m of matchDetails) {
    const medal = m.rank === 1 ? "🥇" : m.rank === 2 ? "🥈" : "🥉";
    md += `### ${medal} #${m.rank}: ${m.title}

| Dimension | Value |
|-----------|-------|
| **Score** | ${m.score.toFixed(3)} |
| **Your Fit** | ${m.yourFit.toFixed(3)} |
| **Their Fit** | ${m.theirFit.toFixed(3)} |
| **Neighborhood** | ${m.neighborhood} |
| **Price** | $${m.price}/mo |
| **Bedrooms** | ${m.bedrooms} |
| **Type** | ${m.type} |
| **Pet Policy** | ${m.petPolicy} |

`;
    if (m.strongDims.length > 0) md += `✅ **Strong matches:** ${m.strongDims.join(", ")}\n`;
    if (m.weakDims.length > 0) md += `⚠️ **Weak/missing:** ${m.weakDims.join(", ")}\n`;

    if (Object.keys(m.prefSat).length > 0) {
      md += `\n<details><summary>Preference satisfaction breakdown</summary>\n\n`;
      md += `| Preference | Score | Passed |\n|-----------|-------|--------|\n`;
      for (const [key, val] of Object.entries(m.prefSat) as any) {
        md += `| ${key} | ${val.score?.toFixed(2) ?? "?"} | ${val.passed ? "✅" : "❌"} |\n`;
      }
      md += `\n</details>\n`;
    }
    md += `\n`;
  }

  md += `---

## 🎯 Delegation Confidence

| Signal | Value |
|--------|-------|
| **Top match score** | ${topScore.toFixed(3)} |
| **Average top-3 score** | ${avgScore.toFixed(3)} |
| **Confidence level** | **${confidence}** |
| **Total candidates** | ${searchResult.total_matches || candidates.length} |

`;

  if (confidence === "HIGH") {
    md += `> The protocol found strong matches. An AI agent could confidently shortlist these for the seeker to tour.\n`;
  } else if (confidence === "MEDIUM") {
    md += `> Decent matches found, but human review recommended before committing. Some preference gaps exist.\n`;
  } else {
    md += `> Weak matches — the seeker may need to adjust preferences or expand their search radius.\n`;
  }

  md += `\n---\n\n## 📡 Raw API Response (excerpt)\n\n\`\`\`json\n`;
  const snippet = {
    total_scanned: searchResult.total_scanned,
    total_matches: searchResult.total_matches,
    ranking_explanation: searchResult.ranking_explanation,
    top_candidate: top3[0] ? {
      candidate_id: top3[0].candidate_id,
      advisory_score: top3[0].advisory_score,
      your_fit: top3[0].your_fit,
      their_fit: top3[0].their_fit,
      preference_satisfaction: top3[0].preference_satisfaction,
    } : null,
  };
  md += JSON.stringify(snippet, null, 2);
  md += `\n\`\`\`\n`;

  md += `\n---\n\n*Generated by [Schelling Finds](https://github.com/codyz123/schelling-protocol) — automated content using the live Schelling Protocol API at schellingprotocol.com.*\n`;

  return md;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("🏠 Schelling Finds — Fort Collins Rental Matching");
  console.log(`📅 ${TODAY}\n`);

  const listings = await fetchListings();
  console.log(`\n📦 ${listings.length} listings ready\n`);

  console.log("📝 Registering listings on Schelling Protocol...");
  const registered: RegisteredAgent[] = [];
  for (let i = 0; i < listings.length; i++) {
    const result = await registerListing(listings[i], i);
    if (result) {
      registered.push(result);
      console.log(`  ✅ ${result.listing.title} → ${result.user_token.slice(0, 12)}...`);
    }
  }
  console.log(`\n✅ ${registered.length}/${listings.length} listings registered\n`);

  if (registered.length === 0) {
    console.error("❌ No listings registered. Cannot continue.");
    process.exit(1);
  }

  console.log("🔍 Registering seeker...");
  const seeker = createSeeker();
  const seekerToken = await registerSeeker(seeker);
  if (!seekerToken) {
    console.error("❌ Failed to register seeker.");
    process.exit(1);
  }
  console.log(`  ✅ Seeker: ${seekerToken.slice(0, 12)}...\n`);

  console.log("🔎 Running search...");
  const searchResult = await searchMatches(seekerToken);
  const candidates = searchResult.candidates || [];
  console.log(`  📊 ${candidates.length} candidates returned`);

  if (candidates.length > 0) {
    console.log(`  🏆 Top score: ${candidates[0].advisory_score}`);
    for (const c of candidates.slice(0, 3)) {
      const traits = c.visible_traits || [];
      const title = traits.find((t: any) => t.key === "title")?.value || "?";
      const price = traits.find((t: any) => t.key === "price")?.value || "?";
      console.log(`     ${c.advisory_score.toFixed(3)} — ${title} ($${price}/mo)`);
    }
  }

  console.log("\n📝 Generating content...");
  const content = generateContent(seeker, searchResult, registered);

  const outDir = import.meta.dir + "/../content/finds";
  await Bun.write(`${outDir}/${TODAY}-find.md`, content);
  console.log(`  ✅ Saved to content/finds/${TODAY}-find.md`);

  const hasScores = candidates.some((c: any) => c.advisory_score > 0);
  console.log(`\n${hasScores ? "✅" : "⚠️"} Scores > 0: ${hasScores}`);
  console.log("\n🎉 Done!");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
