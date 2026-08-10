-- Backfill the user_projects assignment from each valid active project's configured PM/SM.
DELETE FROM user_projects assignment
USING projects project
WHERE assignment.project_id = project.id
  AND project.lead_name IS NOT NULL
  AND project.lead_name <> ''
  AND EXISTS (
    SELECT 1
    FROM users user_account
    WHERE user_account.full_name = project.lead_name
      AND user_account.is_active = TRUE
  );

INSERT INTO user_projects (user_id, project_id)
SELECT user_account.id, project.id
FROM projects project
JOIN users user_account
  ON user_account.full_name = project.lead_name
  AND user_account.is_active = TRUE
WHERE project.lead_name IS NOT NULL
  AND project.lead_name <> '';
