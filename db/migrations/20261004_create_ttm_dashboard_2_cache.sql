-- TTM Dashboard 2: the unfiltered funnel numbers (+ toolbar filter options) per data scope, so the
-- first load of the screen is one small read instead of loading/aggregating every Epic row. See
-- ttm-dashboard-2-cache-service.ts.
--   scope_key          'ALL' (SUPERADMIN + SUPERVISOR share one entry), 'ADMIN:<user id>', 'USER:<user id>'
--   scope_fingerprint  hash of the resolved access scope (project keys + component narrowing) — an
--                      entry whose user/domain/project assignment changed since is ignored and rebuilt
--   source_computed_at epic_alert_row_cache's computed_at it was built from — any cache rebuild
--                      (import, daily refresh, scope/domain save) makes every entry stale at once
CREATE TABLE IF NOT EXISTS ttm_dashboard_2_cache (
    scope_key VARCHAR(64) PRIMARY KEY,
    scope_fingerprint VARCHAR(64) NOT NULL,
    source_computed_at TEXT,
    engine_mode VARCHAR(16) NOT NULL,
    summary JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
