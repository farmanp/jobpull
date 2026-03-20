import { fetchAshbyJobs } from "./fetchers/ashby";
import { fetchGreenhouseJobs } from "./fetchers/greenhouse";
import { fetchLeverJobs } from "./fetchers/lever";
import { fetchPersonioXmlJobs } from "./fetchers/personioXml";
import { fetchRecruiteeJobs } from "./fetchers/recruitee";
import { fetchRemoteJsonJobs } from "./fetchers/remoteJson";
import { dedupeJobs } from "./lib/dedupe";
import { SafeFetchClient } from "./lib/fetchClient";
import { buildJobId, canonicalizeUrl } from "./lib/hash";
import { getStaleCutoffIso, getStaleThresholdDays } from "./lib/stale";
import { inferFocus, inferRemoteStatus, inferTags, isTargetRole, shouldKeepForRemoteBoard } from "./lib/classify";
import { loadConfigFromDB, setActiveConfig } from "./config";
import { normalizeDescriptionText } from "./lib/text";
import type { CrawlError, CrawlSummary, CrawlTrigger, Env, JobCandidate, NormalizedJob, SourceRecord } from "./types";

function uuid(): string {
  return crypto.randomUUID();
}

function toIso(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

export async function normalizeJobCandidate(candidate: JobCandidate, nowIso: string): Promise<NormalizedJob | null> {
  const description = normalizeDescriptionText(candidate.description);

  if (!isTargetRole(candidate.title, description)) {
    return null;
  }

  const remoteStatus = candidate.remote_status ?? inferRemoteStatus(candidate.location, description);
  if (!shouldKeepForRemoteBoard(remoteStatus)) {
    return null;
  }

  const title = candidate.title.trim();
  const company = candidate.company.trim();
  const location = candidate.location.trim() || "Unknown";
  const url = canonicalizeUrl(candidate.url);

  if (!title || !company || !url) {
    return null;
  }

  const id = await buildJobId(company, title, location, url);

  return {
    id,
    title,
    company,
    location,
    remote_status: remoteStatus,
    url,
    source: candidate.source,
    date_posted: toIso(candidate.date_posted),
    date_seen: nowIso,
    description,
    tags: inferTags(title, description, location),
    pm_focus: inferFocus(title, description)
  };
}

export async function fetchSourceJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  switch (source.type) {
    case "ashby":
      return fetchAshbyJobs(source, client);
    case "greenhouse":
      return fetchGreenhouseJobs(source, client);
    case "lever":
      return fetchLeverJobs(source, client);
    case "personio_xml":
      return fetchPersonioXmlJobs(source, client);
    case "recruitee":
      return fetchRecruiteeJobs(source, client);
    case "remote_json":
      return fetchRemoteJsonJobs(source, client);
    default:
      return [];
  }
}

export async function runCrawl(
  env: Env,
  options: { trigger?: CrawlTrigger } = {}
): Promise<CrawlSummary> {
  // Reload dynamic config so cron picks up CLI/UI changes
  const config = await loadConfigFromDB(env.DB);
  setActiveConfig(config);

  const runId = uuid();
  const startedAt = new Date().toISOString();
  const errors: CrawlError[] = [];
  const trigger = options.trigger ?? "manual";

  await env.DB
    .prepare(
      "INSERT INTO crawl_runs (id, started_at, trigger, status, jobs_added, errors_json) VALUES (?, ?, ?, 'running', 0, '[]')"
    )
    .bind(runId, startedAt, trigger)
    .run();

  const sources = await env.DB
    .prepare("SELECT id, type, name, base_url, config_json, enabled FROM sources WHERE enabled = 1")
    .all<SourceRecord>();

  const timeoutMs = Number.parseInt(env.DEFAULT_TIMEOUT_MS ?? "10000", 10);
  const maxRetries = Number.parseInt(env.DEFAULT_MAX_RETRIES ?? "3", 10);
  const hostConcurrency = Number.parseInt(env.HOST_CONCURRENCY ?? "2", 10);
  const hostSpacingMs = Number.parseInt(env.HOST_SPACING_MS ?? "750", 10);
  const staleThresholdDays = getStaleThresholdDays(env.STALE_THRESHOLD_DAYS);

  const client = new SafeFetchClient(
    env.DB,
    {
      timeoutMs,
      maxRetries,
      userAgent: env.USER_AGENT ?? "PMRemoteJobsBot/1.0 (+contact:you@example.com)"
    },
    hostConcurrency,
    hostSpacingMs
  );

  const nowIso = new Date().toISOString();
  const normalized: NormalizedJob[] = [];

  await Promise.all(
    (sources.results ?? []).map(async (source) => {
      try {
        const jobs = await fetchSourceJobs(source, client);
        for (const job of jobs) {
          const normalizedJob = await normalizeJobCandidate(job, nowIso);
          if (normalizedJob) {
            normalized.push(normalizedJob);
          }
        }
      } catch (err) {
        errors.push({
          sourceId: source.id,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    })
  );

  const deduped = dedupeJobs(normalized);

  const insertStmts = deduped.map((job) =>
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO jobs (
          id, title, company, location, remote_status, url, source,
          date_posted, date_seen, description, tags, pm_focus, is_stale, stale_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
      )
      .bind(
        job.id,
        job.title,
        job.company,
        job.location,
        job.remote_status,
        job.url,
        job.source,
        job.date_posted ?? null,
        job.date_seen,
        job.description,
        JSON.stringify(job.tags),
        job.pm_focus
      )
  );

  const updateStmts = deduped.map((job) =>
    env.DB
      .prepare(
        `UPDATE jobs
         SET title = ?,
             company = ?,
             location = ?,
             remote_status = ?,
             source = ?,
             date_posted = ?,
             date_seen = ?,
             description = ?,
             tags = ?,
             pm_focus = ?,
             is_stale = 0,
             stale_at = NULL
         WHERE url = ?`
      )
      .bind(
        job.title,
        job.company,
        job.location,
        job.remote_status,
        job.source,
        job.date_posted ?? null,
        job.date_seen,
        job.description,
        JSON.stringify(job.tags),
        job.pm_focus,
        job.url
      )
  );

  let jobsAdded = 0;
  for (let i = 0; i < insertStmts.length; i += 50) {
    const chunk = insertStmts.slice(i, i + 50);
    const results = await env.DB.batch(chunk);
    jobsAdded += results.reduce((sum, result) => sum + (result.meta?.changes ?? 0), 0);
  }

  for (let i = 0; i < updateStmts.length; i += 50) {
    const chunk = updateStmts.slice(i, i + 50);
    await env.DB.batch(chunk);
  }

  const finishedAt = new Date().toISOString();
  const status: CrawlSummary["status"] = errors.length === 0 ? "success" : jobsAdded > 0 ? "partial" : "failed";

  if (status === "success") {
    const staleCutoffIso = getStaleCutoffIso(finishedAt, staleThresholdDays);
    await env.DB
      .prepare(
        `UPDATE jobs
         SET is_stale = 1,
             stale_at = COALESCE(stale_at, ?)
         WHERE is_stale = 0
           AND date_seen < ?`
      )
      .bind(finishedAt, staleCutoffIso)
      .run();
  }

  await env.DB
    .prepare(
      "UPDATE crawl_runs SET finished_at = ?, status = ?, jobs_added = ?, errors_json = ? WHERE id = ?"
    )
    .bind(finishedAt, status, jobsAdded, JSON.stringify(errors), runId)
    .run();

  return {
    runId,
    startedAt,
    finishedAt,
    jobsAdded,
    errors,
    status,
    trigger
  };
}
