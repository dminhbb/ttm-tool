-- "Báo cáo Epic start sớm" (owner 2026-11-04): the widget numbers (TTM-CNTT (QLDA) and TTM-CNTT start sớm, with their
-- fail counts) of one data scope, computed on the first visit of the report in the day and read from here afterwards.
-- The header widget "TTM-CNTT (actual)" of TTM Dashboard 2 / Quản trị Epic reads the newest entry of the viewer's scope.
-- scope_key: 'ALL' / 'ADMIN:<id>' / 'USER:<id>' (same as ttm_dashboard_2_cache); cache_date: Vietnam calendar date.
CREATE TABLE IF NOT EXISTS ttm_early_start_cache (
    scope_key VARCHAR(64) PRIMARY KEY,
    scope_fingerprint VARCHAR(64) NOT NULL,
    cache_date DATE NOT NULL,
    source_computed_at TEXT,
    summary JSONB NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
