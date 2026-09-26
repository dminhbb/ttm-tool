# Visit Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai toàn diện tính năng Visit Counter: đếm lượt đăng nhập ứng dụng, đếm lượt truy cập 4 màn hình trọng điểm (Dashboard, Quản trị Epic, Epic Report, Epic in PO), thống kê đa chiều (Domain, User, All-time, Tuần này $T-7 \to T$, Tuần trước $T-15 \to T-8$, Hôm nay, Theo giờ), giao diện trực quan trong Panel Cấu hình ứng dụng với biểu đồ trend line và biểu đồ cột kép, cập nhật Page Footer 2 dòng căn giữa, và cập nhật tài liệu sản phẩm.

**Architecture:** Lưu trữ sự kiện chi tiết dạng event log trong bảng `visit_logs` (PostgreSQL), cung cấp backend service tính toán linh hoạt các sliding windows thời gian, API routes cho tracking và thống kê, tích hợp hook tracking tự động ở client, biểu đồ SVG nhẹ không phụ thuộc thư viện ngoài, cập nhật component `SystemStatusFooter` và `AppConfigModal`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (`pg`), Tailwind CSS v4, Phosphor Icons (`@phosphor-icons/react`).

## Global Constraints
- Icons: Chỉ sử dụng `@phosphor-icons/react`.
- Multi-database: Chạy migrations cho cả `local`, `aiven`, và `supabase`.
- Version stamp: Cập nhật `version.json` dạng `"build": "yymmdd.hhmm"` khi hoàn tất.
- Daily change log: Cập nhật `daily_change_log.md` (tiếng Việt).
- Routing chuẩn hóa: Dashboard (`/dashboard-new` và `/dashboard`), Quản trị Epic (`/epic-alerts-15` và `/epic-alerts`), Epic Report (`/reports`), Epic in PO (`/epic-in-po`).
- Tuần này: Từ ngày $T-7$ đến $T$ (8 ngày). Tuần trước: Từ ngày $T-15$ đến $T-8$ (8 ngày).

---

### Task 1: Database Migration for `visit_logs`

**Files:**
- Create: `db/migrations/20260926b_create_visit_logs.sql`
- Create: `db/migrations/20260926b_create_visit_logs.down.sql`

**Interfaces:**
- Produces table `visit_logs` with columns `id`, `event_type`, `screen_key`, `user_id`, `created_at` and indexes on `(event_type, created_at)`, `(screen_key, created_at)`, `(user_id, created_at)`.

- [ ] **Step 1: Create up migration file**
  Write `db/migrations/20260926b_create_visit_logs.sql`.

- [ ] **Step 2: Create down migration file**
  Write `db/migrations/20260926b_create_visit_logs.down.sql`.

- [ ] **Step 3: Run migration across database targets**
  Run `npm run db:migrate:local`, `npm run db:migrate:aiven`, `npm run db:migrate:supabase`.

---

### Task 2: Visit Counter Service Layer

**Files:**
- Create: `src/lib/visit-counter-types.ts`
- Create: `src/lib/visit-counter-service.ts`

**Interfaces:**
- Produces:
  - `recordAppLogin(userId: number): Promise<void>`
  - `recordScreenView(userId: number | null, screenKey: ScreenKey): Promise<void>`
  - `getFooterVisitSummary(screenKey?: ScreenKey | null): Promise<FooterVisitSummary>`
  - `getDetailedVisitStats(): Promise<DetailedVisitStats>`
  - Types: `ScreenKey = 'dashboard' | 'epic_alerts' | 'epic_reports' | 'epic_in_po'`

- [ ] **Step 1: Define TypeScript interfaces in `src/lib/visit-counter-types.ts`**
  Define types for event payloads, daily trend line items, 4-screen comparisons, domain/user stats, and recent login users.

- [ ] **Step 2: Implement core service queries in `src/lib/visit-counter-service.ts`**
  Implement queries with SQL aggregations for:
  - Rolling windows: today ($T$), this week ($T-7 \to T$), previous week ($T-15 \to T-8$).
  - Screen counts by screen_key.
  - Domain and user aggregation.
  - Last 10 and last 5 login users (ordered by `created_at DESC`).

- [ ] **Step 3: Integrate `recordAppLogin` into `src/lib/auth-service.ts`**
  Call `recordAppLogin(user.id)` inside `authenticateLocal()` right after password verification and updating `last_login_at`.

---

### Task 3: API Route Handlers

**Files:**
- Create: `src/app/api/visit-counter/track/route.ts`
- Create: `src/app/api/visit-counter/footer/route.ts`
- Create: `src/app/api/visit-counter/stats/route.ts`

