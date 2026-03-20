import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import workerApp from "../../worker/src/index.ts";
import { canBrowseBoard, isEnabledFlag } from "../../shared/ownerRuntime.ts";
import { createSqliteDatabase, type SqliteDatabase } from "./sqlite.ts";
import { applyMigrations } from "./migrations.ts";
import { createStaticHandler } from "./static.ts";
import { parseCronExpression, startCronScheduler, type CronScheduler } from "./cron.ts";
import { getRuntimeSetting, setRuntimeSetting } from "./runtimeSettings.ts";
import {
  applyOwnerSessionToRequest,
  buildUnauthenticatedBoardResponse,
  getOwnerAccessContext,
  handleOwnerRoute,
  shouldGateAnonymousRequest,
  type OwnerEnv
} from "./owner.ts";
import { createResumeStorage } from "./resumeStorage.ts";

export interface ServerOptions {
  dbPath: string;
  webDistDir: string;
  migrationsDir: string;
  serverMigrationsDir?: string;
  adminToken: string;
  sessionSecret?: string;
  magicLinkDelivery?: string;
  boardVisibilityDefault?: string;
  allowUnclaimedBrowse?: string;
  resendApiKey: string;
  emailFrom: string;
  emailReplyTo: string;
  publicBaseUrl: string;
  uploadsDir?: string;
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
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  PUBLIC_BASE_URL?: string;
  SESSION_SECRET?: string;
  MAGIC_LINK_DELIVERY?: string;
  BOARD_VISIBILITY_DEFAULT?: string;
  ALLOW_UNCLAIMED_BROWSE?: string;
  UPLOADS_DIR?: string;
  USER_AGENT?: string;
  DEFAULT_TIMEOUT_MS?: string;
  DEFAULT_MAX_RETRIES?: string;
  HOST_CONCURRENCY?: string;
  HOST_SPACING_MS?: string;
  STALE_THRESHOLD_DAYS?: string;
  CRON_SCHEDULE?: string;
  RUNTIME_PLATFORM?: "cloudflare" | "server";
  getRuntimeSchedule?: () => Promise<string>;
  setRuntimeSchedule?: (schedule: string) => Promise<void>;
  getBoardState?: () => Promise<unknown>;
  setBoardVisibility?: (visibility: "private" | "public") => Promise<void>;
  saveResumeUpload?: (params: {
    userId: string;
    resumeId: string;
    filename: string;
    data: Uint8Array;
  }) => Promise<{ storageKey: string }>;
  readResumeUpload?: (storageKey: string) => Promise<Uint8Array | null>;
  deleteResumeUpload?: (storageKey: string) => Promise<void>;
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
    SESSION_SECRET: options.sessionSecret,
    MAGIC_LINK_DELIVERY: options.magicLinkDelivery,
    BOARD_VISIBILITY_DEFAULT: options.boardVisibilityDefault,
    ALLOW_UNCLAIMED_BROWSE: options.allowUnclaimedBrowse,
    RESEND_API_KEY: options.resendApiKey,
    EMAIL_FROM: options.emailFrom,
    EMAIL_REPLY_TO: options.emailReplyTo,
    PUBLIC_BASE_URL: options.publicBaseUrl,
    UPLOADS_DIR: options.uploadsDir,
    USER_AGENT: options.userAgent,
    DEFAULT_TIMEOUT_MS: options.defaultTimeoutMs,
    DEFAULT_MAX_RETRIES: options.defaultMaxRetries,
    HOST_CONCURRENCY: options.hostConcurrency,
    HOST_SPACING_MS: options.hostSpacingMs,
    STALE_THRESHOLD_DAYS: options.staleThresholdDays,
    CRON_SCHEDULE: options.cronSchedule,
    RUNTIME_PLATFORM: "server"
  };
}

