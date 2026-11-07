-- "Bản tin": how many times a published article was opened (shown after its date). Counted by the reading page for
-- every opening by someone other than the author. Existing articles start from the number of distinct readers recorded so far.
ALTER TABLE news_letter_articles ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
UPDATE news_letter_articles a SET view_count = r.readers
FROM (SELECT article_id, COUNT(*)::integer AS readers FROM news_letter_reads GROUP BY article_id) r
WHERE r.article_id = a.id AND a.view_count = 0;
