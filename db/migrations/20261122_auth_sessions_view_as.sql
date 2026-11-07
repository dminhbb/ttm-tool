-- "View as" (SUPERADMIN looks at the app as another user, read-only): the session remembers who is being viewed.
-- NULL = normal mode. Dropped to NULL when the viewed user is deleted.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS view_as_user_id integer REFERENCES users(id) ON DELETE SET NULL;
