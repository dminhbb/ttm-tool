-- Recreates import_row_issues EMPTY — the warning / error rows of past batches are not restored.
CREATE TABLE IF NOT EXISTS import_row_issues (
    id SERIAL PRIMARY KEY,
    import_batch_id INT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    issue_key VARCHAR(100),
    summary TEXT,
    validation_status VARCHAR(20) NOT NULL CHECK (validation_status IN ('WARNING', 'INVALID')),
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (import_batch_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_import_row_issues_issue_key ON import_row_issues (issue_key);
