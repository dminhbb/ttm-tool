import 'server-only';
import { randomUUID } from 'node:crypto';
import pool, { getClient } from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import { newsLetterImageIdsOf, sanitizeRichHtml } from '@/lib/rich-html-sanitizer';
import { sniffImageMime } from '@/lib/news-letter/image-sniff';
import { isMcpExcludedFolder, NEWS_LETTER_MCP_EXCLUDED_FOLDER_IDS } from '@/lib/news-letter/mcp-rules';
import {
  NEWS_LETTER_CATEGORY_NAME_MAX,
  NEWS_LETTER_CONTENT_MAX,
  NEWS_LETTER_GROUP_PAGE,
  NEWS_LETTER_LATEST_PAGE,
  NEWS_LETTER_MAX_ARTICLE_IMAGES,
  NEWS_LETTER_MAX_IMAGE_BYTES,
  NEWS_LETTER_PINNED_MAX,
  NEWS_LETTER_ROLES,
  NEWS_LETTER_SUMMARY_MAX,
  NEWS_LETTER_TITLE_MAX,
  type NewsLetterArticle,
  type NewsLetterArticleInput,
  type NewsLetterCategory,
  type NewsLetterNeighbour,
  type NewsLetterPage,
  type NewsLetterToc,
  type NewsLetterTocGroup,
  type NewsLetterTocItem,
} from '@/lib/news-letter/types';

/**
 * "Bản tin" (owner 2026-11-06) — articles, categories, images and read marks (migration 20261119).
 *
 * Who sees what (checked here, never only in the screens):
 *   - a published article: every role listed in its visible_roles;
 *   - a draft (Published off): its author only — another SUPERADMIN neither sees nor edits it;
 *   - writing (create / edit / delete, categories, uploads): SUPERADMIN, and only on an article they can see.
 * Order: first_published_at (set the first time the article is published), newest first; a draft has none and sorts by
 * its creation date. "Bài viết trước / sau" walk the published articles the viewer may read — drafts are skipped.
 * "Ẩn trên menu" (2026-11-10): the article still opens by its id, but only SUPERADMIN finds it in the contents, the
 * neighbours and the default page; it never raises the unread dot nor goes out over MCP. "Ghim bài viết": listed apart at
 * the top of the contents (newest pin first) and in the ticker — it stays in "Mới nhất" and in its folder.
 */

export interface NewsLetterViewer {
  id: number;
  role: UserRole;
  /** "View as" mode: the page is read without marking it read or counting a view. */
  readOnly?: boolean;
}

export class NewsLetterError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.status = status;
  }
}

export function canWriteNewsLetter(viewer: NewsLetterViewer): boolean {
  return viewer.role === 'SUPERADMIN';
}

/** SQL: the viewer ($1 = user id, $2 = role) may read article `a`. */
const VISIBLE = `((a.is_published AND $2::text = ANY(a.visible_roles)) OR a.created_by = $1::int)`;
// `$1::int IS NOT NULL` only gives $1 a type when a query uses this clause alone (the viewer id is always set).
const PUBLISHED_VISIBLE = `(a.is_published AND $2::text = ANY(a.visible_roles) AND $1::int IS NOT NULL)`;
const ORDER_KEY = 'COALESCE(a.first_published_at, a.created_at)';
/** SQL: article `a` may be listed for the viewer ($2 = role) — "Ẩn trên menu" ones for SUPERADMIN only. */
const MENU_VISIBLE = `(NOT a.hidden_from_menu OR $2::text = 'SUPERADMIN')`;
const AUTHOR_NAME = `COALESCE(SPLIT_PART(LOWER(u.email), '@', 1), '')`;

const TOC_COLUMNS = `a.id, a.title, a.created_at::text AS "createdAt", ${AUTHOR_NAME} AS "authorName", NOT a.is_published AS "isDraft",
  a.is_pinned AS "isPinned", a.hidden_from_menu AS "hiddenFromMenu"`;

// ---- Table of contents -------------------------------------------------------------------------------------------

