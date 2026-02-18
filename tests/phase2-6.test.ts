import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { initClusterRegistry, resetClusterRegistry } from "../src/clusters/registry.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleCompare } from "../src/handlers/compare.js";
import { handleRequestProfile } from "../src/handlers/request-profile.js";
import { handlePropose } from "../src/handlers/propose.js";
import { handleDecline } from "../src/handlers/decline.js";
import { handleReconsider } from "../src/handlers/reconsider.js";
import { handleUpdate } from "../src/handlers/update.js";
import { handleRefresh } from "../src/handlers/refresh.js";
import { handleMessage } from "../src/handlers/message.js";
import { handleMessages } from "../src/handlers/messages.js";
import { handleDirect } from "../src/handlers/direct.js";
import { handleRelayBlock } from "../src/handlers/relay-block.js";
import { handlePending } from "../src/handlers/pending.js";
import { handleListVerticals } from "../src/handlers/list-verticals.js";
import type { HandlerContext } from "../src/types.js";
import { CLUSTER_CENTROIDS } from "../src/clusters/centroids.js";

let db: Database;
let ctx: HandlerContext;

function makeEmbedding(seed: number = 0): number[] {
  const emb: number[] = [];
  for (let i = 0; i < 50; i++) {
    emb.push(Math.sin(seed + i * 0.5) * 0.8);
  }
  return emb;
}

function makeIntentEmbedding(clusterId: string = "matchmaking"): number[] {
  return [...CLUSTER_CENTROIDS[clusterId]];
}

async function registerUser(overrides: Record<string, any> = {}) {
  const result = await handleRegister({
    protocol_version: "schelling-2.0",
    embedding: makeEmbedding(Math.random() * 100),
    intent_embedding: makeIntentEmbedding(),
    city: "NYC",
    age_range: "25-34",
    intent: ["romance"],
    interests: ["hiking", "cooking"],
    description: "Test user",
    seeking: "Partner",
    identity: { name: "Test", contact: "test@test.com" },
    ...overrides,
  }, ctx);
  expect(result.ok).toBe(true);
  return (result as any).data.user_token as string;
}

async function createConnectedPair(): Promise<{ tokenA: string; tokenB: string; candidateId: string }> {
  const embA = makeEmbedding(1);
  const embB = makeEmbedding(1.1); // Very similar
  const tokenA = await registerUser({ embedding: embA });
  const tokenB = await registerUser({ embedding: embB });

  const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
  expect(searchResult.ok).toBe(true);
  const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;
  expect(candidateId).toBeDefined();

  // Evaluate both
  await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
  await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
  // Exchange both
  await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleRequestProfile({ user_token: tokenB, candidate_id: candidateId }, ctx);
  // Commit both → CONNECTED
  await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);
  const commitResult = await handlePropose({ user_token: tokenB, candidate_id: candidateId }, ctx);
  expect(commitResult.ok).toBe(true);
  expect((commitResult as any).data.status).toBe("mutual");

  return { tokenA, tokenB, candidateId };
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  resetClusterRegistry();
  initClusterRegistry();
  ctx = { db };
});

// ============================
// Phase 2: Bidirectional Scoring
// ============================

