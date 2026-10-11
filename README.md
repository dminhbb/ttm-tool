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

## Cơ sở dữ liệu — 2 profile song song (local + Supabase)

Ứng dụng chạy trên 2 profile Postgres: **local** (máy dev) và **Supabase** (hosted, dùng cho production
trên Vercel). Profile **Aiven đã ngừng sử dụng** từ 26/09/2026 (code `aiven` trong `src/lib/db.ts` và các
npm script `db:*:aiven` chỉ giữ để không vỡ build, không thuộc quy trình) — chọn
bằng biến `DB_CONNECTION` trong `.env.local` (xem chi tiết từng profile trong
[`.env.example`](.env.example)). Migration nằm ở [`db/migrations/`](db/migrations); mỗi khi thêm
migration mới, chạy cả 2 lệnh dưới đây để không bị lệch schema giữa các profile:

```bash
npm run db:migrate:local
npm run db:migrate:supabase
```

## Các lệnh khác

```bash
npm run build   # build production
npm run start   # chạy bản đã build
npm run lint    # ESLint
```

## Cấu trúc chính

- `src/app` — route App Router: màn hình giám sát Epic (`/ttm-dashboard-2` - TTM Dashboard 2, màn hình chính mặc định khi đăng nhập;
  `/epic-alerts-15` - Quản trị Epic, `/reports`; các màn hình cũ `/epic-alerts`, `/epic-in-po`, `/dashboard` đã gỡ và được redirect), quản trị (`/admin/*`), SSO/MCP, và API Route Handlers
  (`src/app/api`, bao gồm `/api/visit-counter/*`).
- `src/lib/scoring` — **Epic Scoring Service**: mọi rule chấm Epic (TTM-CNTT, TTM-E2E, Release, chất lượng dữ liệu,
  phạm vi, pha, TTM-Index/QA-Index) khai báo tại đây; badge khai báo một lần trong `catalog.ts`. Xem
  [`docs/superpowers/specs/2026-09-29-scoring-service-design.md`](docs/superpowers/specs/2026-09-29-scoring-service-design.md).
  Chạy `npm test` sau khi sửa rule.
- `src/lib` — business logic dùng chung (tính cảnh báo, ngày làm việc, import/aggregate dữ liệu,
  RBAC, MCP server, SSO, Visit Counter qua `visit-counter-service.ts`...), gọi trực tiếp bởi cả UI lẫn API — không có tầng service riêng.
- `db/schema.sql` + `db/migrations/*.sql` — nguồn sự thật của cấu trúc CSDL (bao gồm bảng `visit_logs` phục vụ Visit Counter).
- `brd/` — Business Requirement Document theo từng chủ đề (xem chỉ mục
  [`brd/00-ai-agent-index.md`](brd/00-ai-agent-index.md) trước khi đọc; mô hình CSDL chi tiết tại [`brd/08-data-model.md`](brd/08-data-model.md)).

## Tính năng Thống kê truy cập (Visit Counter)

Hệ thống tích hợp bộ đo lường và phân tích lượt truy cập đa chiều (lưu tại bảng CSDL `visit_logs`):
- **Sự kiện ghi nhận**: Đăng nhập ứng dụng (`APP_LOGIN` khi user login thành công) và lượt xem 3 màn hình trọng điểm (`SCREEN_VIEW` trên TTM Dashboard 2 `/ttm-dashboard-2`, Quản trị Epic `/epic-alerts-15`, Báo cáo Epic `/reports`), áp dụng cơ chế client-side debouncing 30s.
- **Chu kỳ phân tích**: Tuần này ($T-7 \to T$), Tuần trước ($T-15 \to T-8$), Hôm nay ($T$) và Tổng số (Lũy kế).
- **Phân rã đa chiều**: Thống kê theo Domain nghiệp vụ, theo từng User, theo tuần/ngày/giờ, và danh sách 10 user login gần nhất.
- **Hiển thị trên giao diện**:
  - **Chân trang chung (`SystemStatusFooter`)**: Xuất hiện cố định ở đáy mọi màn hình, dòng 1 hiển thị Tổng truy cập (A), Tuần này (B), Màn hình hiện tại (C - nếu thuộc 3 màn hình), và 5 user login gần nhất (D - hover tooltip ngày giờ login `DD/MM/YYYY HH:mm:ss`); dòng 2 hiển thị bản quyền và trạng thái kết nối DB. Ở màn hình đăng nhập (chưa có session) footer chỉ hiển thị phiên bản, bản quyền và trạng thái kết nối DB — không gọi API thống kê.
  - **Màn hình Thống kê truy cập (`/visit-stats`)**: Menu "Thống kê truy cập" ở nhóm Giám sát trên sidebar, mở cho mọi role (chức năng `visit_counter` trong Ma trận phân quyền), trực quan hoá qua 3 thẻ KPI, biểu đồ SVG trend line 7 ngày qua, biểu đồ cột kép so sánh 4 màn hình giữa 2 tuần, bảng phân rã Domain/User và danh sách 10 user login gần nhất.

Xem [`AGENTS.md`](AGENTS.md) để biết quy ước dành cho coding agent khi sửa code trong repo này
(đa CSDL, version stamp, icon standard...).
