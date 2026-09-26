# Design Specification: Visit Counter & Usage Monitoring

- **Date:** 2026-09-26
- **Status:** Approved
- **Feature:** Visit Counter (Bộ đếm truy cập ứng dụng & màn hình)

## 1. Overview & Objectives

Hệ thống bổ sung tính năng **Visit Counter** nhằm đếm và phân tích lượt tương tác của người dùng trên toàn hệ thống TTM Monitor:
1. **Lượt truy cập ứng dụng:** Đếm mỗi khi người dùng đăng nhập thành công.
2. **Lượt truy cập và sử dụng 4 màn hình trọng điểm:**
   - Dashboard: `/dashboard-new` (và fallback `/dashboard`)
   - Quản trị Epic: `/epic-alerts-15` (và fallback `/epic-alerts`)
   - Epic Report: `/reports`
   - Epic in PO: `/epic-in-po`
3. **Thống kê đa chiều:**
   - Theo Domain nghiệp vụ
   - Theo từng User
   - Lũy kế toàn thời gian (All-time total)
   - Tuần này ($T-7$ đến $T$, với $T$ là ngày hiện tại)
   - Hôm nay ($T$)
   - Theo giờ trong ngày (0h-23h)
4. **Hiển thị trực quan trong Panel "Cấu hình ứng dụng":**
   - KPI cards (Tổng số, Tuần này, Hôm nay)
   - Biểu đồ trend line (xu hướng truy cập các ngày từ $T-7$ đến $T$)
   - Bảng thống kê theo Domain (phân rã danh sách user)
   - Biểu đồ cột kép so sánh 4 màn hình giữa 2 tuần: tuần trước ($T-15 \to T-8$) và tuần này ($T-7 \to T$)
   - Danh sách 10 user login gần nhất với tooltip ngày giờ login.
5. **Hiển thị tại Page Footer toàn ứng dụng:**
   - Dòng 1: `TTM Tool | Version {version} | Total visit: A. Weekly: B. {This screen: C. }Last login users: D.` (căn giữa, font nhỏ hơn 1 cỡ, nếu ngoài 4 màn hình thì ẩn `This screen: C.`, tooltip ngày giờ login cho 5 user gần nhất).
   - Dòng 2: `(C) minhnd7. db: {dbTarget} - {dbStatus}` (căn giữa, 1 dòng, chữ mờ).
6. **Tài liệu hóa:**
   - Cập nhật `public/docs/product-guide.html`, `README.md`, `brd/08-data-model.md`.

---

## 2. Database Architecture & Migrations

### 2.1 Schema: `visit_logs`
Tạo migration `db/migrations/20260926b_create_visit_logs.sql`:
```sql
CREATE TABLE IF NOT EXISTS visit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(20) NOT NULL, -- 'APP_LOGIN' | 'SCREEN_VIEW'
    screen_key VARCHAR(50),          -- 'dashboard' | 'epic_alerts' | 'epic_reports' | 'epic_in_po' | NULL
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visit_logs_type_created ON visit_logs (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_screen_created ON visit_logs (screen_key, created_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_user_created ON visit_logs (user_id, created_at);
```
Down migration `db/migrations/20260926b_create_visit_logs.down.sql`:
```sql
DROP TABLE IF EXISTS visit_logs;
```

Áp dụng đồng bộ:
- `npm run db:migrate:local`
- `npm run db:migrate:supabase`

---

## 3. Data Processing & API Endpoints

### 3.1 Service Layer (`src/lib/visit-counter-service.ts`)
- **`recordAppLogin(userId: number): Promise<void>`**
  - Ghi sự kiện `event_type = 'APP_LOGIN'`.
- **`recordScreenView(userId: number | null, screenKey: ScreenKey): Promise<void>`**
  - Ghi sự kiện `event_type = 'SCREEN_VIEW'`.
- **`getFooterVisitSummary(screenKey?: ScreenKey | null): Promise<FooterSummary>`**
  - Tính tổng số truy cập ứng dụng ($A$).
  - Tính tổng số truy cập tuần này $T-7 \to T$ ($B$).
  - Tính tổng số truy cập màn hình hiện tại ($C$) nếu thuộc danh sách 4 màn hình.
  - Lấy danh sách 5 user login gần nhất ($D$) kèm thời điểm `last_login_at`.
- **`getDetailedVisitStats(): Promise<DetailedVisitStats>`**
  - KPI truy cập ứng dụng (Lũy kế, Tuần này $T-7 \to T$, Hôm nay).
  - Trend line data: 8 điểm ngày từ $T-7$ đến $T$.
  - 4 màn hình: Tổng số, Tuần này, Hôm nay.
  - Dual bar chart data: So sánh tuần trước ($T-15 \to T-8$) và tuần này ($T-7 \to T$) cho 4 màn hình.
  - Ma trận Domain -> Users (Tổng số, Tuần này, Hôm nay).
  - 10 user login gần nhất kèm thời điểm.

### 3.2 Route Handlers
- `POST /api/visit-counter/track`: Ghi nhận `SCREEN_VIEW`.
- `GET /api/visit-counter/footer?path={path}`: Trả về số liệu cho Footer.
- `GET /api/visit-counter/stats`: Trả về dữ liệu chi tiết cho Panel Visit counter.

---

## 4. UI Components

### 4.1 Page Footer (`src/components/layout/SystemStatusFooter.tsx`)
- Hook theo dõi pathname hiện tại và định kỳ/khi chuyển trang lấy dữ liệu footer.
- Cấu trúc 2 dòng:
  1. `TTM Tool | Version {version} | Total visit: A. Weekly: B. {This screen: C. }Last login users: D.` (căn giữa, `text-[11px]`).
  2. `(C) minhnd7. db: {target} - {status}` (căn giữa, `text-[11px] text-gray-400`).
- Tooltip hiển thị đầy đủ Họ tên và ngày giờ login cho từng user trong danh sách.

### 4.2 Tracking Hook / Component
- Tích hợp tại `AppShellInner` để tự động kích hoạt khi user điều hướng vào 1 trong 4 màn hình.
- Có session/debounce cache để tránh ghi lặp liên tục trong cùng một tab.

### 4.3 Visit Counter Panel (`src/components/settings/VisitCounterPanel.tsx`)
- Tích hợp vào `AppConfigModal` với mục menu "Thống kê truy cập (Visit counter)".
- Giao diện gồm 4 phần:
  1. Thẻ KPI ứng dụng (Lũy kế, Tuần này, Hôm nay).
  2. Biểu đồ đường Trend Line 7 ngày gần nhất ($T-7 \to T$) vẽ bằng SVG native.
  3. Bảng thống kê 4 màn hình + Biểu đồ cột kép so sánh tuần trước ($T-15 \to T-8$) và tuần này ($T-7 \to T$).
  4. Bảng thống kê theo Domain/User & Danh sách 10 User login gần nhất.

---

## 5. Documentation
- Cập nhật `public/docs/product-guide.html`.
- Cập nhật `README.md` và `brd/08-data-model.md`.
- Ghi nhận `daily_change_log.md` và cập nhật `version.json`.
