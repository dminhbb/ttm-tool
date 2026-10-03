-- Migration: Add 'ttm_dashboard_2' to permission matrix
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('ttm_dashboard_2', 'TTM Dashboard 2', 'VIEW_ONLY', 83)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('ttm_dashboard_2', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('ttm_dashboard_2', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('ttm_dashboard_2', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('ttm_dashboard_2', 'USER', FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO UPDATE
SET can_view = EXCLUDED.can_view;
