export interface DatabaseRow {
  [key: string]: any;
}

export interface QueryResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface PreparedStatement {
  get(...params: any[]): DatabaseRow | undefined;
  all(...params: any[]): DatabaseRow[];
  run(...params: any[]): QueryResult;
}

export interface DatabaseConnection {
  // Execute raw SQL (for DDL, migrations)
  exec(sql: string): void;

  // Prepare a statement
  prepare(sql: string): PreparedStatement;

  // Close the connection
  close(): void;

  // Begin transaction
  transaction<T>(fn: () => T): T;
}

export type DatabaseType = "sqlite" | "postgres";

export interface DatabaseConfig {
  type: DatabaseType;
  sqlite?: {
    path?: string;
    memory?: boolean;
  };
  postgres?: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  };
}