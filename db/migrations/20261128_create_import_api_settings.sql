-- Token của API import tự động (POST /api/data-source/import/auto) lưu trong CSDL thay cho biến môi trường
-- IMPORT_API_TOKEN (owner 2026-11-13): môi trường nội bộ của công ty không cấu hình được biến môi trường cho ứng dụng.
-- SUPERADMIN đặt / tạo / xoá token ở Quản trị hệ thống → "Token import tự động"; công cụ crawl Jira gửi token này
-- trong header Authorization: Bearer <token>. Lưu dạng rõ để quản trị xem lại / sao chép được (ứng dụng chạy trong
-- mạng nội bộ). api_token NULL = chưa cấu hình → API trả 503. Một dòng duy nhất (id = 1).
CREATE TABLE IF NOT EXISTS import_api_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    api_token TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE
);

INSERT INTO import_api_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
