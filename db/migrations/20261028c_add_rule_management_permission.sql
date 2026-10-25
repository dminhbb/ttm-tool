-- "Rule Management" (SuperAdmin: Quản trị hệ thống) in the permission matrix — SUPERADMIN only by default.
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('rule_management', 'Rule Management', 'ADMIN', 65)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('rule_management', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('rule_management', 'ADMIN', FALSE, FALSE, FALSE, FALSE),
    ('rule_management', 'SUPERVISOR', FALSE, FALSE, FALSE, FALSE),
    ('rule_management', 'USER', FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
