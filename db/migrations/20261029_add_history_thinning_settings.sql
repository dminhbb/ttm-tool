-- Safety switch for the daily thinning of the `issues` history (owner decision 2026-10-26).
--
-- The daily job (housekeeping-service.ts → data-layer-retention-service.ts) deletes the issue versions that fall
-- outside the dense zone / weekly snapshot dates. The FIRST run on a database that never thinned is large and
-- irreversible, so the job now deletes nothing until a SUPERADMIN turns it on (tab "Dọn lịch sử" of
-- Quản trị nguồn dữ liệu) — after taking a backup and looking at the preview. Weekly snapshot dates are recorded
-- either way. Once on, one run deletes at most history_thinning_daily_limit issue rows, so a large backlog is
-- cleared over several days (each run starts from where the last one left off).
--   history_thinning_enabled      OFF by default — every existing environment stops thinning until it is switched on
--   history_thinning_daily_limit  issue rows one run may delete
--   last_*                        what the most recent run (daily or manual) did, shown on the tab
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_daily_limit INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_last_run_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_last_run_source VARCHAR(10);
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_last_deleted INTEGER;
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_last_remaining INTEGER;
ALTER TABLE data_retention_configs ADD COLUMN IF NOT EXISTS history_thinning_updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_retention_configs_history_thinning_daily_limit_check') THEN
        ALTER TABLE data_retention_configs ADD CONSTRAINT data_retention_configs_history_thinning_daily_limit_check
            CHECK (history_thinning_daily_limit BETWEEN 1000 AND 1000000);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_retention_configs_history_thinning_last_run_source_check') THEN
        ALTER TABLE data_retention_configs ADD CONSTRAINT data_retention_configs_history_thinning_last_run_source_check
            CHECK (history_thinning_last_run_source IS NULL OR history_thinning_last_run_source IN ('DAILY', 'MANUAL'));
    END IF;
END $$;
