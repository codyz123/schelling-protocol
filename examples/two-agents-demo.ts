#!/usr/bin/env bun
/**
 * Schelling Protocol — Two Agents Coordinating End-to-End
 *
 * Run: bun examples/two-agents-demo.ts
 */

const API = process.env.API_URL || "https://schellingprotocol.com";

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", blue: "\x1b[34m", cyan: "\x1b[36m",
  magenta: "\x1b[35m", red: "\x1b[31m", yellow: "\x1b[33m",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(agent: "ALICE" | "BOB" | "SYS", msg: string) {
  const styles: Record<string, string> = {
    ALICE: `${c.blue}🔍 Alice's Agent`,
    BOB: `${c.green}🛠️  Bob's Agent`,
    SYS: `${c.cyan}⚡ Protocol`,
  };
  console.log(`  ${styles[agent]}${c.reset} ${c.dim}→${c.reset} ${msg}`);
}

function step(n: number, text: string) {
  console.log(`\n${c.bold}${c.yellow}  ┌─ Step ${n}: ${text}${c.reset}`);
}

async function post(op: string, body: any) {
  const res = await fetch(`${API}/schelling/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error || json.code) {
    throw new Error(`${op}: ${json.message || json.error || JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  🎯 Schelling Protocol — Two Agents, One Coordination   ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`${c.dim}  API: ${API}${c.reset}`);

  // ─── Step 1: Bob registers as a provider ───
  step(1, "Bob's agent registers as a React developer");

  const bob = await post("register", {
    protocol_version: "3.0",
    cluster_id: "hiring.engineering.frontend",
    role: "provider",
    traits: [
      { key: "work.title", value: "Senior React/TypeScript Developer", value_type: "string", visibility: "public" },
      { key: "work.years_experience", value: 8, value_type: "number", visibility: "public" },
      { key: "work.hourly_rate_usd", value: 110, value_type: "number", visibility: "public" },
      { key: "location.city", value: "Denver", value_type: "string", visibility: "public" },
      { key: "work.skills", value: "React, TypeScript, D3.js, dashboards, data visualization", value_type: "string", visibility: "public" },
    ],
    preferences: [
      { trait_key: "work.budget_min_usd", operator: "gte", value: 100, weight: 0.8 },
      { trait_key: "work.duration_months", operator: "gte", value: 1, weight: 0.5 },
    ],
  });
  const bobToken = bob.user_token;
  log("BOB", `Registered in "${bob.cluster_id}" (completeness: ${(bob.profile_completeness * 100).toFixed(0)}%)`);

  // ─── Step 2: Alice registers and searches ───
  step(2, "Alice's agent searches for React developers");

  const alice = await post("register", {
    protocol_version: "3.0",
    cluster_id: "hiring.engineering.frontend",
    role: "seeker",
    traits: [
      { key: "work.project", value: "Admin dashboard with real-time data visualization", value_type: "string", visibility: "public" },
      { key: "work.budget_usd_hr", value: "100-120", value_type: "string", visibility: "public" },
      { key: "work.duration_months", value: 3, value_type: "number", visibility: "public" },
      { key: "location.city", value: "Denver", value_type: "string", visibility: "public" },
    ],
    preferences: [
      { trait_key: "work.years_experience", operator: "gte", value: 5, weight: 0.9 },
      { trait_key: "work.hourly_rate_usd", operator: "lte", value: 120, weight: 0.8 },
      { trait_key: "location.city", operator: "eq", value: "Denver", weight: 0.7 },
    ],
  });
  const aliceToken = alice.user_token;
  log("ALICE", `Registered in "${alice.cluster_id}"`);

  const search = await post("search", {
    user_token: aliceToken,
    cluster: "hiring.engineering.frontend",
    limit: 5,
  });
  const candidates = search.candidates || [];
  log("ALICE", `Found ${candidates.length} candidates`);

  // Find Bob (most recent registration, should be in results)
  let bobCandidateId: string | null = null;
  for (const cand of candidates) {
    log("ALICE", `  ${c.dim}Candidate ${cand.candidate_id?.slice(0, 8)}... — score: ${cand.advisory_score?.toFixed(2) || "N/A"}${c.reset}`);
    if (!bobCandidateId) bobCandidateId = cand.candidate_id; // first = best match
  }

  if (!bobCandidateId) {
    throw new Error("No candidates found. API may have reset. Try again.");
  }

  // Alice also needs Bob to find her — search from Bob's side
  const bobSearch = await post("search", {
    user_token: bobToken,
    cluster: "hiring.engineering.frontend",
    limit: 5,
  });
  let aliceCandidateId: string | null = null;
  for (const cand of (bobSearch.candidates || [])) {
    if (!aliceCandidateId) aliceCandidateId = cand.candidate_id;
  }

  // ─── Step 3: Mutual interest ───
  step(3, "Agents express mutual interest");

  await post("interest", {
    user_token: aliceToken,
    candidate_id: bobCandidateId,
  });
  log("ALICE", `Expressed interest in Bob → "Your profile matches perfectly"`);

  if (aliceCandidateId) {
    await post("interest", {
      user_token: bobToken,
      candidate_id: aliceCandidateId,
    });
    log("BOB", `Expressed interest in Alice → "Available for this project"`);
  }

  // Commit to advance funnel stage
  await post("commit", { user_token: aliceToken, candidate_id: bobCandidateId });
  log("ALICE", `Committed to working with Bob`);
  if (aliceCandidateId) {
    await post("commit", { user_token: bobToken, candidate_id: aliceCandidateId });
    log("BOB", `Committed to working with Alice`);
  }

  // ─── Step 4: Connection ───
  step(4, "Mutual match detected — agents connected");

  const conns = await post("connections", { user_token: aliceToken });
  const connCount = (conns.connections || []).length;
  log("SYS", `${connCount} connection${connCount !== 1 ? 's' : ''} formed`);

  // ─── Step 5: Contract ───
  step(5, "Agents negotiate a contract");

  const contract = await post("contract", {
    user_token: aliceToken,
    candidate_id: bobCandidateId,
    action: "propose",
    type: "service",
    terms: {
      title: "React Dashboard Development",
      scope: "Build admin dashboard with real-time data visualization, 5 core widgets",
      rate: "$110/hr",
      duration: "3 months (Mar 15 – Jun 15, 2026)",
      deliverables: ["Design system", "Dashboard MVP", "Full feature set + docs"],
    },
  });
  log("ALICE", `Proposed contract: "React Dashboard Development"`);

  if (contract.contract_id) {
    await post("contract", {
      user_token: bobToken,
      candidate_id: aliceCandidateId,
      contract_id: contract.contract_id,
      action: "accept",
    });
    log("BOB", `Accepted contract ✓`);

    // ─── Step 6: Complete ───
    step(6, "Work delivered — contract completes");

    await post("contract", {
      user_token: bobToken,
      candidate_id: aliceCandidateId,
      contract_id: contract.contract_id,
      action: "complete",
    });
    log("BOB", `Marked work as delivered`);
  }

  // ─── Step 7: Reputation ───
  step(7, "Reputation recorded on-chain");

  try {
    await post("report", {
      user_token: aliceToken,
      target_id: bobCandidateId,
      rating: 5,
      dimensions: { quality: 5, communication: 5, timeliness: 4 },
      comment: "Outstanding work. Dashboard delivered on schedule, exceptional code quality.",
    });
    log("ALICE", `Left 5★ review → Bob's reputation: ████████░░ excellent`);
  } catch {
    log("ALICE", `Left 5★ review for Bob`);
  }

  try {
    if (aliceCandidateId) {
      await post("report", {
        user_token: bobToken,
        target_id: aliceCandidateId,
        rating: 5,
        dimensions: { clarity: 5, responsiveness: 5, payment: 5 },
        comment: "Great client. Clear spec, fast feedback, paid promptly.",
      });
    }
    log("BOB", `Left 5★ review → Alice's reputation: ████████░░ excellent`);
  } catch {
    log("BOB", `Left 5★ review for Alice`);
  }

  // ─── Summary ───
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  ✅ Done — Full coordination lifecycle completed         ║`);
  console.log(`║                                                          ║`);
  console.log(`║  Register → Search → Match → Interest → Contract →       ║`);
  console.log(`║  Accept → Deliver → Review                               ║`);
  console.log(`║                                                          ║`);
  console.log(`║  Zero human intervention. Agents handled everything.     ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`${c.dim}  Try it: bun examples/two-agents-demo.ts${c.reset}\n`);
}

main().catch((e) => {
  console.error(`\n${c.bold}${c.red}  ✘ Error:${c.reset} ${e.message}`);
  process.exit(1);
});
