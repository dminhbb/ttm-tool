-- Per-user usage statistics, accumulated per calendar day: login count, "chức năng" usage (clicks
-- on left-panel nav items + avatar submenu items), and "dữ liệu" usage (Epic Alerts screens: alert
-- history, Epic Browser, pagination). Displayed as all-time totals (SUM across stat_date) in the
-- "Thông tin cá nhân" popup and the Quản lý User table — the daily granularity here just keeps the
-- door open for a future per-day breakdown without a schema change.
CREATE TABLE IF NOT EXISTS user_usage_daily_stats (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    login_count INT NOT NULL DEFAULT 0,
    feature_count INT NOT NULL DEFAULT 0,
    data_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_user_usage_daily_stats_user ON user_usage_daily_stats (user_id);
