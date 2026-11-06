-- "Bản tin" (owner 2026-11-06, route /news-letter): blog-like articles written by SUPERADMIN, readable per role.
-- Kept generic (news_letter_*) so another module of the app can reuse it. Images are stored in the database (bytea):
-- Vercel has no persistent file system, volume is low (~3 articles / month, 1 header + at most 4 images per article),
-- and images then travel with "Sao lưu / Phục hồi dữ liệu". Article HTML is sanitized on the server before storage.
CREATE TABLE IF NOT EXISTS news_letter_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_news_letter_categories_name ON news_letter_categories (LOWER(name));

-- visible_roles: roles that may read the published article; the author always may (a draft — is_published = false — is
-- visible to its author only). first_published_at: set the first time the article is published, never changed after —
-- the order of every list and of "Bài viết trước / sau".
CREATE TABLE IF NOT EXISTS news_letter_articles (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    summary TEXT,
    category_id INTEGER REFERENCES news_letter_categories(id) ON DELETE RESTRICT,
    visible_roles TEXT[] NOT NULL DEFAULT ARRAY['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'USER']::text[],
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    first_published_at TIMESTAMP WITH TIME ZONE,
    header_image_id UUID,
    content_html TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_letter_articles_order ON news_letter_articles (first_published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_news_letter_articles_category ON news_letter_articles (category_id);

-- article_id NULL = uploaded in the editor, not saved with an article yet (removed by the daily housekeeping after 1 day).
CREATE TABLE IF NOT EXISTS news_letter_images (
    id UUID PRIMARY KEY,
    article_id INTEGER REFERENCES news_letter_articles(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('HEADER', 'INLINE')),
    mime_type VARCHAR(40) NOT NULL,
    byte_size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_letter_images_article ON news_letter_images (article_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_letter_articles_header_image_id_fkey') THEN
        ALTER TABLE news_letter_articles ADD CONSTRAINT news_letter_articles_header_image_id_fkey
            FOREIGN KEY (header_image_id) REFERENCES news_letter_images(id) ON DELETE SET NULL;
    END IF;
END $$;

-- "Lịch sử thay đổi": the 5 newest edits of each article (older ones are trimmed on save).
CREATE TABLE IF NOT EXISTS news_letter_article_edits (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES news_letter_articles(id) ON DELETE CASCADE,
    edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_letter_article_edits_article ON news_letter_article_edits (article_id, edited_at DESC);

-- Which user opened which article — the red dot on the menu entry "Bản tin" (unread published article).
CREATE TABLE IF NOT EXISTS news_letter_reads (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id INTEGER NOT NULL REFERENCES news_letter_articles(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, article_id)
);

INSERT INTO permission_features (feature_key, feature_name, category, display_order)
VALUES ('news_letter', 'Bản tin', 'VIEW_ONLY', 80)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, display_order = EXCLUDED.display_order;

INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete) VALUES
    ('news_letter', 'SUPERADMIN', TRUE, TRUE, TRUE, TRUE),
    ('news_letter', 'ADMIN', TRUE, FALSE, FALSE, FALSE),
    ('news_letter', 'SUPERVISOR', TRUE, FALSE, FALSE, FALSE),
    ('news_letter', 'USER', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (feature_key, role) DO NOTHING;
