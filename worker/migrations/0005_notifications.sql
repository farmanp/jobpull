ALTER TABLE crawl_runs ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_crawl_runs_trigger ON crawl_runs(trigger, finished_at DESC);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  confirm_token_hash TEXT,
  unsubscribe_token_hash TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

CREATE TABLE IF NOT EXISTS notification_runs (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  recipients_targeted INTEGER NOT NULL DEFAULT 0,
  recipients_sent INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_runs_unique_digest
  ON notification_runs(crawl_run_id, channel, kind);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_run_id TEXT NOT NULL,
  subscriber_id TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  sent_at TEXT,
  error_text TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_run_subscriber
  ON notification_deliveries(notification_run_id, subscriber_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_email
  ON notification_deliveries(email, sent_at DESC);
