-- "Bản tin" (owner 2026-11-20): cải tiến bài viết + phân loại.
--   short_title — "Tiêu đề ngắn" (max 50 ký tự, không bắt buộc): dùng làm tiêu đề hiển thị trên menu
--                 (bài không có thì dùng title).
--   slug         — rút gọn từ short_title (bỏ dấu tiếng Việt, dấu cách → '_', giữ hoa/thường), dùng
--                 làm URL thay cho id; bài không có short_title thì slug = NULL và URL vẫn dùng id.
--                 Unique (Postgres cho phép nhiều NULL → các bài không có slug không xung đột).
--   categories.expanded — checkbox "Expand" của Quản trị Phân loại: thư mục tương ứng mở sẵn
--                 hiển thị các đầu mục tin trong menu; mặc định collapsed (false).
ALTER TABLE news_letter_articles ADD COLUMN IF NOT EXISTS short_title VARCHAR(50);
ALTER TABLE news_letter_articles ADD COLUMN IF NOT EXISTS slug VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS uq_news_letter_articles_slug ON news_letter_articles (slug)
    WHERE slug IS NOT NULL;

ALTER TABLE news_letter_categories ADD COLUMN IF NOT EXISTS expanded BOOLEAN NOT NULL DEFAULT false;
