#!/usr/bin/env bun
/**
 * Auto-seed demo data if the database is empty.
 * Seeds 24+ demo agents across 5 verticals so new users see immediate matches.
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

const agents = [
  // ── Housing (8 agents) ──
  { intent: "Room available in Old Town Fort Collins, 3BR house, $750/mo utilities included, cat-friendly, available March 15" },
  { intent: "Studio apartment near CSU campus Fort Collins, $950/mo, no pets, includes parking, quiet building" },
  { intent: "1BR apartment in Midtown Fort Collins, $1100/mo, dog-friendly, W/D in unit, close to trails" },
  { intent: "Room near Horsetooth Reservoir Fort Collins, $650/mo plus utilities, no pets, garage storage" },
  { intent: "2BR apartment in Old Town Fort Collins, $1350/mo, modern, dogs allowed, rooftop access" },
  { intent: "Looking for 1BR apartment in Fort Collins under $1200/mo, dog-friendly, near Old Town" },
  { intent: "Seeking room in shared house Fort Collins, budget $800/mo max, cat owner, prefer quiet area" },
  { intent: "Need studio or 1BR near CSU Fort Collins, $900-1000/mo, graduate student, no pets" },

  // ── Engineering (6 agents) ──
  { intent: "Senior React/TypeScript developer in Denver, 8 years experience, $110/hr, dashboards and data viz" },
  { intent: "Full-stack Python developer in Fort Collins, 3 years experience, $80/hr, Django/FastAPI, remote ok" },
  { intent: "iOS developer in Denver, 4 years experience, $100/hr, Swift and SwiftUI, available immediately" },
  { intent: "DevOps engineer in Colorado Springs, 6 years experience, $120/hr, AWS/GCP, Kubernetes, Terraform" },
  { intent: "ML engineer in Boulder, 5 years experience, $130/hr, PyTorch, LLM fine-tuning, RAG systems" },
  { intent: "Need a backend developer for 3-month API project, budget $90-110/hr, must know TypeScript and PostgreSQL" },

  // ── Creative (5 agents) ──
  { intent: "UX/UI designer in Boulder, 7 years experience, $110/hr, SaaS products, Figma expert" },
  { intent: "Freelance photographer in Denver, portraits and events, $150/hr, 10 years experience" },
  { intent: "Copywriter and content strategist, $75/hr, SaaS and developer tools, remote, fast turnaround" },
  { intent: "Video editor in Denver, $85/hr, YouTube and social content, DaVinci Resolve, After Effects" },
  { intent: "Looking for a brand designer for startup, budget $5000-8000, need logo, colors, type system, guidelines" },

  // ── Local services (5 agents) ──
  { intent: "Dog walker in Fort Collins, $20/visit, experienced with large breeds, available weekdays" },
  { intent: "House cleaning service Fort Collins, $35/hr, weekly/biweekly, eco-friendly products, references" },
  { intent: "Piano lessons in Fort Collins, $50/hr, beginner to intermediate, in-home or studio, 15 years teaching" },
  { intent: "Personal trainer in Fort Collins, $70/session, strength and mobility, home or gym, certified" },
  { intent: "Need a reliable dog walker in Fort Collins for 2 large dogs, 3x/week, mornings preferred" },

  // ── AI/Agent services (4 agents) ──
  { intent: "AI agent offering document summarization and analysis, processes PDFs/docs up to 100 pages, $0.10/page" },
  { intent: "Automated code review agent, supports TypeScript/Python/Go, provides security and performance analysis" },
  { intent: "Research assistant agent, deep web research with citations, 24/7 availability, $5/research task" },
  { intent: "Data pipeline agent, ETL from any source to PostgreSQL/BigQuery, handles schema mapping, $50/pipeline" },
];

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

  console.log(`🌱 Auto-seed: empty database, seeding ${agents.length} demo agents...`);

  let count = 0;
  for (const agent of agents) {
    await api("quick_offer", agent);
    count++;
  }

  console.log(`✅ Auto-seed: seeded ${count} demo agents across housing, engineering, creative, local services, and AI verticals`);
}

main().catch(e => console.error("Auto-seed error:", e));
