-- "Epic Mark" (owner 2026-10-27): a PM/SM or an admin-tier user can comment on an Epic and hide it from the
-- "Quản trị Epic" list. Comments accumulate (never edited/deleted); Hide/Unhide also writes a system comment.
-- epic_marks keeps one row per Epic that was ever hidden/unhidden; "Marked" = the Epic has at least one comment.
CREATE TABLE IF NOT EXISTS epic_marks (
  epic_key           VARCHAR(100) PRIMARY KEY,
  is_hidden          BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id INTEGER,
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS epic_comments (
  id         BIGSERIAL PRIMARY KEY,
  epic_key   VARCHAR(100) NOT NULL,
  user_id    INTEGER,
  user_name  TEXT NOT NULL,
  content    VARCHAR(256) NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_epic_comments_epic_key_created ON epic_comments (epic_key, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_epic_marks_hidden ON epic_marks (epic_key) WHERE is_hidden;
