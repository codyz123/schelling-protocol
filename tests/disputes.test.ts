import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import { handleInterest } from "../src/handlers/interest.js";
import { handleCommit } from "../src/handlers/commit.js";
import { handleDispute } from "../src/handlers/dispute.js";
import { handleVerify } from "../src/handlers/verify.js";
import { initSchema } from "../src/db/schema.js";
import { Stage } from "../src/types.js";
import type { HandlerContext } from "../src/types.js";

// ─── Setup ──────────────────────────────────────────────────────────────

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

async function registerUser(overrides = {}) {
  const result = await handleRegister(
    {
      protocol_version: "3.0",
      cluster_id: "dating.general",
      traits: [
        { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
        { key: "age", value: 30, value_type: "number", visibility: "after_interest" },
      ],
      ...overrides,
    } as any,
    ctx,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

async function connectUsers(tokenA: string, tokenB: string) {
  const searchA = await handleSearch({ user_token: tokenA }, ctx);
  if (!searchA.ok) throw new Error(searchA.error.message);
  await handleSearch({ user_token: tokenB }, ctx);
  const candidateId = searchA.data.candidates[0].candidate_id;
  await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);
  await handleCommit({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleCommit({ user_token: tokenB, candidate_id: candidateId }, ctx);
  return candidateId;
}

async function makeInterestedPair(tokenA: string, tokenB: string) {
  const searchA = await handleSearch({ user_token: tokenA }, ctx);
  if (!searchA.ok) throw new Error(searchA.error.message);
  await handleSearch({ user_token: tokenB }, ctx);
  const candidateId = searchA.data.candidates[0].candidate_id;
  await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);
  await handleInterest({ user_token: tokenB, candidate_id: candidateId }, ctx);
  return candidateId;
}

// ─── Dispute Tests ──────────────────────────────────────────────────────

describe("handleDispute", () => {
  test("file dispute successfully at CONNECTED stage", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Profile misrepresentation",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.dispute_id).toBeDefined();
    expect(typeof result.data.dispute_id).toBe("string");
    expect(result.data.dispute_id.length).toBeGreaterThan(0);
    expect(["jury_selected", "operator_review"]).toContain(result.data.status);
    expect(result.data.filed_at).toBeDefined();
    expect(typeof result.data.filed_at).toBe("string");

    // Verify the dispute was persisted in the database
    const dispute = db
      .prepare("SELECT * FROM disputes WHERE id = ?")
      .get(result.data.dispute_id) as any;
    expect(dispute).toBeDefined();
    expect(dispute.filed_by).toBe(tokenA);
    expect(dispute.filed_against).toBe(tokenB);
    expect(dispute.candidate_id).toBe(candidateId);
    expect(dispute.reason).toBe("Profile misrepresentation");
    expect(dispute.stage_at_filing).toBe(Stage.CONNECTED);
  });

  test("dispute requires CONNECTED stage - fails at INTERESTED", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await makeInterestedPair(tokenA, tokenB);

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Misrepresentation",
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STAGE_VIOLATION");
    expect(result.error.message).toContain("CONNECTED");
  });

  test("duplicate dispute is blocked", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const first = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "First dispute",
      },
      ctx,
    );
    expect(first.ok).toBe(true);

    const second = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Second dispute attempt",
      },
      ctx,
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("DUPLICATE_DISPUTE");
  });

  test("dispute with evidence array is stored", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const evidence = [
      "https://example.com/screenshot1.png",
      "https://example.com/screenshot2.png",
      "https://example.com/chat-log.pdf",
    ];

    const traitClaims = [
      { trait_key: "age", claimed_value: "25", actual_value: "45" },
    ];

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Trait misrepresentation",
        evidence,
        trait_claims: traitClaims,
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verify evidence and trait_claims were persisted
    const dispute = db
      .prepare("SELECT * FROM disputes WHERE id = ?")
      .get(result.data.dispute_id) as any;
    expect(dispute).toBeDefined();
    expect(JSON.parse(dispute.evidence)).toEqual(evidence);
    expect(JSON.parse(dispute.trait_claims)).toEqual(traitClaims);
  });

  test("non-participant cannot file dispute", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const tokenC = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const result = await handleDispute(
      {
        user_token: tokenC,
        candidate_id: candidateId,
        reason: "I want to file a dispute",
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  test("operator review when insufficient jurors", async () => {
    // With only two users in the system (the two parties), there can be
    // no eligible jurors, so status should fall back to "operator_review".
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Misrepresentation of skills",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("operator_review");
    expect(result.data.jury_size).toBeNull();
  });

  test("either party in CONNECTED pair can file dispute", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    // Party B files the dispute instead of party A
    const result = await handleDispute(
      {
        user_token: tokenB,
        candidate_id: candidateId,
        reason: "Unresponsive after connection",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dispute_id).toBeDefined();

    // Verify filed_by and filed_against are correct
    const dispute = db
      .prepare("SELECT * FROM disputes WHERE id = ?")
      .get(result.data.dispute_id) as any;
    expect(dispute.filed_by).toBe(tokenB);
    expect(dispute.filed_against).toBe(tokenA);
  });

  test("evidence array exceeding max 10 items is rejected", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const tooMuchEvidence = Array.from(
      { length: 11 },
      (_, i) => `https://example.com/evidence${i}.png`,
    );

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "Bad behavior",
        evidence: tooMuchEvidence,
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toContain("10");
  });

  test("dispute with empty reason is rejected", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "",
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("dispute against non-existent candidate pair fails", async () => {
    const tokenA = await registerUser();

    const result = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: "non-existent-candidate-id",
        reason: "Misrepresentation",
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CANDIDATE_NOT_FOUND");
  });

  test("dispute with non-existent user token fails", async () => {
    const result = await handleDispute(
      {
        user_token: "non-existent-token",
        candidate_id: "some-candidate",
        reason: "Misrepresentation",
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  test("second party can file dispute after first is resolved", async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const candidateId = await connectUsers(tokenA, tokenB);

    // Party A files first
    const first = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "First dispute",
      },
      ctx,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Manually resolve the first dispute
    db.prepare("UPDATE disputes SET status = 'resolved' WHERE id = ?").run(
      first.data.dispute_id,
    );

    // Party A can now file again since previous one is resolved
    const second = await handleDispute(
      {
        user_token: tokenA,
        candidate_id: candidateId,
        reason: "New dispute after resolution",
      },
      ctx,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.dispute_id).not.toBe(first.data.dispute_id);
  });
});

// ─── Verification Tests ─────────────────────────────────────────────────

describe("handleVerify", () => {
  describe("submit action", () => {
    test("submit self_verified auto-approves and updates trait", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "submit",
          trait_key: "age",
          evidence_type: "document",
          evidence_data: "base64encodedDocumentData==",
          requested_tier: "self_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { verification_id: string; status: string; current_tier: string | null };
      expect(data.verification_id).toBeDefined();
      expect(data.status).toBe("approved");
      expect(data.current_tier).toBe("self_verified");

      // Verify the trait's verification field was updated in the database
      const trait = db
        .prepare("SELECT verification FROM traits WHERE user_token = ? AND key = ?")
        .get(token, "age") as any;
      expect(trait.verification).toBe("self_verified");
    });

    test("submit cross_verified returns pending status", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "submit",
          trait_key: "age",
          evidence_type: "document",
          evidence_data: "base64encodedDocumentData==",
          requested_tier: "cross_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { verification_id: string; status: string; current_tier: string | null };
      expect(data.verification_id).toBeDefined();
      expect(data.status).toBe("pending");
      expect(data.current_tier).toBeNull();

      // Verify the trait's verification field was NOT updated
      const trait = db
        .prepare("SELECT verification FROM traits WHERE user_token = ? AND key = ?")
        .get(token, "age") as any;
      expect(trait.verification).toBe("unverified");
    });

    test("submit authority_verified returns pending status", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "submit",
          trait_key: "city",
          evidence_type: "link",
          evidence_data: "https://example.com/proof",
          requested_tier: "authority_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { verification_id: string; status: string; current_tier: string | null };
      expect(data.status).toBe("pending");
      expect(data.current_tier).toBeNull();
    });

    test("submit for non-existent trait returns INVALID_INPUT", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "submit",
          trait_key: "nonexistent_trait",
          evidence_type: "document",
          evidence_data: "base64data==",
          requested_tier: "self_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toContain("nonexistent_trait");
    });

    test("submit with invalid evidence_type returns INVALID_INPUT", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "submit",
          trait_key: "age",
          evidence_type: "video" as any,
          evidence_data: "base64data==",
          requested_tier: "self_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toContain("evidence_type");
    });

    test("submit verification record is persisted in database", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "submit",
          trait_key: "city",
          evidence_type: "photo",
          evidence_data: "base64photoData==",
          requested_tier: "self_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { verification_id: string; status: string; current_tier: string | null };

      const verification = db
        .prepare("SELECT * FROM verifications WHERE id = ?")
        .get(data.verification_id) as any;

      expect(verification).toBeDefined();
      expect(verification.user_token).toBe(token);
      expect(verification.trait_key).toBe("city");
      expect(verification.action).toBe("submit");
      expect(verification.evidence_type).toBe("photo");
      expect(verification.evidence_data).toBe("base64photoData==");
      expect(verification.requested_tier).toBe("self_verified");
      expect(verification.status).toBe("approved");
      expect(verification.current_tier).toBe("self_verified");
    });

    test("submit with all evidence types succeeds", async () => {
      const evidenceTypes = ["photo", "document", "link", "attestation"] as const;

      for (const evidenceType of evidenceTypes) {
        const token = await registerUser();

        const result = await handleVerify(
          {
            user_token: token,
            action: "submit",
            trait_key: "city",
            evidence_type: evidenceType,
            evidence_data: `data-for-${evidenceType}`,
            requested_tier: "self_verified",
          },
          ctx,
        );

        expect(result.ok).toBe(true);
      }
    });

    test("submit with non-existent user returns USER_NOT_FOUND", async () => {
      const result = await handleVerify(
        {
          user_token: "non-existent-user",
          action: "submit",
          trait_key: "age",
          evidence_type: "document",
          evidence_data: "data==",
          requested_tier: "self_verified",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });
  });

  describe("request action", () => {
    test("request verification from counterpart at INTERESTED stage", async () => {
      const tokenA = await registerUser();
      const tokenB = await registerUser();
      const candidateId = await makeInterestedPair(tokenA, tokenB);

      const result = await handleVerify(
        {
          user_token: tokenA,
          action: "request",
          candidate_id: candidateId,
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { requested: true; request_id: string };
      expect(data.requested).toBe(true);
      expect(data.request_id).toBeDefined();
      expect(typeof data.request_id).toBe("string");

      // Verify a pending_action was created for the other party (tokenB)
      const pendingAction = db
        .prepare(
          "SELECT * FROM pending_actions WHERE user_token = ? AND action_type = 'verification_request'",
        )
        .get(tokenB) as any;

      expect(pendingAction).toBeDefined();
      expect(pendingAction.candidate_id).toBe(candidateId);

      const details = JSON.parse(pendingAction.details);
      expect(details.verification_id).toBe(data.request_id);
      expect(details.trait_key).toBe("age");
      expect(details.requested_by).toBe(tokenA);
    });

    test("request verification at CONNECTED stage also works", async () => {
      const tokenA = await registerUser();
      const tokenB = await registerUser();
      const candidateId = await connectUsers(tokenA, tokenB);

      const result = await handleVerify(
        {
          user_token: tokenA,
          action: "request",
          candidate_id: candidateId,
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { requested: true; request_id: string };
      expect(data.requested).toBe(true);
      expect(data.request_id).toBeDefined();
    });

    test("request verification requires INTERESTED stage - fails at DISCOVERED", async () => {
      const tokenA = await registerUser();
      const tokenB = await registerUser();

      // Only search (DISCOVERED), don't express interest
      const searchA = await handleSearch({ user_token: tokenA }, ctx);
      if (!searchA.ok) throw new Error(searchA.error.message);
      await handleSearch({ user_token: tokenB }, ctx);
      const candidateId = searchA.data.candidates[0].candidate_id;

      const result = await handleVerify(
        {
          user_token: tokenA,
          action: "request",
          candidate_id: candidateId,
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("STAGE_VIOLATION");
      expect(result.error.message).toContain("INTERESTED");
    });

    test("request verification fails when only one side is INTERESTED", async () => {
      const tokenA = await registerUser();
      const tokenB = await registerUser();

      const searchA = await handleSearch({ user_token: tokenA }, ctx);
      if (!searchA.ok) throw new Error(searchA.error.message);
      await handleSearch({ user_token: tokenB }, ctx);
      const candidateId = searchA.data.candidates[0].candidate_id;

      // Only A expresses interest, B stays at DISCOVERED
      await handleInterest({ user_token: tokenA, candidate_id: candidateId }, ctx);

      const result = await handleVerify(
        {
          user_token: tokenA,
          action: "request",
          candidate_id: candidateId,
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("STAGE_VIOLATION");
    });

    test("request verification for non-existent candidate fails", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "request",
          candidate_id: "non-existent-candidate",
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CANDIDATE_NOT_FOUND");
    });

    test("request verification as non-participant fails", async () => {
      const tokenA = await registerUser();
      const tokenB = await registerUser();
      const tokenC = await registerUser();
      const candidateId = await makeInterestedPair(tokenA, tokenB);

      const result = await handleVerify(
        {
          user_token: tokenC,
          action: "request",
          candidate_id: candidateId,
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("UNAUTHORIZED");
    });

    test("verification request record is persisted in database", async () => {
      const tokenA = await registerUser();
      const tokenB = await registerUser();
      const candidateId = await makeInterestedPair(tokenA, tokenB);

      const result = await handleVerify(
        {
          user_token: tokenA,
          action: "request",
          candidate_id: candidateId,
          trait_key: "age",
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const data = result.data as { requested: true; request_id: string };

      const verification = db
        .prepare("SELECT * FROM verifications WHERE id = ?")
        .get(data.request_id) as any;

      expect(verification).toBeDefined();
      expect(verification.user_token).toBe(tokenA);
      expect(verification.candidate_id).toBe(candidateId);
      expect(verification.trait_key).toBe("age");
      expect(verification.action).toBe("request");
      expect(verification.requested_from).toBe(tokenB);
      expect(verification.status).toBe("pending");
    });
  });

  describe("invalid action", () => {
    test("invalid action value returns INVALID_INPUT", async () => {
      const token = await registerUser();

      const result = await handleVerify(
        {
          user_token: token,
          action: "invalid" as any,
          trait_key: "age",
        } as any,
        ctx,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toContain("action");
    });
  });
});
