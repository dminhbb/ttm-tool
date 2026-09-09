-- Rollback: Remove 'epic_reports' from permission matrix
DELETE FROM permission_features WHERE feature_key = 'epic_reports';
