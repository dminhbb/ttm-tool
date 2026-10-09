-- PMS Project Core (4/5) — đưa cấu hình TTM ra khỏi bảng projects.
--
-- projects.ttm ('Y'/'N') là thuộc tính của module TTM nhưng đang nằm trong bảng master
-- dùng chung, nên module Projects buộc phải đọc/ghi dữ liệu của TTM. Bảng này tách quyền
-- sở hữu đúng theo thiết kế: "Project tồn tại trong PMS" không còn đồng nghĩa với
-- "Project bắt buộc dùng TTM".
--
-- EXPAND-ONLY: cột projects.ttm GIỮ NGUYÊN. Trong giai đoạn chuyển tiếp, UI Projects phải
-- ghi CẢ HAI nơi (dual-write) để TTM — hiện vẫn đọc projects.ttm, xem
-- black-listed-epic-service.ts — không bị lệch. Chỉ bỏ cột cũ sau khi TTM đã chuyển sang
-- đọc bảng này và đối chiếu khớp.

CREATE TABLE IF NOT EXISTS ttm_project_configs (
    project_id INT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    -- Tương đương projects.ttm = 'Y'.
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ttm_cntt_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ttm_e2e_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ttm_project_configs_enabled
    ON ttm_project_configs (is_enabled)
    WHERE is_enabled;

INSERT INTO ttm_project_configs (project_id, is_enabled)
SELECT p.id, (p.ttm = 'Y')
FROM projects p
ON CONFLICT (project_id) DO NOTHING;
