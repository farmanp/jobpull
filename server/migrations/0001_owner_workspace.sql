CREATE TABLE IF NOT EXISTS board_state (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  owner_user_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  claimed_at TEXT,
  published_at TEXT
);

INSERT OR IGNORE INTO board_state (id, visibility)
VALUES ('singleton', 'private');

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_links_user_id ON magic_links(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_user_states (
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT NOT NULL DEFAULT '',
  applied_at TEXT,
  rejected_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_user_states_user_id ON job_user_states(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_user_states_job_id ON job_user_states(job_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  resume_text TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_blob BLOB,
  resume_text TEXT,
  uploaded_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_user_resumes_user_id ON user_resumes(user_id, is_active DESC, uploaded_at DESC);
