-- Permission matrix management for SUPERADMIN: a fixed registry of app features
-- (permission_features) crossed with role-level actions (role_feature_permissions). Two
-- categories:
--   - ADMIN   : administrative screens — view/add/edit/delete are all independently toggleable
--               per role.
--   - VIEW_ONLY: everything else (Epic monitoring screens, help popups, product docs) — only
--               view is meaningful, add/edit/delete stay FALSE and aren't exposed for editing.
-- SUPERADMIN always has every permission on every feature (seeded TRUE here; the API also
-- refuses to change a SUPERADMIN row, so this can't drift even if someone edits the DB by hand).
-- New features added later are inserted here by a follow-up migration, per product decision.
CREATE TABLE IF NOT EXISTS permission_features (
    feature_key VARCHAR(60) PRIMARY KEY,
    feature_name VARCHAR(150) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('ADMIN', 'VIEW_ONLY')),
    display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_feature_permissions (
    feature_key VARCHAR(60) NOT NULL REFERENCES permission_features(feature_key) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'USER')),
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_add BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (feature_key, role)
);

INSERT INTO permission_features (feature_key, feature_name, category, display_order) VALUES
    ('permission_matrix', 'Ma trận phân quyền', 'ADMIN', 10),
    ('data_source', 'Nguồn dữ liệu', 'ADMIN', 20),
    ('users', 'Quản lý User', 'ADMIN', 30),
    ('domains', 'Quản lý Domain', 'ADMIN', 40),
    ('projects', 'Quản lý Dự án', 'ADMIN', 50),
    ('status_alert_rules', 'Cấu hình cảnh báo', 'ADMIN', 60),
    ('database_backup', 'Sao lưu / Phục hồi dữ liệu', 'ADMIN', 70),
    ('general_settings', 'Quản lý chung', 'ADMIN', 80),
    ('epic_alerts_30', 'Quản lý Epic 30', 'VIEW_ONLY', 90),
    ('epic_alerts_15', 'Quản lý Epic 15', 'VIEW_ONLY', 100),
    ('help_alert_logic', 'Popup Logic cảnh báo Epic', 'VIEW_ONLY', 110),
    ('help_data_logic', 'Popup Logic xử lý dữ liệu', 'VIEW_ONLY', 120),
    ('product_docs', 'Tài liệu sản phẩm', 'VIEW_ONLY', 130)
ON CONFLICT (feature_key) DO NOTHING;

-- SUPERADMIN: every feature, every action TRUE.
INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete)
SELECT feature_key, 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE FROM permission_features
ON CONFLICT (feature_key, role) DO NOTHING;

-- ADMIN defaults, mirroring the hardcoded role checks these screens have today.
INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('permission_matrix', 'ADMIN', FALSE, FALSE, FALSE, FALSE),
    ('data_source', 'ADMIN', FALSE, FALSE, FALSE, FALSE),
    ('users', 'ADMIN', TRUE, TRUE, TRUE, TRUE),
    ('domains', 'ADMIN', TRUE, TRUE, TRUE, TRUE),
    ('projects', 'ADMIN', TRUE, TRUE, TRUE, TRUE),
    ('status_alert_rules', 'ADMIN', FALSE, FALSE, FALSE, FALSE),
    ('database_backup', 'ADMIN', FALSE, FALSE, FALSE, FALSE),
    ('general_settings', 'ADMIN', TRUE, TRUE, TRUE, FALSE),
    ('epic_alerts_30', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('epic_alerts_15', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('help_alert_logic', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('help_data_logic', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('product_docs', 'ADMIN', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;

-- USER defaults, mirroring today's behavior (only Epic 15, the alert-logic popup and product docs
-- are reachable by a plain USER).
INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('permission_matrix', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('data_source', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('users', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('domains', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('projects', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('status_alert_rules', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('database_backup', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('general_settings', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('epic_alerts_30', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('epic_alerts_15', 'USER', TRUE, FALSE, FALSE, FALSE),
    ('help_alert_logic', 'USER', TRUE, FALSE, FALSE, FALSE),
    ('help_data_logic', 'USER', FALSE, FALSE, FALSE, FALSE),
    ('product_docs', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
