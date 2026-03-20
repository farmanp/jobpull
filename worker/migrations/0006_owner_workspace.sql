CREATE TABLE IF NOT EXISTS board_state (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  claimed_at TEXT,
  published_at TEXT
);

INSERT OR IGNORE INTO board_state (id, owner_user_id, visibility, claimed_at, published_at)
VALUES ('singleton', NULL, 'private', NULL, NULL);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_magic_links_user_id ON magic_links(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_user_states (
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT,
  applied_at TEXT,
  rejected_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_user_states_user_status ON job_user_states(user_id, status, updated_at DESC);

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
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_blob BLOB,
  resume_text TEXT,
  uploaded_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_user_resumes_user_active ON user_resumes(user_id, is_active, uploaded_at DESC);
