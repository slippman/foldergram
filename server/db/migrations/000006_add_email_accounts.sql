-- migrate:up

CREATE TABLE IF NOT EXISTS library_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  revoked_at INTEGER NULL,
  created_at INTEGER NOT NULL,
  last_signed_in_at INTEGER NULL
);

CREATE TABLE IF NOT EXISTS email_sign_in_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES library_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_sign_in_tokens_expiry ON email_sign_in_tokens(expires_at);

CREATE TABLE IF NOT EXISTS library_user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES library_users(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_user_sessions_user ON library_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_library_user_sessions_expiry ON library_user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_sign_in_limits (
  address_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  last_requested_at INTEGER NOT NULL,
  requests INTEGER NOT NULL
);


-- migrate:down

-- Forward-only. Account data is retained across upgrades.
