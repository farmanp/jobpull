import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase } from "../src/sqlite.ts";

describe("SqliteDatabase", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jobpull-sqlite-"));
    dbPath = join(dir, "test.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("binds values, returns rows, and reports changes", async () => {
    const db = createSqliteDatabase(dbPath);
    await db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, note TEXT);");

    const insert = db.prepare("INSERT INTO items (name, note) VALUES (?, ?)").bind("O'Hare", "hello?");
    const result = await insert.run();
    assert.equal(result.meta.changes, 1);
    assert.equal(result.meta.last_row_id, 1);

    const rows = await db
      .prepare("SELECT id, name, note FROM items WHERE name = ?")
      .bind("O'Hare")
      .all<{ id: number; name: string; note: string }>();

    assert.equal(rows.results.length, 1);
    assert.deepEqual(rows.results[0], { id: 1, name: "O'Hare", note: "hello?" });

    const first = await db
      .prepare("SELECT id, name, note FROM items WHERE name = ?")
      .bind("O'Hare")
      .first<{ id: number; name: string; note: string }>();

    assert.deepEqual(first, { id: 1, name: "O'Hare", note: "hello?" });
  });

  it("runs batch statements sequentially", async () => {
    const db = createSqliteDatabase(dbPath);
    await db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);");

    const results = await db.batch([
      db.prepare("INSERT INTO items (name) VALUES (?)").bind("alpha"),
      db.prepare("INSERT INTO items (name) VALUES (?)").bind("beta")
    ]);

    assert.equal(results.length, 2);
    assert.equal(results[0].meta.changes, 1);
    assert.equal(results[1].meta.changes, 1);

    const rows = await db.prepare("SELECT name FROM items ORDER BY id").all<{ name: string }>();
    assert.deepEqual(rows.results, [{ name: "alpha" }, { name: "beta" }]);
  });

  it("supports numbered sqlite placeholders used by fetch cache upserts", async () => {
    const db = createSqliteDatabase(dbPath);
    await db.exec(`
      CREATE TABLE fetch_cache (
        url TEXT PRIMARY KEY,
        etag TEXT,
        last_modified TEXT,
        last_status INTEGER,
        last_fetched_at TEXT
      );
    `);

    await db
      .prepare(
        `INSERT INTO fetch_cache (url, etag, last_modified, last_status, last_fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(url) DO UPDATE SET
           etag = excluded.etag,
           last_modified = excluded.last_modified,
           last_status = excluded.last_status,
           last_fetched_at = excluded.last_fetched_at`
      )
      .bind(
        "https://example.com/jobs",
        "etag-1",
        "Wed, 01 Jan 2026 00:00:00 GMT",
        200,
        "2026-03-17T00:00:00.000Z"
      )
      .run();

    const row = await db
      .prepare("SELECT url, etag, last_status FROM fetch_cache WHERE url = ?")
      .bind("https://example.com/jobs")
      .first<{ url: string; etag: string; last_status: number }>();

    assert.deepEqual(row, {
      url: "https://example.com/jobs",
      etag: "etag-1",
      last_status: 200
    });
  });
});
