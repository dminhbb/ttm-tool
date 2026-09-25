-- Rollback: Remove 'dashboard' from permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'dashboard';
DELETE FROM permission_features WHERE feature_key = 'dashboard';
