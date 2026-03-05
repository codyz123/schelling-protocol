import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "../db/interface.js";

export interface LedgerEntry {
  id: string;
  account_id: string;
  account_type: string;
  entry_type: string;
  amount_cents: number;
  currency: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export class LedgerService {
  constructor(private db: DatabaseConnection) {}

  credit(
    accountId: string,
    accountType: string,
    amountCents: number,
    reference?: { type: string; id: string },
    description?: string,
  ): string {
    if (amountCents <= 0) throw new Error("Amount must be positive");
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO ledger_entries (id, account_id, account_type, entry_type, amount_cents, reference_type, reference_id, description)
       VALUES (?, ?, ?, 'credit', ?, ?, ?, ?)`,
    ).run(id, accountId, accountType, amountCents, reference?.type ?? null, reference?.id ?? null, description ?? null);
    return id;
  }

  debit(
    accountId: string,
    accountType: string,
    amountCents: number,
    reference?: { type: string; id: string },
    description?: string,
  ): string {
    if (amountCents <= 0) throw new Error("Amount must be positive");
    const bal = this.balance(accountId, accountType);
    if (bal < amountCents) {
      throw new Error(`Insufficient balance. Balance: ${bal}, Required: ${amountCents}`);
    }
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO ledger_entries (id, account_id, account_type, entry_type, amount_cents, reference_type, reference_id, description)
       VALUES (?, ?, ?, 'debit', ?, ?, ?, ?)`,
    ).run(id, accountId, accountType, amountCents, reference?.type ?? null, reference?.id ?? null, description ?? null);
    return id;
  }

  balance(accountId: string, accountType: string): number {
    const row = this.db.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount_cents ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE 0 END), 0) as balance
       FROM ledger_entries WHERE account_id = ? AND account_type = ?`,
    ).get(accountId, accountType) as any;
    return row?.balance ?? 0;
  }

  transfer(
    fromAccountId: string,
    fromType: string,
    toAccountId: string,
    toType: string,
    amountCents: number,
    reference?: { type: string; id: string },
    description?: string,
  ): { debitId: string; creditId: string } {
    const txn = this.db.transaction(() => {
      const debitId = this.debit(fromAccountId, fromType, amountCents, reference, description);
      const creditId = this.credit(toAccountId, toType, amountCents, reference, description);
      return { debitId, creditId };
    });
    return txn();
  }

  history(accountId: string, accountType?: string): LedgerEntry[] {
    if (accountType) {
      return this.db.prepare(
        `SELECT * FROM ledger_entries WHERE account_id = ? AND account_type = ? ORDER BY created_at DESC`,
      ).all(accountId, accountType) as LedgerEntry[];
    }
    return this.db.prepare(
      `SELECT * FROM ledger_entries WHERE account_id = ? ORDER BY created_at DESC`,
    ).all(accountId) as LedgerEntry[];
  }

  allBalances(accountId: string): Record<string, number> {
    const rows = this.db.prepare(
      `SELECT account_type,
        COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount_cents ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE 0 END), 0) as balance
       FROM ledger_entries WHERE account_id = ? GROUP BY account_type`,
    ).all(accountId) as any[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.account_type] = row.balance;
    }
    return result;
  }
}
