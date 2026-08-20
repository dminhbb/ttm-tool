-- Speeds up the 30-day retention purge (DELETE ... WHERE stat_date < ...) and the retention-window
-- filter now applied to every usage-stats totals query (see USAGE_STATS_RETENTION_DAYS in
-- usage-stats-service.ts).
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_stats_date ON user_usage_daily_stats (stat_date);
