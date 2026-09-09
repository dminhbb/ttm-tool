-- Migration: Add 'epic_reports' to permission matrix
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('epic_reports', 'Báo cáo Epic', 'VIEW_ONLY', 85)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('epic_reports', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('epic_reports', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('epic_reports', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
