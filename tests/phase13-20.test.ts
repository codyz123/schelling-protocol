import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleCompare } from "../src/handlers/compare.js";
import { handleRequestProfile } from "../src/handlers/request-profile.js";
import { handlePropose } from "../src/handlers/propose.js";
import { handleGroupEvaluate } from "../src/handlers/group-evaluate.js";
import { handleGroupCommit } from "../src/handlers/group-commit.js";
import { handleInquire } from "../src/handlers/inquire.js";
import { handleSubscribe } from "../src/handlers/subscribe.js";
import { handleUnsubscribe } from "../src/handlers/unsubscribe.js";
import { handleNotifications } from "../src/handlers/notifications.js";
import { handleContract } from "../src/handlers/contract.js";
import { handleContractUpdate } from "../src/handlers/contract-update.js";
import { handleEvent } from "../src/handlers/event.js";
import { handleUpdate } from "../src/handlers/update.js";
import type { HandlerContext } from "../src/types.js";
import { DIMENSION_COUNT } from "../src/types.js";
import { initVerticalRegistry } from "../src/verticals/registry.js";
import { CLUSTER_CENTROIDS } from "../src/clusters/centroids.js";

function makeEmbedding(base: number, variance: number = 0): number[] {
  return new Array(DIMENSION_COUNT).fill(0).map((_, i) => {
    const v = base + (variance ? Math.sin(i) * variance : 0);
    return Math.max(-1, Math.min(1, v));
  });
}

function makeIntentEmbedding(cluster: string = "matchmaking", noise: number = 0.05): number[] {
  const centroid = CLUSTER_CENTROIDS[cluster] || CLUSTER_CENTROIDS.matchmaking;
  return centroid.map((v: number, i: number) => {
    const noisy = v + (Math.sin(i * 7) * noise);
    return Math.max(-1, Math.min(1, noisy));
  });
}

let ctx: HandlerContext;

beforeEach(() => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  initSchema(db);
  initVerticalRegistry();
  ctx = { db };
});