describe("Phase 2: Bidirectional Scoring", () => {
  test("search returns your_fit, their_fit, combined_score quantized to 2dp", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    await registerUser({ embedding: makeEmbedding(1.5) });

    const result = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    expect(result.ok).toBe(true);
    const cand = (result as any).data.candidates[0];
    expect(cand.your_fit).toBeDefined();
    expect(cand.their_fit).toBeDefined();
    expect(cand.combined_score).toBeDefined();
    // Check quantized to 2dp
    const dp = (n: number) => (n.toString().split(".")[1]?.length ?? 0);
    expect(dp(cand.your_fit)).toBeLessThanOrEqual(2);
    expect(dp(cand.their_fit)).toBeLessThanOrEqual(2);
    expect(dp(cand.combined_score)).toBeLessThanOrEqual(2);
  });

  test("USER_PAUSED check in search", async () => {
    const token = await registerUser({ status: "paused" });
    const result = await handleSearch({ user_token: token }, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("USER_PAUSED");
  });

  test("paused users excluded from search results", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    const tokenB = await registerUser({ embedding: makeEmbedding(1.1), status: "paused" });
    
    const result = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    expect(result.ok).toBe(true);
    const tokens = (result as any).data.candidates.map((c: any) => c.candidate_id);
    // Paused user should not appear
    expect((result as any).data.candidates.length).toBe(0);
  });

  test("mutual_no_identity on propose when other lacks identity", async () => {
    const embA = makeEmbedding(1);
    const embB = makeEmbedding(1.1);
    // A has identity, B does not
    const tokenA = await registerUser({ embedding: embA, identity: { name: "A", contact: "a@a.com" } });
    const resultB = await handleRegister({
      protocol_version: "schelling-2.0",
      embedding: embB,
      intent_embedding: makeIntentEmbedding(),
      city: "NYC",
      age_range: "25-34",
      intent: ["romance"],
      description: "Test",
      seeking: "Partner",
    }, ctx);
    expect(resultB.ok).toBe(true);
    const tokenB = (resultB as any).data.user_token;

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;
    
    await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
    await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
    await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleRequestProfile({ user_token: tokenB, candidate_id: candidateId }, ctx);
    // B commits first, then A commits (making it mutual)
    // When A commits and it's mutual, A fetches B's identity — B has none → mutual_no_identity
    await handlePropose({ user_token: tokenB, candidate_id: candidateId }, ctx);
    const result = await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.status).toBe("mutual_no_identity");
  });

  test("pending_mutual in exchange when other party not EVALUATED", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    await registerUser({ embedding: makeEmbedding(1.1) });

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;

    await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
    // Don't evaluate B

    const result = await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.status).toBe("pending_mutual");
  });
});

// ============================
// Phase 3: Intent Clustering
// ============================

describe("Phase 3: Intent Clustering", () => {
  test("schelling.intents returns clusters with centroids and roles", async () => {
    const result = handleListVerticals({}, ctx);
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.clusters).toBeDefined();
    expect(data.clusters.length).toBeGreaterThanOrEqual(4);

    const talent = data.clusters.find((c: any) => c.id === "talent");
    expect(talent).toBeDefined();
    expect(talent.centroid).toHaveLength(16);
    expect(talent.peer_roles).toEqual(["peer"]);
    expect(talent.roles.some((r: any) => r.id === "peer")).toBe(true);
    expect(talent.recommended_attributes).toBeDefined();
  });

  test("peer role users match each other in talent cluster", async () => {
    const intent = [...CLUSTER_CENTROIDS.talent];
    const tokenA = await registerUser({
      embedding: makeEmbedding(1),
      intent_embedding: intent,
      vertical_id: "talent",
      role: "peer",
    });
    const tokenB = await registerUser({
      embedding: makeEmbedding(1.1),
      intent_embedding: intent,
      vertical_id: "talent",
      role: "peer",
    });

    const result = await handleSearch({ user_token: tokenA, cluster_id: "talent", threshold: 0 }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.candidates.length).toBe(1);
  });
});

// ============================
// Phase 4: Decline Expiry & Reconsider
// ============================

describe("Phase 4: Decline Expiry & Reconsider", () => {
  test("decline returns expires_at and repeat_count", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    await registerUser({ embedding: makeEmbedding(1.1) });

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;

    const result = await handleDecline({ user_token: tokenA, candidate_id: candidateId }, ctx);
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.declined).toBe(true);
    expect(data.expires_at).not.toBeNull();
    expect(data.repeat_count).toBe(1);
  });

  test("reconsider lifts decline, user reappears in search", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    const tokenB = await registerUser({ embedding: makeEmbedding(1.1) });

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;

    await handleDecline({ user_token: tokenA, candidate_id: candidateId }, ctx);

    // Search should exclude declined user
    const search2 = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    expect((search2 as any).data.candidates.length).toBe(0);

    // Reconsider
    const reconsider = await handleReconsider({ user_token: tokenA, declined_token: tokenB }, ctx);
    expect(reconsider.ok).toBe(true);

    // Now should appear again
    const search3 = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    expect((search3 as any).data.candidates.length).toBe(1);
  });

  test("3rd decline becomes permanent, cannot reconsider", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    const tokenB = await registerUser({ embedding: makeEmbedding(1.1) });

    for (let i = 0; i < 3; i++) {
      // Search to create candidate
      const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
      if ((searchResult as any).data.candidates.length === 0 && i < 3) {
        // If previously reconsidered, candidate should reappear
        break;
      }
      const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;
      if (!candidateId) break;

      const declineResult = await handleDecline({ user_token: tokenA, candidate_id: candidateId }, ctx);
      if (i < 2) {
        expect((declineResult as any).data.expires_at).not.toBeNull();
        // Reconsider so we can decline again
        await handleReconsider({ user_token: tokenA, declined_token: tokenB }, ctx);
      } else {
        // 3rd decline should be permanent (null expiry)
        expect((declineResult as any).data.expires_at).toBeNull();
        expect((declineResult as any).data.repeat_count).toBe(3);
      }
    }

    // Can't reconsider permanent decline
    const reconsider = await handleReconsider({ user_token: tokenA, declined_token: tokenB }, ctx);
    expect(reconsider.ok).toBe(false);
    expect((reconsider as any).error.code).toBe("PERMANENT_DECLINE");
  });

  test("expired decline does not block search", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    await registerUser({ embedding: makeEmbedding(1.1) });

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;

    await handleDecline({ user_token: tokenA, candidate_id: candidateId }, ctx);

    // Manually expire the decline
    db.prepare("UPDATE declines SET expiry_at = datetime('now', '-1 day') WHERE decliner_token = ?").run(tokenA);

    const search2 = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    expect((search2 as any).data.candidates.length).toBe(1);
  });
});

