-- TTM Dashboard 2 — frozen daily series of the widget numbers (owner 2026-11-03): one row per data scope and data layer date,
-- written once when that layer is the newest (every import / "Tạo lại cache" only writes TODAY's row) and never recomputed
-- afterwards. Feeds the "Xu hướng biến động chỉ số" charts, the week / month comparison messages and the "So với <ngày>"
-- ticker (whose previous-layer numbers are read from here instead of re-judging every Epic as it stood on that day).
--   source DAILY    = judged with the rules of that day;
--   source BACKFILL = filled in later with the rules of the day it was filled (the first deployment's one-off fill).
-- Rows older than 400 days are deleted by the cache refresh.
CREATE TABLE IF NOT EXISTS ttm_dashboard_metric_history (
  scope_key     VARCHAR(64) NOT NULL,
  layer_date    DATE NOT NULL,
  metric_values JSONB NOT NULL,
  source        VARCHAR(10) NOT NULL DEFAULT 'DAILY' CHECK (source IN ('DAILY', 'BACKFILL')),
  computed_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope_key, layer_date)
);
CREATE INDEX IF NOT EXISTS idx_ttm_dashboard_metric_history_date ON ttm_dashboard_metric_history (layer_date);

-- Company-wide Epics that were Fail TTM-CNTT (Phạm vi của QLDA) on each layer date: what "new Fail Epics" is measured against.
CREATE TABLE IF NOT EXISTS ttm_dashboard_fail_history (
  layer_date     DATE PRIMARY KEY,
  fail_epic_keys TEXT[] NOT NULL DEFAULT '{}',
  source         VARCHAR(10) NOT NULL DEFAULT 'DAILY' CHECK (source IN ('DAILY', 'BACKFILL')),
  computed_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The per-scope ticker row also carries what the dashboard shows from the history, so one row serves the whole page.
ALTER TABLE ttm_dashboard_trend_cache ADD COLUMN IF NOT EXISTS series JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ttm_dashboard_trend_cache ADD COLUMN IF NOT EXISTS week_ref JSONB;
ALTER TABLE ttm_dashboard_trend_cache ADD COLUMN IF NOT EXISTS month_ref JSONB;
