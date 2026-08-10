-- Down migration for 20260810_create_auth_rbac_users.sql.
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS password_reset_requests;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS user_projects;
DROP TABLE IF EXISTS user_domains;
DROP TABLE IF EXISTS users;
