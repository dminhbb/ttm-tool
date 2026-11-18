-- Migration: Add 'ttm_calculator' (màn hình "TTM Calculator") to the permission matrix.
-- View-only screen, open to every role by default — it only computes milestones of an imaginary Epic, nothing is stored.
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('ttm_calculator', 'TTM Calculator', 'VIEW_ONLY', 102)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('ttm_calculator', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('ttm_calculator', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('ttm_calculator', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('ttm_calculator', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
