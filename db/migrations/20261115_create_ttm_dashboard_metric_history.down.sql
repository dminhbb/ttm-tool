ALTER TABLE ttm_dashboard_trend_cache DROP COLUMN IF EXISTS month_ref;
ALTER TABLE ttm_dashboard_trend_cache DROP COLUMN IF EXISTS week_ref;
ALTER TABLE ttm_dashboard_trend_cache DROP COLUMN IF EXISTS series;
DROP TABLE IF EXISTS ttm_dashboard_fail_history;
DROP TABLE IF EXISTS ttm_dashboard_metric_history;
