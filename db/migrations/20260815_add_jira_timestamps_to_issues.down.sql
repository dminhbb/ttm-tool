-- Rollback: remove jira_created_at and jira_updated_at from issues table

ALTER TABLE issues
  DROP COLUMN IF EXISTS jira_created_at,
  DROP COLUMN IF EXISTS jira_updated_at;
