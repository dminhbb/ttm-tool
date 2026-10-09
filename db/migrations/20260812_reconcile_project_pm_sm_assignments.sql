-- Normalize PM/SM to the active user's full name and rebuild the matching user-project assignments.
--
-- 2026-10-09 — bọc trong guard kiểm tra sự tồn tại của projects.lead_name, cùng lý do như
-- 20260811_sync_project_lead_assignments.sql: cột đã bị bỏ bởi 20260908 và không còn trong
-- db/schema.sql, nên DB khởi tạo mới sẽ vỡ ở đây. Đây là migration reconcile dữ liệu một lần.
DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'lead_name'
    ) THEN
        RAISE NOTICE 'Bo qua 20260812: projects.lead_name khong ton tai (DB khoi tao moi).';
        RETURN;
    END IF;

    EXECUTE $sql$
        UPDATE projects project
        SET lead_name = user_account.full_name,
            updated_at = CURRENT_TIMESTAMP
        FROM users user_account
        WHERE (project.lead_name = user_account.full_name OR project.lead_name = user_account.email)
          AND user_account.is_active = TRUE
    $sql$;

    EXECUTE $sql$
        DELETE FROM user_projects assignment
        USING projects project
        WHERE assignment.project_id = project.id
          AND project.lead_name IS NOT NULL
          AND project.lead_name <> ''
          AND EXISTS (
            SELECT 1 FROM users user_account
            WHERE user_account.full_name = project.lead_name
              AND user_account.is_active = TRUE
          )
    $sql$;

    EXECUTE $sql$
        INSERT INTO user_projects (user_id, project_id)
        SELECT user_account.id, project.id
        FROM projects project
        JOIN users user_account
          ON user_account.full_name = project.lead_name
          AND user_account.is_active = TRUE
        WHERE project.lead_name IS NOT NULL
          AND project.lead_name <> ''
    $sql$;
END $mig$;