async function registerUser(overrides: Record<string, unknown> = {}) {
  const result = await handleRegister(
    {
      protocol_version: "schelling-2.0",
      embedding: makeEmbedding(0.5, 0.2),
      intent_embedding: makeIntentEmbedding(),
      city: "San Francisco",
      age_range: "25-34",
      intent: ["romance"],
      interests: ["coding"],
      description: "Test user",
      seeking: "Connection",
      identity: { name: "Test", contact: "test@test.com" },
      ...overrides,
    },
    ctx
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

async function advanceToStage(tokenA: string, tokenB: string, targetStage: number) {
  // Search
  await handleSearch({ user_token: tokenA }, ctx);
  await handleSearch({ user_token: tokenB }, ctx);

  const candidateRow = ctx.db.prepare(
    "SELECT id FROM candidates WHERE (user_a_token = ? AND user_b_token = ?) OR (user_a_token = ? AND user_b_token = ?)"
  ).get(tokenA, tokenB, tokenB, tokenA) as { id: string };
  const candidateId = candidateRow.id;

  if (targetStage >= 2) {
    await handleCompare({ user_token: tokenA, candidate_ids: [candidateId] }, ctx);
    await handleCompare({ user_token: tokenB, candidate_ids: [candidateId] }, ctx);
  }
  if (targetStage >= 3) {
    await handleRequestProfile({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handleRequestProfile({ user_token: tokenB, candidate_id: candidateId }, ctx);
  }
  if (targetStage >= 4) {
    await handlePropose({ user_token: tokenA, candidate_id: candidateId }, ctx);
    await handlePropose({ user_token: tokenB, candidate_id: candidateId }, ctx);
  }
  return candidateId;
}

// ==================== Phase 13: Peer Roles ====================
describe("Phase 13: Peer Roles in Talent Cluster", () => {
  test("peer role users find each other in search", async () => {
    const tokenA = await registerUser({ vertical_id: "talent", role: "peer", intent_embedding: makeIntentEmbedding("talent") });
    const tokenB = await registerUser({ vertical_id: "talent", role: "peer", intent_embedding: makeIntentEmbedding("talent") });
    const result = await handleSearch({ user_token: tokenA, vertical_id: "talent" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.candidates.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("peer role does not match employer role", async () => {
    const peerToken = await registerUser({ vertical_id: "talent", role: "peer", intent_embedding: makeIntentEmbedding("talent") });
    await registerUser({ vertical_id: "talent", role: "seeker", intent_embedding: makeIntentEmbedding("talent") });
    const result = await handleSearch({ user_token: peerToken, vertical_id: "talent" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.candidates.length).toBe(0);
    }
  });

  test("talent cluster has peer role defined", async () => {
    const { getCluster } = await import("../src/clusters/registry.js");
    const cluster = getCluster("talent");
    expect(cluster).toBeDefined();
    expect(cluster!.peer_roles).toContain("peer");
    expect(cluster!.roles.peer).toBeDefined();
  });
});

// ==================== Phase 14: Multi-Party Groups ====================
describe("Phase 14: Multi-Party Group Formation", () => {
  test("group_evaluate returns pairwise scores for 3 members", async () => {
    const t1 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });
    const t2 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });
    const t3 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });

    const result = await handleGroupEvaluate({
      user_token: t1,
      cluster_id: "roommates",
      member_tokens: [t1, t2, t3],
    }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pairwise_scores.length).toBe(3); // C(3,2) = 3
      expect(result.data.member_count).toBe(3);
      expect(typeof result.data.viable).toBe("boolean");
    }
  });

  test("group_commit create → join → complete lifecycle", async () => {
    const t1 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });
    const t2 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });
    const t3 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });

    // Create group
    const createResult = await handleGroupCommit({
      user_token: t1,
      action: "create",
      cluster_id: "roommates",
      member_tokens: [t1, t2, t3],
    }, ctx);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const groupId = createResult.data.group_id;
    expect(createResult.data.status).toBe("proposed");

    // t2 joins
    const joinResult = await handleGroupCommit({ user_token: t2, action: "join", group_id: groupId }, ctx);
    expect(joinResult.ok).toBe(true);
    if (joinResult.ok) expect(joinResult.data.status).toBe("proposed");

    // t3 joins → complete
    const joinResult2 = await handleGroupCommit({ user_token: t3, action: "join", group_id: groupId }, ctx);
    expect(joinResult2.ok).toBe(true);
    if (joinResult2.ok) expect(joinResult2.data.status).toBe("complete");
  });

  test("member leaving below min dissolves group", async () => {
    const t1 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });
    const t2 = await registerUser({ vertical_id: "roommates", intent_embedding: makeIntentEmbedding("roommates") });

    const createResult = await handleGroupCommit({
      user_token: t1,
      action: "create",
      cluster_id: "roommates",
      member_tokens: [t1, t2],
    }, ctx);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const leaveResult = await handleGroupCommit({ user_token: t2, action: "leave", group_id: createResult.data.group_id }, ctx);
    expect(leaveResult.ok).toBe(true);
    if (leaveResult.ok) expect(leaveResult.data.status).toBe("dissolved");
  });

  test("group in non-group cluster fails", async () => {
    const t1 = await registerUser();
    const t2 = await registerUser();

    const result = await handleGroupEvaluate({
      user_token: t1,
      cluster_id: "matchmaking",
      member_tokens: [t1, t2],
    }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });
});

