-- Add jira_created_at and jira_updated_at columns to issues table
-- These store the original Jira creation/update timestamps from source data
-- Used by the Py Jira API adapter (epic_created, epic_updated columns)

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS jira_created_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS jira_updated_at TIMESTAMP WITH TIME ZONE;
