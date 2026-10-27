-- "Hide Epic" becomes personal (owner 2026-10-27): hiding an Epic leaves it out of "Quản trị Epic" for the user
-- who pressed Hide only — everybody else keeps seeing it. One row = (user, Epic) hidden; Unhide deletes the row,
-- so an Epic nobody hid has no row and is shown as usual. Hide/Unhide no longer writes a system comment.
--
-- epic_marks (migration 20261106, a global is_hidden flag) is no longer read by the new code; its hidden rows are
-- copied here for the user who hid them. The table itself is dropped in a later migration, once the code that
-- stopped reading it is deployed.
CREATE TABLE IF NOT EXISTS epic_hidden_by_users (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  epic_key  VARCHAR(100) NOT NULL,
  hidden_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, epic_key)
);

INSERT INTO epic_hidden_by_users (user_id, epic_key, hidden_at)
SELECT m.updated_by_user_id, m.epic_key, m.updated_at
FROM epic_marks m
WHERE m.is_hidden AND EXISTS (SELECT 1 FROM users u WHERE u.id = m.updated_by_user_id)
ON CONFLICT DO NOTHING;
