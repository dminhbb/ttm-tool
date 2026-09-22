-- Rollback: Remove 'dashboard_new' from permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'dashboard_new';
DELETE FROM permission_features WHERE feature_key = 'dashboard_new';
