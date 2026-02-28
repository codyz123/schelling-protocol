import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { handleReport } from "../src/handlers/report.js";
import { handleClusterInfo } from "../src/handlers/clusters.js";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db as any);
  return db;
}

function createCtx(db: any): HandlerContext {
  return { db, config: {} as any };
}

/** Set up two users at CONNECTED stage so we can file reports */
function setupConnectedPair(db: any, clusterId = "test-cluster") {
  const rawA = "aaa-" + Math.random().toString(36).slice(2);
  const rawB = "zzz-" + Math.random().toString(36).slice(2);
  // Ensure tokenA < tokenB for CHECK constraint
  const tokenA = rawA < rawB ? rawA : rawB;
  const tokenB = rawA < rawB ? rawB : rawA;
  const candId = "cand-" + Math.random().toString(36).slice(2);

  // Create cluster
  db.prepare(
    `INSERT OR IGNORE INTO clusters (cluster_id, population, phase) VALUES (?, 2, 'active')`
  ).run(clusterId);

  // Create users
  db.prepare(
    `INSERT INTO users (user_token, cluster_id, role, display_name, status) VALUES (?, ?, 'seeker', 'User A', 'active')`
  ).run(tokenA, clusterId);
  db.prepare(
    `INSERT INTO users (user_token, cluster_id, role, display_name, status) VALUES (?, ?, 'seeker', 'User B', 'active')`
  ).run(tokenB, clusterId);

  // Create candidate at CONNECTED (stage 4)
  db.prepare(
    `INSERT INTO candidates (id, cluster_id, user_a_token, user_b_token, stage_a, stage_b, score, created_at) VALUES (?, ?, ?, ?, 4, 4, 0.8, datetime('now'))`
  ).run(candId, clusterId, tokenA, tokenB);

  return { tokenA, tokenB, candId, clusterId };
}

