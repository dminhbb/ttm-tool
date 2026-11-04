-- Crawl tool V16 / V16.1 (owner 2026-11-04): four new CSV columns kept on `issues`.
--   subtask_assignees_role  ← subtask_Assignees_Role  (SUBTASK rows) Jira "Assignee's Role", several values joined by ','
--   subtask_resolved        ← subtask_Resolved        (SUBTASK rows) Jira "Resolved", YYYY-MM-DD
--   story_real_start_date   ← Story_Real_Start_Date   (STORY rows)   computed by the crawl tool
--   epic_real_start_date    ← Epic_Real_Start_Date    (EPIC rows)    computed by the crawl tool; an empty / NULL value is
--                             carried over from the Epic's newest earlier row before the batch is committed
-- Older files (without these columns) simply leave them NULL — except epic_real_start_date, carried over as above.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS subtask_assignees_role TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS subtask_resolved DATE;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS story_real_start_date DATE;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS epic_real_start_date DATE;
