-- PMS Project Core (1/5) — danh mục loại dự án + năng lực theo loại.
--
-- Thay cho CHECK text trên projects.project_category ('Dự án' / 'Team Agile' /
-- 'Team Triển khai'). Đây là migration EXPAND-ONLY: cột project_category CŨ ĐƯỢC GIỮ
-- NGUYÊN và mọi code hiện tại (Quản lý Dự án, TTM) tiếp tục đọc nó không đổi. Việc bỏ
-- cột cũ chỉ làm ở bước contract sau khi module Projects đã chuyển hẳn sang bảng này.
--
-- project_type_capabilities chỉ khai báo các năng lực KHÁC BIỆT giữa các loại. Các năng
-- lực lõi dùng chung cho MỌI loại (thông tin tổng quan, nhân sự, sức khoẻ, phạm vi/rủi
-- ro) không nằm ở đây vì luôn bật — xem docs/architecture/PMS-HLAD.md §9.2.

CREATE TABLE IF NOT EXISTS project_types (
    id SERIAL PRIMARY KEY,
    type_code VARCHAR(50) NOT NULL UNIQUE,
    type_name VARCHAR(100) NOT NULL,
    -- Giá trị projects.project_category tương ứng — dùng để backfill project_type_id và
    -- đối chiếu hai nguồn trong giai đoạn chuyển tiếp. NULL = loại mới, không có bản đồ legacy.
    legacy_category VARCHAR(30),
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_types_legacy_category
    ON project_types (legacy_category)
    WHERE legacy_category IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_type_capabilities (
    project_type_id INT NOT NULL REFERENCES project_types(id) ON DELETE CASCADE,
    capability_code VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_type_id, capability_code)
);

INSERT INTO project_types (type_code, type_name, legacy_category, description, sort_order) VALUES
    ('DELIVERY_PROJECT', 'Dự án', 'Dự án',
     'Dự án triển khai: mốc kế hoạch theo năm, checklist triển khai và kế hoạch thực thi chi tiết.', 1),
    ('AGILE_TEAM', 'Team Agile', 'Team Agile',
     'Team Agile: lập kế hoạch theo quý/tháng và kiểm soát backlog đầu vào.', 2),
    ('DEPLOYMENT_TEAM', 'Team Triển khai', 'Team Triển khai',
     'Team triển khai. Bộ năng lực dưới đây là mặc định tạm thời, CẦN chủ sở hữu nghiệp vụ xác nhận.', 3)
ON CONFLICT (type_code) DO NOTHING;

INSERT INTO project_type_capabilities (project_type_id, capability_code)
SELECT t.id, seed.capability_code
FROM project_types t
JOIN (VALUES
    ('DELIVERY_PROJECT', 'CHECKLIST'),
    ('DELIVERY_PROJECT', 'MILESTONE'),
    ('DELIVERY_PROJECT', 'GANTT'),
    ('DELIVERY_PROJECT', 'IMPLEMENTATION_PLAN'),
    ('AGILE_TEAM', 'PLANNING_PERIOD'),
    ('AGILE_TEAM', 'BACKLOG'),
    ('AGILE_TEAM', 'CAPACITY'),
    -- Mặc định tạm thời, chờ xác nhận nghiệp vụ (xem description của DEPLOYMENT_TEAM).
    ('DEPLOYMENT_TEAM', 'CHECKLIST'),
    ('DEPLOYMENT_TEAM', 'MILESTONE')
) AS seed(type_code, capability_code) ON seed.type_code = t.type_code
ON CONFLICT DO NOTHING;
