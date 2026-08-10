-- Normalize PM/SM to the active user's full name and rebuild the matching user-project assignments.
UPDATE projects project
SET lead_name = user_account.full_name,
    updated_at = CURRENT_TIMESTAMP
FROM users user_account
WHERE (project.lead_name = user_account.full_name OR project.lead_name = user_account.email)
  AND user_account.is_active = TRUE;

DELETE FROM user_projects assignment
USING projects project
WHERE assignment.project_id = project.id
  AND project.lead_name IS NOT NULL
  AND project.lead_name <> ''
  AND EXISTS (
    SELECT 1 FROM users user_account
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
