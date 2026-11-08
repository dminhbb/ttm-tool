-- "Tạm dừng hệ thống" (Quản trị hệ thống, SUPERADMIN — owner 2026-11-08): while is_suspended is ON every user below
-- SUPERADMIN is cut off from the app (the proxy sends them to the full-screen page /suspended), except "Bản tin"
-- (allow_news_letter) and the MCP Server for AI chatbots (allow_mcp). message_html is the text of /suspended, written with
-- the app's WYSIWYG editor and sanitized (lib/rich-html-sanitizer.ts) before it is stored. One row only (id = 1).
CREATE TABLE IF NOT EXISTS system_suspension_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    message_html TEXT NOT NULL DEFAULT '',
    allow_news_letter BOOLEAN NOT NULL DEFAULT FALSE,
    allow_mcp BOOLEAN NOT NULL DEFAULT FALSE,
    suspended_at TIMESTAMPTZ,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_suspension_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
