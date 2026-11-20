# Bản tin — `/news-letter`

Cập nhật lần cuối: 2026-11-20. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

## Mục đích

Blog nội bộ do SUPERADMIN soạn, xem được theo role (`visible_roles`). Bài viết có tiêu đề, tóm tắt, phân loại
(thư mục), ảnh header, nội dung HTML đã lọc ở server, Published (tắt = nháp, chỉ tác giả xem), "Ẩn trên menu",
"Ghim bài viết", "Tiêu đề ngắn" (từ 20/11/2026). Có mục lục cột phải (Mới nhất + Thư mục bài viết) và ticker bài ghim.
Yêu cầu: `REQ-20261120-02` (xem `docs/traceability/TRACEABILITY.md`).

## Điểm vào

| Loại | Đường dẫn |
|---|---|
| Màn hình | `src/app/news-letter/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `new/page.tsx` |
| Components | `src/components/news-letter/NewsLetterShell.tsx` (cột menu + layout), `NewsLetterReader.tsx`, `NewsLetterEditor.tsx`, `CategoryManagerModal.tsx`, `NewsLetterPinnedTicker.tsx` |
| API | `GET /api/news-letter?ref=` (reading), `POST/PUT/DELETE /api/news-letter/articles[/[id]]`, `GET /api/news-letter/toc`, `GET/POST /api/news-letter/categories`, `GET/PUT/DELETE /api/news-letter/categories/[id]`, `GET /api/news-letter/images/[id]` |
| MCP | `src/lib/news-letter/mcp-rules.ts` (chatbot đọc qua hashtag `#bantin`) |

## Luồng dữ liệu

```text
editor (NewsLetterEditor) → POST/PUT articles → service.ts (cleanInput → sanitize → uniqueSlug → INSERT/UPDATE)
→ news_letter_articles / news_letter_images / news_letter_categories
→ getNewsLetterToc / getNewsLetterPageByRef → API → NewsLetterShell (cột) + NewsLetterReader (bài)
```

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|
| "Tiêu đề ngắn" → slug (bỏ dấu VN, dấu cách → `_`, giữ hoa/thường) + tiêu đề hiển thị trên menu | `src/lib/news-letter/slug.ts` |
| Lưu/lấy `short_title`, `slug`, `expanded`; resolve URL ref (số/slug) | `src/lib/news-letter/service.ts` |
| Type dùng chung (article, toc, category, input) + `newsArticleHref` | `src/lib/news-letter/types.ts` |
| Cột menu bên phải; thư mục mở/đóng (mặc định theo `expanded`); Mới nhất chỉ title + thanh dọc; bỏ mục Ghim ở cột | `src/components/news-letter/NewsLetterShell.tsx` |
| Input "Tiêu đề ngắn"; redirect về URL slug sau lưu | `src/components/news-letter/NewsLetterEditor.tsx` |
| Checkbox Expand trong Quản trị Phân loại + popup cao hơn 50% | `src/components/news-letter/CategoryManagerModal.tsx`, `src/components/ui/Modal.tsx` (`frameClassName`) |
| Khung trắng viền xám nội dung bài + font tiêu đề nhỏ | `src/components/news-letter/NewsLetterReader.tsx` |

## Bảng DB

- Đọc: `news_letter_articles`, `news_letter_categories`, `news_letter_images`, `news_letter_reads`, `users`.
- Ghi: `news_letter_articles` (bài + `short_title`, `slug`), `news_letter_categories` (`name`, `expanded`),
  `news_letter_images`, `news_letter_article_edits`, `news_letter_reads`.
- Migration: `20261119_create_news_letter`, `20261125_news_letter_hidden_pinned`, `20261126_news_letter_short_title_expand`
  (+ `.down.sql`).

## Contract

- **URL bài viết** (từ 20/11/2026): dùng **slug** (`/news-letter/<slug>`) khi bài có `short_title`, ngược lại
  `/news-letter/<id>`. Cả hai mở được; `GET /api/news-letter?ref=` nhận ref số hoặc slug (`articleRefToId`).
  `articles/[id]` GET/PUT/DELETE cũng nhận số hoặc slug; POST trả `{ id, slug }` để editor redirect đúng URL.
- **Slug**: `newsLetterSlug(shortTitle)` — bỏ dấu tiếng Việt, `đ→d`/`Đ→D`, khoảng trắng & ký tự khác chữ/số →
  `_` (ghép chuỗi dài thành 1), giữ hoa/thường, cắt `_` thừa ở đầu/cuối. Bài không có `short_title` → slug NULL,
  unique index `uq_news_letter_articles_slug` (nhiều NULL được). Trùng slug → thêm hậu tố `_2`, `_3`…
- **Tiêu đề hiển thị trên menu**: `newsLetterDisplayTitle` = `short_title || title`.
- **Cột menu** (từ 20/11/2026): nằm **bên phải**; "Mới nhất" chỉ title, font thường, thanh dọc; thư mục mở/đóng,
  mặc định theo `categories.expanded`; bỏ mục "Ghim" ở cột (ticker phía trên bài vẫn giữ).
- **Reading** trả `NewsLetterPage { article (kèm `slug`, `shortTitle`), previous/next (kèm `slug`), canPost }`.

## Test

`src/lib/__tests__/news-letter-slug.test.ts` (slug + display title), `news-letter-mcp-rules.test.ts`. Chưa có test UI / service (đụng DB).

## Phụ thuộc chéo

- Backup dữ liệu: `db-backup-tables.ts` liệt kê các bảng `news_letter_*`.
- MCP: `mcp-rules.ts` + `mcp-server.ts` đọc bài (id, không đổi theo slug). Folder ID 2 bị loại khỏi MCP.
- Tài liệu: `docs/database-erd.md` (mục 11), `public/docs/product-guide.html` (mục 11.8), `scripts/db-schema-catalog.json`.

## Bẫy đã biết

- **`ref` là tên prop dễ đụng linter `react-hooks/refs`** — các component dùng `articleRef` thay vì `ref` để tránh
  false-positive (React coi `ref` là ref object).
- Slug sinh từ `short_title` chỉ đổi khi sửa bài (không có migration backfill); bài cũ không có `slug`.
- "Ẩn trên menu": bài vẫn mở được qua link (kể cả link slug), chỉ bị ẩn ở mục lục cho user thường.