**Interfaces:**
- `POST /api/visit-counter/track` body: `{ screenKey: ScreenKey }`
- `GET /api/visit-counter/footer?path={pathname}` returns `{ totalVisits, weeklyVisits, screenVisits, lastLoginUsers, currentScreenKey }`
- `GET /api/visit-counter/stats` returns `DetailedVisitStats`

- [ ] **Step 1: Create `POST /api/visit-counter/track`**
  Resolve current user session (optional/nullable) and record screen view.

- [ ] **Step 2: Create `GET /api/visit-counter/footer`**
  Extract query param `path`, map path to `ScreenKey` if eligible, query footer summary and return JSON.

- [ ] **Step 3: Create `GET /api/visit-counter/stats`**
  Check user authentication, query full statistics matrix and return JSON.

---

### Task 4: Client-side Route Tracking in `AppShell`

**Files:**
- Create: `src/lib/visit-counter-client.ts`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- `resolveScreenKeyFromPathname(pathname: string): ScreenKey | null`
- Client tracking trigger fired on route transition with in-session debounce.

- [ ] **Step 1: Create route resolution utility `src/lib/visit-counter-client.ts`**
  Map `/dashboard-new` & `/dashboard` to `'dashboard'`; `/epic-alerts-15` & `/epic-alerts` to `'epic_alerts'`; `/reports` to `'epic_reports'`; `/epic-in-po` to `'epic_in_po'`.

- [ ] **Step 2: Integrate tracking effect in `AppShellInner`**
  When pathname matches a tracked screen, trigger `POST /api/visit-counter/track` (fire-and-forget, with session debounce to prevent multiple triggers in short periods).

---

### Task 5: Page Footer Updates in `SystemStatusFooter.tsx`

**Files:**
- Modify: `src/components/layout/SystemStatusFooter.tsx`

- [ ] **Step 1: Fetch footer visit summary in `SystemStatusFooter`**
  Fetch `/api/visit-counter/footer?path=${encodeURIComponent(pathname)}` alongside system status.

- [ ] **Step 2: Render Line 1**
  Render centered `text-[11px]`:
  `TTM Tool | Version {version} | Total visit: {A}. Weekly: {B}. {This screen: {C}. }Last login users: {D}.`
  - Render each user in D with hover Tooltip showing `{fullName} ({username}) - Đăng nhập: {formattedDate}`.
  - Exclude `This screen: C.` if current screen is not in the 4 tracked screens.

- [ ] **Step 3: Render Line 2**
  Render centered `text-[11px] text-gray-400` on 1 line:
  `(C) minhnd7. db: {status.dbTarget} - {status.dbStatus}`

---

### Task 6: Visit Counter Panel in `AppConfigModal`

**Files:**
- Create: `src/components/settings/VisitCounterPanel.tsx`
- Modify: `src/components/settings/AppConfigModal.tsx`

- [ ] **Step 1: Build `VisitCounterPanel.tsx`**
  - Section 1: KPI cards (Lũy kế, Tuần này, Hôm nay).
  - Section 2: SVG Trend Line Chart (truy cập ứng dụng 8 ngày từ $T-7$ đến $T$, có trục ngày, chấm tròn hover tooltip).
  - Section 3: Dual Bar Chart so sánh 4 màn hình (Cột 1: tuần trước $T-15 \to T-8$, Cột 2: tuần này $T-7 \to T$, màu sắc tương phản) + Bảng số liệu chi tiết.
  - Section 4: Bảng thống kê Domain & phân rã User (Tổng số, Tuần này, Hôm nay).
  - Section 5: Danh sách 10 user login gần nhất với hover tooltip hiển thị ngày giờ login đầy đủ.

- [ ] **Step 2: Register tab in `AppConfigModal.tsx`**
  Add `{ id: 'visit-counter', icon: ChartLineUp, label: 'Thống kê truy cập (Visit counter)', panel: <VisitCounterPanel /> }`.

---

### Task 7: Documentation Updates

**Files:**
- Modify: `public/docs/product-guide.html`
- Modify: `README.md`
- Modify: `brd/08-data-model.md`

- [ ] **Step 1: Update `public/docs/product-guide.html`**
  Add a dedicated section for Visit Counter explaining metrics, tracking rules, footer and panel usage.

- [ ] **Step 2: Update `README.md` and `brd/08-data-model.md`**
  Document the `visit_logs` table schema and feature overview.

---

### Task 8: Verification, Version Bump & Change Log

**Files:**
- Modify: `version.json`
- Modify: `daily_change_log.md`

- [ ] **Step 1: Run typecheck and build**
  Run `npm run build` or `npx tsc --noEmit` to verify zero compile/type errors.

- [ ] **Step 2: Update `version.json` with fresh build timestamp**
  Format `"build": "yymmdd.hhmm"`.

- [ ] **Step 3: Update `daily_change_log.md`**
  Add entry under `## 2026-09-26` in Vietnamese.
