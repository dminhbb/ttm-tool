-- Company-wide (no permission scope) TTM-E2E ratio, same pattern as the existing ttm_*/qa_*
-- columns on ttm_index_global_cache — see refreshTtmIndexGlobalCache() in
-- ttm-index-global-cache-service.ts. DEFAULT 0 only matters for the existing singleton row until
-- the next refresh (every import) overwrites it with the real computed value.
ALTER TABLE ttm_index_global_cache
    ADD COLUMN IF NOT EXISTS e2e_eligible INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS e2e_pass INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS e2e_fail INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS e2e_total INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS e2e_pct_precise NUMERIC(6, 3) NOT NULL DEFAULT 0;
