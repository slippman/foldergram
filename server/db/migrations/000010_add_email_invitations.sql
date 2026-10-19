-- migrate:up

CREATE TABLE IF NOT EXISTS email_invitations (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES library_users(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- migrate:down

-- Forward-only.