// ============================
// Phase 5: Profile Update
// ============================

describe("Phase 5: Profile Update", () => {
  test("update description without affecting candidates", async () => {
    const token = await registerUser();
    const result = await handleUpdate({ user_token: token, description: "Updated desc" }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.updated_fields).toContain("description");
    expect((result as any).data.scores_recomputing).toBe(false);

    const user = db.prepare("SELECT description FROM users WHERE user_token = ?").get(token) as any;
    expect(user.description).toBe("Updated desc");
  });

  test("update status to paused", async () => {
    const token = await registerUser();
    const result = await handleUpdate({ user_token: token, status: "paused" }, ctx);
    expect(result.ok).toBe(true);

    const user = db.prepare("SELECT status FROM users WHERE user_token = ?").get(token) as any;
    expect(user.status).toBe("paused");
  });

  test("update embedding requires recompute_scores", async () => {
    const token = await registerUser();
    const result = await handleUpdate({ user_token: token, embedding: makeEmbedding(99) }, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("INVALID_INPUT");
  });

  test("update embedding with recompute_scores succeeds", async () => {
    const token = await registerUser();
    const result = await handleUpdate({
      user_token: token,
      embedding: makeEmbedding(99),
      recompute_scores: true,
    }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.scores_recomputing).toBe(true);
  });

  test("update immutable field rejected", async () => {
    const token = await registerUser();
    const result = await handleUpdate({ user_token: token, role: "admin" } as any, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("IMMUTABLE_FIELD");
  });

  test("update structured_attributes updates user_attributes table", async () => {
    const token = await registerUser({ structured_attributes: { languages: ["en"] } });
    await handleUpdate({
      user_token: token,
      structured_attributes: { languages: ["en", "zh"], profession: "engineer" },
    }, ctx);

    const attrs = db.prepare("SELECT attr_key, attr_value FROM user_attributes WHERE user_token = ?").all(token) as any[];
    expect(attrs.length).toBe(3); // en, zh, engineer
  });

  test("refresh updates last_registered_at", async () => {
    const token = await registerUser();
    // Set last_registered_at to 31 days ago
    db.prepare("UPDATE users SET last_registered_at = datetime('now', '-31 days') WHERE user_token = ?").run(token);

    const result = await handleRefresh({ user_token: token }, ctx);
    expect(result.ok).toBe(true);
    expect((result as any).data.refreshed).toBe(true);
  });

  test("refresh rate limited to 30 days", async () => {
    const token = await registerUser();
    // last_registered_at is now (just registered)
    const result = await handleRefresh({ user_token: token }, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("RATE_LIMITED");
  });
});

// ============================
// Phase 6: Message Relay
// ============================

describe("Phase 6: Message Relay", () => {
  test("send and retrieve messages between connected users", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    const sendResult = await handleMessage({
      user_token: tokenA,
      candidate_id: candidateId,
      content: "Hello!",
    }, ctx);
    expect(sendResult.ok).toBe(true);
    expect((sendResult as any).data.message_id).toBeDefined();

    // Retrieve messages as B
    const messagesResult = await handleMessages({
      user_token: tokenB,
      candidate_id: candidateId,
    }, ctx);
    expect(messagesResult.ok).toBe(true);
    const msgs = (messagesResult as any).data.messages;
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toBe("Hello!");
    expect(msgs[0].sender).toBe("them");
  });

  test("message at wrong stage fails", async () => {
    const tokenA = await registerUser({ embedding: makeEmbedding(1) });
    await registerUser({ embedding: makeEmbedding(1.1) });

    const searchResult = await handleSearch({ user_token: tokenA, threshold: 0 }, ctx);
    const candidateId = (searchResult as any).data.candidates[0]?.candidate_id;

    const result = await handleMessage({
      user_token: tokenA,
      candidate_id: candidateId,
      content: "Hi",
    }, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("STAGE_VIOLATION");
  });

  test("message > 5000 chars rejected", async () => {
    const { tokenA, candidateId } = await createConnectedPair();
    const result = await handleMessage({
      user_token: tokenA,
      candidate_id: candidateId,
      content: "x".repeat(5001),
    }, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("MESSAGE_TOO_LONG");
  });

  test("direct opt-in: one side pending, both sides mutual", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    // A opts in
    const directA = await handleDirect({ user_token: tokenA, candidate_id: candidateId }, ctx);
    expect(directA.ok).toBe(true);
    expect((directA as any).data.status).toBe("pending");

    // B opts in → mutual
    const directB = await handleDirect({ user_token: tokenB, candidate_id: candidateId }, ctx);
    expect(directB.ok).toBe(true);
    expect((directB as any).data.status).toBe("mutual");
    expect((directB as any).data.contact).toBeDefined();
  });

  test("relay block suppresses message delivery silently", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    // B blocks A
    await handleRelayBlock({ user_token: tokenB, candidate_id: candidateId, block: true }, ctx);

    // A sends message — should "succeed" silently
    const sendResult = await handleMessage({
      user_token: tokenA,
      candidate_id: candidateId,
      content: "blocked message",
    }, ctx);
    expect(sendResult.ok).toBe(true);

    // B retrieves messages — should see nothing
    const messagesResult = await handleMessages({
      user_token: tokenB,
      candidate_id: candidateId,
    }, ctx);
    expect((messagesResult as any).data.messages.length).toBe(0);
  });

  test("relay unblock restores delivery", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    await handleRelayBlock({ user_token: tokenB, candidate_id: candidateId, block: true }, ctx);
    await handleRelayBlock({ user_token: tokenB, candidate_id: candidateId, block: false }, ctx);

    await handleMessage({ user_token: tokenA, candidate_id: candidateId, content: "after unblock" }, ctx);

    const messagesResult = await handleMessages({ user_token: tokenB, candidate_id: candidateId }, ctx);
    expect((messagesResult as any).data.messages.length).toBe(1);
  });

  test("pending actions include new_message", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    await handleMessage({ user_token: tokenA, candidate_id: candidateId, content: "Hey" }, ctx);

    const pending = await handlePending({ user_token: tokenB }, ctx);
    expect(pending.ok).toBe(true);
    const actions = (pending as any).data.actions;
    expect(actions.some((a: any) => a.action_type === "new_message")).toBe(true);
  });

  test("message read tracking", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    await handleMessage({ user_token: tokenA, candidate_id: candidateId, content: "msg1" }, ctx);
    await handleMessage({ user_token: tokenA, candidate_id: candidateId, content: "msg2" }, ctx);

    // Check unread
    const unread = db.prepare("SELECT COUNT(*) as count FROM messages WHERE candidate_id = ? AND read = 0").get(candidateId) as any;
    expect(unread.count).toBe(2);

    // B reads messages
    await handleMessages({ user_token: tokenB, candidate_id: candidateId }, ctx);

    // Now should be read
    const afterRead = db.prepare("SELECT COUNT(*) as count FROM messages WHERE candidate_id = ? AND read = 0").get(candidateId) as any;
    expect(afterRead.count).toBe(0);
  });

  test("message pagination", async () => {
    const { tokenA, tokenB, candidateId } = await createConnectedPair();

    for (let i = 0; i < 5; i++) {
      await handleMessage({ user_token: tokenA, candidate_id: candidateId, content: `msg${i}` }, ctx);
    }

    const page1 = await handleMessages({ user_token: tokenB, candidate_id: candidateId, limit: 3 }, ctx);
    expect((page1 as any).data.messages.length).toBe(3);
    expect((page1 as any).data.has_more).toBe(true);
    expect((page1 as any).data.total_messages).toBe(5);
  });
});
