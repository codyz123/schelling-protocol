/**
 * Schelling Protocol — TypeScript Quickstart
 * ===========================================
 * Registers an apartment listing and a seeker, then shows match results.
 * Uses the live API at https://schellingprotocol.com
 *
 * Run: bun run main.ts
 */

const API = "https://schellingprotocol.com";

async function post<T = any>(operation: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/schelling/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${operation} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

function bar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Schelling Protocol — TypeScript Quickstart");
  console.log("  Apartment hunting in Fort Collins, CO");
  console.log("=".repeat(60));

  // Step 1: Register a listing (provider)
  console.log("\n🏠 Step 1: Register an apartment listing...");
  const offer = await post("quick_offer", {
    intent:
      "I have a 2-bedroom apartment in Fort Collins near CSU campus. " +
      "$1,350/month, pet-friendly, in-unit laundry, available March 1. " +
      "Quiet neighborhood, 10-min bike to Old Town.",
  });
  console.log(`   ✅ Registered in cluster: ${offer.cluster_id ?? "N/A"}`);
  console.log(`   Token: ${offer.user_token.slice(0, 8)}...`);
  const traits = offer.nl_parsed?.traits ?? [];
  if (traits.length) {
    console.log(`   Parsed ${traits.length} traits from natural language:`);
    for (const t of traits.slice(0, 5)) {
      console.log(`     • ${t.key}: ${t.value}`);
    }
  }

  // Step 2: Register a seeker
  console.log("\n🔍 Step 2: Register an apartment seeker...");
  const seek = await post("quick_seek", {
    intent:
      "Looking for a 2-bedroom apartment in Fort Collins. " +
      "Budget up to $1,500/month. Must be pet-friendly (I have a dog). " +
      "Prefer near Old Town or CSU. Need in-unit laundry.",
  });
  console.log(`   ✅ Registered in cluster: ${seek.cluster_id ?? "N/A"}`);
  console.log(`   Token: ${seek.user_token.slice(0, 8)}...`);

  // Step 3: Show match results
  const candidates: any[] = seek.candidates ?? [];
  const total = seek.total_matches ?? 0;
  console.log(`\n📊 Step 3: Match Results (${total} total candidates)`);
  console.log("-".repeat(50));

  if (candidates.length === 0) {
    console.log("   No candidates returned (network may be empty).");
  } else {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const score: number = c.score ?? 0;
      const matching = (c.matching_traits ?? []).join(", ");
      console.log(`   #${i + 1}  Score: ${score.toFixed(2)}  [${bar(score)}]`);
      console.log(`       Matching on: ${matching}`);
      console.log(`       ID: ${c.user_token_hash ?? "N/A"}`);
      console.log();
    }
  }

  // Step 4: Delegation model context
  console.log("🤖 Delegation Model Context");
  console.log("-".repeat(50));
  console.log("   In a real agent integration, include agent_confidence");
  console.log("   on each preference to signal AI certainty:\n");
  console.log(
    JSON.stringify(
      { key: "pet_friendly", value: true, agent_confidence: 0.95, source: "user_stated — 'I have a dog'" },
      null,
      4,
    )
      .split("\n")
      .map((l) => "   " + l)
      .join("\n"),
  );
  console.log();
  console.log(
    JSON.stringify(
      { key: "laundry", value: "in-unit", agent_confidence: 0.7, source: "user_preference — 'prefer'" },
      null,
      4,
    )
      .split("\n")
      .map((l) => "   " + l)
      .join("\n"),
  );

  // Done
  const bestScore = candidates[0]?.score ?? 0;
  console.log("\n" + "=".repeat(60));
  console.log("  ✅ Done! Both profiles registered and matched.");
  console.log(`  Highest match score: ${bestScore.toFixed(2)}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
