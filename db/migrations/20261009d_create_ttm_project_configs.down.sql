-- Gỡ cấu hình TTM theo project. An toàn khi còn dual-write: projects.ttm vẫn là nguồn
-- TTM đang đọc, nên không mất trạng thái bật/tắt TTM của dự án.
DROP TABLE IF EXISTS ttm_project_configs;
