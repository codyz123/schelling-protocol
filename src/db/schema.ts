import type { DatabaseConnection } from "./interface.js";
import { getDatabaseType } from "./factory.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Schema Migration Functions ────────────────────────────────────────

function loadMigrationFile(dbType: "sqlite" | "postgres"): string {
  const migrationPath = resolve(process.cwd(), `migrations/001_initial_schema_${dbType}.sql`);
  try {
    return readFileSync(migrationPath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read migration file: ${migrationPath}`);
    throw error;
  }
}

function loadMarketplaceMigration(): string {
  const migrationPath = resolve(process.cwd(), "migrations/002_marketplace.sql");
  try {
    return readFileSync(migrationPath, 'utf-8');
  } catch {
    // Migration file may not exist in all environments
    return "";
  }
}

export function initSchema(db: DatabaseConnection): void {
  const dbType = getDatabaseType();
  const migrationSql = loadMigrationFile(dbType);

  try {
    db.exec(migrationSql);
  } catch (error) {
    console.error(`Failed to initialize ${dbType} schema:`, error);
    throw error;
  }

  // Apply marketplace migration
  const marketplaceSql = loadMarketplaceMigration();
  if (marketplaceSql) {
    try {
      db.exec(marketplaceSql);
    } catch (error) {
      // Tables may already exist, ignore
    }
  }
}
