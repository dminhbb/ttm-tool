-- "Delete" of an own comment in Review Notes (owner 2026-10-28): the row stays (author, time) but its text is replaced by
-- '~~deleted~~' and shown in italics; a deleted comment cannot be deleted again. is_deleted marks it, deleted_at says when.
ALTER TABLE epic_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE epic_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
