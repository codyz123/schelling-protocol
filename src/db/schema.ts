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

  // Idempotent additions for existing v4 databases (ALTER TABLE fails if column already exists)
  for (const stmt of [
    "ALTER TABLE submissions ADD COLUMN search_mode TEXT DEFAULT 'active'",
    "ALTER TABLE submissions ADD COLUMN search_source TEXT DEFAULT 'user_directed'",
    "ALTER TABLE submissions ADD COLUMN hybrid_active_hours INTEGER DEFAULT 168",
    "ALTER TABLE submissions ADD COLUMN alert_webhook TEXT",
    "ALTER TABLE submissions ADD COLUMN alert_threshold REAL DEFAULT 0.5",
  ]) {
    try { db.exec(stmt); } catch { /* column already exists — safe to ignore */ }
  }
}
