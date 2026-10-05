-- Coordinates rebuilds of the derived caches (epic_alert_row_cache, ttm_index_global_cache,
-- ttm_dashboard_2_cache — refreshDerivedCaches in daily-cache-service.ts) across every server
-- instance: only the holder of the lease rebuilds; anyone else asking meanwhile just bumps
-- request_seq, and the holder runs once more before releasing so the last request always wins.
-- Prevents two overlapping rebuilds where the one started first (reading the older black list /
-- project flags / scope config) finishes last and leaves the caches stale. One row only (id = 1).
CREATE TABLE IF NOT EXISTS derived_cache_refresh_lock (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    request_seq BIGINT NOT NULL DEFAULT 0,
    lease_owner VARCHAR(64),
    lease_until TIMESTAMPTZ,
    last_source VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO derived_cache_refresh_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
