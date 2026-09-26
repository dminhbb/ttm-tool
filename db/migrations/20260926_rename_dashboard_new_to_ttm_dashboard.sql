-- Migration: Rename 'Dashboard New' to 'TTM dashboard' in permission matrix
UPDATE permission_features
SET feature_name = 'TTM dashboard'
WHERE feature_key = 'dashboard_new';
