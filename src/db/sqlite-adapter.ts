import { Database } from "bun:sqlite";
import type {
  DatabaseConnection,
  PreparedStatement as IPreparedStatement,
  DatabaseRow,
  QueryResult,
  DatabaseConfig
} from "./interface.js";

class SqlitePreparedStatement implements IPreparedStatement {
  constructor(private statement: any) {}

  get(...params: any[]): DatabaseRow | undefined {
    return this.statement.get(...params);
  }

  all(...params: any[]): DatabaseRow[] {
    return this.statement.all(...params);
  }

  run(...params: any[]): QueryResult {
    const result = this.statement.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }
}

export class SqliteConnection implements DatabaseConnection {
  private db: Database;

  constructor(config: DatabaseConfig["sqlite"] = {}) {
    if (config.memory) {
      this.db = new Database(":memory:");
    } else {
      const dbPath = config.path || "data/schelling.db";

      // Create directory if it doesn't exist
      const { mkdirSync } = require("node:fs");
      const { dirname } = require("node:path");
      mkdirSync(dirname(dbPath), { recursive: true });

      this.db = new Database(dbPath);
      // Enable SQLite optimizations
      this.db.exec("PRAGMA journal_mode = WAL");
    }

    this.db.exec("PRAGMA foreign_keys = ON");
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): IPreparedStatement {
    const statement = this.db.prepare(sql);
    return new SqlitePreparedStatement(statement);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}