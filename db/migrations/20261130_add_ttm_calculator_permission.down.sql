-- Down Migration: Remove 'ttm_calculator' from permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'ttm_calculator';
DELETE FROM permission_features WHERE feature_key = 'ttm_calculator';
