# TTM Monitor

Công cụ giám sát rủi ro **Time to Market (TTM)** cho các Epic Jira, dùng nội bộ để theo dõi tiến độ
TTM-CNTT (Start Date → R4G Date) và TTM-E2E (Idea Approved Date → Release), cảnh báo sớm/muộn theo
trạng thái Epic, và quản lý dữ liệu nhập từ CSV export của Jira.

Ứng dụng Next.js (App Router) + PostgreSQL. Tài liệu nghiệp vụ đầy đủ nằm ở [`brd/`](brd/) (bắt đầu
từ [`brd/00-ai-agent-index.md`](brd/00-ai-agent-index.md)); tài liệu vận hành/đào tạo người dùng nằm
ở trang trong ứng dụng **Tài liệu sản phẩm** (`/docs/product`, nguồn tại
[`public/docs/product-guide.html`](public/docs/product-guide.html)).

## Bắt đầu

Cài dependency và cấu hình kết nối CSDL trước khi chạy dev server:

```bash
npm install
cp .env.example .env.local   # rồi điền DB_CONNECTION + thông tin kết nối tương ứng
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Cơ sở dữ liệu — 3 profile song song

Ứng dụng có thể chạy trên 3 profile Postgres: **local** (máy dev), **Aiven** và **Supabase** — chọn
bằng biến `DB_CONNECTION` trong `.env.local` (xem chi tiết từng profile trong
[`.env.example`](.env.example)). Migration nằm ở [`db/migrations/`](db/migrations); mỗi khi thêm
migration mới, chạy đủ 3 lệnh dưới đây để không bị lệch schema giữa các profile:

```bash
npm run db:migrate:local
npm run db:migrate:aiven
npm run db:migrate:supabase
```

## Các lệnh khác

```bash
npm run build   # build production
npm run start   # chạy bản đã build
npm run lint    # ESLint
```

## Cấu trúc chính

- `src/app` — route App Router: màn hình giám sát Epic (`/dashboard-new` - TTM Dashboard màn hình chính mặc định khi đăng nhập, `/epic-alerts-15` - Quản trị Epic,
  `/epic-in-po`, `/reports`), quản trị (`/admin/*`), SSO/MCP, và API Route Handlers
  (`src/app/api`).
- `src/lib` — business logic dùng chung (tính cảnh báo, ngày làm việc, import/aggregate dữ liệu,
  RBAC, MCP server, SSO...), gọi trực tiếp bởi cả UI lẫn API — không có tầng service riêng.
- `db/schema.sql` + `db/migrations/*.sql` — nguồn sự thật của cấu trúc CSDL.
- `brd/` — Business Requirement Document theo từng chủ đề (xem chỉ mục
  [`brd/00-ai-agent-index.md`](brd/00-ai-agent-index.md) trước khi đọc).

Xem [`AGENTS.md`](AGENTS.md) để biết quy ước dành cho coding agent khi sửa code trong repo này
(đa CSDL, version stamp, icon standard...).
