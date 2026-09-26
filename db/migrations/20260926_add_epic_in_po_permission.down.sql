-- Migration: Revert adding 'epic_in_po' to permission matrix
DELETE FROM role_feature_permissions WHERE feature_key = 'epic_in_po';
DELETE FROM permission_features WHERE feature_key = 'epic_in_po';
