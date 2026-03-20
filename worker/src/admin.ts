import { buildPackConfigPatch, buildPackStarterSources, getRolePack, listRolePacks, type PackName } from "../../shared/rolePacks.ts";
import {
  buildSourceRecordFromTemplate,
  getSourceTemplate,
  listSourceTemplates,
  type SourceTemplateValues
} from "../../shared/sourceTemplates.ts";
import { loadConfigFromDB, saveConfigToDB } from "./config";
import { fetchSourceJobs, normalizeJobCandidate } from "./crawler";
import { SafeFetchClient } from "./lib/fetchClient";
import { getStaleThresholdDays } from "./lib/stale";
import type { Env, SourceRecord, SourceType } from "./types";

type PreviewJob = {
  title: string;
  company: string;
  location: string;
  source: string;
  remote_status: string;
  pm_focus: string;
  url: string;
  tags: string[];
  date_posted?: string;
};

type RuntimeChecks = {
  schedulerAvailable: boolean;
  adminTokenConfigured: boolean;
  runtimeStorageAvailable: boolean;
  databaseConnected: boolean;
};

export interface AdminRuntimeInfo {
  platform: "cloudflare" | "server";
  schedule: string;
  scheduleEditable: boolean;
  staleThresholdDays: number;
  lastCrawl: { finishedAt: string; status: string; jobsAdded: number } | null;
  editableFields: string[];
  checks: RuntimeChecks;
  externalSteps: string[];
}

function cleanupPatternSource(source: string): string {
  return source
    .replace(/^\\b\(/, "")
    .replace(/\)\\b$/, "")
    .replace(/^\\b/, "")
    .replace(/\\b$/, "");
}

function patternSourceToKeywords(source: string): string[] {
  const cleaned = cleanupPatternSource(source);
  if (!cleaned) {
    return [];
  }

  return cleaned
    .split("|")
    .map((part) => part.replace(/\\b/g, "").trim())
    .filter(Boolean);
}

function getFetchClient(env: Env): SafeFetchClient {
  return new SafeFetchClient(
    env.DB,
    {
      timeoutMs: Number.parseInt(env.DEFAULT_TIMEOUT_MS ?? "10000", 10),
      maxRetries: Number.parseInt(env.DEFAULT_MAX_RETRIES ?? "3", 10),
      userAgent: env.USER_AGENT ?? "JobPullBot/1.0 (+contact:you@example.com)"
    },
    Number.parseInt(env.HOST_CONCURRENCY ?? "2", 10),
    Number.parseInt(env.HOST_SPACING_MS ?? "750", 10)
  );
}

export function listAdminPacks() {
  return listRolePacks().map((pack) => ({
    key: pack.key,
    label: pack.label,
    summary: pack.summary,
    providerRecommendations: pack.providerRecommendations,
    starterSources: buildPackStarterSources(pack.key).map((source) => ({
      id: source.id,
      type: source.type,
      name: source.name
    })),
    review: {
      tagline: pack.config.tagline,
      remoteOnly: pack.config.remoteOnly,
      includeKeywords: pack.config.titleIncludePatterns.flatMap((rule) => patternSourceToKeywords(rule.source)),
      excludeKeywords: pack.config.titleExcludePatterns.flatMap((rule) => patternSourceToKeywords(rule.source)),
      focusAreas: pack.config.focusCategories.map((category) => category.label),
      boardTags: pack.config.tagKeywords.map((tag) => tag.tag)
    }
  }));
}

export function listAdminSourceTemplates() {
  return listSourceTemplates();
}

function getRuntimePlatform(env: Env): "cloudflare" | "server" {
  return env.RUNTIME_PLATFORM ?? (env.setRuntimeSchedule ? "server" : "cloudflare");
}

function getRuntimeSchedule(env: Env): string {
  return env.CRON_SCHEDULE ?? "0 7 * * *";
}

function getRuntimeChecks(env: Env, schedule: string): RuntimeChecks {
  return {
    schedulerAvailable: Boolean(schedule),
    adminTokenConfigured: Boolean(env.ADMIN_TOKEN),
    runtimeStorageAvailable: Boolean(env.setRuntimeSchedule),
    databaseConnected: Boolean(env.DB)
  };
}

function getRuntimeExternalSteps(schedule: string, platform: "cloudflare" | "server"): string[] {
  if (platform === "server") {
    return [
      "Schedule changes are saved in the app and hot-reload the runtime scheduler.",
      "Save a new cron value above to apply it without restarting the server."
    ];
  }

  return [
    `Current cron schedule: ${schedule}.`,
    "Update the Worker cron trigger in Wrangler or the Cloudflare dashboard, then redeploy."
  ];
}

