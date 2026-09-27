-- Precomputed "Phạm vi dữ liệu cho TTM" gate (see ttm_scope_config / ttm-scope-config-service.ts),
-- stored per Epic so epic-alert-row-cache-query-service.ts's SQL aggregates (queryTtmQaIndexPm,
-- queryEpicAlertStatCounts) and the "Nhận xét" badge can filter/gate without re-deriving the R4G
-- date-range check per request. Defaults TRUE (in scope) so existing rows before this migration's
-- first refreshEpicAlertRowCache() run are never wrongly hidden.
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS ttm_cntt_in_scope BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS qa_in_scope BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_ttm_cntt_in_scope ON epic_alert_row_cache (ttm_cntt_in_scope);
