-- Create mcp_access_daily_stats: per-user, per-day counter of MCP tool calls, same rolling-window
-- shape as user_usage_daily_stats (see usage-stats-service.ts) — backs the "weekly access count"
-- and "top 5 users" tiles on the MCP Server admin panel without needing a full per-call log table.
CREATE TABLE IF NOT EXISTS mcp_access_daily_stats (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_mcp_access_daily_stats_date ON mcp_access_daily_stats (stat_date);
