ALTER TABLE ttm_index_global_cache
    DROP COLUMN IF EXISTS e2e_eligible,
    DROP COLUMN IF EXISTS e2e_pass,
    DROP COLUMN IF EXISTS e2e_fail,
    DROP COLUMN IF EXISTS e2e_total,
    DROP COLUMN IF EXISTS e2e_pct_precise;
