-- Float message mở rộng (REQ-20261118-04, chủ sản phẩm 18/11/2026):
--   url               URL mở khi bấm vào message (http/https hoặc đường dẫn nội bộ "/..."); NULL = không bấm được
--   open_in_new_tab   TRUE = mở tab mới, FALSE (mặc định) = tab hiện tại
--   highlight_border  TRUE = viền nâu nổi bật (giống thông báo My assigned tasks), mặc định FALSE
-- float_message_priorities: thứ tự ưu tiên (1 chữ số, 1 = ưu tiên nhất) của hai nguồn hệ thống trong hàng đợi:
--   FM-001 Thông báo Tạo cache, FM-002 Thông báo My assigned tasks. FM-003 (nội dung cấu hình Quản trị hệ thống) luôn ở
--   mức cuối nên không lưu ở đây. Cùng thứ tự → xếp theo mã A-Z.
ALTER TABLE float_message_settings ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE float_message_settings ADD COLUMN IF NOT EXISTS open_in_new_tab BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE float_message_settings ADD COLUMN IF NOT EXISTS highlight_border BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE float_message_settings DROP CONSTRAINT IF EXISTS float_message_url_length;
ALTER TABLE float_message_settings ADD CONSTRAINT float_message_url_length CHECK (url IS NULL OR char_length(url) BETWEEN 1 AND 2048);

CREATE TABLE IF NOT EXISTS float_message_priorities (
    code VARCHAR(10) PRIMARY KEY CHECK (code IN ('FM-001', 'FM-002')),
    priority SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 8),
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO float_message_priorities (code, priority) VALUES ('FM-001', 1), ('FM-002', 2) ON CONFLICT (code) DO NOTHING;