export async function createServerRuntime(options: ServerOptions): Promise<ServerRuntime> {
  const db = createSqliteDatabase(options.dbPath);
  await applyMigrations(db, options.migrationsDir);
  const serverMigrationsDir = options.serverMigrationsDir ?? resolve(options.migrationsDir, "..", "..", "server", "migrations");
  if (existsSync(serverMigrationsDir)) {
    await applyMigrations(db, serverMigrationsDir);
  }

  const persistedSchedule = await getRuntimeSetting(db, "schedule");
  let currentSchedule = persistedSchedule ?? options.cronSchedule;
  if (!persistedSchedule) {
    await setRuntimeSetting(db, "schedule", currentSchedule);
  }

  const env = createEnv(db, options);
  const handleStatic = createStaticHandler(options.webDistDir);
  const resumeStorage = createResumeStorage(options.uploadsDir ?? resolve(options.migrationsDir, "..", "..", "uploads"));
  env.getBoardState = async () => {
    return env.DB
      .prepare(
        `SELECT id, owner_user_id, visibility, claimed_at, published_at
         FROM board_state
         WHERE id = 'singleton'`
      )
      .first();
  };
  env.setBoardVisibility = async (visibility) => {
    await env.DB
      .prepare(
        `UPDATE board_state
         SET visibility = ?, published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END
         WHERE id = 'singleton'`
      )
      .bind(visibility, visibility)
      .run();
  };
  env.saveResumeUpload = async (params) => resumeStorage.save(params);
  env.readResumeUpload = async (storageKey) => resumeStorage.read(storageKey);
  env.deleteResumeUpload = async (storageKey) => resumeStorage.delete(storageKey);
  env.CRON_SCHEDULE = currentSchedule;

  let scheduler: CronScheduler | null = null;

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const ownerRouteResponse = await handleOwnerRoute(request, env as never, resumeStorage);
    if (ownerRouteResponse) {
      return ownerRouteResponse;
    }

    if (url.pathname.startsWith("/api/admin/")) {
      const ownerContext = await getOwnerAccessContext(request, env as unknown as OwnerEnv);
      if (ownerContext.isOwner && !request.headers.get("authorization")) {
        const delegatedRequest = await applyOwnerSessionToRequest(request, env as unknown as OwnerEnv);
        return workerApp.fetch(delegatedRequest, env as never);
      }
    }

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/subscribe/")) {
      const ownerContext = await getOwnerAccessContext(request, env as unknown as OwnerEnv);
      if (
        shouldGateAnonymousRequest(url.pathname) &&
        !canBrowseBoard({
          visibility: ownerContext.boardState.visibility,
          claimed: Boolean(ownerContext.boardState.owner_user_id),
          isOwner: ownerContext.isOwner,
          allowUnclaimedBrowse: isEnabledFlag(env.ALLOW_UNCLAIMED_BROWSE)
        })
      ) {
        return buildUnauthenticatedBoardResponse();
      }

      return workerApp.fetch(request, env as never);
    }

    return handleStatic(request);
  };

  const restartScheduler = (): void => {
    scheduler?.stop();
    scheduler = startCronScheduler(currentSchedule, async () => {
      await workerApp.scheduled({} as ScheduledEvent, env as never);
    });
  };

  env.getRuntimeSchedule = async () => currentSchedule;
  env.setRuntimeSchedule = async (schedule: string) => {
    parseCronExpression(schedule);
    currentSchedule = schedule;
    env.CRON_SCHEDULE = schedule;
    await setRuntimeSetting(db, "schedule", schedule);
    if (scheduler) {
      restartScheduler();
    }
  };

  const startScheduler = (): CronScheduler => {
    restartScheduler();
    return {
      stop() {
        scheduler?.stop();
        scheduler = null;
      }
    };
  };

  return { db, env, handleRequest, startScheduler };
}

export function buildRuntimeOptionsFromEnv(baseDir: string): ServerOptions {
  const dbPath = process.env.DB_PATH ?? "/data/jobpull.sqlite";
  const webDistDir = process.env.WEB_DIST_DIR ?? join(baseDir, "web", "dist");
  const migrationsDir = process.env.MIGRATIONS_DIR ?? join(baseDir, "worker", "migrations");
  const serverMigrationsDir = process.env.SERVER_MIGRATIONS_DIR ?? join(baseDir, "server", "migrations");

  return {
    dbPath,
    webDistDir,
    migrationsDir,
    serverMigrationsDir,
    adminToken: process.env.ADMIN_TOKEN ?? "",
    sessionSecret: process.env.SESSION_SECRET ?? "",
    magicLinkDelivery: process.env.MAGIC_LINK_DELIVERY ?? "",
    boardVisibilityDefault: process.env.BOARD_VISIBILITY_DEFAULT ?? "",
    allowUnclaimedBrowse: process.env.ALLOW_UNCLAIMED_BROWSE ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "",
    emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
    uploadsDir: process.env.UPLOADS_DIR ?? join(baseDir, "uploads"),
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
