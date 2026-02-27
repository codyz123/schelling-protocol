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

export function initSchema(db: DatabaseConnection): void {
  const dbType = getDatabaseType();
  const migrationSql = loadMigrationFile(dbType);

  try {
    db.exec(migrationSql);
  } catch (error) {
    console.error(`Failed to initialize ${dbType} schema:`, error);
    throw error;
  }
}
