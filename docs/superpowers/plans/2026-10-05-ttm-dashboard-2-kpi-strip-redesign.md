# TTM Dashboard 2 - KPI Strip Redesign (Phương án 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tối ưu thiết kế hàng widget KPI (KpiStrip) trên màn hình TTM Dashboard 2 (`/ttm-dashboard-2`): giữ nguyên 1 hàng ngang duy nhất nhưng xóa bỏ triệt để hiện tượng xô lệch/ngắt dòng chữ vụn vặt, chuyển 3 đồng hồ tròn (`IndexRing`) sang layout dọc cân đối, chuẩn hóa cấu trúc key-value cho các subtext chi tiết, và tăng độ tương phản của theme (nền slate chống chói mắt, viền border rõ nét, top-accent color).

**Architecture:** Cập nhật trực tiếp component `KpiStrip` và `IndexRing` trong `src/components/ttm-dashboard-2/DashboardInsights.tsx`, chuẩn hóa styling Tailwind CSS v4, đảm bảo responsive mượt mà từ màn hình laptop 1366px đến màn hình 2K/4K ở zoom 100%.

**Tech Stack:** React 19, Next.js 16 (App Router), Tailwind CSS v4, TypeScript.

## Global Constraints
- Bố cục: Giữ nguyên 1 hàng ngang duy nhất cho 9 thẻ KPI.
- Tuyệt đối không để text bị xô lệch, chữ bị rơi rớt kiểu "Trừ Cancelled=\n 342" hoặc chữ label bị ngắt vụn 4-5 dòng trong IndexRing.
- Typography: Xuống dòng dứt khoát theo cụm ngữ nghĩa trọn vẹn, sử dụng `whitespace-nowrap` cho các từ khóa chuyên môn (`TTM-CNTT`, `(QLDA)`, `(QA)`, `TTM-E2E`).
- Tương phản & Chống chói: Dùng background card có chiều sâu (nền trắng ngà/slate trên nền container xám dịu `bg-slate-100/70`, viền `border-slate-300/90`), thay thế các nền pastel nhạt nhòa chói mắt bằng dải màu viền đầu thẻ (`border-t-[3px]`) tinh tế.
- Icons: Chỉ sử dụng `@phosphor-icons/react` nếu cần.
- Tuân thủ quy định `AGENTS.md`: Cập nhật `version.json` và `daily_change_log.md`.

---

### Task 1: Tối ưu Component `IndexRing` sang Layout Dọc & Compact

**Files:**
- Modify: `src/components/ttm-dashboard-2/DashboardInsights.tsx`

**Interfaces:**
- `IndexRing({ color, label, onClick, subtitle, summary, title, value }: { ... })`

- [ ] **Step 1: Cấu trúc lại JSX của `IndexRing`**
  - Chuyển container từ layout ngang sang layout dọc `flex flex-col items-center justify-between text-center p-2.5 sm:p-3`.
  - Vòng tròn ring thu nhỏ nhẹ từ `size-14` (56px) xuống `size-12` (48px), vòng tròn trong `size-9` (36px), font text `text-xs font-black`.
  - Chuẩn hóa hiển thị nhãn:
    - Nếu label chứa ngoặc đơn (ví dụ `TTM-CNTT (QLDA)`), tách thành 2 dòng dứt khoát:
      - Dòng 1: `TTM-CNTT` (`text-[11px] font-bold text-slate-800 whitespace-nowrap`)
      - Dòng 2: `(QLDA)` hoặc `(QA)` (`text-[10px] font-semibold text-slate-600 whitespace-nowrap`)
    - Nếu label là `Hoàn thành TTM-E2E`, tách thành `TTM-E2E` và `(Hoàn thành)`.
  - Subtitle: `{fmt(qlda.pass)}/{fmt(qlda.denominator)}` hiển thị rõ ràng dưới vòng tròn với font `text-[10px] font-semibold text-slate-500`.
  - Thêm viền `border-t-[3px]` đồng bộ với màu `color` của ring (`#0866ff`, `#7c3aed`, `#059669`).

---

### Task 2: Chuẩn hóa Typography & Chống rớt dòng cho các Thẻ KPI còn lại trong `KpiStrip`

**Files:**
- Modify: `src/components/ttm-dashboard-2/DashboardInsights.tsx`

