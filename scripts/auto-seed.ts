#!/usr/bin/env bun
/**
 * Auto-seed demo data if the database is empty.
 * Called from startup (Dockerfile CMD or index.ts).
 * Checks /schelling/describe — if 0 clusters, seeds housing + freelance verticals.
 */

const API = process.env.SCHELLING_SEED_URL || `http://localhost:${process.env.PORT || process.env.SCHELLING_REST_PORT || "3000"}`;

async function api(op: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/schelling/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

async function waitForServer(maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${API}/schelling/describe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log("🌱 Auto-seed: checking if database needs seeding...");
  
  if (!await waitForServer()) {
    console.log("⚠️  Auto-seed: server not reachable, skipping");
    return;
  }

  const desc = await api("describe");
  if (desc.clusters?.total_active > 0) {
    console.log(`✅ Auto-seed: ${desc.clusters.total_active} clusters exist, skipping`);
    return;
  }

  console.log("🌱 Auto-seed: empty database, seeding demo data...");

  // Housing vertical — Fort Collins rentals
  const housing = [
    { intent: "Room available in Old Town Fort Collins, 3BR house, $750/mo utilities included, cat-friendly, available March 15" },
    { intent: "Studio apartment near CSU campus Fort Collins, $950/mo, no pets, includes parking, quiet building" },
    { intent: "1BR apartment in Midtown Fort Collins, $1100/mo, dog-friendly, W/D in unit, close to trails" },
    { intent: "Room near Horsetooth Reservoir Fort Collins, $650/mo plus utilities, no pets, garage storage" },
    { intent: "2BR apartment in Old Town Fort Collins, $1350/mo, modern, dogs allowed, rooftop access" },
    { intent: "Townhouse near CSU Fort Collins, 2BR, $1200/mo, small yard, cats and small dogs ok" },
    { intent: "1BR apartment in South Fort Collins, $900/mo, brand new, no pets, gym included" },
    { intent: "Room in 3BR house in Midtown Fort Collins, $700/mo, all pets welcome, big backyard" },
  ];

  // Freelance vertical — developers and designers
  const freelance = [
    { intent: "Freelance React developer in Denver, 5 years experience, $95/hr, available for contract work" },
    { intent: "Full-stack Python developer in Fort Collins, 3 years experience, $80/hr, remote ok" },
    { intent: "UX designer in Boulder, 7 years experience, $110/hr, specializing in SaaS products" },
    { intent: "iOS developer in Denver, 4 years experience, $100/hr, Swift and SwiftUI" },
    { intent: "DevOps engineer in Colorado Springs, 6 years experience, $120/hr, AWS and Kubernetes" },
    { intent: "Technical writer in Denver, 5 years experience, $65/hr, API docs and developer guides" },
  ];

  let count = 0;
  for (const h of housing) {
    await api("quick_offer", h);
    count++;
  }
  for (const f of freelance) {
    await api("quick_offer", f);
    count++;
  }

  console.log(`✅ Auto-seed: seeded ${count} demo entries across housing and freelance verticals`);
}

main().catch(e => console.error("Auto-seed error:", e));
