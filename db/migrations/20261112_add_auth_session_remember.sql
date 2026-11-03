-- Session renewal (owner 2026-11-03): opening certain screens with < 30 min left extends a session to 2 h from now,
-- but never past a ceiling counted from login — 2 days for a "Ghi nhớ đăng nhập" session, 12 h otherwise. The ceiling
-- needs to know which kind a session is. Existing sessions are classified by their lifetime (24 h = remembered, 2 h = not).
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS remember BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE auth_sessions SET remember = TRUE WHERE created_at IS NOT NULL AND expires_at - created_at > INTERVAL '3 hours';
