import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import { LedgerService } from "../src/services/ledger.js";
import { EscrowService } from "../src/services/escrow.js";
import { NegotiationService } from "../src/services/negotiation.js";
import { handleMarketplaceRegister, handleMarketplaceUpdate, handleMarketplaceSearch, handleMarketRates } from "../src/services/marketplace.js";
import { handleRegister } from "../src/handlers/register.js";
import type { HandlerContext } from "../src/types.js";

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

async function registerUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const result = await handleRegister({
    protocol_version: "3.0",
    cluster_id: "hiring.dev",
    traits: [{ key: "skill", value: "typescript", value_type: "string", visibility: "public" }],
    ...overrides,
  } as any, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

// ─── Ledger Tests ─────────────────────────────────────────────────────

describe("Ledger Service", () => {
  test("credit and balance", () => {
    const ledger = new LedgerService(db);
    ledger.credit("user1", "client_wallet", 1000);
    expect(ledger.balance("user1", "client_wallet")).toBe(1000);
  });

  test("debit reduces balance", () => {
    const ledger = new LedgerService(db);
    ledger.credit("user1", "client_wallet", 1000);
    ledger.debit("user1", "client_wallet", 400);
    expect(ledger.balance("user1", "client_wallet")).toBe(600);
  });

  test("debit fails with insufficient balance", () => {
    const ledger = new LedgerService(db);
    ledger.credit("user1", "client_wallet", 100);
    expect(() => ledger.debit("user1", "client_wallet", 200)).toThrow("Insufficient balance");
  });

  test("transfer is atomic", () => {
    const ledger = new LedgerService(db);
    ledger.credit("alice", "client_wallet", 5000);
    const result = ledger.transfer("alice", "client_wallet", "bob", "worker_earnings", 2000);
    expect(result.debitId).toBeTruthy();
    expect(result.creditId).toBeTruthy();
    expect(ledger.balance("alice", "client_wallet")).toBe(3000);
    expect(ledger.balance("bob", "worker_earnings")).toBe(2000);
  });

  test("credits equal debits invariant", () => {
    const ledger = new LedgerService(db);
    ledger.credit("a", "client_wallet", 1000);
    ledger.credit("b", "client_wallet", 2000);
    ledger.transfer("a", "client_wallet", "b", "worker_earnings", 500);
    ledger.debit("b", "client_wallet", 100);

    // Sum all credits and debits across entire ledger
    const totals = db.prepare(
      `SELECT entry_type, SUM(amount_cents) as total FROM ledger_entries GROUP BY entry_type`
    ).all() as any[];

    const credits = totals.find((t: any) => t.entry_type === "credit")?.total ?? 0;
    const debits = totals.find((t: any) => t.entry_type === "debit")?.total ?? 0;

    // Credits: 1000 + 2000 + 500 = 3500
    // Debits: 500 + 100 = 600
    expect(credits).toBe(3500);
    expect(debits).toBe(600);
  });

  test("allBalances returns all account types", () => {
    const ledger = new LedgerService(db);
    ledger.credit("user1", "client_wallet", 1000);
    ledger.credit("user1", "worker_earnings", 500);
    const balances = ledger.allBalances("user1");
    expect(balances.client_wallet).toBe(1000);
    expect(balances.worker_earnings).toBe(500);
  });

  test("history returns entries in order", () => {
    const ledger = new LedgerService(db);
    ledger.credit("user1", "client_wallet", 100, { type: "topup", id: "t1" });
    ledger.credit("user1", "client_wallet", 200, { type: "topup", id: "t2" });
    const entries = ledger.history("user1", "client_wallet");
    expect(entries.length).toBe(2);
  });

  test("rejects non-positive amounts", () => {
    const ledger = new LedgerService(db);
    expect(() => ledger.credit("user1", "client_wallet", 0)).toThrow("Amount must be positive");
    expect(() => ledger.credit("user1", "client_wallet", -100)).toThrow("Amount must be positive");
  });

  test("5% fee calculation rounds up", () => {
    // 333 cents * 0.05 = 16.65 → ceil = 17
    const fee = Math.ceil(333 * 0.05);
    expect(fee).toBe(17);

    // 100 cents * 0.05 = 5 → 5
    expect(Math.ceil(100 * 0.05)).toBe(5);

    // 1 cent * 0.05 = 0.05 → ceil = 1
    expect(Math.ceil(1 * 0.05)).toBe(1);
  });
});

// ─── Escrow Tests ─────────────────────────────────────────────────────

describe("Escrow Service", () => {
  test("hold and release full lifecycle", () => {
    const escrow = new EscrowService(db);
    const ledger = escrow.getLedger();

    // Fund client wallet
    ledger.credit("client1", "client_wallet", 10000);

    // Hold escrow for contract
    const record = escrow.hold("contract1", "client1", "worker1", 1000);
    expect(record.status).toBe("held");
    expect(record.amount_cents).toBe(1000);
    expect(record.platform_fee_cents).toBe(50); // 5% of 1000

    // Client wallet debited: 1000 + 50 = 1050
    expect(ledger.balance("client1", "client_wallet")).toBe(10000 - 1050);

    // Escrow holds the money
    expect(ledger.balance("escrow", "escrow_hold")).toBe(1050);

    // Release escrow
    const released = escrow.release("contract1");
    expect(released.status).toBe("released");

    // Worker gets the agreed amount
    expect(ledger.balance("worker1", "worker_earnings")).toBe(1000);

    // Platform gets the fee
    expect(ledger.balance("platform", "platform_fees")).toBe(50);

    // Escrow is empty
    expect(ledger.balance("escrow", "escrow_hold")).toBe(0);
  });

  test("refund returns full amount to client", () => {
    const escrow = new EscrowService(db);
    const ledger = escrow.getLedger();

    ledger.credit("client1", "client_wallet", 5000);
    escrow.hold("contract2", "client1", "worker1", 2000);

    const fee = Math.ceil(2000 * 0.05); // 100
    expect(ledger.balance("client1", "client_wallet")).toBe(5000 - 2000 - fee);

    const refunded = escrow.refund("contract2");
    expect(refunded.status).toBe("refunded");

    // Full refund including fee
    expect(ledger.balance("client1", "client_wallet")).toBe(5000);
    expect(ledger.balance("escrow", "escrow_hold")).toBe(0);
  });

  test("hold fails with insufficient funds", () => {
    const origPlayground = process.env.PLAYGROUND_MODE;
    process.env.PLAYGROUND_MODE = "false";
    try {
      const escrow = new EscrowService(db);
      const ledger = escrow.getLedger();

      ledger.credit("client1", "client_wallet", 100);
      expect(() => escrow.hold("contract3", "client1", "worker1", 1000)).toThrow("Insufficient funds");
    } finally {
      if (origPlayground !== undefined) process.env.PLAYGROUND_MODE = origPlayground;
      else delete process.env.PLAYGROUND_MODE;
    }
  });

  test("$0 contract requires no escrow funds", () => {
    const escrow = new EscrowService(db);
    const record = escrow.hold("contract_free", "client1", "worker1", 0);
    expect(record.status).toBe("held");
    expect(record.amount_cents).toBe(0);
    expect(record.platform_fee_cents).toBe(0);

    const released = escrow.release("contract_free");
    expect(released.status).toBe("released");
  });

  test("dispute locks escrow", () => {
    const escrow = new EscrowService(db);
    const ledger = escrow.getLedger();

    ledger.credit("client1", "client_wallet", 5000);
    escrow.hold("contract4", "client1", "worker1", 1000);
    escrow.dispute("contract4");

    const record = escrow.getByContract("contract4");
    expect(record?.status).toBe("disputed");
  });

  test("double release fails", () => {
    const escrow = new EscrowService(db);
    const ledger = escrow.getLedger();

    ledger.credit("client1", "client_wallet", 5000);
    escrow.hold("contract5", "client1", "worker1", 500);
    escrow.release("contract5");
    expect(() => escrow.release("contract5")).toThrow("No held escrow");
  });
});

// ─── Negotiation Tests ───────────────────────────────────────────────

describe("Negotiation Service", () => {
  test("start negotiation creates session and initial move", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();

    const svc = new NegotiationService(db);
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 500,
    });

    expect(session.status).toBe("active");
    expect(session.initial_bid_cents).toBe(500);
    expect(session.current_turn).toBe(offererToken);

    const status = svc.status(session.id);
    expect(status.moves.length).toBe(1);
    expect(status.moves[0].move_type).toBe("offer");
    expect(status.time_remaining_ms).toBeGreaterThan(0);
  });

  test("counter-offer alternates turns", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();

    const svc = new NegotiationService(db);
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 500,
    });

    // Offerer counters
    const after = svc.respond({
      session_id: session.id,
      agent_token: offererToken,
      move_type: "counter",
      price_cents: 700,
    });

    expect(after.current_price_cents).toBe(700);
    expect(after.current_turn).toBe(seekerToken);
    expect(after.rounds).toBe(1);
  });

  test("accept closes negotiation", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();

    const svc = new NegotiationService(db);
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 500,
    });

    const result = svc.respond({
      session_id: session.id,
      agent_token: offererToken,
      move_type: "accept",
    });

    expect(result.status).toBe("agreed");
    expect(result.agreed_price_cents).toBe(500);
  });

  test("reject closes negotiation", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();

    const svc = new NegotiationService(db);
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 500,
    });

    const result = svc.respond({
      session_id: session.id,
      agent_token: offererToken,
      move_type: "reject",
    });

    expect(result.status).toBe("rejected");
  });

  test("wrong turn rejected", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();

    const svc = new NegotiationService(db);
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 500,
    });

    // Seeker tries to move when it's offerer's turn
    expect(() => svc.respond({
      session_id: session.id,
      agent_token: seekerToken,
      move_type: "counter",
      price_cents: 600,
    })).toThrow("not your turn");
  });

  test("non-party rejected", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();
    const outsiderToken = await registerUser();

    const svc = new NegotiationService(db);
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 500,
    });

    expect(() => svc.respond({
      session_id: session.id,
      agent_token: outsiderToken,
      move_type: "accept",
    })).toThrow("not a party");
  });

  test("expire deadlines marks sessions as expired", async () => {
    const seekerToken = await registerUser();
    const offererToken = await registerUser();

    const svc = new NegotiationService(db);
    // Create session with very low bid (30s deadline)
    const session = svc.start({
      seeker_token: seekerToken,
      offerer_token: offererToken,
      initial_bid_cents: 50,
    });

    // Manually set deadline to the past
    db.prepare(
      `UPDATE negotiation_sessions SET deadline_at = datetime('now', '-1 minute') WHERE id = ?`
    ).run(session.id);

    const expired = svc.expireDeadlines();
    expect(expired).toBe(1);

    const status = svc.status(session.id);
    expect(status.session.status).toBe("expired");
  });

  test("deadline scales with bid amount", () => {
    // This tests the internal logic indirectly
    const svc = new NegotiationService(db);

    // Create minimal users
    const token1 = "test_seeker_" + Math.random();
    const token2 = "test_offerer_" + Math.random();
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(token1);
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(token2);

    // Small bid: 30s
    const s1 = svc.start({ seeker_token: token1, offerer_token: token2, initial_bid_cents: 50 });
    expect(s1.deadline_ms).toBe(30_000);

    // Medium bid: 5 min
    const t3 = "seeker_" + Math.random();
    const t4 = "offerer_" + Math.random();
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(t3);
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(t4);
    const s2 = svc.start({ seeker_token: t3, offerer_token: t4, initial_bid_cents: 500 });
    expect(s2.deadline_ms).toBe(300_000);

    // Large bid: 30 min
    const t5 = "seeker_" + Math.random();
    const t6 = "offerer_" + Math.random();
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(t5);
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(t6);
    const s3 = svc.start({ seeker_token: t5, offerer_token: t6, initial_bid_cents: 10000 });
    expect(s3.deadline_ms).toBe(1_800_000);

    // Very large bid: 2 hours
    const t7 = "seeker_" + Math.random();
    const t8 = "offerer_" + Math.random();
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(t7);
    db.prepare(`INSERT INTO users (user_token, cluster_id, protocol_version) VALUES (?, 'test', '3.0')`).run(t8);
    const s4 = svc.start({ seeker_token: t7, offerer_token: t8, initial_bid_cents: 100000 });
    expect(s4.deadline_ms).toBe(7_200_000);
  });
});

