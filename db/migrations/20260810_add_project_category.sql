ALTER TABLE projects
  ADD COLUMN project_category VARCHAR(30)
  CHECK (project_category IN ('Dự án', 'Team Agile', 'Team Triển khai'));
