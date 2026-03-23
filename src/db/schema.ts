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

  // Apply v4 schema update migration (drops old v4 tables if they exist with wrong schema)
  try {
    const v4UpdateSql = readFileSync(resolve(process.cwd(), "migrations/004_v4_schema_update.sql"), "utf-8");
    if (v4UpdateSql) {
      // Only run if old schema exists (has ask_embedding instead of intent_embedding)
      try {
        const check = db.prepare("SELECT ask_embedding FROM submissions LIMIT 0");
        check.get(); // Will succeed if old column exists
        // Old schema detected — drop and let 003 recreate
        db.exec(v4UpdateSql);
        // Re-run 003 to create fresh tables
        const v4SqlAgain = loadV4Migration();
        if (v4SqlAgain) db.exec(v4SqlAgain);
      } catch {
        // Column doesn't exist (new schema) or table doesn't exist — skip
      }
    }
  } catch {
    // Migration file not found — skip
  }
}
