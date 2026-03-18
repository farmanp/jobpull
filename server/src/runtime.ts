import { existsSync } from "node:fs";
import { join } from "node:path";
import workerApp from "../../worker/src/index.ts";
import { createSqliteDatabase, type SqliteDatabase } from "./sqlite.ts";
import { applyMigrations } from "./migrations.ts";
import { createStaticHandler } from "./static.ts";
import { startCronScheduler, type CronScheduler } from "./cron.ts";

export interface ServerOptions {
  dbPath: string;
  webDistDir: string;
  migrationsDir: string;
  adminToken: string;
  port: number;
  cronSchedule: string;
  userAgent: string;
  defaultTimeoutMs: string;
  defaultMaxRetries: string;
  hostConcurrency: string;
  hostSpacingMs: string;
  staleThresholdDays: string;
}

export interface ServerEnv {
  DB: D1Database;
  ADMIN_TOKEN: string;
  USER_AGENT?: string;
  DEFAULT_TIMEOUT_MS?: string;
  DEFAULT_MAX_RETRIES?: string;
  HOST_CONCURRENCY?: string;
  HOST_SPACING_MS?: string;
  STALE_THRESHOLD_DAYS?: string;
}

export interface ServerRuntime {
  db: SqliteDatabase;
  env: ServerEnv;
  handleRequest(request: Request): Promise<Response>;
  startScheduler(): CronScheduler;
}

function createEnv(db: SqliteDatabase, options: ServerOptions): ServerEnv {
  return {
    DB: db,
    ADMIN_TOKEN: options.adminToken,
    USER_AGENT: options.userAgent,
    DEFAULT_TIMEOUT_MS: options.defaultTimeoutMs,
    DEFAULT_MAX_RETRIES: options.defaultMaxRetries,
    HOST_CONCURRENCY: options.hostConcurrency,
    HOST_SPACING_MS: options.hostSpacingMs,
    STALE_THRESHOLD_DAYS: options.staleThresholdDays
  };
}

export async function createServerRuntime(options: ServerOptions): Promise<ServerRuntime> {
  const db = createSqliteDatabase(options.dbPath);
  await applyMigrations(db, options.migrationsDir);

  const env = createEnv(db, options);
  const handleStatic = createStaticHandler(options.webDistDir);

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return workerApp.fetch(request, env as never);
    }

    return handleStatic(request);
  };

  const startScheduler = (): CronScheduler =>
    startCronScheduler(options.cronSchedule, async () => {
      await workerApp.scheduled({} as ScheduledEvent, env as never);
    });

  return { db, env, handleRequest, startScheduler };
}

export function buildRuntimeOptionsFromEnv(baseDir: string): ServerOptions {
  const dbPath = process.env.DB_PATH ?? "/data/jobpull.sqlite";
  const webDistDir = process.env.WEB_DIST_DIR ?? join(baseDir, "web", "dist");
  const migrationsDir = process.env.MIGRATIONS_DIR ?? join(baseDir, "worker", "migrations");

  return {
    dbPath,
    webDistDir,
    migrationsDir,
    adminToken: process.env.ADMIN_TOKEN ?? "",
    port: Number.parseInt(process.env.PORT ?? "8787", 10) || 8787,
    cronSchedule: process.env.CRON_SCHEDULE ?? "0 7 * * *",
    userAgent: process.env.USER_AGENT ?? "JobPullBot/1.0 (+contact:you@example.com)",
    defaultTimeoutMs: process.env.DEFAULT_TIMEOUT_MS ?? "10000",
    defaultMaxRetries: process.env.DEFAULT_MAX_RETRIES ?? "3",
    hostConcurrency: process.env.HOST_CONCURRENCY ?? "2",
    hostSpacingMs: process.env.HOST_SPACING_MS ?? "750",
    staleThresholdDays: process.env.STALE_THRESHOLD_DAYS ?? "14"
  };
}

export function webDistExists(webDistDir: string): boolean {
  return existsSync(join(webDistDir, "index.html"));
}
