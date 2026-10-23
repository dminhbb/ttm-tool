-- Retire epic_ttm_snapshots and issue_daily_snapshots (owner decision 2026-10-23, DB-size reduction).
--
-- Both were row-for-row copies of `issues` (a subset of its columns) and nothing displayed their data:
-- every reader (Từ chối import rule B proof / "hasData", Epic deletion scope, the data-layer admin
-- panels, the backup export) now reads the RAW `issues` rows instead. Issue history therefore lives only
-- in `issues`, for as long as the RAW retention keeps it (data_retention_configs.raw_import_retention_days).
-- Dumps taken before this migration contain INSERTs for these tables and can no longer be imported.
DROP TABLE IF EXISTS epic_ttm_snapshots;
DROP TABLE IF EXISTS issue_daily_snapshots;