export async function applyPack(db: D1Database, packName: string) {
  const pack = getRolePack(packName);
  if (!pack) {
    throw new Error(`Unknown pack: ${packName}`);
  }

  const currentSources = await db
    .prepare("SELECT id, type, name, base_url, config_json, enabled FROM sources")
    .all<SourceRecord>();

  const updates = buildPackConfigPatch(pack.key);
  await saveConfigToDB(db, updates);

  const starterSources = buildPackStarterSources(pack.key);
  const sourceRows = currentSources.results ?? [];
  const created: string[] = [];
  const updated: string[] = [];

  for (const source of starterSources) {
    const existing = sourceRows.find((row) => row.id === source.id);
    if (existing) {
      if (existing.type !== "remote_json") {
        throw new Error(`Managed source id "${source.id}" already exists with non-remote_json type.`);
      }

      await db
        .prepare(
          "UPDATE sources SET name = ?, base_url = ?, config_json = ?, enabled = 1 WHERE id = ?"
        )
        .bind(source.name, source.base_url, source.config_json, source.id)
        .run();
      updated.push(source.id);
      continue;
    }

    await db
      .prepare("INSERT INTO sources (id, type, name, base_url, config_json, enabled) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(source.id, source.type, source.name, source.base_url, source.config_json, source.enabled)
      .run();
    created.push(source.id);
  }

  const config = await loadConfigFromDB(db);
  return {
    pack: {
      key: pack.key,
      label: pack.label,
      summary: pack.summary
    },
    config,
    starterSources: starterSources.map((source) => ({
      id: source.id,
      type: source.type,
      name: source.name
    })),
    created,
    updated
  };
}

export async function validateSource(
  env: Env,
  type: string,
  values: SourceTemplateValues
): Promise<{ source: SourceRecord; previewJobs: PreviewJob[]; totalFetched: number; warnings: string[] }> {
  const template = getSourceTemplate(type);
  if (!template) {
    throw new Error(`Unsupported source type: ${type}`);
  }

  const source = buildSourceRecordFromTemplate(template.type, values) as SourceRecord;
  const jobs = await fetchSourceJobs(source, getFetchClient(env));
  const nowIso = new Date().toISOString();

  const previewJobs: PreviewJob[] = [];
  for (const job of jobs) {
    const normalized = await normalizeJobCandidate(job, nowIso);
    if (!normalized) {
      continue;
    }
    previewJobs.push({
      title: normalized.title,
      company: normalized.company,
      location: normalized.location,
      source: normalized.source,
      remote_status: normalized.remote_status,
      pm_focus: normalized.pm_focus,
      url: normalized.url,
      tags: normalized.tags,
      date_posted: normalized.date_posted
    });
    if (previewJobs.length >= 5) {
      break;
    }
  }

  const warnings: string[] = [];
  if (jobs.length === 0) {
    warnings.push("The source responded, but no matching jobs were returned.");
  } else if (previewJobs.length === 0) {
    warnings.push("Jobs were returned, but none matched the current board targeting and remote filters.");
  }

  return {
    source,
    previewJobs,
    totalFetched: jobs.length,
    warnings
  };
}

export async function getAdminRuntimeInfo(env: Env): Promise<AdminRuntimeInfo> {
  const lastCrawl = await env.DB
    .prepare(
      "SELECT finished_at, status, jobs_added FROM crawl_runs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1"
    )
    .first<{ finished_at: string; status: string; jobs_added: number }>();

  const schedule = env.getRuntimeSchedule ? await env.getRuntimeSchedule() : getRuntimeSchedule(env);
  const platform = getRuntimePlatform(env);

  return {
    platform,
    schedule,
    scheduleEditable: Boolean(env.setRuntimeSchedule),
    staleThresholdDays: getStaleThresholdDays(env.STALE_THRESHOLD_DAYS),
    editableFields: env.setRuntimeSchedule ? ["schedule"] : [],
    checks: getRuntimeChecks(env, schedule),
    externalSteps: getRuntimeExternalSteps(schedule, platform),
    lastCrawl: lastCrawl
      ? { finishedAt: lastCrawl.finished_at, status: lastCrawl.status, jobsAdded: lastCrawl.jobs_added }
      : null
  };
}

export async function updateAdminRuntime(
  env: Env,
  body: Partial<{ schedule: string }>
): Promise<AdminRuntimeInfo> {
  const schedule = body.schedule?.trim();
  if (!schedule) {
    throw new Error("schedule is required");
  }

  if (!env.setRuntimeSchedule) {
    const error = new Error("This runtime manages schedules through deployment config. Update the Cloudflare cron trigger instead.");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  await env.setRuntimeSchedule(schedule);
  return getAdminRuntimeInfo(env);
}

export function isPackName(value: string): value is PackName {
  return Boolean(getRolePack(value));
}

export function isSourceTemplateType(value: string): value is SourceType {
  return Boolean(getSourceTemplate(value));
}