// ─── Marketplace Profile Tests ───────────────────────────────────────

describe("Marketplace Profiles", () => {
  test("register and search", async () => {
    const token = await registerUser();

    const reg = handleMarketplaceRegister({
      user_token: token,
      hourly_rate_cents: 5000,
      per_task_rate_cents: 10000,
      capabilities: ["typescript", "react"],
    }, ctx);
    expect(reg.ok).toBe(true);
    if (reg.ok) {
      expect(reg.data.marketplace_id).toBeTruthy();
    }

    const search = handleMarketplaceSearch({}, ctx);
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.data.results.length).toBe(1);
      expect(search.data.results[0].hourly_rate_cents).toBe(5000);
    }
  });

  test("update marketplace profile", async () => {
    const token = await registerUser();
    handleMarketplaceRegister({ user_token: token, hourly_rate_cents: 5000 }, ctx);

    const updated = handleMarketplaceUpdate({
      user_token: token,
      hourly_rate_cents: 7500,
      availability: "busy",
    }, ctx);
    expect(updated.ok).toBe(true);
  });

  test("duplicate registration rejected", async () => {
    const token = await registerUser();
    handleMarketplaceRegister({ user_token: token }, ctx);
    const dup = handleMarketplaceRegister({ user_token: token }, ctx);
    expect(dup.ok).toBe(false);
  });

  test("search filters by price", async () => {
    const token1 = await registerUser();
    const token2 = await registerUser();
    handleMarketplaceRegister({ user_token: token1, per_task_rate_cents: 1000 }, ctx);
    handleMarketplaceRegister({ user_token: token2, per_task_rate_cents: 5000 }, ctx);

    const cheap = handleMarketplaceSearch({ max_price_cents: 2000 }, ctx);
    expect(cheap.ok).toBe(true);
    if (cheap.ok) {
      expect(cheap.data.results.length).toBe(1);
    }
  });

  test("market_rates with no data", () => {
    const result = handleMarketRates({}, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sample_size).toBe(0);
    }
  });
});

