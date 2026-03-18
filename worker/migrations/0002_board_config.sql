-- Board configuration key-value store
-- Allows CLI and Admin UI to persist config without editing source code
CREATE TABLE IF NOT EXISTS board_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
