-- PMS Project Core (3/5) — ánh xạ project của PMS với hệ thống ngoài (Jira, OPMS...).
--
-- Cho phép một project PMS gắn với nhiều project ngoài, có hệ thống nguồn và khoảng hiệu
-- lực riêng; đổi Jira key trở thành thao tác dữ liệu thay vì đổi định danh project.
--
-- EXPAND-ONLY: projects.source_project_key GIỮ NGUYÊN và vẫn là nguồn TTM đang đọc.
-- Bảng này được backfill từ chính nó để hai nguồn khớp nhau ngay từ đầu.

CREATE TABLE IF NOT EXISTS project_external_bindings (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- JIRA, OPMS, ... (chuỗi tự do có kiểm soát ở tầng ứng dụng, tránh CHECK cứng vì danh
    -- sách hệ thống tích hợp còn mở — kênh OPMS chưa chốt).
    system_code VARCHAR(30) NOT NULL DEFAULT 'JIRA',
    external_project_id VARCHAR(100),
    external_project_key VARCHAR(100) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE,
    valid_to DATE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_peb_valid_range CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

-- Mỗi (project, hệ thống) chỉ có duy nhất một binding chính đang hiệu lực.
CREATE UNIQUE INDEX IF NOT EXISTS uq_peb_primary_per_system
    ON project_external_bindings (project_id, system_code)
    WHERE is_primary AND is_active;

-- Một khoá ngoài chỉ trỏ tới một project trong cùng hệ thống. So sánh UPPER() vì Jira key
-- không phân biệt hoa thường về nghiệp vụ, trong khi VARCHAR của Postgres thì có — đây
-- chính là nguồn gốc rủi ro "ABC" vs "abc" thành hai master record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_peb_external_key_per_system
    ON project_external_bindings (system_code, UPPER(external_project_key))
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_peb_project ON project_external_bindings (project_id);

INSERT INTO project_external_bindings (project_id, system_code, external_project_key, is_primary, is_active)
SELECT p.id, 'JIRA', p.source_project_key, TRUE, TRUE
FROM projects p
WHERE NOT EXISTS (
    SELECT 1 FROM project_external_bindings b
    WHERE b.project_id = p.id AND b.system_code = 'JIRA'
);
