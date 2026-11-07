import { USER_ROLES, type UserRole } from '@/lib/auth-types';

/**
 * "Bản tin" (owner 2026-11-06, route /news-letter) — shapes shared by the API and the screens. Kept free of any
 * database import so the browser can use it.
 */

export const NEWS_LETTER_ROUTE = '/news-letter';
export const NEWS_LETTER_ROLES: readonly UserRole[] = USER_ROLES;

/** Limits (owner 2026-11-06, tightened after review — server memory): at most 3 images per article, header included, 1 MB each. */
export const NEWS_LETTER_MAX_ARTICLE_IMAGES = 3;
/** Upload size cap (the browser shrinks every image to ≤ 1600px and re-encodes it under this size before sending it). */
export const NEWS_LETTER_MAX_IMAGE_BYTES = 1024 * 1024;
export const NEWS_LETTER_TITLE_MAX = 300;
export const NEWS_LETTER_SUMMARY_MAX = 1000;
export const NEWS_LETTER_CONTENT_MAX = 500_000;
export const NEWS_LETTER_CATEGORY_NAME_MAX = 120;

/** "Mới nhất": the 5 newest articles (owner 2026-11-06); each folder of "Thư mục bài viết": 5, "...." loads 5 more. */
export const NEWS_LETTER_LATEST_PAGE = 5;
export const NEWS_LETTER_GROUP_PAGE = 5;

export interface NewsLetterCategory {
  id: number;
  name: string;
  articleCount: number;
}

/** One line of the table of contents. */
export interface NewsLetterTocItem {
  id: number;
  title: string;
  createdAt: string;
  authorName: string;
  isDraft: boolean;
}

export interface NewsLetterTocGroup {
  /** null = "Chưa phân loại". */
  categoryId: number | null;
  name: string;
  total: number;
  items: NewsLetterTocItem[];
}

export interface NewsLetterToc {
  latest: NewsLetterTocItem[];
  latestTotal: number;
  groups: NewsLetterTocGroup[];
}

export interface NewsLetterNeighbour {
  id: number;
  title: string;
}

export interface NewsLetterEdit {
  editedAt: string;
  editorName: string;
}

export interface NewsLetterArticle {
  id: number;
  title: string;
  summary: string | null;
  categoryId: number | null;
  categoryName: string | null;
  visibleRoles: UserRole[];
  isPublished: boolean;
  firstPublishedAt: string | null;
  headerImageId: string | null;
  /** Sanitized HTML. */
  contentHtml: string;
  createdAt: string;
  authorId: number | null;
  authorName: string;
  /** How many times the article was opened (by anyone but its author). */
  viewCount: number;
  /** Newest first, at most 5. */
  edits: NewsLetterEdit[];
}

/** Reading page: the article and its neighbours (the contents are loaded once by the layout — NewsLetterTocPayload). */
export interface NewsLetterPage {
  article: NewsLetterArticle | null;
  previous: NewsLetterNeighbour | null;
  next: NewsLetterNeighbour | null;
  /** SUPERADMIN: the pen. */
  canPost: boolean;
}

export interface NewsLetterTocPayload {
  toc: NewsLetterToc;
  /** SUPERADMIN: the POST button. */
  canPost: boolean;
}

export const NEWS_LETTER_ROLE_LABEL: Record<string, string> = { SUPERADMIN: 'Superadmin', ADMIN: 'Admin', SUPERVISOR: 'Supervisor', USER: 'User' };

/** Window events between the screens of "Bản tin" and the menu. */
export const NEWS_LETTER_CHANGED_EVENT = 'news-letter-changed';
export const NEWS_LETTER_READ_EVENT = 'news-letter-read';

/** What the editor sends. */
export interface NewsLetterArticleInput {
  title: string;
  summary: string;
  categoryId: number | null;
  visibleRoles: UserRole[];
  isPublished: boolean;
  headerImageId: string | null;
  contentHtml: string;
}

export function newsLetterImageUrl(id: string): string {
  return `/api/news-letter/images/${id}`;
}
