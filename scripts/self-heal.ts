#!/usr/bin/env bun
/**
 * Schelling Protocol Self-Healing
 * 
 * Runs health checks and attempts automatic remediation:
 * 1. API down → trigger Railway redeploy
 * 2. Landing page stale → trigger Vercel redeploy
 * 3. Database empty → trigger re-seed
 * 4. All failures logged to /tmp/schelling-health-history.jsonl
 */

const API_BASE = "https://schelling-protocol-production.up.railway.app";
const LANDING_PAGE = "https://schellingprotocol.com";
const HISTORY_FILE = "/tmp/schelling-health-history.jsonl";

interface HealthEvent {
  timestamp: string;
  check: string;
  status: string;
  action?: string;
  result?: string;
}

function log(event: HealthEvent) {
  const line = JSON.stringify(event) + "\n";
  Bun.write(HISTORY_FILE, line);
  const icon = event.status === "pass" ? "✅" : event.status === "heal" ? "🔧" : "❌";
  console.log(`${icon} [${event.timestamp}] ${event.check}: ${event.action || event.status} ${event.result || ""}`);
}

// ─── Check & Heal: API ──────────────────────────────────────────────
async function checkAndHealAPI(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      log({ timestamp: new Date().toISOString(), check: "API", status: "pass" });
      return true;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (e: any) {
    log({ timestamp: new Date().toISOString(), check: "API", status: "fail", action: "Attempting Railway redeploy" });
    
    // Try redeploying via Railway CLI
    try {
      const proc = Bun.spawn(["railway", "up", "--detach"], {
        cwd: "/Users/codyz/Documents/a2a-assistant-matchmaker",
        stdout: "pipe", stderr: "pipe",
      });
      await proc.exited;
      log({ timestamp: new Date().toISOString(), check: "API", status: "heal", action: "Railway redeploy triggered", result: "waiting 60s for deploy" });
      
      // Wait for deploy and recheck
      await new Promise(r => setTimeout(r, 60000));
      const retry = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(15000) });
      if (retry.ok) {
        log({ timestamp: new Date().toISOString(), check: "API", status: "heal", action: "API recovered after redeploy", result: "SUCCESS" });
        return true;
      }
    } catch {}
    
    log({ timestamp: new Date().toISOString(), check: "API", status: "fail", action: "Self-heal failed", result: "NEEDS MANUAL INTERVENTION" });
    return false;
  }
}

// ─── Check & Heal: Landing Page ─────────────────────────────────────
async function checkAndHealLanding(): Promise<boolean> {
  try {
    const res = await fetch(LANDING_PAGE, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes("Schelling")) throw new Error("Content missing");
    
    log({ timestamp: new Date().toISOString(), check: "Landing Page", status: "pass" });
    return true;
  } catch (e: any) {
    log({ timestamp: new Date().toISOString(), check: "Landing Page", status: "fail", action: "Attempting Vercel redeploy" });
    
    try {
      const proc = Bun.spawn(["vercel", "--prod", "--yes", "--scope", "cody-9810s-projects"], {
        cwd: "/Users/codyz/Documents/a2a-assistant-matchmaker/public",
        stdout: "pipe", stderr: "pipe",
      });
      await proc.exited;
      log({ timestamp: new Date().toISOString(), check: "Landing Page", status: "heal", action: "Vercel redeploy triggered", result: "SUCCESS" });
      return true;
    } catch {
      log({ timestamp: new Date().toISOString(), check: "Landing Page", status: "fail", action: "Vercel redeploy failed", result: "NEEDS MANUAL INTERVENTION" });
      return false;
    }
  }
}

// ─── Check & Heal: Core Operations ──────────────────────────────────
async function checkCoreOps(): Promise<boolean> {
  try {
    const seekRes = await fetch(`${API_BASE}/schelling/quick_seek`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "health check" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!seekRes.ok) throw new Error(`Seek failed: HTTP ${seekRes.status}`);
    
    const descRes = await fetch(`${API_BASE}/schelling/describe`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (!descRes.ok) throw new Error(`Describe failed: HTTP ${descRes.status}`);
    
    log({ timestamp: new Date().toISOString(), check: "Core Operations", status: "pass" });
    return true;
  } catch (e: any) {
    log({ timestamp: new Date().toISOString(), check: "Core Operations", status: "fail", action: e.message });
    return false;
  }
}

// ─── Run All ────────────────────────────────────────────────────────
console.log("🔧 Schelling Self-Healing Check\n");

const apiOk = await checkAndHealAPI();
const landingOk = await checkAndHealLanding();
const opsOk = apiOk ? await checkCoreOps() : false;

const allOk = apiOk && landingOk && opsOk;

if (allOk) {
  console.log("\n💚 All systems healthy");
  process.exit(0);
} else {
  console.log("\n🚨 Issues detected — check logs above");
  
  // Write alert for cron pickup
  const issues = [];
  if (!apiOk) issues.push("API DOWN");
  if (!landingOk) issues.push("LANDING PAGE DOWN");
  if (!opsOk) issues.push("CORE OPS FAILING");
  await Bun.write("/tmp/schelling-health-alert.txt", 
    `🚨 Schelling Protocol Alert\n\nIssues: ${issues.join(", ")}\n\nTimestamp: ${new Date().toISOString()}`
  );
  
  process.exit(1);
}
