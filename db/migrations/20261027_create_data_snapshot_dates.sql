-- Fixed weekly "snapshot dates" of the issues history (owner decision 2026-10-24): RAW issue versions are kept
-- in full for the 15 newest import days ("dense zone") and, beyond them, only as the version in force at one
-- fixed date per week — the last working day of that week ("sparse zone") — up to the RAW retention
-- (data_retention_configs.raw_import_retention_days). Every screen that looks at a past day reads "the state at
-- date X" (newest row of each issue with aggregated_at::date <= X), and X can only be a dense-zone import day
-- or one of these dates, so every Epic still has data on every selectable day.
-- A date is written once, when its week has passed (data-layer-retention-service.ts), and never changes later
-- even if the holiday calendar is edited; rows older than the retention are removed with the same daily job.
-- About one row per week (~29 rows within 200 days).
CREATE TABLE IF NOT EXISTS data_snapshot_dates (
    snapshot_date DATE PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
