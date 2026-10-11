-- Gỡ ánh xạ hệ thống ngoài. Không mất dữ liệu nghiệp vụ: toàn bộ nội dung được backfill
-- từ projects.source_project_key, vốn vẫn còn nguyên.
DROP TABLE IF EXISTS project_external_bindings;
