import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "../db/interface.js";
import type { HandlerContext, HandlerResult } from "../types.js";

export interface NegotiationSession {
  id: string;
  seeker_token_hash: string;
  offerer_token_hash: string;
  cluster_id: string | null;
  status: string;
  current_turn: string | null;
  current_price_cents: number | null;
  initial_ask_cents: number | null;
  initial_bid_cents: number | null;
  rounds: number;
  max_rounds: number;
  deadline_ms: number;
  deadline_at: string;
  agreed_price_cents: number | null;
  market_rate_cents: number | null;
  locked_controls_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface NegotiationMove {
  id: string;
  session_id: string;
  agent_token_hash: string;
  move_type: string;
  price_cents: number | null;
  message: string | null;
  created_at: string;
}

function computeDeadlineMs(bidCents: number): number {
  if (bidCents < 100) return 30_000;
  if (bidCents <= 5_000) return 300_000;
  if (bidCents <= 50_000) return 1_800_000;
  return 7_200_000;
}

export class NegotiationService {
  constructor(private db: DatabaseConnection) {}

  start(params: {
    seeker_token: string;
    offerer_token: string;
    initial_bid_cents: number;
    job_description?: string;
    cluster_id?: string;
  }): NegotiationSession {
    const deadlineMs = computeDeadlineMs(params.initial_bid_cents);
    const deadlineAt = new Date(Date.now() + deadlineMs).toISOString();

    // Look up offerer's marketplace profile for initial ask and locked controls
    const offererProfile = this.db.prepare(
      `SELECT * FROM marketplace_profiles WHERE registration_id = ?`,
    ).get(params.offerer_token) as any;

    const initialAsk = offererProfile?.per_task_rate_cents ?? offererProfile?.hourly_rate_cents ?? null;
    const lockedControls = offererProfile ? JSON.stringify({
      min_price_cents: offererProfile.min_price_cents,
      auto_accept_below_cents: offererProfile.auto_accept_below_cents,
    }) : null;

    // Get market rate
    const marketRate = this.getMarketRate(params.cluster_id);

    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO negotiation_sessions
        (id, seeker_token_hash, offerer_token_hash, cluster_id, status, current_turn, current_price_cents,
         initial_ask_cents, initial_bid_cents, deadline_ms, deadline_at, market_rate_cents, locked_controls_json)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, params.seeker_token, params.offerer_token,
      params.cluster_id ?? null, params.offerer_token,
      params.initial_bid_cents, initialAsk, params.initial_bid_cents,
      deadlineMs, deadlineAt, marketRate, lockedControls,
    );

    // Record initial offer move
    this.db.prepare(
      `INSERT INTO negotiation_moves (id, session_id, agent_token_hash, move_type, price_cents, message)
       VALUES (?, ?, ?, 'offer', ?, ?)`,
    ).run(randomUUID(), id, params.seeker_token, params.initial_bid_cents, params.job_description ?? null);

    // Auto-accept if below threshold
    if (offererProfile?.auto_accept_below_cents && params.initial_bid_cents >= offererProfile.auto_accept_below_cents) {
      return this.doAccept(id, params.offerer_token, params.initial_bid_cents);
    }

    return this.db.prepare(`SELECT * FROM negotiation_sessions WHERE id = ?`).get(id) as NegotiationSession;
  }

