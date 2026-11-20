ALTER TABLE news_letter_categories DROP COLUMN IF EXISTS expanded;
DROP INDEX IF EXISTS uq_news_letter_articles_slug;
ALTER TABLE news_letter_articles DROP COLUMN IF EXISTS slug;
ALTER TABLE news_letter_articles DROP COLUMN IF EXISTS short_title;
