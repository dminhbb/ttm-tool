-- Schema-only rollback — does not restore historical lead_name values (the column was a derived
-- cache; re-populate it from user_projects + users by hand if ever needed).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lead_name VARCHAR(100);
