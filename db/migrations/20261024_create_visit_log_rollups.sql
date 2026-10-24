-- Visit Counter all-time totals survive the visit_logs retention (owner 2026-10-24: per-event detail is
-- kept only for the T-15 → T window the week-over-week comparison reads).
--
-- The footer / Visit Counter show ALL-TIME totals (per app, per screen, per user) computed with
-- COUNT(*) over visit_logs. Once housekeeping deletes rows older than the retention window
-- (housekeeping-service.ts), the deleted rows are first folded into this table so those totals keep
-- counting them: total = live visit_logs rows + SUM(visit_count) here. Weekly / today figures only
-- look at the last ~2 weeks, so they never need it.
-- screen_key '' = no screen (APP_LOGIN); user_id 0 = unknown user (the log row's user was deleted).
CREATE TABLE IF NOT EXISTS visit_log_rollups (
    event_type VARCHAR(20) NOT NULL,
    screen_key VARCHAR(50) NOT NULL DEFAULT '',
    user_id INT NOT NULL DEFAULT 0,
    visit_count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_type, screen_key, user_id)
);