  respond(params: {
    session_id: string;
    agent_token: string;
    move_type: "counter" | "accept" | "reject" | "withdraw";
    price_cents?: number;
    message?: string;
  }): NegotiationSession {
    const session = this.db.prepare(
      `SELECT * FROM negotiation_sessions WHERE id = ?`,
    ).get(params.session_id) as NegotiationSession | undefined;

    if (!session) throw new Error("Negotiation session not found");
    if (session.status !== "active") throw new Error(`Session is ${session.status}, not active`);

    // Verify agent is a party
    const isSeeker = params.agent_token === session.seeker_token_hash;
    const isOfferer = params.agent_token === session.offerer_token_hash;
    if (!isSeeker && !isOfferer) throw new Error("You are not a party to this negotiation");

    // Check turn
    if (session.current_turn && session.current_turn !== params.agent_token) {
      throw new Error("It is not your turn");
    }

    // Check deadline
    if (new Date(session.deadline_at) < new Date()) {
      this.db.prepare(`UPDATE negotiation_sessions SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(session.id);
      throw new Error("Negotiation deadline has passed");
    }

    switch (params.move_type) {
      case "accept":
        return this.doAccept(session.id, params.agent_token, session.current_price_cents!);

      case "reject":
        this.db.prepare(
          `INSERT INTO negotiation_moves (id, session_id, agent_token_hash, move_type, message) VALUES (?, ?, ?, 'reject', ?)`,
        ).run(randomUUID(), session.id, params.agent_token, params.message ?? null);
        this.db.prepare(
          `UPDATE negotiation_sessions SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`,
        ).run(session.id);
        return this.db.prepare(`SELECT * FROM negotiation_sessions WHERE id = ?`).get(session.id) as NegotiationSession;

      case "withdraw":
        this.db.prepare(
          `INSERT INTO negotiation_moves (id, session_id, agent_token_hash, move_type, message) VALUES (?, ?, ?, 'withdraw', ?)`,
        ).run(randomUUID(), session.id, params.agent_token, params.message ?? null);
        this.db.prepare(
          `UPDATE negotiation_sessions SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?`,
        ).run(session.id);
        return this.db.prepare(`SELECT * FROM negotiation_sessions WHERE id = ?`).get(session.id) as NegotiationSession;

      case "counter": {
        if (!params.price_cents || params.price_cents <= 0) throw new Error("Counter offer must include a positive price");
        if (session.rounds >= session.max_rounds) throw new Error("Maximum negotiation rounds exceeded");

        // Check min_price enforcement for offerer
        if (isOfferer) {
          const controls = session.locked_controls_json ? JSON.parse(session.locked_controls_json) : null;
          if (controls?.min_price_cents && params.price_cents < controls.min_price_cents) {
            throw new Error(`Price cannot be below minimum: ${controls.min_price_cents}`);
          }
        }

        // Auto-reject if seeker bids below offerer's min_price
        if (isSeeker) {
          const controls = session.locked_controls_json ? JSON.parse(session.locked_controls_json) : null;
          if (controls?.min_price_cents && params.price_cents < controls.min_price_cents) {
            // Don't auto-reject, just record the counter - offerer can reject on their turn
          }
        }

        const nextTurn = isSeeker ? session.offerer_token_hash : session.seeker_token_hash;
        this.db.prepare(
          `INSERT INTO negotiation_moves (id, session_id, agent_token_hash, move_type, price_cents, message) VALUES (?, ?, ?, 'counter', ?, ?)`,
        ).run(randomUUID(), session.id, params.agent_token, params.price_cents, params.message ?? null);
        this.db.prepare(
          `UPDATE negotiation_sessions SET current_price_cents = ?, current_turn = ?, rounds = rounds + 1, updated_at = datetime('now') WHERE id = ?`,
        ).run(params.price_cents, nextTurn, session.id);
        return this.db.prepare(`SELECT * FROM negotiation_sessions WHERE id = ?`).get(session.id) as NegotiationSession;
      }

      default:
        throw new Error(`Unknown move type: ${params.move_type}`);
    }
  }

  private doAccept(sessionId: string, agentToken: string, priceCents: number): NegotiationSession {
    this.db.prepare(
      `INSERT INTO negotiation_moves (id, session_id, agent_token_hash, move_type, price_cents) VALUES (?, ?, ?, 'accept', ?)`,
    ).run(randomUUID(), sessionId, agentToken, priceCents);
    this.db.prepare(
      `UPDATE negotiation_sessions SET status = 'agreed', agreed_price_cents = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(priceCents, sessionId);
    return this.db.prepare(`SELECT * FROM negotiation_sessions WHERE id = ?`).get(sessionId) as NegotiationSession;
  }

  status(sessionId: string): { session: NegotiationSession; moves: NegotiationMove[]; time_remaining_ms: number } {
    const session = this.db.prepare(
      `SELECT * FROM negotiation_sessions WHERE id = ?`,
    ).get(sessionId) as NegotiationSession | undefined;
    if (!session) throw new Error("Negotiation session not found");

    const moves = this.db.prepare(
      `SELECT * FROM negotiation_moves WHERE session_id = ? ORDER BY created_at ASC`,
    ).all(sessionId) as NegotiationMove[];

    const timeRemaining = Math.max(0, new Date(session.deadline_at).getTime() - Date.now());

    return { session, moves, time_remaining_ms: timeRemaining };
  }

  expireDeadlines(): number {
    const result = this.db.prepare(
      `UPDATE negotiation_sessions SET status = 'expired', updated_at = datetime('now')
       WHERE status = 'active' AND deadline_at < datetime('now')`,
    ).run();
    return result.changes;
  }

  private getMarketRate(clusterId?: string | null): number | null {
    // Compute median from completed contracts in cluster
    if (!clusterId) return null;
    const rows = this.db.prepare(
      `SELECT ns.agreed_price_cents FROM negotiation_sessions ns
       WHERE ns.cluster_id = ? AND ns.status = 'agreed' AND ns.agreed_price_cents IS NOT NULL
       ORDER BY ns.agreed_price_cents`,
    ).all(clusterId) as any[];
    if (rows.length === 0) return null;
    const mid = Math.floor(rows.length / 2);
    return rows.length % 2 === 0
      ? Math.round((rows[mid - 1].agreed_price_cents + rows[mid].agreed_price_cents) / 2)
      : rows[mid].agreed_price_cents;
  }
}
