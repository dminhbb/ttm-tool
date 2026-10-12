-- Migration: Add 'data_normalization' (màn hình "Chuẩn hoá dữ liệu") to the permission matrix.
-- View-only screen, open to every role by default — a PM/SM is who fixes the data of their own Epics.
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('data_normalization', 'Chuẩn hoá dữ liệu', 'VIEW_ONLY', 101)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('data_normalization', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('data_normalization', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('data_normalization', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('data_normalization', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
