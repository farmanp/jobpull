CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  remote_status TEXT NOT NULL DEFAULT 'unknown',
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  date_posted TEXT,
  date_seen TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  pm_focus TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_jobs_date_seen ON jobs(date_seen DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_date_posted ON jobs(date_posted DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_pm_focus ON jobs(pm_focus);
CREATE INDEX IF NOT EXISTS idx_jobs_remote_status ON jobs(remote_status);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  config_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fetch_cache (
  url TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  last_status INTEGER,
  last_fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  jobs_added INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]'
);
