-- Backfill the user_projects assignment from each valid active project's configured PM/SM.
--
-- 2026-10-09 — bọc trong guard kiểm tra sự tồn tại của projects.lead_name:
-- Cột đó đã bị bỏ bởi 20260908_drop_projects_lead_name.sql và cũng không còn trong
-- db/schema.sql, nên trên một DB khởi tạo mới migration này vỡ với
-- "column project.lead_name does not exist" và chặn toàn bộ chuỗi init.
-- Đây là migration backfill DỮ LIỆU một lần: DB cũ đã chạy nó khi cột còn tồn tại, còn DB
-- mới thì không có gì để backfill — nên bỏ qua là đúng ngữ nghĩa, không phải workaround.
-- Dùng EXECUTE (SQL động) vì câu lệnh tĩnh tham chiếu cột không tồn tại sẽ lỗi ngay khi
-- PL/pgSQL phân giải tên, kể cả trong nhánh IF không được chạy.
DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'lead_name'
    ) THEN
        RAISE NOTICE 'Bo qua 20260811: projects.lead_name khong ton tai (DB khoi tao moi).';
        RETURN;
    END IF;

    EXECUTE $sql$
        DELETE FROM user_projects assignment
        USING projects project
        WHERE assignment.project_id = project.id
          AND project.lead_name IS NOT NULL
          AND project.lead_name <> ''
          AND EXISTS (
            SELECT 1
            FROM users user_account
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
