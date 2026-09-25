-- Migration: cache table for fully-computed Epic 15 rows (EpicAlertRowPhased), refreshed once per
-- CSV import (same pattern as ttm_index_global_cache) instead of recomputed on every page view.
-- alertLevel/hasDataAnomaly/releaseAxisState/phase cells etc. are all derived in JS from working-day
-- calendars and live story/subtask completion — not queryable SQL columns on `issues` — so this
-- table pre-computes and stores the finished row once, then epic-alerts-15's API can filter/sort/
-- paginate with plain WHERE/ORDER BY/LIMIT against it instead of recomputing per request.
-- Only ever holds the NEWEST data layer (permission-unscoped, like ttm_index_global_cache) — the
-- "layer cũ hơn" drill-down on Quản trị Epic keeps using the existing live computation path.
CREATE TABLE IF NOT EXISTS epic_alert_row_cache (
    epic_key VARCHAR(40) PRIMARY KEY,
    project_key VARCHAR(40) NOT NULL DEFAULT '',
    current_status VARCHAR(100) NOT NULL DEFAULT '',
    epic_type VARCHAR(60) NOT NULL DEFAULT '',
    requesting_unit VARCHAR(200),
    owner_names TEXT[] NOT NULL DEFAULT '{}',
    components TEXT[] NOT NULL DEFAULT '{}',
    alert_level VARCHAR(10) NOT NULL DEFAULT 'NONE',
    ttm_e2e_alert_level VARCHAR(10) NOT NULL DEFAULT 'NONE',
    has_data_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
    remaining_working_days INT,
    epic_name TEXT NOT NULL DEFAULT '',
    row_data JSONB NOT NULL,
    source_import_batch_id INT,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_project_key ON epic_alert_row_cache (project_key);
CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_current_status ON epic_alert_row_cache (current_status);
CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_alert_level ON epic_alert_row_cache (alert_level);
