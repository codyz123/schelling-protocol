import postgres from "postgres";
import type {
  DatabaseConnection,
  PreparedStatement as IPreparedStatement,
  DatabaseRow,
  QueryResult,
  DatabaseConfig
} from "./interface.js";

// Note: This Postgres adapter has limitations due to async/sync boundary
// The existing codebase expects synchronous database operations, but postgres.js is async-only
// This implementation provides basic functionality but should be considered experimental
// For production use with Postgres, the application would need to be refactored to use async/await

class PostgresPreparedStatement implements IPreparedStatement {
  constructor(
    private sql: string,
    private client: ReturnType<typeof postgres>
  ) {}

  private convertSqlToPostgres(sql: string, params: any[]): { sql: string; params: any[] } {
    let paramIndex = 1;
    const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    return { sql: convertedSql, params };
  }

  get(...params: any[]): DatabaseRow | undefined {
    // Note: This is blocking the thread and should not be used in production
    // Postgres operations are async, but we're providing sync interface for compatibility
    throw new Error(
      "Postgres adapter: synchronous operations not supported. " +
      "The application needs to be refactored to use async/await for Postgres support. " +
      "Use SQLite for now, or refactor handlers to be async."
    );
  }

  all(...params: any[]): DatabaseRow[] {
    throw new Error(
      "Postgres adapter: synchronous operations not supported. " +
      "The application needs to be refactored to use async/await for Postgres support. " +
      "Use SQLite for now, or refactor handlers to be async."
    );
  }

  run(...params: any[]): QueryResult {
    throw new Error(
      "Postgres adapter: synchronous operations not supported. " +
      "The application needs to be refactored to use async/await for Postgres support. " +
      "Use SQLite for now, or refactor handlers to be async."
    );
  }
}

export class PostgresConnection implements DatabaseConnection {
  private client: ReturnType<typeof postgres>;

  constructor(config: DatabaseConfig["postgres"] = {}) {
    const connectionString =
      config.connectionString ||
      process.env.DATABASE_URL ||
      `postgres://${config.username || 'postgres'}:${config.password || 'postgres'}@${config.host || 'localhost'}:${config.port || 5432}/${config.database || 'schelling'}`;

    this.client = postgres(connectionString, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 30,
    });

    console.warn(
      "PostgresConnection: This adapter has limitations due to async/sync boundary. " +
      "For production Postgres usage, refactor the application to use async/await."
    );
  }

  exec(sql: string): void {
    throw new Error(
      "Postgres adapter: exec() not supported in synchronous mode. " +
      "For DDL operations with Postgres, use an async migration tool or refactor to async."
    );
  }

  prepare(sql: string): IPreparedStatement {
    return new PostgresPreparedStatement(sql, this.client);
  }

  close(): void {
    // This is async but we can't await it in this sync interface
    this.client.end().catch(error => {
      console.error("Error closing Postgres connection:", error);
    });
  }

  transaction<T>(fn: () => T): T {
    throw new Error(
      "Postgres adapter: transactions not supported in synchronous mode. " +
      "Refactor to async for proper transaction support."
    );
  }
}