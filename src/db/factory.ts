import type { DatabaseConnection, DatabaseConfig, DatabaseType } from "./interface.js";
import { SqliteConnection } from "./sqlite-adapter.js";
import { PostgresConnection } from "./postgres-adapter.js";

export function createDatabaseConnection(config?: DatabaseConfig): DatabaseConnection {
  // Default to SQLite for backwards compatibility
  const dbType: DatabaseType = config?.type || (process.env.DB_TYPE as DatabaseType) || "sqlite";

  switch (dbType) {
    case "sqlite":
      return new SqliteConnection(config?.sqlite);

    case "postgres":
      console.warn(
        "WARNING: Postgres support is experimental. The current codebase uses synchronous " +
        "database operations, but Postgres requires async. For production use with Postgres, " +
        "the handlers need to be refactored to use async/await. Using SQLite is recommended."
      );
      return new PostgresConnection(config?.postgres);

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

// Helper to determine database type from environment
export function getDatabaseType(): DatabaseType {
  return (process.env.DB_TYPE as DatabaseType) || "sqlite";
}

// Helper to get database config from environment
export function getDatabaseConfigFromEnv(): DatabaseConfig {
  const type = getDatabaseType();

  if (type === "postgres") {
    return {
      type: "postgres",
      postgres: {
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
    };
  }

  return {
    type: "sqlite",
    sqlite: {
      path: process.env.DB_PATH || "data/schelling.db",
      memory: false,
    },
  };
}

// Helper to create in-memory database for testing
export function createTestDatabase(): DatabaseConnection {
  return new SqliteConnection({ memory: true });
}