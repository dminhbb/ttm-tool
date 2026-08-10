-- Remove only assignments that are still derived from the current configured PM/SM.
DELETE FROM user_projects assignment
USING projects project, users user_account
WHERE assignment.project_id = project.id
  AND assignment.user_id = user_account.id
  AND user_account.full_name = project.lead_name;
