-- projects.project_key ("Mã hiển thị") was always kept in lockstep with source_project_key on
-- every project except one manual test row; the app now uses source_project_key as the single,
-- unified project key everywhere (already the join key for permission scope and component
-- matching), so the redundant display-code column is dropped and source_project_key gets the
-- UNIQUE constraint project_key used to carry.
--
-- 2026-10-09 — làm migration này tolerant với DB khởi tạo mới: db/schema.sql (đã bị hand-edit
-- theo thời gian) không còn khai báo cột project_key, nên DROP COLUMN không điều kiện sẽ vỡ
-- với "column project_key does not exist" và chặn chuỗi init.
ALTER TABLE projects DROP COLUMN IF EXISTS project_key;

DO $mig$
BEGIN
    -- Chỉ thêm ràng buộc khi chưa có UNIQUE nào phủ đúng cột source_project_key. Trên DB khởi
    -- tạo mới, db/schema.sql đã khai báo cột này UNIQUE sẵn (constraint tự đặt tên), nên thêm
    -- nữa chỉ tạo thêm một unique index trùng lặp.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
        WHERE n.nspname = 'public'
          AND t.relname = 'projects'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'source_project_key'
    ) THEN
        ALTER TABLE projects ADD CONSTRAINT uq_projects_source_project_key UNIQUE (source_project_key);
    END IF;
END $mig$;
