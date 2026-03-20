export type DigestJobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_status: string;
  url: string;
  date_posted?: string | null;
  date_seen: string;
  pm_focus: string;
};

export type DigestWindow = {
  crawlRunId: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  trigger: string;
};

export async function getLatestDigestWindow(db: D1Database): Promise<DigestWindow | null> {
  const row = await db
    .prepare(
      `SELECT id, started_at, finished_at, status, trigger
       FROM crawl_runs
       WHERE status IN ('success', 'partial')
         AND finished_at IS NOT NULL
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .first<{ id: string; started_at: string; finished_at: string; status: string; trigger?: string }>();

  if (!row) {
    return null;
  }

  return {
    crawlRunId: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    trigger: row.trigger ?? "manual"
  };
}

export async function getDigestJobsForWindow(
  db: D1Database,
  startedAt: string,
  finishedAt: string
): Promise<DigestJobRow[]> {
  const jobs = await db
    .prepare(
      `SELECT id, title, company, location, remote_status, url, date_posted, date_seen, pm_focus
       FROM jobs
       WHERE is_stale = 0
         AND date_seen >= ?
         AND date_seen <= ?
       ORDER BY date_seen DESC`
    )
    .bind(startedAt, finishedAt)
    .all<DigestJobRow>();

  return jobs.results ?? [];
}

export async function getDigestJobsForLastDay(db: D1Database): Promise<DigestJobRow[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const jobs = await db
    .prepare(
      `SELECT id, title, company, location, remote_status, url, date_posted, date_seen, pm_focus
       FROM jobs
       WHERE is_stale = 0
         AND date_seen >= ?
       ORDER BY date_seen DESC`
    )
    .bind(since)
    .all<DigestJobRow>();

  return jobs.results ?? [];
}

export function groupDigestJobs(rows: DigestJobRow[]): Record<string, DigestJobRow[]> {
  return rows.reduce<Record<string, DigestJobRow[]>>((acc, row) => {
    const key = String(row.pm_focus ?? "unknown");
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(row);
    return acc;
  }, {});
}

export async function getTodayDigest(db: D1Database): Promise<{
  generatedAt: string;
  groups: Record<string, DigestJobRow[]>;
  total: number;
  window: DigestWindow | null;
}> {
  const window = await getLatestDigestWindow(db);
  const jobs = window
    ? await getDigestJobsForWindow(db, window.startedAt, window.finishedAt)
    : await getDigestJobsForLastDay(db);

  return {
    generatedAt: new Date().toISOString(),
    groups: groupDigestJobs(jobs),
    total: jobs.length,
    window
  };
}
