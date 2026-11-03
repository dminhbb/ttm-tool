-- TTM Dashboard 2 — "So với <ngày>" ticker (owner 2026-11-03): the six widget numbers of each data scope on the newest
-- data layer and on the layer just before it, both judged with today's rules. Rebuilt by the first cache run of the day,
-- a manual "Tạo lại cache" and every import (not by other automatic rebuilds). One row per scope, same keys as
-- ttm_dashboard_2_cache ('ALL', 'ADMIN:<id>', 'USER:<id>'). Kept apart from that cache, which every rebuild wipes.
CREATE TABLE IF NOT EXISTS ttm_dashboard_trend_cache (
  scope_key           VARCHAR(64) PRIMARY KEY,
  latest_layer_date   DATE NOT NULL,
  compared_layer_date DATE NOT NULL,
  current_values      JSONB NOT NULL,
  previous_values     JSONB NOT NULL,
  computed_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
