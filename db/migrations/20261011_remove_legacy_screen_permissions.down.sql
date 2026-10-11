-- Rollback: đưa các chức năng của màn hình cũ trở lại Ma trận phân quyền với quyền mặc định ban đầu.
-- Lưu ý: các tuỳ chỉnh quyền do SUPERADMIN đã sửa tay trước khi gỡ không được khôi phục
-- (riêng dashboard_new trước đó mặc định chỉ SUPERADMIN còn xem được từ 2026-10-05).
INSERT INTO permission_features (feature_key, feature_name, category, display_order) VALUES
    ('dashboard', 'Dashboard', 'VIEW_ONLY', 83),
    ('epic_alerts_30', 'Quản lý Epic 30', 'VIEW_ONLY', 90),
    ('epic_in_po', 'Epic in PO', 'VIEW_ONLY', 105),
    ('dashboard_new', 'TTM dashboard', 'VIEW_ONLY', 82)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('dashboard', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('dashboard', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('dashboard', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('dashboard', 'USER', TRUE, FALSE, FALSE, FALSE),
    ('epic_alerts_30', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('epic_alerts_30', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('epic_alerts_30', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('epic_alerts_30', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('epic_in_po', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('epic_in_po', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('epic_in_po', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('epic_in_po', 'USER', TRUE, FALSE, FALSE, FALSE),
    ('dashboard_new', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('dashboard_new', 'ADMIN', FALSE, FALSE, FALSE, FALSE),
    ('dashboard_new', 'SUPERVISOR', FALSE, FALSE, FALSE, FALSE),
    ('dashboard_new', 'USER', FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
