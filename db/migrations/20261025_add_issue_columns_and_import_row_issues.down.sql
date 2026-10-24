DROP TABLE IF EXISTS import_row_issues;
ALTER TABLE issues DROP COLUMN IF EXISTS request_type;
ALTER TABLE issues DROP COLUMN IF EXISTS project_key;
