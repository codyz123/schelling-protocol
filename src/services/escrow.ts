import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "../db/interface.js";
import { LedgerService } from "./ledger.js";

const PLATFORM_FEE_RATE = 0.05;

export interface EscrowRecord {
  id: string;
  contract_id: string;
  client_account_id: string;
  worker_account_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  status: string;
  held_at: string;
  released_at: string | null;
  ledger_hold_id: string | null;
  ledger_release_id: string | null;
}

export class EscrowService {
  private ledger: LedgerService;

  constructor(private db: DatabaseConnection) {
    this.ledger = new LedgerService(db);
  }

  hold(contractId: string, clientAccountId: string, workerAccountId: string, amountCents: number): EscrowRecord {
    if (amountCents <= 0) {
      // $0 contract — no escrow needed
      const id = randomUUID();
      this.db.prepare(
        `INSERT INTO escrow_records (id, contract_id, client_account_id, worker_account_id, amount_cents, platform_fee_cents, status)
         VALUES (?, ?, ?, ?, 0, 0, 'held')`,
      ).run(id, contractId, clientAccountId, workerAccountId);
      return this.db.prepare(`SELECT * FROM escrow_records WHERE id = ?`).get(id) as EscrowRecord;
    }

    const platformFee = Math.ceil(amountCents * PLATFORM_FEE_RATE);
    const totalRequired = amountCents + platformFee;

    const clientBalance = this.ledger.balance(clientAccountId, "client_wallet");
    if (clientBalance < totalRequired) {
      throw new Error(
        `Insufficient funds. Balance: ${clientBalance}, Required: ${totalRequired}. Top up with schelling.wallet_topup`,
      );
    }

    const txn = this.db.transaction(() => {
      // Debit client wallet
      const holdDebitId = this.ledger.debit(
        clientAccountId, "client_wallet", totalRequired,
        { type: "contract", id: contractId },
        `Escrow hold for contract ${contractId}`,
      );
      // Credit escrow
      const holdCreditId = this.ledger.credit(
        "escrow", "escrow_hold", totalRequired,
        { type: "contract", id: contractId },
        `Escrow hold for contract ${contractId}`,
      );

      const id = randomUUID();
      this.db.prepare(
        `INSERT INTO escrow_records (id, contract_id, client_account_id, worker_account_id, amount_cents, platform_fee_cents, status, ledger_hold_id)
         VALUES (?, ?, ?, ?, ?, ?, 'held', ?)`,
      ).run(id, contractId, clientAccountId, workerAccountId, amountCents, platformFee, holdDebitId);
      return id;
    });

    const escrowId = txn();
    return this.db.prepare(`SELECT * FROM escrow_records WHERE id = ?`).get(escrowId) as EscrowRecord;
  }

  release(contractId: string): EscrowRecord {
    const escrow = this.db.prepare(
      `SELECT * FROM escrow_records WHERE contract_id = ? AND status = 'held'`,
    ).get(contractId) as EscrowRecord | undefined;
    if (!escrow) throw new Error(`No held escrow for contract ${contractId}`);

    if (escrow.amount_cents === 0) {
      this.db.prepare(
        `UPDATE escrow_records SET status = 'released', released_at = datetime('now') WHERE id = ?`,
      ).run(escrow.id);
      return this.db.prepare(`SELECT * FROM escrow_records WHERE id = ?`).get(escrow.id) as EscrowRecord;
    }

    // Client paid: amount + fee into escrow. Worker gets amount, platform gets fee.
    const totalHeld = escrow.amount_cents + escrow.platform_fee_cents;

    const txn = this.db.transaction(() => {
      // Debit escrow
      this.ledger.debit(
        "escrow", "escrow_hold", totalHeld,
        { type: "contract", id: contractId },
        `Escrow release for contract ${contractId}`,
      );
      // Credit worker the agreed amount
      const releaseId = this.ledger.credit(
        escrow.worker_account_id, "worker_earnings", escrow.amount_cents,
        { type: "contract", id: contractId },
        `Payment for contract ${contractId}`,
      );
      // Credit platform the fee
      this.ledger.credit(
        "platform", "platform_fees", escrow.platform_fee_cents,
        { type: "contract", id: contractId },
        `Platform fee for contract ${contractId}`,
      );

      this.db.prepare(
        `UPDATE escrow_records SET status = 'released', released_at = datetime('now'), ledger_release_id = ? WHERE id = ?`,
      ).run(releaseId, escrow.id);
    });
    txn();

    return this.db.prepare(`SELECT * FROM escrow_records WHERE id = ?`).get(escrow.id) as EscrowRecord;
  }

  refund(contractId: string): EscrowRecord {
    const escrow = this.db.prepare(
      `SELECT * FROM escrow_records WHERE contract_id = ? AND status = 'held'`,
    ).get(contractId) as EscrowRecord | undefined;
    if (!escrow) throw new Error(`No held escrow for contract ${contractId}`);

    if (escrow.amount_cents === 0) {
      this.db.prepare(
        `UPDATE escrow_records SET status = 'refunded', released_at = datetime('now') WHERE id = ?`,
      ).run(escrow.id);
      return this.db.prepare(`SELECT * FROM escrow_records WHERE id = ?`).get(escrow.id) as EscrowRecord;
    }

    const totalHeld = escrow.amount_cents + escrow.platform_fee_cents;

    const txn = this.db.transaction(() => {
      // Debit escrow
      this.ledger.debit(
        "escrow", "escrow_hold", totalHeld,
        { type: "refund", id: contractId },
        `Escrow refund for contract ${contractId}`,
      );
      // Credit back to client (full refund)
      this.ledger.credit(
        escrow.client_account_id, "client_wallet", totalHeld,
        { type: "refund", id: contractId },
        `Escrow refund for contract ${contractId}`,
      );

      this.db.prepare(
        `UPDATE escrow_records SET status = 'refunded', released_at = datetime('now') WHERE id = ?`,
      ).run(escrow.id);
    });
    txn();

    return this.db.prepare(`SELECT * FROM escrow_records WHERE id = ?`).get(escrow.id) as EscrowRecord;
  }

  dispute(contractId: string): void {
    this.db.prepare(
      `UPDATE escrow_records SET status = 'disputed' WHERE contract_id = ? AND status = 'held'`,
    ).run(contractId);
  }

  getByContract(contractId: string): EscrowRecord | undefined {
    return this.db.prepare(
      `SELECT * FROM escrow_records WHERE contract_id = ?`,
    ).get(contractId) as EscrowRecord | undefined;
  }

  getLedger(): LedgerService {
    return this.ledger;
  }
}
