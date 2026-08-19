-- New role: SUPERVISOR — same visibility scope as SUPERADMIN (sees everything), but read-only: no
-- create/edit/delete on admin management screens and no access to data-processing actions (import,
-- purge, backup, cleanup). Enforcement itself lives in application code (auth-service.ts's
-- requireUser role arrays); this migration only widens the two role CHECK constraints and seeds a
-- SUPERVISOR row per feature in the permission matrix (view-only where SUPERVISOR actually has view
-- access per the app-side rules, mirroring how the ADMIN seed rows already document ADMIN's
-- hardcoded route checks) so SUPERADMIN can review/adjust it from "Ma trận phân quyền".
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'USER'));

ALTER TABLE role_feature_permissions DROP CONSTRAINT role_feature_permissions_role_check;
ALTER TABLE role_feature_permissions ADD CONSTRAINT role_feature_permissions_role_check CHECK (role IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'USER'));

-- SUPERVISOR defaults: view-only wherever the app grants SUPERVISOR view access at all;
-- data_source/database_backup/permission_matrix stay fully FALSE (SUPERVISOR has zero access to
-- data-processing actions or to the matrix screen itself, only a row within it).
INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('permission_matrix', 'SUPERVISOR', FALSE, FALSE, FALSE, FALSE),
    ('data_source', 'SUPERVISOR', FALSE, FALSE, FALSE, FALSE),
    ('users', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('domains', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('projects', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('status_alert_rules', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('database_backup', 'SUPERVISOR', FALSE, FALSE, FALSE, FALSE),
    ('general_settings', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('epic_alerts_30', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('epic_alerts_15', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('help_alert_logic', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('help_data_logic', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('product_docs', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
