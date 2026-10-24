-- Preparation for retiring import_rows (owner decision 2026-10-24, DB-size reduction).
--
-- import_rows kept one JSON copy of every issue row next to `issues` (97% identical). The only things it
-- held that `issues` lacks are the Epic's original "Loại yêu cầu" text and the project key the file
-- carried, plus each row's validation result. This migration adds exactly those, ADDITIVELY (the code
-- that still reads/writes import_rows keeps working), and backfills them from import_rows:
--   * issues.project_key   = COALESCE(JSON projectKey, issue-key prefix) — the same expression every reader used
--   * issues.request_type  = JSON epicType (blank → NULL)
--   * import_row_issues    = the WARNING / INVALID rows of each batch, for "Chi tiết lỗi/cảnh báo" of an import
-- The follow-up migration 20261025b_drop_import_rows.sql re-runs the backfill and drops import_rows once the
-- code that no longer touches it is deployed.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS project_key VARCHAR(100);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS request_type VARCHAR(255);

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

UPDATE issues i
SET project_key = COALESCE(NULLIF(j.project_key, ''), NULLIF(SPLIT_PART(i.issue_key, '-', 1), '')),
    request_type = NULLIF(j.epic_type, '')
FROM (
    SELECT import_batch_id,
           normalized_data_json::jsonb ->> 'issueKey' AS issue_key,
           normalized_data_json::jsonb ->> 'projectKey' AS project_key,
           normalized_data_json::jsonb ->> 'epicType' AS epic_type
    FROM import_rows
) j
WHERE j.import_batch_id = i.source_import_batch_id AND j.issue_key = i.issue_key AND i.project_key IS NULL;

-- Issues that never had an import_rows row (placeholders from "Hoàn thiện dữ liệu").
UPDATE issues SET project_key = NULLIF(SPLIT_PART(issue_key, '-', 1), '') WHERE project_key IS NULL;

INSERT INTO import_row_issues (import_batch_id, row_number, issue_key, summary, validation_status, validation_errors)
SELECT r.import_batch_id, r.row_number,
       r.normalized_data_json::jsonb ->> 'issueKey',
       r.normalized_data_json::jsonb ->> 'summary',
       r.validation_status,
       CASE WHEN NULLIF(r.validation_errors_json, '') IS NULL THEN '[]'::jsonb ELSE r.validation_errors_json::jsonb END
FROM import_rows r
WHERE r.validation_status IN ('WARNING', 'INVALID')
ON CONFLICT (import_batch_id, row_number) DO NOTHING;
