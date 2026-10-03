-- Down Migration: Remove 'ttm_dashboard_2' from permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'ttm_dashboard_2';
DELETE FROM permission_features WHERE feature_key = 'ttm_dashboard_2';