// ==================== Phase 15: Structured Attributes & Hard Filters ====================
describe("Phase 15: Structured Attributes & Hard Filters", () => {
  test("register with structured_attributes and search with hard_filters", async () => {
    const tokenA = await registerUser({ structured_attributes: { languages: ["en", "zh"], profession: "attorney" } });
    const tokenB = await registerUser({ structured_attributes: { languages: ["en"], profession: "engineer" } });

    const result = await handleSearch({ user_token: tokenA, hard_filters: { languages: "zh" } }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // tokenB doesn't have zh, so shouldn't appear
      expect(result.data.candidates.length).toBe(0);
    }
  });

  test("hard_filters are conjunctive", async () => {
    const tokenA = await registerUser({ structured_attributes: { languages: ["zh"], jurisdiction: "CO" } });
    const tokenB = await registerUser({ structured_attributes: { languages: ["zh"] } }); // missing jurisdiction

    const result = await handleSearch({
      user_token: tokenA,
      hard_filters: { languages: "zh", jurisdiction: "CO" },
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.candidates.length).toBe(0); // tokenB missing jurisdiction
  });

  test("update structured_attributes reflects in search", async () => {
    const tokenA = await registerUser({ structured_attributes: { languages: ["en"] } });
    const tokenB = await registerUser({ structured_attributes: { languages: ["en"] } });

    await handleUpdate({ user_token: tokenB, structured_attributes: { languages: ["en", "zh"] } }, ctx);

    const result = await handleSearch({ user_token: tokenA, hard_filters: { languages: "zh" } }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.candidates.length).toBe(1);
  });
});

// ==================== Phase 16: Pre-Commitment Dialogue ====================
describe("Phase 16: Inquire", () => {
  test("ask question at EVALUATED stage succeeds", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    const result = await handleInquire({
      user_token: tokenA,
      candidate_id: candidateId,
      action: "ask",
      question: "What are your hobbies?",
      category: "lifestyle",
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("asked");
  });

  test("ask question at DISCOVERED stage fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 1);

    const result = await handleInquire({
      user_token: tokenA,
      candidate_id: candidateId,
      action: "ask",
      question: "Test?",
    }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STAGE_VIOLATION");
  });

  test("answer a question succeeds", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    const askResult = await handleInquire({
      user_token: tokenA,
      candidate_id: candidateId,
      action: "ask",
      question: "Pets?",
    }, ctx);
    expect(askResult.ok).toBe(true);
    if (!askResult.ok) return;

    const answerResult = await handleInquire({
      user_token: tokenB,
      candidate_id: candidateId,
      action: "answer",
      inquiry_id: askResult.data.inquiry_id,
      answer: "I have a cat",
    }, ctx);
    expect(answerResult.ok).toBe(true);
    if (answerResult.ok) expect(answerResult.data.status).toBe("answered");
  });

  test("answer already-answered question fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    const askResult = await handleInquire({ user_token: tokenA, candidate_id: candidateId, action: "ask", question: "Q?" }, ctx);
    if (!askResult.ok) return;

    await handleInquire({ user_token: tokenB, candidate_id: candidateId, action: "answer", inquiry_id: askResult.data.inquiry_id, answer: "A" }, ctx);
    const result = await handleInquire({ user_token: tokenB, candidate_id: candidateId, action: "answer", inquiry_id: askResult.data.inquiry_id, answer: "A2" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ALREADY_ANSWERED");
  });

  test("rate limit: 6th question fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    for (let i = 0; i < 5; i++) {
      const r = await handleInquire({ user_token: tokenA, candidate_id: candidateId, action: "ask", question: `Q${i}?` }, ctx);
      expect(r.ok).toBe(true);
    }
    const r6 = await handleInquire({ user_token: tokenA, candidate_id: candidateId, action: "ask", question: "Q6?" }, ctx);
    expect(r6.ok).toBe(false);
    if (!r6.ok) expect(r6.error.code).toBe("RATE_LIMITED");
  });

  test("list inquiries returns Q&A history", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    await handleInquire({ user_token: tokenA, candidate_id: candidateId, action: "ask", question: "Q1?" }, ctx);
    const listResult = await handleInquire({ user_token: tokenA, candidate_id: candidateId, action: "list" }, ctx);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) expect(listResult.data.inquiries.length).toBe(1);
  });
});

