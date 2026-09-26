-- Rollback: Rename 'TTM dashboard' back to 'Dashboard New'
UPDATE permission_features
SET feature_name = 'Dashboard New'
WHERE feature_key = 'dashboard_new';