- [ ] **Step 1: Cấu trúc lại Thẻ `Tổng số Epic`**
  - Đổi nền sang `bg-white border border-slate-300 border-t-[3px] border-t-slate-700 shadow-xs`.
  - Chuyển 3 dòng trừ Epic thành layout 2 cột `flex items-center justify-between text-[10px] text-slate-600 py-0.5`:
    - `Trừ Cancelled` : `{fmt(cancelled)}`
    - `Trừ Ngoại lệ` : `{fmt(blackListed)}`
    - `Trừ TTM=N` : `{fmt(nonTtmProject)}`
  - Đảm bảo số luôn căn phải, nhãn căn trái, không bao giờ ngắt số xuống hàng.

- [ ] **Step 2: Cấu trúc lại Thẻ `Fail TTM-CNTT (QLDA)`**
  - Đổi nền sang `bg-white border border-rose-300 border-t-[3px] border-t-rose-600 shadow-xs`.
  - Tiêu đề hiển thị dứt khoát: dòng 1 `FAIL TTM-CNTT`, dòng 2 `(QLDA)`.
  - Dòng phụ: `Mẫu số: {fmt(qlda.denominator)} Epic` (hoặc `/ Đánh giá: {fmt(qlda.denominator)}`) gọn gàng trên 1 dòng.

- [ ] **Step 3: Cấu trúc lại Thẻ `Chậm tiến độ / Cảnh báo` & `Sai lệch dữ liệu`**
  - Thẻ Chậm tiến độ: Nền `bg-white border border-amber-300 border-t-[3px] border-t-amber-500 shadow-xs`.
    - Dòng phụ: `{fmt(insights.lateWarning)} muộn · {fmt(insights.earlyWarning)} sớm` (dùng `whitespace-nowrap`).
  - Thẻ Sai lệch dữ liệu: Nền `bg-white border border-purple-300 border-t-[3px] border-t-purple-600 shadow-xs`.
    - Dòng phụ: `Vi phạm rule CLDL` (rút gọn dứt khoát thay vì đoạn text dài).

- [ ] **Step 4: Cấu trúc lại Thẻ `Chờ Golive` & `Giải trình Golive`**
  - Thẻ Chờ Golive: Nền `bg-white border border-sky-300 border-t-[3px] border-t-sky-500 shadow-xs`.
    - Chuyển 3 chỉ số con thành layout 2 cột tương tự thẻ Tổng số:
      - `Thiếu R4G` : `{fmt(waiting.missingR4g)}`
      - `Trong hạn` : `{fmt(waiting.withinGrace)}`
      - `Quá hạn` : `{fmt(waiting.overdue)}` (nếu > 0 thì highlight màu đỏ).
  - Thẻ Giải trình Golive: Nền `bg-white border border-red-300 border-t-[3px] border-t-red-600 shadow-xs`.
    - Dòng phụ: `Quá hạn R4G + 5 ngày` trên 1 dòng.

---

### Task 3: Bọc Khung Container & Nâng cao Độ tương phản Toàn Hàng Widget

**Files:**
- Modify: `src/components/ttm-dashboard-2/DashboardInsights.tsx`

- [ ] **Step 1: Cập nhật Wrapper của `KpiStrip`**
  - Bọc toàn bộ hàng KpiStrip trong container có chiều sâu nhẹ:
    `<div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-xs">`
  - Giữ divider ngăn cách giữa Cụm 5 thẻ chiến lược và Cụm 4 thẻ tác nghiệp:
    `<div className="hidden w-px shrink-0 bg-slate-300 lg:block my-1" aria-hidden="true" />`
  - Đảm bảo các thẻ con bên trong có cùng chiều cao (`items-stretch`).

---

### Task 4: Kiểm thử, Xác thực & Cập nhật Version Stamp

**Files:**
- Run: `npm run lint` hoặc `npm run build`
- Modify: `version.json`
- Modify: `daily_change_log.md`

- [ ] **Step 1: Chạy build / lint kiểm tra syntax & type check**
- [ ] **Step 2: Cập nhật `version.json` với build stamp mới nhất theo chuẩn `yymmdd.hhmm`**
- [ ] **Step 3: Ghi nhận nhật ký vào `daily_change_log.md` (tiếng Việt)**
