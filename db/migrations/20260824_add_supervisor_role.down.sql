DELETE FROM role_feature_permissions WHERE role = 'SUPERVISOR';

ALTER TABLE role_feature_permissions DROP CONSTRAINT role_feature_permissions_role_check;
ALTER TABLE role_feature_permissions ADD CONSTRAINT role_feature_permissions_role_check CHECK (role IN ('SUPERADMIN', 'ADMIN', 'USER'));

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPERADMIN', 'ADMIN', 'USER'));
