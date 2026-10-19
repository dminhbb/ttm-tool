DROP TRIGGER IF EXISTS trg_user_projects_sync_project_members ON user_projects;
DROP TRIGGER IF EXISTS trg_projects_sync_pms_tables ON projects;
DROP TRIGGER IF EXISTS trg_projects_sync_project_type ON projects;
DROP FUNCTION IF EXISTS user_projects_sync_project_members();
DROP FUNCTION IF EXISTS projects_sync_pms_tables();
DROP FUNCTION IF EXISTS projects_sync_project_type();
