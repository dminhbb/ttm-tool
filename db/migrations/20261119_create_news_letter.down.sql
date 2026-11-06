DELETE FROM role_feature_permissions WHERE feature_key = 'news_letter';
DELETE FROM permission_features WHERE feature_key = 'news_letter';
DROP TABLE IF EXISTS news_letter_reads;
DROP TABLE IF EXISTS news_letter_article_edits;
ALTER TABLE IF EXISTS news_letter_articles DROP CONSTRAINT IF EXISTS news_letter_articles_header_image_id_fkey;
DROP TABLE IF EXISTS news_letter_images;
DROP TABLE IF EXISTS news_letter_articles;
DROP TABLE IF EXISTS news_letter_categories;