// ==================== Phase 17: Subscribe ====================
describe("Phase 17: Subscribe", () => {
  test("create subscription succeeds", async () => {
    const token = await registerUser();
    const result = await handleSubscribe({
      user_token: token,
      intent_embedding: makeIntentEmbedding(),
      threshold: 0.3,
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("active");
  });

  test("max 10 subscriptions enforced", async () => {
    const token = await registerUser();
    for (let i = 0; i < 10; i++) {
      const r = await handleSubscribe({ user_token: token, intent_embedding: makeIntentEmbedding(), threshold: 0.3 }, ctx);
      expect(r.ok).toBe(true);
    }
    const r11 = await handleSubscribe({ user_token: token, intent_embedding: makeIntentEmbedding(), threshold: 0.3 }, ctx);
    expect(r11.ok).toBe(false);
    if (!r11.ok) expect(r11.error.code).toBe("MAX_SUBSCRIPTIONS");
  });

  test("unsubscribe cancels subscription", async () => {
    const token = await registerUser();
    const subResult = await handleSubscribe({ user_token: token, intent_embedding: makeIntentEmbedding(), threshold: 0.3 }, ctx);
    expect(subResult.ok).toBe(true);
    if (!subResult.ok) return;

    const unsubResult = await handleUnsubscribe({ user_token: token, subscription_id: subResult.data.subscription_id }, ctx);
    expect(unsubResult.ok).toBe(true);
    if (unsubResult.ok) expect(unsubResult.data.status).toBe("cancelled");
  });

  test("new registration triggers subscription notification", async () => {
    const subscriber = await registerUser();
    const subResult = await handleSubscribe({
      user_token: subscriber,
      intent_embedding: makeIntentEmbedding(),
      threshold: 0.1, // low threshold so it matches
    }, ctx);
    expect(subResult.ok).toBe(true);
    if (!subResult.ok) return;

    // Register another user with similar intent
    await registerUser();

    const notifResult = await handleNotifications({ user_token: subscriber }, ctx);
    expect(notifResult.ok).toBe(true);
    if (notifResult.ok) {
      expect(notifResult.data.notifications.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("unsubscribed subscription gets no new notifications", async () => {
    const subscriber = await registerUser();
    const subResult = await handleSubscribe({ user_token: subscriber, intent_embedding: makeIntentEmbedding(), threshold: 0.1 }, ctx);
    if (!subResult.ok) return;

    await handleUnsubscribe({ user_token: subscriber, subscription_id: subResult.data.subscription_id }, ctx);
    await registerUser();

    const notifResult = await handleNotifications({ user_token: subscriber, subscription_id: subResult.data.subscription_id }, ctx);
    expect(notifResult.ok).toBe(true);
    if (notifResult.ok) expect(notifResult.data.notifications.length).toBe(0);
  });
});

// ==================== Phase 18: Agent Capabilities ====================
describe("Phase 18: Agent Capabilities", () => {
  test("register with agent_capabilities stores correctly", async () => {
    const token = await registerUser({
      agent_capabilities: [
        { capability: "can_schedule_meetings", confidence: 0.9 },
        { capability: "speak_language:zh", confidence: 1.0 },
      ],
    });

    const caps = ctx.db.prepare("SELECT * FROM agent_capabilities WHERE user_token = ?").all(token);
    expect(caps.length).toBe(2);
  });

  test("search with capability_filters returns matching candidates", async () => {
    const tokenA = await registerUser({
      agent_capabilities: [{ capability: "can_schedule_meetings", confidence: 1.0 }],
    });
    const tokenB = await registerUser({
      agent_capabilities: [{ capability: "can_translate", confidence: 1.0 }],
    });

    const result = await handleSearch({
      user_token: tokenA,
      capability_filters: ["can_schedule_meetings"],
    }, ctx);
    expect(result.ok).toBe(true);
    // tokenB doesn't have can_schedule_meetings
    if (result.ok) expect(result.data.candidates.length).toBe(0);
  });

  test("prefix matching works for capability_filters", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser({
      agent_capabilities: [{ capability: "speak_language:zh", confidence: 1.0 }],
    });

    const result = await handleSearch({
      user_token: tokenA,
      capability_filters: ["speak_language"],
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.candidates.length).toBe(1);
  });

  test("update agent_capabilities replaces entire list", async () => {
    const token = await registerUser({
      agent_capabilities: [{ capability: "cap_a", confidence: 1.0 }],
    });

    await handleUpdate({
      user_token: token,
      agent_capabilities: [{ capability: "cap_b", confidence: 0.8 }],
    }, ctx);

    const caps = ctx.db.prepare("SELECT * FROM agent_capabilities WHERE user_token = ?").all(token) as any[];
    expect(caps.length).toBe(1);
    expect(caps[0].capability).toBe("cap_b");
  });

  test("max 50 capabilities enforced on register", async () => {
    const caps = Array.from({ length: 51 }, (_, i) => ({ capability: `cap_${i}`, confidence: 1.0 }));
    const result = await handleRegister({
      protocol_version: "schelling-2.0",
      embedding: makeEmbedding(0.5, 0.2),
      city: "SF",
      age_range: "25-34",
      intent: ["romance"],
      agent_capabilities: caps,
    }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });
});

// ==================== Phase 19: Contracts ====================
describe("Phase 19: Contracts", () => {
  test("propose contract at COMMITTED stage succeeds", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const result = await handleContract({
      user_token: tokenA,
      action: "propose",
      candidate_id: candidateId,
      type: "match",
      terms: { duration: "3 months" },
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("proposed");
  });

  test("propose at EVALUATED stage fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    const result = await handleContract({
      user_token: tokenA,
      action: "propose",
      candidate_id: candidateId,
      type: "task",
      terms: { scope: "test" },
    }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STAGE_VIOLATION");
  });

  test("accept → complete lifecycle with reputation", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const proposeResult = await handleContract({
      user_token: tokenA, action: "propose", candidate_id: candidateId, type: "service", terms: { rate: 100 },
    }, ctx);
    if (!proposeResult.ok) return;
    const contractId = proposeResult.data.contract_id;

    const acceptResult = await handleContract({ user_token: tokenB, action: "accept", contract_id: contractId }, ctx);
    expect(acceptResult.ok).toBe(true);
    if (acceptResult.ok) expect(acceptResult.data.status).toBe("active");

    const completeResult = await handleContract({ user_token: tokenA, action: "complete", contract_id: contractId }, ctx);
    expect(completeResult.ok).toBe(true);
    if (completeResult.ok) expect(completeResult.data.status).toBe("completed");

    // Check positive reputation events created
    const repEvents = ctx.db.prepare("SELECT * FROM reputation_events WHERE event_type = 'completion'").all();
    expect(repEvents.length).toBe(2); // one for each party
  });

  test("accept own proposal fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const proposeResult = await handleContract({
      user_token: tokenA, action: "propose", candidate_id: candidateId, type: "match", terms: {},
    }, ctx);
    if (!proposeResult.ok) return;

    const result = await handleContract({ user_token: tokenA, action: "accept", contract_id: proposeResult.data.contract_id }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CANNOT_RESPOND_OWN_PROPOSAL");
  });

  test("terminate creates negative reputation for terminator", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const proposeResult = await handleContract({
      user_token: tokenA, action: "propose", candidate_id: candidateId, type: "task", terms: {},
    }, ctx);
    if (!proposeResult.ok) return;

    await handleContract({ user_token: tokenB, action: "accept", contract_id: proposeResult.data.contract_id }, ctx);
    await handleContract({ user_token: tokenA, action: "terminate", contract_id: proposeResult.data.contract_id, reason: "changed mind" }, ctx);

    const repEvents = ctx.db.prepare("SELECT * FROM reputation_events WHERE identity_id = ? AND rating = 'negative'").all(tokenA);
    expect(repEvents.length).toBe(1);
  });

  test("contract_update amendment on active contract", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const proposeResult = await handleContract({
      user_token: tokenA, action: "propose", candidate_id: candidateId, type: "service", terms: { rate: 100 },
    }, ctx);
    if (!proposeResult.ok) return;
    await handleContract({ user_token: tokenB, action: "accept", contract_id: proposeResult.data.contract_id }, ctx);

    const amendResult = await handleContractUpdate({
      user_token: tokenA,
      contract_id: proposeResult.data.contract_id,
      updated_terms: { rate: 120 },
      reason: "Market rate changed",
    }, ctx);
    expect(amendResult.ok).toBe(true);
    if (amendResult.ok) expect(amendResult.data.status).toBe("proposed");
  });

  test("list contracts filtered by status", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    await handleContract({ user_token: tokenA, action: "propose", candidate_id: candidateId, type: "match", terms: {} }, ctx);

    const listResult = await handleContract({ user_token: tokenA, action: "list", status: "proposed" }, ctx);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) expect(listResult.data.contracts.length).toBe(1);
  });
});

