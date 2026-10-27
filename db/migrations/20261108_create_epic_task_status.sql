-- "Giao việc" of an Epic (owner 2026-10-27), toggle of the Mark & Comment popup: 'TODO' (default) / 'DONE'.
-- An Epic "is assigned" to its PM/SMs once it has a comment; a PM/SM sets DONE to tell whoever commented that the
-- work is finished. One state per Epic, shared by everybody. No row = TODO. A new comment does NOT reset DONE.
-- Who may change it: the Epic's PM/SMs (owner_names) and ADMIN / SUPERADMIN whose data scope contains the Epic.
CREATE TABLE IF NOT EXISTS epic_task_status (
  epic_key           VARCHAR(100) PRIMARY KEY,
  status             VARCHAR(10) NOT NULL DEFAULT 'TODO',
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT epic_task_status_status_check CHECK (status IN ('TODO', 'DONE'))
);
