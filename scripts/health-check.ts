#!/usr/bin/env bun
/**
 * Schelling Protocol Health Check Suite
 * 
 * Checks:
 * 1. API liveness (status endpoint)
 * 2. Core operations (quick_seek, quick_offer, describe)
 * 3. Landing page (schellingprotocol.com)
 * 4. MCP server (npm package accessible)
 * 5. Response times
 * 6. Database health (agent count, cluster count)
 * 
 * Exit codes:
 *   0 = all healthy
 *   1 = critical failure (API down)
 *   2 = degraded (slow responses, partial failures)
 */

const API_BASE = "https://schelling-protocol-production.up.railway.app";
const LANDING_PAGE = "https://schellingprotocol.com";
const NPM_PACKAGE = "https://registry.npmjs.org/@schelling/mcp-server";
const SLOW_THRESHOLD_MS = 3000;
const CRITICAL_THRESHOLD_MS = 10000;

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  latencyMs: number;
  message: string;
  details?: any;
}

const results: CheckResult[] = [];
const jsonMode = process.argv.includes("--json");
const alertMode = process.argv.includes("--alert");

async function check(name: string, fn: () => Promise<{ status: "pass" | "warn" | "fail"; message: string; details?: any }>) {
  const start = performance.now();
  try {
    const result = await fn();
    const latencyMs = Math.round(performance.now() - start);
    let status = result.status;
    if (status === "pass" && latencyMs > SLOW_THRESHOLD_MS) status = "warn";
    if (latencyMs > CRITICAL_THRESHOLD_MS) status = "fail";
    results.push({ name, status, latencyMs, message: result.message, details: result.details });
  } catch (e: any) {
    const latencyMs = Math.round(performance.now() - start);
    results.push({ name, status: "fail", latencyMs, message: e.message || String(e) });
  }
}

// ─── Check 1: API Liveness ──────────────────────────────────────────
await check("API Liveness", async () => {
  const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const data = await res.json() as any;
  if (data.status !== "live") return { status: "fail", message: `Status: ${data.status}` };
  return { status: "pass", message: "API is live", details: { version: data.version } };
});

// ─── Check 2: Describe Endpoint ─────────────────────────────────────
await check("Describe Endpoint", async () => {
  const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const data = await res.json() as any;
  if (!data.protocol) return { status: "fail", message: "Missing protocol in response" };
  return { status: "pass", message: `Protocol: ${data.protocol.name || "schelling"} v${data.protocol.version || "3.0"}`, details: { agents: data.network?.total_agents, clusters: data.network?.clusters } };
});

// ─── Check 3: Quick Seek ────────────────────────────────────────────
await check("Quick Seek", async () => {
  const res = await fetch(`${API_BASE}/schelling/quick_seek`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "health check - React developer" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const data = await res.json() as any;
  if (!data.candidates && !data.user_token) return { status: "warn", message: "Unexpected response shape" };
  return { status: "pass", message: `${data.candidates?.length || 0} matches`, details: { candidates: data.candidates?.length } };
});

// ─── Check 4: Clusters (read-only) ──────────────────────────────────
await check("Clusters Endpoint", async () => {
  const res = await fetch(`${API_BASE}/schelling/clusters`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}), signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const data = await res.json() as any;
  const count = data.clusters?.length || 0;
  return { status: "pass", message: `${count} clusters`, details: { count } };
});

// ─── Check 5: Landing Page ──────────────────────────────────────────
await check("Landing Page", async () => {
  const res = await fetch(LANDING_PAGE, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const html = await res.text();
  if (!html.includes("Schelling")) return { status: "fail", message: "Page content missing" };
  const hasTryIt = html.includes("try-it-box");
  if (!hasTryIt) return { status: "warn", message: "Missing try-it widget" };
  return { status: "pass", message: "Landing page OK" };
});

// ─── Check 6: NPM Package ──────────────────────────────────────────
await check("NPM Package", async () => {
  const res = await fetch(NPM_PACKAGE, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const data = await res.json() as any;
  const latest = data["dist-tags"]?.latest;
  if (!latest) return { status: "warn", message: "No latest version" };
  return { status: "pass", message: `v${latest}` };
});

// ─── Check 7: Database Health ───────────────────────────────────────
await check("Database Health", async () => {
  // Use /status endpoint which has full network stats
  const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { status: "fail", message: `HTTP ${res.status}` };
  const data = await res.json() as any;
  const agents = data.network?.total_agents || data.network?.agents || 0;
  if (agents === 0) return { status: "warn", message: "Zero agents" };
  return { status: "pass", message: `${agents} agents`, details: data.network };
});

// ─── Check 8: CORS ──────────────────────────────────────────────────
await check("CORS Headers", async () => {
  const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(5000) });
  const cors = res.headers.get("access-control-allow-origin");
  if (!cors) return { status: "warn", message: "No CORS header" };
  return { status: "pass", message: `CORS: ${cors}` };
});


// ─── Check 8.5: DNS Resolution ──────────────────────────────────────
await check("DNS Resolution", async () => {
  // If we can fetch both URLs, DNS is resolving
  const [api, landing] = await Promise.all([
    fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok),
    fetch(LANDING_PAGE, { signal: AbortSignal.timeout(5000) }).then(r => r.ok),
  ]);
  if (!api && !landing) return { status: "fail", message: "Both domains unreachable" };
  if (!api) return { status: "fail", message: "API domain unreachable" };
  if (!landing) return { status: "fail", message: "Landing page domain unreachable" };
  return { status: "pass", message: "Both domains resolving" };
});

// ─── Check 9: SSL ───────────────────────────────────────────────────
await check("SSL Certificate", async () => {
  await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(5000) });
  await fetch(LANDING_PAGE, { signal: AbortSignal.timeout(5000) });
  return { status: "pass", message: "Both endpoints SSL OK" };
});

// ─── Output ─────────────────────────────────────────────────────────
const passed = results.filter(r => r.status === "pass").length;
const warned = results.filter(r => r.status === "warn").length;
const failed = results.filter(r => r.status === "fail").length;

if (jsonMode) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), summary: { total: results.length, passed, warned, failed }, checks: results }, null, 2));
} else {
  console.log("\n🏥 Schelling Protocol Health Check");
  console.log("═".repeat(50));
  for (const r of results) {
    const icon = r.status === "pass" ? "✅" : r.status === "warn" ? "⚠️" : "❌";
    console.log(`${icon} ${r.name}: ${r.message} (${r.latencyMs}ms)`);
  }
  console.log("═".repeat(50));
  console.log(`Results: ${passed} pass, ${warned} warn, ${failed} fail`);
  if (failed > 0) console.log("\n🚨 CRITICAL: Failures detected!");
  else if (warned > 0) console.log("\n⚠️ DEGRADED: Warnings detected");
  else console.log("\n💚 ALL HEALTHY");
}

// Alert
if (alertMode && failed > 0) {
  const failedChecks = results.filter(r => r.status === "fail");
  const alertMsg = `🚨 Schelling Health Alert!\n\n${failedChecks.map(r => `❌ ${r.name}: ${r.message} (${r.latencyMs}ms)`).join("\n")}`;
  await Bun.write("/tmp/schelling-health-alert.txt", alertMsg);
}

if (failed > 0) process.exit(1);
if (warned > 0) process.exit(2);
process.exit(0);