// ==================== Phase 20: Lifecycle Events ====================
describe("Phase 20: Lifecycle Events", () => {
  test("emit event at CONNECTED stage succeeds", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);
    // After mutual commit, both should be at stage 5 (CONNECTED)

    const result = await handleEvent({
      user_token: tokenA,
      action: "emit",
      candidate_id: candidateId,
      type: "milestone",
      data: { message: "First meeting scheduled" },
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("emitted");
  });

  test("emit at EVALUATED stage fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 2);

    const result = await handleEvent({
      user_token: tokenA,
      action: "emit",
      candidate_id: candidateId,
      type: "update",
      data: { note: "test" },
    }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STAGE_VIOLATION");
  });

  test("emit with requires_ack creates pending_ack event", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const result = await handleEvent({
      user_token: tokenA,
      action: "emit",
      candidate_id: candidateId,
      type: "milestone",
      data: { message: "Delivery shipped" },
      requires_ack: true,
      ack_window_hours: 24,
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("pending_ack");
      expect(result.data.ack_deadline).toBeDefined();
    }
  });

  test("acknowledge event succeeds", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const emitResult = await handleEvent({
      user_token: tokenA, action: "emit", candidate_id: candidateId,
      type: "milestone", data: { msg: "test" }, requires_ack: true,
    }, ctx);
    if (!emitResult.ok) return;

    const ackResult = await handleEvent({
      user_token: tokenB, action: "ack", event_id: emitResult.data.event_id,
    }, ctx);
    expect(ackResult.ok).toBe(true);
    if (ackResult.ok) expect(ackResult.data.status).toBe("acknowledged");
  });

  test("acknowledge already-acked event fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const emitResult = await handleEvent({
      user_token: tokenA, action: "emit", candidate_id: candidateId,
      type: "update", data: {}, requires_ack: true,
    }, ctx);
    if (!emitResult.ok) return;

    await handleEvent({ user_token: tokenB, action: "ack", event_id: emitResult.data.event_id }, ctx);
    const result = await handleEvent({ user_token: tokenB, action: "ack", event_id: emitResult.data.event_id }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EVENT_ALREADY_ACKED");
  });

  test("list events returns history", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    await handleEvent({ user_token: tokenA, action: "emit", candidate_id: candidateId, type: "milestone", data: { n: 1 } }, ctx);
    await handleEvent({ user_token: tokenA, action: "emit", candidate_id: candidateId, type: "update", data: { n: 2 } }, ctx);

    const listResult = await handleEvent({ user_token: tokenA, action: "list", candidate_id: candidateId }, ctx);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) expect(listResult.data.events.length).toBe(2);
  });

  test("completion event creates positive reputation", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    await handleEvent({
      user_token: tokenA, action: "emit", candidate_id: candidateId,
      type: "completion", data: { result: "success" },
    }, ctx);

    const repEvents = ctx.db.prepare("SELECT * FROM reputation_events WHERE event_type = 'completion' AND identity_id = ?").all(tokenA);
    expect(repEvents.length).toBe(1);
  });

  test("event data over 10KB fails", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await advanceToStage(tokenA, tokenB, 4);

    const bigData: Record<string, string> = {};
    for (let i = 0; i < 200; i++) bigData[`key_${i}`] = "x".repeat(100);

    const result = await handleEvent({
      user_token: tokenA, action: "emit", candidate_id: candidateId,
      type: "custom", data: bigData,
    }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });
});
