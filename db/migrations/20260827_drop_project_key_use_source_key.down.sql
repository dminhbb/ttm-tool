ALTER TABLE projects DROP CONSTRAINT uq_projects_source_project_key;
ALTER TABLE projects ADD COLUMN project_key VARCHAR(50);
UPDATE projects SET project_key = source_project_key;
ALTER TABLE projects ALTER COLUMN project_key SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_project_key_key UNIQUE (project_key);
