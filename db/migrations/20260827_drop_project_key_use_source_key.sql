-- projects.project_key ("Mã hiển thị") was always kept in lockstep with source_project_key on
-- every project except one manual test row; the app now uses source_project_key as the single,
-- unified project key everywhere (already the join key for permission scope and component
-- matching), so the redundant display-code column is dropped and source_project_key gets the
-- UNIQUE constraint project_key used to carry.
ALTER TABLE projects DROP COLUMN project_key;
ALTER TABLE projects ADD CONSTRAINT uq_projects_source_project_key UNIQUE (source_project_key);
