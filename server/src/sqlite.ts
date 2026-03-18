import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

export interface SqliteMeta {
  changes: number;
  last_row_id: number;
}

export interface SqliteRunResult {
  success: boolean;
  meta: SqliteMeta;
}

export interface SqliteAllResult<T> {
  success: boolean;
  results: T[];
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function escapeSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function bindSql(sql: string, bindings: unknown[]): string {
  let output = "";
  let bindingIndex = 0;
  const usedBindings = new Set<number>();
  let state: "normal" | "single" | "double" | "line" | "block" = "normal";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] ?? "";
    const next = sql[i + 1] ?? "";

    if (state === "normal") {
      if (char === "'") {
        state = "single";
        output += char;
        continue;
      }

      if (char === '"') {
        state = "double";
        output += char;
        continue;
      }

      if (char === "-" && next === "-") {
        state = "line";
        output += char + next;
        i += 1;
        continue;
      }

      if (char === "/" && next === "*") {
        state = "block";
        output += char + next;
        i += 1;
        continue;
      }

      if (char === "?") {
        let consumedDigits = 0;
        while (/\d/.test(sql[i + 1 + consumedDigits] ?? "")) {
          consumedDigits += 1;
        }

        if (consumedDigits > 0) {
          const explicitIndex = Number.parseInt(sql.slice(i + 1, i + 1 + consumedDigits), 10) - 1;
          if (!Number.isFinite(explicitIndex) || explicitIndex < 0 || explicitIndex >= bindings.length) {
            throw new Error(`Missing bind value for placeholder ?${sql.slice(i + 1, i + 1 + consumedDigits)}`);
          }
          output += escapeSqlLiteral(bindings[explicitIndex]);
          usedBindings.add(explicitIndex);
          i += consumedDigits;
          continue;
        }

        if (bindingIndex >= bindings.length) {
          throw new Error(`Missing bind value for placeholder ${bindingIndex + 1}`);
        }
        output += escapeSqlLiteral(bindings[bindingIndex]);
        usedBindings.add(bindingIndex);
        bindingIndex += 1;
        continue;
      }

      output += char;
      continue;
    }

    if (state === "single") {
      output += char;
      if (char === "'") {
        if (next === "'") {
          output += next;
          i += 1;
        } else {
          state = "normal";
        }
      }
      continue;
    }

    if (state === "double") {
      output += char;
      if (char === '"') {
        if (next === '"') {
          output += next;
          i += 1;
        } else {
          state = "normal";
        }
      }
      continue;
    }

    if (state === "line") {
      output += char;
      if (char === "\n") {
        state = "normal";
      }
      continue;
    }

    output += char;
    if (char === "*" && next === "/") {
      output += next;
      i += 1;
      state = "normal";
    }
  }

  if (usedBindings.size < bindings.length) {
    throw new Error(`Too many bind values provided (${bindings.length}), only ${usedBindings.size} placeholders found`);
  }

  return output;
}

function runSqliteJson<T>(dbPath: string, sql: string): T[] {
  ensureDir(dbPath);
  const result = spawnSync("sqlite3", ["-json", dbPath], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || "sqlite3 command failed";
    throw new Error(message);
  }

  const output = result.stdout.trim();
  if (!output) {
    return [];
  }

  return JSON.parse(output) as T[];
}

function runSqliteScript(dbPath: string, script: string): void {
  ensureDir(dbPath);
  const result = spawnSync("sqlite3", [dbPath], {
    input: script,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || "sqlite3 command failed";
    throw new Error(message);
  }
}

export class SqliteStatement {
  private readonly db: SqliteDatabase;
  private readonly sql: string;
  private readonly bindings: unknown[];

  constructor(
    db: SqliteDatabase,
    sql: string,
    bindings: unknown[] = []
  ) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.db, this.sql, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.bindings);
  }

  async all<T = Record<string, unknown>>(): Promise<SqliteAllResult<T>> {
    return this.db.all<T>(this.sql, this.bindings);
  }

  async run(): Promise<SqliteRunResult> {
    return this.db.run(this.sql, this.bindings);
  }
}

export class SqliteDatabase {
  public readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    ensureDir(filePath);
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this, sql);
  }

  async first<T = Record<string, unknown>>(sql: string, bindings: unknown[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, bindings);
    return rows.results[0] ?? null;
  }

  async all<T = Record<string, unknown>>(sql: string, bindings: unknown[] = []): Promise<SqliteAllResult<T>> {
    const boundSql = bindSql(sql, bindings);
    const results = runSqliteJson<T>(this.filePath, `${boundSql};`);
    return { success: true, results };
  }

  async run(sql: string, bindings: unknown[] = []): Promise<SqliteRunResult> {
    const boundSql = bindSql(sql, bindings);
    const results = runSqliteJson<SqliteMeta>(
      this.filePath,
      `${boundSql};\nselect changes() as changes, last_insert_rowid() as last_row_id;`
    );
    const meta = results[0] ?? { changes: 0, last_row_id: 0 };
    return { success: true, meta };
  }

  async batch(statements: SqliteStatement[]): Promise<SqliteRunResult[]> {
    const results: SqliteRunResult[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  async exec(script: string): Promise<void> {
    runSqliteScript(this.filePath, script);
  }
}

export function createSqliteDatabase(filePath: string): SqliteDatabase {
  return new SqliteDatabase(filePath);
}
