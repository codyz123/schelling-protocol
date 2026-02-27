import type { DatabaseConnection } from "./interface.js";
import { createDatabaseConnection, getDatabaseConfigFromEnv, createTestDatabase } from "./factory.js";

let instance: DatabaseConnection | null = null;

export function getDatabase(): DatabaseConnection {
  if (instance) return instance;

  instance = createDatabaseConnection(getDatabaseConfigFromEnv());
  return instance;
}

export function createInMemoryDatabase(): DatabaseConnection {
  return createTestDatabase();
}

// Legacy export for backwards compatibility
export type Database = DatabaseConnection;
