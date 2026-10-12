-- Down Migration: Remove 'data_normalization' from permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'data_normalization';
DELETE FROM permission_features WHERE feature_key = 'data_normalization';
