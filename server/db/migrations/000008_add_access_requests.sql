-- migrate:up

ALTER TABLE library_users ADD COLUMN access_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (access_status IN ('pending', 'approved', 'banned'));
ALTER TABLE library_users ADD COLUMN requested_at INTEGER NULL;
ALTER TABLE library_users ADD COLUMN last_requested_at INTEGER NULL;
UPDATE library_users SET access_status = 'banned' WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_library_users_access_status ON library_users(access_status, requested_at);

-- migrate:down

-- Forward-only. Preserve account identities, requests, and ban decisions.
