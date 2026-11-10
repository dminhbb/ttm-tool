-- "Bản tin" (owner 2026-11-10): two switches of the editor, next to "Nháp".
--   hidden_from_menu — "Ẩn trên menu": the article still opens through its link (shared directly), but is left out of the
--                      contents column, "Bài viết trước / sau", the unread dot and MCP — except for SUPERADMIN, who still
--                      sees it in the column.
--   is_pinned        — "Ghim bài viết": listed at the top of the contents column (above "Mới nhất", with a pin) and in the
--                      ticker above the article; it stays in its folder too. pinned_at orders the pinned ones (newest first).
ALTER TABLE news_letter_articles ADD COLUMN IF NOT EXISTS hidden_from_menu BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE news_letter_articles ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE news_letter_articles ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