export async function listNewsLetterTocItems(viewer: NewsLetterViewer, options: { categoryId?: number | null; offset: number; limit: number }): Promise<NewsLetterTocItem[]> {
  const params: unknown[] = [viewer.id, viewer.role, Math.max(0, options.offset), Math.min(50, Math.max(1, options.limit))];
  let categoryClause = '';
  if (options.categoryId !== undefined) {
    if (options.categoryId === null) categoryClause = ' AND a.category_id IS NULL';
    else {
      params.push(options.categoryId);
      categoryClause = ` AND a.category_id = $${params.length}`;
    }
  }
  const result = await pool.query<NewsLetterTocItem>(`
    SELECT ${TOC_COLUMNS}
    FROM news_letter_articles a LEFT JOIN users u ON u.id = a.created_by
    WHERE ${VISIBLE} AND ${MENU_VISIBLE}${categoryClause}
    ORDER BY ${ORDER_KEY} DESC, a.id DESC
    OFFSET $3 LIMIT $4
  `, params);
  return result.rows;
}

/** "Mới nhất" (10) + one group per category the viewer has articles in (5 each, A→Z, "Chưa phân loại" last). */
export async function getNewsLetterToc(viewer: NewsLetterViewer): Promise<NewsLetterToc> {
  const [pinned, latest, counts] = await Promise.all([
    pool.query<NewsLetterTocItem>(`
      SELECT ${TOC_COLUMNS}
      FROM news_letter_articles a LEFT JOIN users u ON u.id = a.created_by
      WHERE ${VISIBLE} AND ${MENU_VISIBLE} AND a.is_pinned
      ORDER BY a.pinned_at DESC NULLS LAST, ${ORDER_KEY} DESC, a.id DESC
      LIMIT ${NEWS_LETTER_PINNED_MAX}
    `, [viewer.id, viewer.role]).then((result) => result.rows),
    listNewsLetterTocItems(viewer, { offset: 0, limit: NEWS_LETTER_LATEST_PAGE }),
    pool.query<{ categoryId: number | null; name: string | null; total: number }>(`
      SELECT a.category_id AS "categoryId", c.name, COUNT(*)::int AS total
      FROM news_letter_articles a LEFT JOIN news_letter_categories c ON c.id = a.category_id
      WHERE ${VISIBLE} AND ${MENU_VISIBLE}
      GROUP BY a.category_id, c.name
    `, [viewer.id, viewer.role]),
  ]);
  const groupRows = [...counts.rows].sort((a, b) => (a.categoryId === null ? 1 : b.categoryId === null ? -1 : (a.name ?? '').localeCompare(b.name ?? '', 'vi')));
  // One request per group, sequential: hosted connection caps are low (see db.ts) and there are only a few groups.
  const groups: NewsLetterTocGroup[] = [];
  for (const row of groupRows) {
    groups.push({
      categoryId: row.categoryId,
      name: row.name ?? 'Chưa phân loại',
      total: row.total,
      items: await listNewsLetterTocItems(viewer, { categoryId: row.categoryId, offset: 0, limit: NEWS_LETTER_GROUP_PAGE }),
    });
  }
  const latestTotal = counts.rows.reduce((sum, row) => sum + row.total, 0);
  return { pinned, latest, latestTotal, groups };
}

// ---- Reading ---------------------------------------------------------------------------------------------------

interface ArticleRow extends Omit<NewsLetterArticle, 'edits'> {
  orderKey: string;
}

async function loadArticle(viewer: NewsLetterViewer, articleId: number | null): Promise<ArticleRow | null> {
  const params: unknown[] = [viewer.id, viewer.role];
  // No id: the newest published article the viewer may read (a draft — or an article hidden from the menu, for anyone but
  // SUPERADMIN — never opens by itself). An id opens even a hidden one: that is what its shared link is for.
  const where = articleId === null ? `${PUBLISHED_VISIBLE} AND ${MENU_VISIBLE}` : `${VISIBLE} AND a.id = $3`;
  if (articleId !== null) params.push(articleId);
  const result = await pool.query<ArticleRow>(`
    SELECT a.id, a.title, a.summary, a.category_id AS "categoryId", c.name AS "categoryName", a.visible_roles AS "visibleRoles",
      a.is_published AS "isPublished", a.hidden_from_menu AS "hiddenFromMenu", a.is_pinned AS "isPinned", a.first_published_at::text AS "firstPublishedAt", a.header_image_id::text AS "headerImageId",
      a.content_html AS "contentHtml", a.created_at::text AS "createdAt", a.created_by AS "authorId", ${AUTHOR_NAME} AS "authorName",
      a.view_count AS "viewCount", ${ORDER_KEY}::text AS "orderKey"
    FROM news_letter_articles a
    LEFT JOIN news_letter_categories c ON c.id = a.category_id
    LEFT JOIN users u ON u.id = a.created_by
    WHERE ${where}
    ORDER BY ${ORDER_KEY} DESC, a.id DESC
    LIMIT 1
  `, params);
  return result.rows[0] ?? null;
}

