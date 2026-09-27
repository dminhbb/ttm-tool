-- "Phạm vi dữ liệu cho TTM" panel (Cấu hình cảnh báo) — a single-row admin setting that narrows
-- which Epics count toward TTM-CNTT / QA-Index calculations by R4G Date (or, for TTM-CNTT only,
-- the TTM-CNTT baseline/target R4G date when the Epic hasn't recorded one yet). NULL bounds mean
-- "no limit on that side" — see ttm-scope-config-service.ts for the exact comparison rules.
-- Singleton row (id fixed to 1 via the CHECK), upserted via INSERT ... ON CONFLICT (id) DO UPDATE —
-- same pattern as ttm_index_global_cache.
CREATE TABLE IF NOT EXISTS ttm_scope_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cntt_from DATE,
    cntt_to DATE,
    qa_from DATE,
    qa_to DATE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);
