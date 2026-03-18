import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SqliteDatabase } from "./sqlite.ts";

export interface MigrationResult {
  applied: string[];
}

export async function applyMigrations(db: SqliteDatabase, migrationsDir: string): Promise<MigrationResult> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  const appliedRows = await db.all<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
  const applied = new Set((appliedRows.results ?? []).map((row) => row.name));
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const migrationSql = readFileSync(join(migrationsDir, file), "utf8");
    const escapedName = file.replace(/'/g, "''");
    const script = `
      BEGIN;
      ${migrationSql}
      INSERT INTO schema_migrations (name, applied_at) VALUES ('${escapedName}', CURRENT_TIMESTAMP);
      COMMIT;
    `;

    try {
      await db.exec(script);
      newlyApplied.push(file);
    } catch (error) {
      try {
        await db.exec("ROLLBACK;");
      } catch {
        // Ignore rollback failures. The migration error is the real signal.
      }
      throw error;
    }
  }

  return { applied: newlyApplied };
}
