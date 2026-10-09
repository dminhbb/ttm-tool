-- PMS Project Core (2/5) — định danh nghiệp vụ của PMS, tách khỏi Jira project key.
--
-- Vấn đề đang xử lý: projects.source_project_key hiện kiêm 5 vai trò (định danh project,
-- khoá tích hợp Jira, khoá join dữ liệu, khoá phân quyền, khoá cache). Hệ quả: không khai
-- báo được project chưa có trên Jira, và đổi Jira key sẽ làm mất phân quyền + lệch lịch sử.
--
-- EXPAND-ONLY: source_project_key và project_category GIỮ NGUYÊN, TTM đọc như cũ.
--   project_code    = mã nghiệp vụ PMS (backfill = source_project_key, sau này sửa độc lập)
--   project_type_id = FK tới project_types (backfill từ project_category)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type_id INT REFERENCES project_types(id) ON DELETE SET NULL;

UPDATE projects SET project_code = source_project_key WHERE project_code IS NULL;

UPDATE projects p
SET project_type_id = t.id
FROM project_types t
WHERE p.project_type_id IS NULL
  AND p.project_category IS NOT NULL
  AND t.legacy_category = p.project_category;

-- Trigger điền project_code từ source_project_key khi caller không truyền.
--
-- BẮT BUỘC cho tính chất expand-only: code hiện tại (saveProject trong
-- master-data-service.ts, và route bulk import ở src/app/api/projects/route.ts) INSERT vào
-- projects mà KHÔNG biết cột project_code. Nếu chỉ đặt NOT NULL thì mọi lần tạo dự án mới
-- sẽ vỡ với "null value in column project_code" — đã tái hiện được khi test với dữ liệu thật.
-- DEFAULT của cột không dùng được ở đây vì nó không tham chiếu được cột khác cùng dòng.
--
-- Trigger này là cơ chế CHUYỂN TIẾP: bỏ đi ở bước contract, sau khi module Projects luôn
-- ghi project_code tường minh.
CREATE OR REPLACE FUNCTION projects_fill_project_code() RETURNS trigger AS $fn$
BEGIN
    IF NEW.project_code IS NULL OR BTRIM(NEW.project_code) = '' THEN
        NEW.project_code := NEW.source_project_key;
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_fill_project_code ON projects;
CREATE TRIGGER trg_projects_fill_project_code
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION projects_fill_project_code();

-- Chỉ siết NOT NULL sau khi đã backfill xong VÀ trigger đã sẵn sàng đỡ các writer cũ.
ALTER TABLE projects ALTER COLUMN project_code SET NOT NULL;

DO $mig$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_projects_project_code') THEN
        ALTER TABLE projects ADD CONSTRAINT uq_projects_project_code UNIQUE (project_code);
    END IF;
END $mig$;

CREATE INDEX IF NOT EXISTS idx_projects_project_type ON projects (project_type_id);
