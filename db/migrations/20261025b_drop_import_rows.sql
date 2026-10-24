-- Retire import_rows (owner decision 2026-10-24, DB-size reduction). MUST run after the code that no longer
-- reads or writes import_rows is deployed (see 20261025_add_issue_columns_and_import_row_issues.sql for why
-- the table is redundant: a JSON copy of every `issues` row, 97% identical).
--
-- 1) Re-run the backfill for anything the previous code wrote between the first migration and the deploy
--    (its rows carry no project_key / import_row_issues because it only knew import_rows).
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

-- 2) The table itself.
DROP TABLE IF EXISTS import_rows;
