-- Trả projects về trạng thái chỉ có source_project_key + project_category.
DROP TRIGGER IF EXISTS trg_projects_fill_project_code ON projects;
DROP FUNCTION IF EXISTS projects_fill_project_code();
DROP INDEX IF EXISTS idx_projects_project_type;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS uq_projects_project_code;
ALTER TABLE projects DROP COLUMN IF EXISTS project_type_id;
ALTER TABLE projects DROP COLUMN IF EXISTS project_code;