/** "Bài viết trước / sau" in ONE query: previous = published earlier (older), next = published later (newer). */
async function neighbours(viewer: NewsLetterViewer, article: ArticleRow): Promise<{ previous: NewsLetterNeighbour | null; next: NewsLetterNeighbour | null }> {
  const side = (direction: 'previous' | 'next') => {
    const older = direction === 'previous';
    const comparison = older
      ? `(${ORDER_KEY} < $3::timestamptz OR (${ORDER_KEY} = $3::timestamptz AND a.id < $4))`
      : `(${ORDER_KEY} > $3::timestamptz OR (${ORDER_KEY} = $3::timestamptz AND a.id > $4))`;
    return `(SELECT '${direction}' AS side, a.id, a.title FROM news_letter_articles a
      WHERE ${PUBLISHED_VISIBLE} AND ${MENU_VISIBLE} AND a.id <> $4 AND ${comparison}
      ORDER BY ${ORDER_KEY} ${older ? 'DESC' : 'ASC'}, a.id ${older ? 'DESC' : 'ASC'} LIMIT 1)`;
  };
  const result = await pool.query<NewsLetterNeighbour & { side: 'previous' | 'next' }>(
    `${side('previous')} UNION ALL ${side('next')}`,
    [viewer.id, viewer.role, article.orderKey, article.id],
  );
  const pick = (direction: 'previous' | 'next'): NewsLetterNeighbour | null => {
    const row = result.rows.find((item) => item.side === direction);
    return row ? { id: row.id, title: row.title } : null;
  };
  return { previous: pick('previous'), next: pick('next') };
}

/** Existence + visibility check that does not pull content_html (up to 500 KB). */
async function canSeeArticle(viewer: NewsLetterViewer, articleId: number): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM news_letter_articles a WHERE ' + VISIBLE + ' AND a.id = $3', [viewer.id, viewer.role, articleId]);
  return (result.rowCount ?? 0) > 0;
}

async function loadEdits(articleId: number): Promise<NewsLetterArticle['edits']> {
  const result = await pool.query<{ editedAt: string; editorName: string }>(`
    SELECT e.edited_at::text AS "editedAt", ${AUTHOR_NAME} AS "editorName"
    FROM news_letter_article_edits e LEFT JOIN users u ON u.id = e.edited_by
    WHERE e.article_id = $1 ORDER BY e.edited_at DESC, e.id DESC LIMIT 5
  `, [articleId]);
  return result.rows;
}

/** The reading page: the article (the newest published one without an id) + its neighbours. Opening a published article
 * of someone else marks it read (red dot on the menu). */
export async function getNewsLetterPage(viewer: NewsLetterViewer, articleId: number | null): Promise<NewsLetterPage> {
  const row = await loadArticle(viewer, articleId);
  if (articleId !== null && !row) throw new NewsLetterError('Không tìm thấy bài viết, hoặc bạn không có quyền xem bài viết này.', 404);
  if (!row) return { article: null, previous: null, next: null, canPost: canWriteNewsLetter(viewer) };
  const { previous, next } = await neighbours(viewer, row);
  const edits = await loadEdits(row.id);
  let viewCount = row.viewCount;
  if (row.isPublished && row.authorId !== viewer.id && !viewer.readOnly) {
    // One round trip: mark it read (red dot) and count the opening.
    const counted = await pool.query<{ viewCount: number }>(`
      WITH marked AS (INSERT INTO news_letter_reads (user_id, article_id) VALUES ($1, $2) ON CONFLICT DO NOTHING)
      UPDATE news_letter_articles SET view_count = view_count + 1 WHERE id = $2 RETURNING view_count AS "viewCount"
    `, [viewer.id, row.id]);
    viewCount = counted.rows[0]?.viewCount ?? viewCount + 1;
  }
  const { orderKey: _orderKey, ...rowArticle } = row;
  const article = { ...rowArticle, viewCount };
  void _orderKey;
  // Sanitized again on the way out — the stored HTML is already clean, this only guards against a row written by hand.
  const allowed = new Set(newsLetterImageIdsOf(article.contentHtml));
  return {
    article: { ...article, contentHtml: sanitizeRichHtml(article.contentHtml, { headings: true, allowImageId: (id) => allowed.has(id) }), edits },
    previous,
    next,
    canPost: canWriteNewsLetter(viewer),
  };
}

