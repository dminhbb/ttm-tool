-- "Đã đọc" on tab "Duyệt đăng ký mới" of Quản lý user (owner 2026-11-02): an admin marks a pending registration
-- (an inactive user) as read, so it no longer counts in THEIR unread badge (tab name + left menu "Quản lý User").
-- Per reader: one row = (reader, registered user) read; each admin keeps their own unread state.
CREATE TABLE IF NOT EXISTS user_registration_reads (
  reader_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reader_user_id, registered_user_id)
);
