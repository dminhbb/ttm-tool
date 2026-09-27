-- Migration: Revert adding 'visit_counter' to permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'visit_counter';
DELETE FROM permission_features WHERE feature_key = 'visit_counter';
