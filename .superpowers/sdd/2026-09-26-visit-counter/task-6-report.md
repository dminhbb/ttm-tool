# Task 6 Report: Visit Counter Panel & AppConfigModal Integration

## Overview
Built `src/components/settings/VisitCounterPanel.tsx` and integrated it into the application settings dialog `src/components/settings/AppConfigModal.tsx` as a new configuration section 'Thống kê truy cập (Visit counter)' with icon `ChartLineUp`.

## Implementation Details

### 1. File: `src/components/settings/AppConfigModal.tsx`
- Imported `ChartLineUp` from `@phosphor-icons/react` and `VisitCounterPanel` from `@/components/settings/VisitCounterPanel`.
- Added section definition to `CONFIG_SECTIONS`:
  ```tsx
  {
    id: 'visit-counter',
    icon: ChartLineUp,
    label: 'Thống kê truy cập (Visit counter)',
    panel: <VisitCounterPanel />,
  }
  ```
- Retained existing structure and sections ('holidays', 'issue-type-roles').

### 2. File: `src/components/settings/VisitCounterPanel.tsx`
- **Data Fetching & State**:
  - Fetches `GET /api/visit-counter/stats` on mount with `cache: 'no-store'`.
  - Refresh button in header with `ArrowsClockwise` icon (spinning during refresh) and last-updated time display.
  - Graceful loading skeleton screens and error alerts with retry mechanism.
- **Section a: 3 KPI Cards**:
  - Tổng số (Lũy kế): `appVisits.total`
  - Tuần này ($T-7 \to T$): `appVisits.weekly`
  - Hôm nay ($T$): `appVisits.today`
  - Rendered in a responsive 3-column grid styled with TTM theme tokens (`bg-fb-surface`, `border-fb-border`, Vietnamese numeric formatting `toLocaleString('vi-VN')`).
- **Section b: Biểu đồ dạng trend line (SVG)**:
  - Visualizes daily application logins across 1 week ($T-7$ to $T$).
  - SVG line chart (`stroke="#2563eb"`, `strokeWidth="2.5"`) with smooth gradient fill underneath (`#2563eb` linear gradient).
  - Horizontal dashed grid lines with Y-axis scale values.
  - Date labels along the X-axis.
  - Responsive HTML overlay dots with `<Tooltip side="top">` showing exact date, day label, and visit count on mouse hover.
- **Section c: Tổng số lượt truy cập màn hình (Dual Column Bar Chart + Detailed Table)**:
  - Displays statistics for the 4 key screens (`Dashboard`, `Quản trị Epic`, `Báo cáo Epic`, `Epic in PO`).
  - Dual column bar chart (CSS flex):
    - Col 1 (Tuần trước $T-15 \to T-8$): `#64748b` (slate-500).
    - Col 2 (Tuần này $T-7 \to T$): `#2563eb` (blue-600).
    - Explicit legend and value labels atop each bar.
  - Detailed Table beneath:
    - Columns: Màn hình, Hôm nay ($T$), Tuần này ($T-7 \to T$), Tuần trước ($T-15 \to T-8$), Tổng số (Lũy kế).
- **Section d: Lượt truy cập theo Domain**:
  - Displays domain-level aggregates: Số user, Hôm nay, Tuần này, Tổng số.
  - Interactive expand/collapse functionality per domain and global "Mở rộng tất cả / Thu gọn tất cả" toggle.
  - Sub-table on expand showing each user's username, full name, email, and visit counts (Hôm nay, Tuần này, Tổng số).
- **Section e: Danh sách 10 user login gần nhất**:
  - Table displaying: STT, Username, Họ và tên, Email, Thời điểm đăng nhập gần nhất.
  - Username wrapped in `<Tooltip>` showing full name and exact login timestamp formatted as `DD/MM/YYYY HH:mm:ss` (GMT+7).

## Verification & Tests
1. **TypeScript Typecheck**:
   - Command: `cmd /c npx tsc --noEmit`
   - Result: Exit code 0, 0 errors.
2. **Next.js Production Build**:
   - Command: `cmd /c npm run build`
   - Result: Exit code 0, all 87 routes compiled successfully.

## Status
- **Status**: DONE
- **Summary**: Implemented `VisitCounterPanel.tsx` with all 5 visualization sections and integrated into `AppConfigModal.tsx`; verified with clean typecheck and production build.
- **Commits**: none
- **Tests**: `npx tsc --noEmit` passed with 0 errors; `npm run build` passed with 0 errors.
- **Concerns**: none
