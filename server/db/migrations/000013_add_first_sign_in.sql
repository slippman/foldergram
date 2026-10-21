-- migrate:up
ALTER TABLE library_users ADD COLUMN first_signed_in_at INTEGER NULL;

-- Recover a historical first login only when all logins were counted and the
-- first timestamp is provable. Never substitute invitation/account creation.
UPDATE library_users
SET first_signed_in_at = CASE WHEN login_count = 1 THEN last_signed_in_at
  ELSE (SELECT MIN(s.created_at) FROM library_user_sessions s WHERE s.user_id = library_users.id) END
WHERE last_signed_in_at IS NOT NULL
  AND created_at >= CAST((SELECT value FROM app_settings WHERE key = 'activity.capture_started_at') AS INTEGER)
  AND login_count > 0
  AND (login_count = 1 OR login_count = (SELECT COUNT(*) FROM library_user_sessions s WHERE s.user_id = library_users.id));

-- migrate:down
-- Forward-only: preserve recorded first sign-ins.
