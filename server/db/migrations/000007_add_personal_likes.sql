-- migrate:up

CREATE TABLE IF NOT EXISTS user_likes (
  user_id INTEGER NOT NULL REFERENCES library_users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_user_likes_post ON user_likes(post_id);

-- migrate:down

-- Forward-only. Personal likes are retained across upgrades.
