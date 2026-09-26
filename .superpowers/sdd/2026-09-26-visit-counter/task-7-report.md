# Task 7 Report: Product Documentation & Data Model Updates for Visit Counter

## Overview
Updated project documentation to thoroughly cover the Visit Counter feature across `public/docs/product-guide.html`, `README.md`, and `brd/08-data-model.md`.

## Changes Made

### 1. `public/docs/product-guide.html`
- **Table of Contents**:
  - Added new section block 'Theo dõi & Thống kê' and link: `18. Visit Counter — Thống kê lượt truy cập & tương tác người dùng`.
  - Renumbered Tech Stack to `19. Tech stack` and Glossary to `20. Thuật ngữ`.
- **Main Body**:
  - Added Section `18. Visit Counter — Thống kê lượt truy cập & tương tác người dùng` detailing:
    - **18.1. Cơ chế thu thập sự kiện & 4 màn hình trọng điểm**:
      - `APP_LOGIN`: Ghi nhận khi người dùng đăng nhập thành công vào hệ thống.
      - `SCREEN_VIEW`: Ghi nhận khi truy cập 4 màn hình nghiệp vụ trọng điểm:
        1. Dashboard (`/dashboard-new` hoặc alias `/dashboard`)
        2. Quản trị Epic (`/epic-alerts-15` hoặc alias `/epic-alerts`)
        3. Báo cáo Epic (`/reports`)
        4. Epic in PO (`/epic-in-po`)
      - Cơ chế chống đếm lặp Client-side Debouncing: 30 giây per screen duy trì trong `sessionStorage`.
    - **18.2. Khái niệm chu kỳ thời gian & Thống kê đa chiều**:
      - Khung thời gian trượt: Hôm nay ($T$), Tuần này ($T-7 \to T$), Tuần trước ($T-15 \to T-8$), và Tổng số (Lũy kế).
      - Phân tích đa chiều: theo Domain, theo từng User, theo thời gian (tuần, ngày, giờ), theo màn hình.
    - **18.3. Vị trí hiển thị trên giao diện người dùng**:
      - Tab "Thống kê truy cập (Visit counter)" trong modal "Cấu hình ứng dụng" (ADMIN trở lên): 3 thẻ KPI, biểu đồ SVG trend line 7 ngày qua có gradient và tooltip, biểu đồ cột kép so sánh 4 màn hình giữa 2 tuần & bảng chi tiết, bảng phân rã Domain/User hỗ trợ mở rộng/thu gọn linh hoạt, danh sách 10 user login gần nhất có tooltip ngày giờ login chi tiết GMT+7 (`DD/MM/YYYY HH:mm:ss`).
      - Page Footer chung (`SystemStatusFooter`) tại mọi màn hình:
        - Dòng 1 căn giữa (11px, slate-500): `TTM Tool | Version {version} | Total visit: {A}. Weekly: {B}. {This screen: {C}. }Last login users: {D}.`
        - Dòng 2 căn giữa (10px, gray-400): `(C) minhnd7. db: {dbTarget} - {dbStatus}`.
- **Section 5 (Data Model & ERD)**:
  - Updated total table count from 38 to 39 tables.
  - Added `visit_logs` to Section 5.1 Group 6 table (Nhóm Lịch sử, Snapshot, Audit & Nhật ký truy cập).
  - Added row 39 for `visit_logs` in Table 5.2.
- **Section 13.2 (Modal Cấu hình ứng dụng)**:
  - Added row for "Thống kê truy cập (Visit counter)" in the features table.
- **Section 20 (Thuật ngữ)**:
  - Added glossary terms: `Visit Counter`, `Tuần này ($T-7 \to T$) / Tuần trước ($T-15 \to T-8$)`, `SystemStatusFooter`.

### 2. `README.md`
- Added section `## Tính năng Thống kê truy cập (Visit Counter)` outlining event tracking, sliding timeframes, multi-dimensional analytics, footer summary, and the config modal panel.
- Updated `## Cấu trúc chính` to reference `/api/visit-counter/*`, `visit-counter-service.ts`, and `visit_logs`.

### 3. `brd/08-data-model.md`
- Updated table count to 39 entities and added `users ||--o{ visit_logs : "1-n (user_id)"` to Mermaid ERD diagram.
- Added Section `22. visit_logs (Nhật ký truy cập ứng dụng & màn hình — Visit Counter)`:
  - Schema: `id`, `event_type`, `screen_key`, `user_id`, `created_at`.
  - Indexes: `idx_visit_logs_type_created`, `idx_visit_logs_screen_created`, `idx_visit_logs_user_created`.
  - Business rules, relationships (`users` ON DELETE SET NULL), client debounce, and live aggregation logic.

## Verification & Tests
1. **HTML Markup Validation**:
   - Automated script verified tag balancing for all structural tags (`section`, `table`, `thead`, `tbody`, `tr`, `td`, `th`, `div`, `ul`, `ol`, `li`, `h2`, `h3`, `h4`, `p`, `details`, `summary`, `main`, `nav`, `header`, `footer`) -> `HTML tag balancing check passed!`.
2. **TypeScript Typecheck**:
   - `npx tsc --noEmit` passed with 0 errors.
3. **Next.js Production Build**:
   - `npm run build` completed successfully, all 87 routes compiled and generated without any error.
4. **Housekeeping**:
   - Generated version stamp in `version.json`: `"build": "260926.2155"`.
   - Updated `daily_change_log.md` with entry under `## 2026-09-26`.

## Status
- **Status**: DONE
- **Summary**: Comprehensive documentation updates across `product-guide.html`, `README.md`, and `brd/08-data-model.md` completed and verified with successful Next.js build.
- **Commits**: none
- **Tests**: Tag balance check passed, `npx tsc --noEmit` passed, `npm run build` passed (87/87 routes).
- **Concerns**: none
