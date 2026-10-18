-- migrate:up

CREATE TABLE IF NOT EXISTS email_access_reviews (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES library_users(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  reviewer_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_access_reviews_expiry ON email_access_reviews(expires_at);

-- migrate:down

-- Forward-only. Preserve pending review credentials until expiry.
