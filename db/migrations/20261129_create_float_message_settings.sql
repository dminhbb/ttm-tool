-- "Float message" (Quản trị hệ thống, SUPERADMIN — owner 2026-11-17): a rounded floating box with a message icon and a
-- custom text, shown to every signed-in user at the top-right or bottom-right corner of every screen. One row only
-- (id = 1). Rules (dates, auto-hide, close button, position): src/lib/float-message.ts.
--   message_text       one line of plain text (no HTML), at most 256 characters
--   is_active          master switch
--   start_date/end_date shown from / until this day (Vietnam time, both inclusive); NULL = no bound on that side
--   auto_hide_seconds  disappears after this many seconds; NULL = always shown (until closed, if it can be closed)
--   dismissible        shows an X in the corner that closes it
--   position           TOP_RIGHT | BOTTOM_RIGHT (bottom-right waits for the "epic được giao task" notice to go first)
CREATE TABLE IF NOT EXISTS float_message_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    message_text TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    auto_hide_seconds INT CHECK (auto_hide_seconds IS NULL OR (auto_hide_seconds BETWEEN 1 AND 3600)),
    dismissible BOOLEAN NOT NULL DEFAULT TRUE,
    position VARCHAR(20) NOT NULL DEFAULT 'BOTTOM_RIGHT' CHECK (position IN ('TOP_RIGHT', 'BOTTOM_RIGHT')),
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT float_message_dates_ordered CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

INSERT INTO float_message_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