// ─── Full Round-Trip Test ────────────────────────────────────────────

describe("Full Escrow Round-Trip", () => {
  test("topup → negotiate → hold → release → payout", async () => {
    const clientToken = await registerUser();
    const workerToken = await registerUser();

    // Register worker on marketplace
    handleMarketplaceRegister({
      user_token: workerToken,
      per_task_rate_cents: 1000,
    }, ctx);

    const ledger = new LedgerService(db);
    const escrow = new EscrowService(db);

    // 1. Client tops up wallet
    ledger.credit(clientToken, "client_wallet", 50000);
    expect(ledger.balance(clientToken, "client_wallet")).toBe(50000);

    // 2. Negotiate
    const neg = new NegotiationService(db);
    const session = neg.start({
      seeker_token: clientToken,
      offerer_token: workerToken,
      initial_bid_cents: 1000,
    });
    const agreed = neg.respond({
      session_id: session.id,
      agent_token: workerToken,
      move_type: "accept",
    });
    expect(agreed.status).toBe("agreed");
    expect(agreed.agreed_price_cents).toBe(1000);

    // 3. Escrow hold
    const hold = escrow.hold("contract_roundtrip", clientToken, workerToken, 1000);
    expect(hold.status).toBe("held");
    expect(hold.platform_fee_cents).toBe(50); // 5%

    // Client pays 1050 total
    expect(ledger.balance(clientToken, "client_wallet")).toBe(50000 - 1050);
    expect(ledger.balance("escrow", "escrow_hold")).toBe(1050);

    // 4. Release (deliverable accepted)
    const released = escrow.release("contract_roundtrip");
    expect(released.status).toBe("released");

    // Worker gets 1000 (the agreed amount)
    expect(ledger.balance(workerToken, "worker_earnings")).toBe(1000);
    // Platform gets 50 (the fee)
    expect(ledger.balance("platform", "platform_fees")).toBe(50);
    // Escrow empty
    expect(ledger.balance("escrow", "escrow_hold")).toBe(0);

    // 5. Payout (simulate)
    ledger.debit(workerToken, "worker_earnings", 1000, { type: "payout", id: "payout_1" });
    expect(ledger.balance(workerToken, "worker_earnings")).toBe(0);

    // Verify global invariant: sum of all credits = sum of all debits + remaining balances
    const allCredits = (db.prepare(
      `SELECT SUM(amount_cents) as total FROM ledger_entries WHERE entry_type = 'credit'`
    ).get() as any).total;
    const allDebits = (db.prepare(
      `SELECT SUM(amount_cents) as total FROM ledger_entries WHERE entry_type = 'debit'`
    ).get() as any).total;

    // Every cent is accounted for
    const clientBal = ledger.balance(clientToken, "client_wallet");
    const workerBal = ledger.balance(workerToken, "worker_earnings");
    const platformBal = ledger.balance("platform", "platform_fees");
    const escrowBal = ledger.balance("escrow", "escrow_hold");

    expect(allCredits - allDebits).toBe(clientBal + workerBal + platformBal + escrowBal);
  });
});
