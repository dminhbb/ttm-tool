-- Migration: Add 'epic_in_po' to permission matrix
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('epic_in_po', 'Epic in PO', 'VIEW_ONLY', 105)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('epic_in_po', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('epic_in_po', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('epic_in_po', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('epic_in_po', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
