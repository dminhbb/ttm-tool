-- Migration: Add 'visit_counter' (Thống kê truy cập, /visit-stats) to permission matrix.
-- Moved out of the "Cấu hình ứng dụng" modal into its own left-panel menu item, viewable by every role.
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('visit_counter', 'Thống kê truy cập', 'VIEW_ONLY', 107)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('visit_counter', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('visit_counter', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('visit_counter', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('visit_counter', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
