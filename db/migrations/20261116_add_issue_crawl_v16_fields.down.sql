ALTER TABLE issues DROP COLUMN IF EXISTS epic_real_start_date;
ALTER TABLE issues DROP COLUMN IF EXISTS story_real_start_date;
ALTER TABLE issues DROP COLUMN IF EXISTS subtask_resolved;
ALTER TABLE issues DROP COLUMN IF EXISTS subtask_assignees_role;
