#!/usr/bin/env bun
/**
 * Example: Find a roommate using structured traits and preferences
 *
 * Shows the full registration flow with explicit traits and preferences
 * instead of natural language (for agents that want precise control).
 */

const API = process.env.SCHELLING_API || "https://schelling-protocol-production.up.railway.app";

async function api(op: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/schelling/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  console.log("🏠 Schelling Protocol — Roommate Search\n");

  // Register someone offering a room
  console.log("1. Registering a room listing...");
  const listing = await api("register", {
    protocol_version: "3.0",
    cluster_id: "housing.roommates",
    role: "provider",
    traits: [
      { key: "type", value: "shared-apartment", value_type: "string", visibility: "public" },
      { key: "location", value: "Fort Collins", value_type: "string", visibility: "public" },
      { key: "neighborhood", value: "Old Town", value_type: "string", visibility: "public" },
      { key: "price", value: 800, value_type: "number", visibility: "public" },
      { key: "bedrooms", value: 1, value_type: "number", visibility: "public" },
      { key: "pets", value: "cats-ok", value_type: "string", visibility: "public" },
      { key: "move_in", value: "2026-04-01", value_type: "string", visibility: "public" },
    ],
    preferences: [
      { trait_key: "clean", operator: "eq", value: true, weight: 0.9 },
      { trait_key: "quiet_hours", operator: "eq", value: true, weight: 0.7 },
    ],
  });
  console.log(`   ✅ Listed: ${listing.user_token?.slice(0, 8)}...\n`);

  // Register someone seeking a room
  console.log("2. Registering a room seeker...");
  const seeker = await api("register", {
    protocol_version: "3.0",
    cluster_id: "housing.roommates",
    role: "seeker",
    traits: [
      { key: "clean", value: true, value_type: "boolean", visibility: "public" },
      { key: "quiet_hours", value: true, value_type: "boolean", visibility: "public" },
      { key: "has_pets", value: "cat", value_type: "string", visibility: "public" },
    ],
    preferences: [
      { trait_key: "location", operator: "eq", value: "Fort Collins", weight: 0.8 },
      { trait_key: "price", operator: "lte", value: 900, weight: 1.0 },
      { trait_key: "pets", operator: "contains", value: "cats", weight: 0.9 },
    ],
  });
  console.log(`   ✅ Registered: ${seeker.user_token?.slice(0, 8)}...\n`);

  // Search
  console.log("3. Searching for matching rooms...");
  const results = await api("search", {
    user_token: seeker.user_token,
  });

  console.log(`   Found ${results.candidates?.length || 0} matches\n`);

  for (const c of results.candidates || []) {
    console.log(`   📋 ${c.candidate_id?.slice(0, 8)}...`);
    console.log(`      Score: ${c.advisory_score} | Your fit: ${c.your_fit} | Their fit: ${c.their_fit}`);
    const traits = c.visible_traits || [];
    const location = traits.find((t: any) => t.key === "location")?.value;
    const price = traits.find((t: any) => t.key === "price")?.value;
    if (location) console.log(`      Location: ${location}`);
    if (price) console.log(`      Price: $${price}/mo`);
    if (c.match_explanation?.summary) console.log(`      ${c.match_explanation.summary}`);
    console.log();
  }
}

main().catch(console.error);
