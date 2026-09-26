-- One row per Vietnam calendar day for the "first user of the day rebuilds the cache" mechanism
-- (see src/lib/daily-cache-service.ts) — Vercel here has no scheduler, so the derived caches
-- (epic_alert_row_cache, ttm_index_global_cache), whose alertLevel/remaining-working-days are
-- evaluated "as of today", would otherwise only ever be rebuilt on the next CSV import.
-- run_date as PRIMARY KEY is what makes "only once per day" hold across concurrent requests/
-- serverless instances: the claim is a single INSERT ... ON CONFLICT statement (atomic, and safe
-- through Supabase's transaction pooler, unlike session-level advisory locks).
CREATE TABLE IF NOT EXISTS daily_cache_runs (
    run_date DATE PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    triggered_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE,
    duration_ms INT,
    epic_row_count INT,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    attempt_count INT NOT NULL DEFAULT 1,
    error_message TEXT
);
