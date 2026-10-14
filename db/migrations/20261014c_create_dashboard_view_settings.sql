-- "Dashboard Lead view cho tất cả user" (Quản trị hệ thống, SUPERADMIN — owner 2026-10-14): when ON,
-- every user (ADMIN / USER, whose own data scope is narrower) opens TTM Dashboard 2 on the Lead view of
-- the whole company by default and can switch back to the view of their own scope. Only the
-- aggregated numbers widen: the "Quản trị Epic" popups behind them still list just the Epics the
-- user may see. One row only (id = 1).
CREATE TABLE IF NOT EXISTS dashboard_view_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    lead_view_for_all_users BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO dashboard_view_settings (id, lead_view_for_all_users) VALUES (1, TRUE) ON CONFLICT (id) DO NOTHING;
