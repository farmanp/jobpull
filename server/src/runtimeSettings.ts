import type { SqliteDatabase } from "./sqlite.ts";

export async function getRuntimeSetting(db: SqliteDatabase, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM runtime_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();

  return row?.value ?? null;
}

export async function setRuntimeSetting(db: SqliteDatabase, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO runtime_settings (key, value) VALUES (?, ?)")
    .bind(key, value)
    .run();
}