describe("Delegation metadata in report", () => {
  let db: any;
  let ctx: HandlerContext;

  beforeEach(() => {
    db = createTestDb();
    ctx = createCtx(db);
  });

  test("report with delegation_metadata stores it in outcomes table", async () => {
    const { tokenA, candId } = setupConnectedPair(db);

    const result = await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: ["price", "location"],
        user_reviewed_dimensions: ["aesthetics"],
        user_overrode_agent: false,
      },
    }, ctx);

    expect(result.ok).toBe(true);

    // Verify stored in DB
    const row = db.prepare("SELECT delegation_metadata FROM outcomes WHERE candidate_id = ? AND reporter_token = ?").get(candId, tokenA);
    expect(row).toBeTruthy();
    const meta = JSON.parse(row.delegation_metadata);
    expect(meta.agent_decided_dimensions).toEqual(["price", "location"]);
    expect(meta.user_reviewed_dimensions).toEqual(["aesthetics"]);
    expect(meta.user_overrode_agent).toBe(false);
  });

  test("report without delegation_metadata stores null", async () => {
    const { tokenA, candId } = setupConnectedPair(db);

    await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "positive",
    }, ctx);

    const row = db.prepare("SELECT delegation_metadata FROM outcomes WHERE candidate_id = ? AND reporter_token = ?").get(candId, tokenA);
    expect(row.delegation_metadata).toBeNull();
  });

  test("positive outcome with delegation_metadata increases dimension_decidability for agent-decided dims", async () => {
    const clusterId = "deleg-cluster-1";
    const { tokenA, candId } = setupConnectedPair(db, clusterId);

    await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: ["price", "location"],
        user_reviewed_dimensions: [],
        user_overrode_agent: false,
      },
    }, ctx);

    const cluster = db.prepare("SELECT delegation_priors FROM clusters WHERE cluster_id = ?").get(clusterId);
    expect(cluster.delegation_priors).toBeTruthy();
    const priors = JSON.parse(cluster.delegation_priors);

    // Starting from 0.5, EMA toward 1.0 with alpha=0.3: 0.5 + 0.3*(1-0.5) = 0.65
    expect(priors.dimension_decidability.price).toBeCloseTo(0.65, 2);
    expect(priors.dimension_decidability.location).toBeCloseTo(0.65, 2);
    expect(priors.sample_size).toBe(1);
  });

  test("negative outcome with agent-decided dims decreases decidability", async () => {
    const clusterId = "deleg-cluster-2";
    const { tokenA, candId } = setupConnectedPair(db, clusterId);

    await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "negative",
      delegation_metadata: {
        agent_decided_dimensions: ["price"],
        user_reviewed_dimensions: [],
        user_overrode_agent: false,
      },
    }, ctx);

    const cluster = db.prepare("SELECT delegation_priors FROM clusters WHERE cluster_id = ?").get(clusterId);
    const priors = JSON.parse(cluster.delegation_priors);

    // Starting from 0.5, EMA toward 0.0 with alpha=0.3: 0.5 + 0.3*(0-0.5) = 0.35
    expect(priors.dimension_decidability.price).toBeCloseTo(0.35, 2);
  });

  test("user_overrode_agent=true decreases decidability for user-reviewed dims", async () => {
    const clusterId = "deleg-cluster-3";
    const { tokenA, candId } = setupConnectedPair(db, clusterId);

    await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: [],
        user_reviewed_dimensions: ["aesthetics", "vibe"],
        user_overrode_agent: true,
      },
    }, ctx);

    const cluster = db.prepare("SELECT delegation_priors FROM clusters WHERE cluster_id = ?").get(clusterId);
    const priors = JSON.parse(cluster.delegation_priors);

    // Override: EMA toward 0.0: 0.5 + 0.3*(0-0.5) = 0.35
    expect(priors.dimension_decidability.aesthetics).toBeCloseTo(0.35, 2);
    expect(priors.dimension_decidability.vibe).toBeCloseTo(0.35, 2);
  });

  test("typical_agent_autonomy updates based on agent/user dimension ratio", async () => {
    const clusterId = "deleg-cluster-4";
    const { tokenA, candId } = setupConnectedPair(db, clusterId);

    await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: ["price", "location", "bedrooms"],
        user_reviewed_dimensions: ["aesthetics", "vibe"],
        user_overrode_agent: false,
      },
    }, ctx);

    const cluster = db.prepare("SELECT delegation_priors FROM clusters WHERE cluster_id = ?").get(clusterId);
    const priors = JSON.parse(cluster.delegation_priors);

    // thisAutonomy = 3/5 = 0.6, EMA from 0.5: 0.5 + 0.3*(0.6-0.5) = 0.53
    expect(priors.typical_agent_autonomy).toBeCloseTo(0.53, 2);
  });

  test("multiple reports accumulate priors via EMA", async () => {
    const clusterId = "deleg-cluster-5";
    const { tokenA, candId: candId1 } = setupConnectedPair(db, clusterId);
    
    await handleReport({
      user_token: tokenA,
      candidate_id: candId1,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: ["price"],
        user_reviewed_dimensions: [],
        user_overrode_agent: false,
      },
    }, ctx);

    // Second report from a different pair
    const { tokenA: tokenA2, candId: candId2 } = setupConnectedPair(db, clusterId);

    await handleReport({
      user_token: tokenA2,
      candidate_id: candId2,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: ["price"],
        user_reviewed_dimensions: [],
        user_overrode_agent: false,
      },
    }, ctx);

    const cluster = db.prepare("SELECT delegation_priors FROM clusters WHERE cluster_id = ?").get(clusterId);
    const priors = JSON.parse(cluster.delegation_priors);

    // First: 0.5 -> 0.65, Second: 0.65 + 0.3*(1-0.65) = 0.755
    expect(priors.dimension_decidability.price).toBeCloseTo(0.755, 2);
    expect(priors.sample_size).toBe(2);
  });

  test("cluster_info exposes delegation_priors", async () => {
    const clusterId = "deleg-cluster-6";
    const { tokenA, candId } = setupConnectedPair(db, clusterId);

    // Report with delegation metadata
    await handleReport({
      user_token: tokenA,
      candidate_id: candId,
      outcome: "positive",
      delegation_metadata: {
        agent_decided_dimensions: ["price"],
        user_reviewed_dimensions: ["aesthetics"],
        user_overrode_agent: false,
      },
    }, ctx);

    const infoResult = await handleClusterInfo({ cluster_id: clusterId }, ctx);
    expect(infoResult.ok).toBe(true);
    if (!infoResult.ok) return;

    const data = infoResult.data;
    expect(data.delegation_priors).toBeTruthy();
    expect(data.delegation_priors.dimension_decidability.price).toBeCloseTo(0.65, 2);
    expect(data.delegation_priors.sample_size).toBe(1);
  });

  test("cluster_info returns default priors for cluster with no reports", async () => {
    const clusterId = "deleg-cluster-7";
    db.prepare(
      `INSERT INTO clusters (cluster_id, population, phase) VALUES (?, 0, 'nascent')`
    ).run(clusterId);

    const infoResult = await handleClusterInfo({ cluster_id: clusterId }, ctx);
    expect(infoResult.ok).toBe(true);
    if (!infoResult.ok) return;

    expect(infoResult.data.delegation_priors.typical_agent_autonomy).toBe(0.5);
    expect(infoResult.data.delegation_priors.sample_size).toBe(0);
  });
});
