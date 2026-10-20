-- migrate:up
ALTER TABLE library_users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE library_users ADD COLUMN last_active_at INTEGER NULL;
CREATE TABLE IF NOT EXISTS album_daily_views (
  user_id INTEGER NOT NULL REFERENCES library_users(id) ON DELETE CASCADE,
  album_key TEXT NOT NULL,
  album_slug TEXT NOT NULL,
  album_name TEXT NOT NULL,
  view_day TEXT NOT NULL,
  first_viewed_at INTEGER NOT NULL,
  last_viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, album_key, view_day)
);
CREATE INDEX IF NOT EXISTS idx_album_views_user_day ON album_daily_views(user_id, view_day);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('activity.capture_started_at', CAST(strftime('%s','now') * 1000 AS TEXT));
-- migrate:down
-- Forward-only: preserve recorded activity.
