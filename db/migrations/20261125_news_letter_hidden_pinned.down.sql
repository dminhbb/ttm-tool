ALTER TABLE news_letter_articles DROP COLUMN IF EXISTS pinned_at;
ALTER TABLE news_letter_articles DROP COLUMN IF EXISTS is_pinned;
ALTER TABLE news_letter_articles DROP COLUMN IF EXISTS hidden_from_menu;
