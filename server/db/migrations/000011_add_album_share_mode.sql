-- migrate:up
ALTER TABLE folders ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'library'
  CHECK (share_mode IN ('library', 'link-only'));

-- migrate:down
-- Forward-only: preserve album access choices.
