-- Migration: Add 'dashboard_new' to permission matrix
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('dashboard_new', 'Dashboard New', 'VIEW_ONLY', 82)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('dashboard_new', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('dashboard_new', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('dashboard_new', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('dashboard_new', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
