-- Compact, long-retention Epic-level history table. Populated once per import batch
-- (Epic rows only) so historical TTM trend survives even after the much larger raw
-- import_rows/issues layers for old batches are cleaned up.
CREATE TABLE IF NOT EXISTS epic_ttm_snapshots (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    epic_name TEXT,
    project_key VARCHAR(50),
    domain_id INT REFERENCES domains(id) ON DELETE SET NULL,
    assignee_name VARCHAR(100),
    current_status VARCHAR(50),
    epic_complexity_type VARCHAR(20),
    idea_approved_date DATE,
    start_date DATE,
    r4g_date DATE,
    due_date DATE,
    target_r4g_date DATE,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    aggregated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (epic_key, aggregated_at)
);

CREATE INDEX IF NOT EXISTS idx_epic_ttm_snapshots_epic_key ON epic_ttm_snapshots (epic_key);
CREATE INDEX IF NOT EXISTS idx_epic_ttm_snapshots_aggregated_at ON epic_ttm_snapshots (aggregated_at);
