-- PMS Project Core (5/5) — roster nhân sự chính thức của dự án.
--
-- Khác với user_projects: bảng đó là GRANT PHÂN QUYỀN của IAM (ai được xem dữ liệu dự án
-- nào) và không mô tả được vai trò, tỷ lệ tham gia hay thời gian vào/ra. project_members là
-- dữ liệu NGHIỆP VỤ do PMS sở hữu, phục vụ chức năng "Quản lý nhân sự trong dự án".
--
-- Theo thiết kế đã chốt: PMS sở hữu roster chính thức; dữ liệu quan sát từ Jira chỉ dùng để
-- đề xuất/đối chiếu, không tự thay đổi roster.
--
-- EXPAND-ONLY: user_projects GIỮ NGUYÊN và vẫn là nguồn phân quyền duy nhất. Backfill dưới
-- đây chỉ tạo roster khởi điểm từ các PM/SM hiện có.

CREATE TABLE IF NOT EXISTS project_members (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- PM_SM, MEMBER, BA, DEV, QC, ... (kiểm soát ở tầng ứng dụng; chưa CHECK cứng vì danh
    -- mục vai trò trong dự án còn chờ nghiệp vụ chốt).
    role_in_project VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
    allocation_percent NUMERIC(5,2),
    joined_at DATE,
    left_at DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pm_allocation CHECK (allocation_percent IS NULL OR (allocation_percent >= 0 AND allocation_percent <= 100)),
    CONSTRAINT chk_pm_dates CHECK (left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at)
);

-- Một người chỉ giữ một vai trò đang hiệu lực trong một dự án; vẫn cho phép lưu nhiều dòng
-- lịch sử đã kết thúc (is_active = FALSE) của cùng cặp project/user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_active_role
    ON project_members (project_id, user_id, role_in_project)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members (project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members (user_id);

INSERT INTO project_members (project_id, user_id, role_in_project)
SELECT up.project_id, up.user_id, 'PM_SM'
FROM user_projects up
WHERE NOT EXISTS (
    SELECT 1 FROM project_members m
    WHERE m.project_id = up.project_id
      AND m.user_id = up.user_id
      AND m.role_in_project = 'PM_SM'
      AND m.is_active
);
