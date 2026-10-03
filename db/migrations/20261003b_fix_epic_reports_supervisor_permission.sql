-- Migration: Ensure all features have role permissions for all roles (including SUPERVISOR for epic_reports)
INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete)
SELECT f.feature_key, r.role, FALSE, FALSE, FALSE, FALSE
FROM permission_features f
CROSS JOIN (VALUES ('SUPERADMIN'), ('ADMIN'), ('SUPERVISOR'), ('USER')) AS r(role)
ON CONFLICT (feature_key, role) DO NOTHING;

-- Specifically ensure SUPERADMIN always has full permissions
UPDATE role_feature_permissions
SET can_view = TRUE, can_add = TRUE, can_edit = TRUE, can_delete = TRUE
WHERE role = 'SUPERADMIN';
