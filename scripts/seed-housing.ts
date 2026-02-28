#!/usr/bin/env bun
/**
 * Seed Fort Collins housing listings on Schelling Protocol.
 * Run against local or deployed instance.
 */

const API = process.env.SCHELLING_API || "https://www.schellingprotocol.com/schelling";

interface Listing {
  alias: string;
  description: string;
  traits: { key: string; value: string; value_type: string }[];
  preferences: { trait_key: string; operator: string; value: any; weight: number }[];
  intents: string[];
}

const listings: Listing[] = [
  {
    alias: "housing:oldtown-room-01",
    description: "Room available in Old Town Fort Collins. 3BR house, shared kitchen/bath. $750/mo utilities included. Cat-friendly. Available March 15.",
    traits: [
      { key: "type", value: "room", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "price", value: 750, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "pet_policy", value: "cats-ok", value_type: "string" },
      { key: "utilities", value: "included", value_type: "string" },
      { key: "available_date", value: "2026-03-15", value_type: "string" },
      { key: "shared", value: "kitchen, bathroom", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:csu-studio-02",
    description: "Studio apartment near CSU campus. $950/mo. No pets. Includes parking. Quiet building, great for students or professionals.",
    traits: [
      { key: "type", value: "studio", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "CSU Campus", value_type: "string" },
      { key: "price", value: 950, value_type: "number" },
      { key: "bedrooms", value: 0, value_type: "number" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
      { key: "parking", value: "included", value_type: "string" },
      { key: "available_date", value: "2026-03-01", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:midtown-1br-03",
    description: "1BR apartment in Midtown Fort Collins. $1100/mo. Dog-friendly. W/D in unit. Close to trails and shopping.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "Midtown", value_type: "string" },
      { key: "price", value: 1100, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "laundry", value: "in-unit", value_type: "string" },
      { key: "available_date", value: "2026-04-01", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:horsetooth-room-04",
    description: "Room in 4BR house near Horsetooth Reservoir. $650/mo + utilities. No pets. Outdoor enthusiasts preferred. Garage storage available.",
    traits: [
      { key: "type", value: "room", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "Horsetooth", value_type: "string" },
      { key: "price", value: 650, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
      { key: "utilities", value: "separate", value_type: "string" },
      { key: "storage", value: "garage", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:campuswest-2br-05",
    description: "2BR townhouse in Campus West. $1400/mo. Small dogs ok. Patio, 2 parking spots. Walking distance to CSU.",
    traits: [
      { key: "type", value: "townhouse", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "Campus West", value_type: "string" },
      { key: "price", value: 1400, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "pet_policy", value: "small-dogs-ok", value_type: "string" },
      { key: "parking", value: "2 spots", value_type: "string" },
      { key: "available_date", value: "2026-03-01", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:oldtown-1br-06",
    description: "1BR apartment above restaurant in Old Town. $900/mo. No pets. Charming, walkable to everything. Some noise on weekends.",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "price", value: 900, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
      { key: "walkability", value: "excellent", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:seeker-roommate-07",
    description: "Looking for a room or studio in Fort Collins. Budget $600-900. Cat owner. Quiet professional, clean, respectful.",
    traits: [
      { key: "type", value: "room or studio", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "budget_max", value: 900, value_type: "number" },
      { key: "budget_min", value: 600, value_type: "number" },
      { key: "has_pet", value: "cat", value_type: "string" },
      { key: "lifestyle", value: "quiet professional", value_type: "string" },
    ],
    preferences: [
      { trait_key: "location", operator: "eq", value: "Fort Collins", weight: 0.9 },
      { trait_key: "price", operator: "near", value: 750, weight: 0.7 },
      { trait_key: "pet_policy", operator: "eq", value: "cats-ok", weight: 0.8 },
    ],
    intents: ["seek"],
  },
  {
    alias: "housing:seeker-family-08",
    description: "Family of 3 looking for 2-3BR in Fort Collins. Budget up to $1500. Need yard or patio. Dog-friendly required.",
    traits: [
      { key: "type", value: "house or townhouse", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "budget_max", value: 1500, value_type: "number" },
      { key: "family_size", value: 3, value_type: "number" },
      { key: "has_pet", value: "dog", value_type: "string" },
    ],
    preferences: [
      { trait_key: "location", operator: "eq", value: "Fort Collins", weight: 0.9 },
      { trait_key: "bedrooms", operator: "gte", value: 2, weight: 0.8 },
      { trait_key: "price", operator: "near", value: 1300, weight: 0.6 },
      { trait_key: "pet_policy", operator: "eq", value: "dogs-ok", weight: 1.0 },
    ],
    intents: ["seek"],
  },
  {
    alias: "housing:south-fc-room-09",
    description: "Room in south Fort Collins near Harmony. $700/mo all-in. No smoking, no pets. Furnished.",
    traits: [
      { key: "type", value: "room", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "South Fort Collins", value_type: "string" },
      { key: "price", value: 700, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
      { key: "furnished", value: "yes", value_type: "string" },
      { key: "utilities", value: "included", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
  {
    alias: "housing:timnath-3br-10",
    description: "3BR house in Timnath (10 min from Fort Collins). $1800/mo. Large yard, 2-car garage. All pets welcome. Great for families.",
    traits: [
      { key: "type", value: "house", value_type: "string" },
      { key: "location", value: "Timnath", value_type: "string" },
      { key: "neighborhood", value: "Timnath", value_type: "string" },
      { key: "price", value: 1800, value_type: "number" },
      { key: "bedrooms", value: 3, value_type: "number" },
      { key: "pet_policy", value: "all-pets-welcome", value_type: "string" },
      { key: "garage", value: "2-car", value_type: "string" },
      { key: "yard", value: "large", value_type: "string" },
    ],
    preferences: [],
    intents: ["offer"],
  },
];

async function seed() {
  console.log(`Seeding ${listings.length} housing listings on ${API}...\n`);

  for (const listing of listings) {
    try {
      // Register directly with structured traits for proper matching
      const cluster = listing.intents.includes("seek") ? "housing.seekers" : "housing.rentals";
      const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol_version: "3.0",
          cluster_id: cluster,
          traits: listing.traits,
          preferences: listing.preferences,
          intents: listing.intents,
        }),
      });
      const data = await res.json();

      if (data.user_token) {
        // Store alias mapping
        await fetch(`${API}/agent_seek`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alias: listing.alias, intent: listing.description, cluster_id: cluster }),
        });
        console.log(`✅ ${listing.alias} → ${data.user_token.slice(0, 12)}... (${cluster})`);
      } else {
        console.log(`❌ ${listing.alias}: ${JSON.stringify(data)}`);
      }
    } catch (e: any) {
      console.log(`❌ ${listing.alias}: ${e.message}`);
    }
  }

  // Now test a search as Cody
  console.log("\n--- Testing search as Cody ---");
  const seekRes = await fetch(`${API}/agent_seek`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      alias: "telegram:cody",
      intent: "Looking for an apartment or room in Fort Collins, around $800/mo, no pets preferred, walkable area",
    }),
  });
  const seekData = await seekRes.json();
  console.log(`Token: ${seekData.user_token?.slice(0, 12)}...`);
  console.log(`Actions: ${seekData.actions_taken}`);
  console.log(`Candidates: ${seekData.candidates?.length || 0}\n`);

  for (const c of (seekData.candidates || []).slice(0, 5)) {
    console.log(`  Score: ${c.advisory_score} | ${c.match_explanation?.summary || "no explanation"}`);
    const traits = c.visible_traits || [];
    const neighborhood = traits.find((t: any) => t.key === "neighborhood")?.value || "?";
    const price = traits.find((t: any) => t.key === "price")?.value || "?";
    const type = traits.find((t: any) => t.key === "type")?.value || "?";
    console.log(`    ${type} in ${neighborhood} — $${price}/mo`);
  }
}

seed().catch(console.error);
