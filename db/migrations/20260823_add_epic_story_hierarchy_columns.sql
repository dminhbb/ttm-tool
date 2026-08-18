-- Py Jira API adapter now emits epic_stories (list of story keys, on epic rows) and
-- story_subtasks (list of subtask keys, on story rows). Stored verbatim from the CSV for
-- display/audit — the actual epic/story/subtask relationships are still derived independently
-- via issues.epic_key/parent_key + the UPDATE...JOIN linking in import-service.ts.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS epic_stories TEXT[];
ALTER TABLE issues ADD COLUMN IF NOT EXISTS story_subtasks TEXT[];
