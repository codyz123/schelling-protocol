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

function loadV4Migration(): string {
  const migrationPath = resolve(process.cwd(), "migrations/003_v4_submissions.sql");
  try {
    return readFileSync(migrationPath, 'utf-8');
  } catch {
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

  // Apply v4 submissions migration
  const v4Sql = loadV4Migration();
  if (v4Sql) {
    try {
      db.exec(v4Sql);
    } catch (error) {
      // Tables may already exist, ignore
    }
  }

  // Apply v4 schema update — always drop and recreate v4 tables (pre-launch, no real data)
  // This ensures the schema is always fresh and matches the latest 003 migration
  try {
    const v4UpdateSql = readFileSync(resolve(process.cwd(), "migrations/004_v4_schema_update.sql"), "utf-8");
    if (v4UpdateSql) {
      db.exec(v4UpdateSql);
      // Re-run 003 to create fresh tables with correct schema
      const v4SqlAgain = loadV4Migration();
      if (v4SqlAgain) db.exec(v4SqlAgain);
    }
  } catch {
    // Migration file not found or already applied — skip
  }
}
