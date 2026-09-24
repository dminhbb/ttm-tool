# Daily Change Log

> Nhật ký thay đổi lũy kế theo ngày, dùng để phát triển liên tục trên nhiều máy/nhiều phiên làm
> việc mà không cần đọc lại toàn bộ `git log`. Mọi AI agent (Claude Code, Codex, Cursor,
> Antigravity, hoặc con người) khi hoàn thành một yêu cầu có thay đổi code/schema/config PHẢI bổ
> sung một bullet vào block của ngày hiện tại — xem hướng dẫn đầy đủ ở `AGENTS.md` § "Daily change
> log". Ngày mới nhất nằm TRÊN CÙNG; không sửa/xoá bullet của các lần chạy trước trong cùng một ngày.

## 2026-09-24

- **Thiết lập `daily_change_log.md`**: tạo file nhật ký lũy kế theo ngày ở repo root (khởi tạo lại
  lịch sử 2026-09-22/23 từ commit log) và bổ sung mục "Daily change log" vào `AGENTS.md` yêu cầu mọi
  AI agent tự động bổ sung bullet vào ngày hiện tại sau mỗi lần hoàn thành yêu cầu có thay đổi
  code/schema/config — để phát triển liên tục trên nhiều máy chỉ cần đọc file này thay vì `git log`.
- **Sửa lỗi phát hiện ở Dashboard 2 / TTM-CNTT-QA sau khi pull code mới**:
  - `src/lib/ttm-cntt-qa.ts`: khôi phục fallback 2 tầng cho `pct` — trước đó khi chưa có Epic nào
    tới R4G (`eligible=0`) thì luôn hiện 100% dù đã có Epic Fail TTM-CNTT trước hạn; giờ fallback về
    `(total-fail)/total` như logic Dashboard 2 gốc.
  - `dashboard-new/page.tsx` (Ma trận Phân bổ): mỗi Epic giờ luôn rơi vào đúng 1 trong 2 nhóm cột
    (Pass/Fail TTM-CNTT QLDA hoặc Đúng/Chậm tiến độ) — trước đó Epic Released nhưng thiếu R4G Date
    hoặc có sai lệch dữ liệu bị đếm vào "Tổng số Epic" nhưng không hiện ở cột nào.
  - `dashboard-new/page.tsx` (`toEpicAlertsLink`): forward thêm `searchQuery` vào deep-link sang
    `epic-alerts-15` để số liệu ở màn đích khớp đúng số trên KPI tile đã lọc theo từ khoá tìm kiếm.
  - `src/lib/csv-parser.ts`: bổ sung mapping cột `Custom field (Đơn vị yêu cầu)` cho adapter Pure
    Jira Export — trước đó chỉ adapter Py Jira API set được `requestingUnit`, import qua Pure Jira
    Export luôn ra `null` âm thầm.
  - Đã kiểm tra riêng và xác nhận là false positive (không sửa): mismatch giữa tile "Fail TTM-E2E"
    và filter `FAIL_E2E` — `ttmE2eStatusMismatch` và `ttmE2eAlertLevel==='FAIL'` loại trừ lẫn nhau
    theo `resolveTtmE2eStatusMismatch`, nên tình huống review nêu ra không thể xảy ra trong thực tế.
  - Đã chạy `db:migrate:supabase` (0 migration mới — cột `requesting_unit` đã có sẵn). `local` và
    `aiven` chưa migrate được từ máy này (thiếu cấu hình Postgres local và thiếu `db/ca.pem`) — cần
    chạy `npm run db:migrate:local` / `db:migrate:aiven` trên đúng máy đang dùng 2 profile đó.

## 2026-09-23

- **Dashboard 2 (beta)**: thêm màn `/dashboard-new` gồm 2 chế độ — Lead Command Center (Executive)
  và PM/SM Workbench (Operational), API `GET /api/dashboard-new`, quyền mới `dashboard_new`
  (migration `20260923_add_dashboard_new_permission`).
- **Pink theme**: cập nhật bảng màu theme (`src/lib/theme-brand.ts`).
- **Fix Dashboard 2**: sửa các lỗi phát hiện khi review — cột "Chi tiết vi phạm" dùng lại component
  chung `DataAnomalyList` thay vì tự check thiếu rule; sửa `isReleased` dùng AND thay vì OR; API map
  lỗi auth về đúng 401/403 thay vì luôn 500; chặn race-condition khi đổi "Xem dưới dạng User" nhanh;
  thêm phân trang cho tab "Tiến độ TTM & Danh sách Epic"; đổi tên "TTM Health Index" →
  "TTM Index (QLDA)"; đổi toggle Lead/PM-SM — chuyển sang PM/SM sẽ mở popup chọn user thay vì có nút
  riêng.
- **Đơn vị yêu cầu (Requesting Unit)**: thêm cột `requesting_unit` (migration
  `20260923_add_epic_requesting_unit`), hiển thị & filter tại `epic-alerts-15`, `epic-alerts`,
  `epic-in-po`, và trong popup Epic Browser (`EpicBrowserModal.tsx`, `getEpicBrowserSummary`).
- **Rule TTM-CNTT-QA**: thêm `src/lib/ttm-cntt-qa.ts` (tách logic tính tỷ lệ đạt TTM-CNTT dùng
  chung cho Dashboard 2), thêm deep-link giữa Dashboard 2 và `epic-alerts-15`
  (`src/lib/epic-alerts-deep-link.ts`), tái cấu trúc Ma trận Phân bổ & Phase Pipeline tại
  `dashboard-new`.

## 2026-09-22

- **Dashboard 2 (beta)** — khởi tạo lần đầu (chi tiết đã gộp vào mục 2026-09-23 ở trên vì được sửa
  tiếp ngay hôm sau).
- **Sửa lỗi import file CSV**.
- **Update rule Sai lệch dữ liệu** (cập nhật rule phát hiện dữ liệu bất thường R1-R6).
