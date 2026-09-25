-- Company-wide (no permission scope) TTM-Index/QA-Index cache — see
-- src/lib/ttm-index-global-cache-service.ts. Recomputed wholesale once per CSV import (see the
-- refreshTtmIndexGlobalCache() call added to import-service.ts's processImport) instead of on
-- every page view, since the unscoped query it replaces (every Epic in the system, ignoring the
-- viewer's own project/domain access) is the heaviest query pattern this app has — see
-- AGENTS.md's Multi-database section for why that matters on Aiven's low connection cap.
-- Single row, enforced by the CHECK (id = 1); upserted via INSERT ... ON CONFLICT (id) DO UPDATE.
CREATE TABLE IF NOT EXISTS ttm_index_global_cache (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ttm_eligible INT NOT NULL,
    ttm_pass INT NOT NULL,
    ttm_fail INT NOT NULL,
    ttm_total INT NOT NULL,
    ttm_pct_precise NUMERIC(6, 3) NOT NULL,
    qa_eligible INT NOT NULL,
    qa_pass INT NOT NULL,
    qa_fail INT NOT NULL,
    qa_total INT NOT NULL,
    qa_pct_precise NUMERIC(6, 3) NOT NULL,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
