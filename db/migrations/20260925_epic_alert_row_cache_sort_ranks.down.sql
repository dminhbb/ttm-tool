-- Rollback: drop epic_alert_row_cache sort-rank columns
DROP INDEX IF EXISTS idx_epic_alert_row_cache_sort;
ALTER TABLE epic_alert_row_cache
    DROP COLUMN IF EXISTS alert_rank,
    DROP COLUMN IF EXISTS bottom_status_rank,
    DROP COLUMN IF EXISTS remaining_working_days_rank;