/** Red dot on the menu entry: a published article the viewer may read, published after their account was created, by
 * someone else, that they never opened. */
export async function hasUnreadNewsLetter(viewer: NewsLetterViewer): Promise<boolean> {
  const result = await pool.query<{ unread: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM news_letter_articles a JOIN users me ON me.id = $1
      WHERE ${PUBLISHED_VISIBLE} AND NOT a.hidden_from_menu AND a.created_by IS DISTINCT FROM $1
        AND a.first_published_at > COALESCE(me.created_at, 'epoch'::timestamptz)
        AND NOT EXISTS (SELECT 1 FROM news_letter_reads r WHERE r.user_id = $1 AND r.article_id = a.id)
    ) AS unread
  `, [viewer.id, viewer.role]);
  return Boolean(result.rows[0]?.unread);
}

// ---- Editing ---------------------------------------------------------------------------------------------------

function requireWriter(viewer: NewsLetterViewer): void {
  if (!canWriteNewsLetter(viewer)) throw new NewsLetterError('Chỉ SUPERADMIN được soạn bài viết.', 403);
}

/** The article as the editor loads it (raw stored fields); the same visibility rule as reading. */
export async function getNewsLetterArticleForEdit(viewer: NewsLetterViewer, articleId: number): Promise<NewsLetterArticle> {
  requireWriter(viewer);
  const row = await loadArticle(viewer, articleId);
  if (!row) throw new NewsLetterError('Không tìm thấy bài viết, hoặc bạn không có quyền sửa bài viết này.', 404);
  const { orderKey: _orderKey, ...article } = row;
  void _orderKey;
  return { ...article, edits: await loadEdits(row.id) };
}

interface CleanInput {
  title: string;
  summary: string | null;
  categoryId: number | null;
  visibleRoles: UserRole[];
  isPublished: boolean;
  hiddenFromMenu: boolean;
  isPinned: boolean;
  headerImageId: string | null;
  contentHtml: string;
  inlineImageIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Validates the editor's input and sanitizes its HTML; images must be ones this article may use (`usableImageIds`). */
function cleanInput(input: NewsLetterArticleInput, usableImageIds: ReadonlySet<string>): CleanInput {
  const title = String(input.title ?? '').replace(/\s+/g, ' ').trim();
  if (!title) throw new NewsLetterError('Tiêu đề là bắt buộc.');
  if (title.length > NEWS_LETTER_TITLE_MAX) throw new NewsLetterError(`Tiêu đề tối đa ${NEWS_LETTER_TITLE_MAX} ký tự.`);
  const summary = String(input.summary ?? '').trim();
  if (summary.length > NEWS_LETTER_SUMMARY_MAX) throw new NewsLetterError(`Tóm tắt tối đa ${NEWS_LETTER_SUMMARY_MAX} ký tự.`);
  const rawHtml = String(input.contentHtml ?? '');
  if (rawHtml.length > NEWS_LETTER_CONTENT_MAX) throw new NewsLetterError('Nội dung bài viết quá dài.');
  const roles = [...new Set((input.visibleRoles ?? []).filter((role): role is UserRole => NEWS_LETTER_ROLES.includes(role)))];
  if (!roles.length) throw new NewsLetterError('Chọn ít nhất 1 role được xem bài viết.');
  const headerImageId = input.headerImageId && UUID.test(input.headerImageId) && usableImageIds.has(input.headerImageId) ? input.headerImageId : null;
  const contentHtml = sanitizeRichHtml(rawHtml, { headings: true, allowImageId: (id) => usableImageIds.has(id) && id !== headerImageId });
  const inlineImageIds = newsLetterImageIdsOf(contentHtml);
  if (inlineImageIds.length + (headerImageId ? 1 : 0) > NEWS_LETTER_MAX_ARTICLE_IMAGES) throw new NewsLetterError(`Mỗi bài viết có tối đa ${NEWS_LETTER_MAX_ARTICLE_IMAGES} ảnh (kể cả ảnh header).`);
  const categoryId = input.categoryId === null || input.categoryId === undefined ? null : Number(input.categoryId);
  if (categoryId !== null && !Number.isInteger(categoryId)) throw new NewsLetterError('Phân loại không hợp lệ.');
  return {
    title, summary: summary || null, categoryId, visibleRoles: roles, isPublished: Boolean(input.isPublished),
    hiddenFromMenu: Boolean(input.hiddenFromMenu), isPinned: Boolean(input.isPinned), headerImageId, contentHtml, inlineImageIds,
  };
}

type Queryable = { query: typeof pool.query };

/** Images this article may use: the author's own not-yet-saved uploads, and the images already attached to it. */
async function usableImageIds(db: Queryable, viewer: NewsLetterViewer, articleId: number | null, wanted: string[]): Promise<Set<string>> {
  const ids = wanted.filter((id) => UUID.test(id));
  if (!ids.length) return new Set();
  const result = await db.query<{ id: string }>(`
    SELECT id::text FROM news_letter_images
    WHERE id = ANY($1::uuid[]) AND ((article_id IS NULL AND created_by = $2) OR ($3::int IS NOT NULL AND article_id = $3::int))
  `, [ids, viewer.id, articleId]);
  return new Set(result.rows.map((row) => row.id));
}

async function assertCategory(db: Queryable, categoryId: number | null): Promise<void> {
  if (categoryId === null) return;
  const exists = await db.query('SELECT 1 FROM news_letter_categories WHERE id = $1', [categoryId]);
  if (!exists.rowCount) throw new NewsLetterError('Phân loại không còn tồn tại.');
}

/** Attaches the images the article uses and deletes the ones it no longer uses. */
async function syncImages(db: Queryable, viewer: NewsLetterViewer, articleId: number, clean: CleanInput): Promise<void> {
  const keep = [...clean.inlineImageIds, ...(clean.headerImageId ? [clean.headerImageId] : [])];
  if (keep.length) {
    await db.query(`UPDATE news_letter_images SET article_id = $1 WHERE id = ANY($2::uuid[]) AND (article_id IS NULL AND created_by = $3 OR article_id = $1)`, [articleId, keep, viewer.id]);
  }
  await db.query('DELETE FROM news_letter_images WHERE article_id = $1 AND NOT (id = ANY($2::uuid[]))', [articleId, keep]);
}

export async function createNewsLetterArticle(viewer: NewsLetterViewer, input: NewsLetterArticleInput): Promise<number> {
  requireWriter(viewer);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const wanted = [...newsLetterImageIdsOf(String(input.contentHtml ?? '')), ...(input.headerImageId ? [input.headerImageId] : [])];
    const clean = cleanInput(input, await usableImageIds(client, viewer, null, wanted));
    await assertCategory(client, clean.categoryId);
    const inserted = await client.query<{ id: number }>(`
      INSERT INTO news_letter_articles (title, summary, category_id, visible_roles, is_published, first_published_at, content_html, created_by, updated_by,
        hidden_from_menu, is_pinned, pinned_at)
      VALUES ($1, $2, $3, $4::text[], $5, CASE WHEN $5 THEN CURRENT_TIMESTAMP END, $6, $7, $7, $8, $9, CASE WHEN $9 THEN CURRENT_TIMESTAMP END)
      RETURNING id
    `, [clean.title, clean.summary, clean.categoryId, clean.visibleRoles, clean.isPublished, clean.contentHtml, viewer.id, clean.hiddenFromMenu, clean.isPinned]);
    const articleId = inserted.rows[0].id;
    await syncImages(client, viewer, articleId, clean);
    await client.query('UPDATE news_letter_articles SET header_image_id = $2 WHERE id = $1', [articleId, clean.headerImageId]);
    await client.query('COMMIT');
    return articleId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateNewsLetterArticle(viewer: NewsLetterViewer, articleId: number, input: NewsLetterArticleInput): Promise<void> {
  requireWriter(viewer);
  if (!(await canSeeArticle(viewer, articleId))) throw new NewsLetterError('Không tìm thấy bài viết, hoặc bạn không có quyền sửa bài viết này.', 404);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const wanted = [...newsLetterImageIdsOf(String(input.contentHtml ?? '')), ...(input.headerImageId ? [input.headerImageId] : [])];
    const clean = cleanInput(input, await usableImageIds(client, viewer, articleId, wanted));
    await assertCategory(client, clean.categoryId);
    await syncImages(client, viewer, articleId, clean);
    await client.query(`
      UPDATE news_letter_articles SET title = $2, summary = $3, category_id = $4, visible_roles = $5::text[], is_published = $6,
        first_published_at = COALESCE(first_published_at, CASE WHEN $6 THEN CURRENT_TIMESTAMP END),
        header_image_id = $7, content_html = $8, updated_by = $9, updated_at = CURRENT_TIMESTAMP,
        hidden_from_menu = $10, is_pinned = $11,
        -- A pin keeps its date while it stays pinned (the newest pin is listed first).
        pinned_at = CASE WHEN $11 THEN COALESCE(pinned_at, CURRENT_TIMESTAMP) END
      WHERE id = $1
    `, [articleId, clean.title, clean.summary, clean.categoryId, clean.visibleRoles, clean.isPublished, clean.headerImageId, clean.contentHtml, viewer.id, clean.hiddenFromMenu, clean.isPinned]);
    // "Lịch sử thay đổi": this edit, and only the 5 newest are kept.
    await client.query('INSERT INTO news_letter_article_edits (article_id, edited_by) VALUES ($1, $2)', [articleId, viewer.id]);
    await client.query(`
      DELETE FROM news_letter_article_edits WHERE article_id = $1 AND id NOT IN (
        SELECT id FROM news_letter_article_edits WHERE article_id = $1 ORDER BY edited_at DESC, id DESC LIMIT 5
      )
    `, [articleId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Deletes the article with its images, edits and read marks (ON DELETE CASCADE). */
export async function deleteNewsLetterArticle(viewer: NewsLetterViewer, articleId: number): Promise<void> {
  requireWriter(viewer);
  if (!(await canSeeArticle(viewer, articleId))) throw new NewsLetterError('Không tìm thấy bài viết, hoặc bạn không có quyền xoá bài viết này.', 404);
  await pool.query('DELETE FROM news_letter_articles WHERE id = $1', [articleId]);
}

// ---- Categories ------------------------------------------------------------------------------------------------

export async function listNewsLetterCategories(): Promise<NewsLetterCategory[]> {
  const result = await pool.query<NewsLetterCategory>(`
    SELECT c.id, c.name, COUNT(a.id)::int AS "articleCount"
    FROM news_letter_categories c LEFT JOIN news_letter_articles a ON a.category_id = c.id
    GROUP BY c.id, c.name
  `);
  return result.rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function cleanCategoryName(name: unknown): string {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new NewsLetterError('Tên phân loại là bắt buộc.');
  if (clean.length > NEWS_LETTER_CATEGORY_NAME_MAX) throw new NewsLetterError(`Tên phân loại tối đa ${NEWS_LETTER_CATEGORY_NAME_MAX} ký tự.`);
  return clean;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function createNewsLetterCategory(viewer: NewsLetterViewer, name: unknown): Promise<void> {
  requireWriter(viewer);
  try {
    await pool.query('INSERT INTO news_letter_categories (name, created_by) VALUES ($1, $2)', [cleanCategoryName(name), viewer.id]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new NewsLetterError('Đã có phân loại cùng tên.', 409);
    throw error;
  }
}

export async function renameNewsLetterCategory(viewer: NewsLetterViewer, categoryId: number, name: unknown): Promise<void> {
  requireWriter(viewer);
  try {
    const result = await pool.query('UPDATE news_letter_categories SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [categoryId, cleanCategoryName(name)]);
    if (!result.rowCount) throw new NewsLetterError('Không tìm thấy phân loại.', 404);
  } catch (error) {
    if (isUniqueViolation(error)) throw new NewsLetterError('Đã có phân loại cùng tên.', 409);
    throw error;
  }
}

/** Refused while articles use it (owner 2026-11-06) — the message says how many. */
export async function deleteNewsLetterCategory(viewer: NewsLetterViewer, categoryId: number): Promise<void> {
  requireWriter(viewer);
  const used = await pool.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM news_letter_articles WHERE category_id = $1', [categoryId]);
  const total = used.rows[0]?.total ?? 0;
  if (total > 0) throw new NewsLetterError(`Không xoá được: phân loại đang được ${total} bài viết sử dụng. Đổi phân loại của các bài viết đó trước.`, 409);
  await pool.query('DELETE FROM news_letter_categories WHERE id = $1', [categoryId]);
}

// ---- Images ----------------------------------------------------------------------------------------------------

/** Stores an uploaded image (not attached to an article until the article is saved). */
export async function uploadNewsLetterImage(viewer: NewsLetterViewer, kind: 'HEADER' | 'INLINE', bytes: Uint8Array): Promise<string> {
  requireWriter(viewer);
  if (bytes.byteLength > NEWS_LETTER_MAX_IMAGE_BYTES) throw new NewsLetterError(`Ảnh tối đa ${Math.round(NEWS_LETTER_MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  const mime = sniffImageMime(bytes);
  if (!mime) throw new NewsLetterError('Chỉ nhận ảnh PNG, JPEG, WebP hoặc GIF.');
  const id = randomUUID();
  await pool.query('INSERT INTO news_letter_images (id, kind, mime_type, byte_size, data, created_by) VALUES ($1, $2, $3, $4, $5, $6)', [id, kind, mime, bytes.byteLength, Buffer.from(bytes), viewer.id]);
  return id;
}

/** An image the viewer may see: one of an article they may read, or their own upload not saved yet. */
export async function readNewsLetterImage(viewer: NewsLetterViewer, imageId: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!UUID.test(imageId)) return null;
  const result = await pool.query<{ mime: string; data: Buffer }>(`
    SELECT i.mime_type AS mime, i.data FROM news_letter_images i
    LEFT JOIN news_letter_articles a ON a.id = i.article_id
    WHERE i.id = $3::uuid AND ((i.article_id IS NULL AND i.created_by = $1) OR (a.id IS NOT NULL AND ${VISIBLE}))
  `, [viewer.id, viewer.role, imageId]);
  return result.rows[0] ?? null;
}

/** Daily housekeeping: uploads never saved with an article, older than a day. */
export async function purgeOrphanNewsLetterImages(): Promise<number> {
  const result = await pool.query(`DELETE FROM news_letter_images WHERE article_id IS NULL AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 day'`);
  return result.rowCount ?? 0;
}

// ---- MCP (AI chatbot, owner 2026-11-08) -----------------------------------------------------------------------------

/** One published article as the MCP tools see it (rules: news-letter/mcp-rules.ts). */
export interface NewsLetterMcpRow {
  id: number;
  title: string;
  summary: string | null;
  folder: string | null;
  publishedAt: string | null;
  authorName: string;
  /** Sanitized HTML; only loaded when asked for (search with words, or one article). */
  contentHtml: string | null;
}

/**
 * Published articles the viewer's role may read, outside the folder kept from MCP — newest first, at most `limit`.
 * `articleId` narrows to one article. Drafts never come out here, not even the caller's own.
 */
export async function listNewsLetterForMcp(
  viewer: NewsLetterViewer,
  options: { articleId?: number; limit: number; withContent: boolean },
): Promise<NewsLetterMcpRow[]> {
  const params: unknown[] = [viewer.id, viewer.role, [...NEWS_LETTER_MCP_EXCLUDED_FOLDER_IDS], options.limit];
  if (options.articleId !== undefined) params.push(options.articleId);
  const result = await pool.query<NewsLetterMcpRow>(`
    SELECT a.id, a.title, a.summary, c.name AS folder, a.first_published_at::text AS "publishedAt", ${AUTHOR_NAME} AS "authorName",
      ${options.withContent ? 'a.content_html' : 'NULL::text'} AS "contentHtml"
    FROM news_letter_articles a
    LEFT JOIN news_letter_categories c ON c.id = a.category_id
    LEFT JOIN users u ON u.id = a.created_by
    WHERE ${PUBLISHED_VISIBLE} AND NOT a.hidden_from_menu AND (a.category_id IS NULL OR NOT (a.category_id = ANY($3::int[])))
      ${options.articleId !== undefined ? 'AND a.id = $5' : ''}
    ORDER BY ${ORDER_KEY} DESC, a.id DESC
    LIMIT $4
  `, params);
  return result.rows;
}

/** Folders a chatbot may filter on (the excluded one left out), with the articles the viewer may read in each. */
export async function listNewsLetterFoldersForMcp(viewer: NewsLetterViewer): Promise<{ name: string; articles: number }[]> {
  const result = await pool.query<{ id: number; name: string; articles: number }>(`
    SELECT c.id, c.name, COUNT(a.id) FILTER (WHERE ${PUBLISHED_VISIBLE} AND NOT a.hidden_from_menu)::int AS articles
    FROM news_letter_categories c LEFT JOIN news_letter_articles a ON a.category_id = c.id
    GROUP BY c.id, c.name
  `, [viewer.id, viewer.role]);
  return result.rows
    .filter((row) => !isMcpExcludedFolder(row.id))
    .map(({ name, articles }) => ({ name, articles }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
