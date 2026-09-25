-- Migration: add pre-computed sort-rank columns to epic_alert_row_cache so the paginated query
-- (epic-alert-row-cache-query-service.ts) can ORDER BY plain ints instead of a CASE expression per
-- query. Mirrors the two-key sort epic-alert-phase-service.ts/epic-alerts-15/page.tsx apply today:
-- bottom_status_rank (0 = normal; 1/2/3 = In PO/To Do/Released, sunk to the bottom of the list) as
-- the primary key, then alert_rank (FAIL=0, LATE=1, EARLY=2, NONE=3) as the secondary key — data-
-- anomaly rows already sink via has_data_anomaly, checked first.
ALTER TABLE epic_alert_row_cache
    ADD COLUMN IF NOT EXISTS alert_rank INT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS bottom_status_rank INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS remaining_working_days_rank INT NOT NULL DEFAULT 2147483647;

CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_sort
    ON epic_alert_row_cache (bottom_status_rank, has_data_anomaly, alert_rank, remaining_working_days_rank);
