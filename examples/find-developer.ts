#!/usr/bin/env bun
/**
 * Example: Find a freelance developer using Schelling Protocol
 *
 * This example:
 * 1. Registers a developer offering their services
 * 2. Registers a client seeking a developer
 * 3. Shows the match results with scores and explanations
 */

const API = process.env.SCHELLING_API || "https://schellingprotocol.com";

async function api(op: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/schelling/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  console.log("🔍 Schelling Protocol — Find a Developer\n");

  // Step 1: Register a developer offering services
  console.log("1. Registering a React developer in Denver...");
  const offer = await api("quick_offer", {
    intent: "I am a freelance React developer in Denver, 5 years experience, $90/hr",
  });
  console.log(`   ✅ Registered: ${offer.user_token?.slice(0, 8)}...`);
  console.log(`   Cluster: ${offer.cluster_id}\n`);

  // Step 2: Search for that developer
  console.log("2. Searching for a React developer...");
  const seek = await api("quick_seek", {
    intent: "looking for a React developer in Denver, budget $120/hr, need 3+ years",
  });
  console.log(`   ✅ Found ${seek.candidates?.length || 0} candidates\n`);

  // Step 3: Show results
  if (seek.candidates?.length > 0) {
    for (const c of seek.candidates) {
      // quick_seek returns compact format: user_token_hash, score, matching_traits
      const id = c.candidate_id || c.user_token_hash || "unknown";
      console.log(`   📋 Candidate: ${id}`);
      console.log(`      Score: ${c.advisory_score ?? c.score}`);
      if (c.your_fit !== undefined) console.log(`      Your fit: ${c.your_fit} | Their fit: ${c.their_fit}`);
      if (c.matching_traits) console.log(`      Matching: ${c.matching_traits.join(", ")}`);
      if (c.match_explanation?.summary) console.log(`      ${c.match_explanation.summary}`);
      console.log();
    }
  }

  // Step 4: Express interest in best match (requires full search for candidate_id)
  if (seek.candidates?.length > 0 && seek.user_token) {
    console.log("3. Running full search for detailed results...");
    const search = await api("search", { user_token: seek.user_token });
    if (search.candidates?.length > 0) {
      const best = search.candidates[0];
      console.log(`   Top match: ${best.candidate_id?.slice(0, 8)}... (score: ${best.advisory_score})`);
      const interest = await api("interest", {
        user_token: seek.user_token,
        candidate_id: best.candidate_id,
      });
      console.log(`   ✅ Interest expressed. Stage: ${interest.new_stage ?? interest.stage}\n`);
    }
  }

  console.log("Done! Next steps: commit → contract → deliver → reputation");
}

main().catch(console.error);
