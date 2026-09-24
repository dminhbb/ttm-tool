# Daily Change Log

> Nhật ký thay đổi lũy kế theo ngày, dùng để phát triển liên tục trên nhiều máy/nhiều phiên làm
> việc mà không cần đọc lại toàn bộ `git log`. Mọi AI agent (Claude Code, Codex, Cursor,
> Antigravity, hoặc con người) khi hoàn thành một yêu cầu có thay đổi code/schema/config PHẢI bổ
> sung một bullet vào block của ngày hiện tại — xem hướng dẫn đầy đủ ở `AGENTS.md` § "Daily change
> log". Ngày mới nhất nằm TRÊN CÙNG; không sửa/xoá bullet của các lần chạy trước trong cùng một ngày.

## 2026-09-24

- **Thu hẹp rule "Chờ golive" + thêm 2 widget Dashboard New + sort bảng ma trận Dashboard 2 + format % 1 số thập phân**:
  - `src/lib/epic-alert-service.ts` (`resolveReleaseAxis`): "Chờ golive" nay CHỈ áp dụng khi Epic đã
    có R4G Date và hôm nay còn trong khoảng R4G Date → R4G Date + 5 ngày làm việc (trước đó áp dụng
    cho mọi Epic status ≤ R4GOLIVE bất kể có R4G Date hay không, kể cả Epic còn ở DESIGN/DEV — sai).
    Viết lại toàn bộ hàm theo luồng: chưa có R4G Date → NONE; có R4G Date → so Due Date/hôm nay với
    hạn R4G Date + 5 ngày làm việc như cũ, chỉ khác ở nhánh còn trong hạn mà chưa có Due Date (chia
    "Chờ golive" nếu status ≤ R4GOLIVE, "Cảnh báo sớm" nếu đã qua R4GOLIVE). Cập nhật tooltip ở cả 3
    màn hình (`epic-alerts`, `epic-alerts-15`, `epic-in-po`) và tài liệu (`brd/02`, `HelpPanels.tsx`).
  - `src/app/dashboard-new/page.tsx`: thêm 2 widget KPI mới ở Executive view — "Chờ golive" và
    "Giải trình Golive" (đếm `row.releaseAxisState`), deep-link sang `epic-alerts-15` qua
    `toEpicAlertsLink({ alert: 'WAITING_GOLIVE' | 'JUSTIFY_GOLIVE' })`. Mở rộng
    `EpicAlertsDeepLinkAlert` (`src/lib/epic-alerts-deep-link.ts`) để nhận 3 giá trị Trục Release.
  - `src/app/dashboard-new/page.tsx`: bảng "Ma trận Phân bổ Tiến độ Epic Đa chiều" nay sort được
    bằng cách bấm vào header (dùng lại hook `useSortableList`/`compareValues` từ
    `src/lib/use-sortable-list.ts`, cùng pattern với `admin/projects`/`admin/domains`), mặc định
    sort giảm dần theo cột TTM-CNTT (QLDA).
  - `src/lib/ttm-cntt-qa.ts`: `summarizeTtmCntt` trả thêm `pctPrecise` (tỷ lệ chưa làm tròn) bên
    cạnh `pct` (số nguyên, giữ nguyên cho bảng ma trận). 2 widget "TTM Index (QLDA)"/"TTM Index
    (QA)" ở Dashboard New nay hiển thị `pctPrecise` làm tròn 1 số thập phân, dùng dấu phẩy kiểu Việt
    Nam (`Intl.NumberFormat('vi-VN', {minimumFractionDigits:1, maximumFractionDigits:1})`) — trước
    đó hiện số nguyên làm tròn 0 chữ số thập phân.

- **Đổi rule TTM-E2E sang tính tới R4G Date (thay vì Due Date) + rule "Trục Release" mới**:
  - `src/lib/epic-alert-service.ts`: `resolveTtmE2eRelease` nay lấy R4G Date làm điểm kết thúc thực
    tế (trước đó Due Date); "Đạt TTM-E2E" (frontend) nay yêu cầu thêm status = Released. Bỏ hẳn
    `resolveTtmE2eStatusMismatch`/`ttmE2eStatusMismatch` (khái niệm "Sai Status TTM-E2E" cũ dựa trên
    Due Date) — thay bằng 2 cơ chế mới:
    1. Hàm `resolveReleaseAxis` mới (+ type `ReleaseAxisState`): badge thứ 3 ở cột Nhận xét — "Chờ
       golive" (status ≤ R4GOLIVE, chưa có Due Date), "Cảnh báo sớm" (đã qua R4GOLIVE, trong hạn R4G
       Date + 5 ngày làm việc), "Giải trình Golive" (quá hạn đó mà chưa Released đúng hạn/Due Date
       vượt hạn).
    2. Rule sai lệch dữ liệu mới **R7 `RELEASE_STATUS_MISMATCH`** (`src/lib/epic-data-anomaly.ts`,
       `EPIC_ANOMALY_RULE_INDEX`): Due Date đúng hạn (≤ R4G Date + 5 ngày làm việc) nhưng status
       chưa Released — ưu tiên hơn 2 badge Cảnh báo sớm/Giải trình Golive ở trên.
  - Hằng số dùng chung `RELEASE_DUE_GRACE_WORKING_DAYS = 5` đặt tại `src/lib/ttm-rules.ts` để 2 nơi
    trên không bao giờ lệch nhau về mốc 5 ngày làm việc.
  - `breaksTtmE2eCalculation` đổi sang kiểm tra R4G Date < T0 (trước đó kiểm tra Due Date < T0).
  - Cập nhật đồng bộ cả 3 màn hình (`epic-alerts`, `epic-alerts-15`, `epic-in-po`: badge, filter
    "Lọc Nhận xét" thêm 3 giá trị mới, dải TTM-E2E bỏ marker "Sai Status") và `reports-service.ts`
    (Bảng Đạt TTM-e2e giờ đòi status Released + R4G Date, không còn dùng Due Date).
  - Migration `20260924_add_release_status_mismatch_anomaly_rule.sql`: mở rộng CHECK constraint
    `rule_code` của `epic_data_anomaly_violations` để nhận `RELEASE_STATUS_MISMATCH`. Đã áp dụng lên
    Supabase; `local`/`aiven` chưa migrate được từ máy này (cùng lý do thiếu cấu hình như các mục
    trước) — cần chạy `npm run db:migrate:local` / `db:migrate:aiven` trên đúng máy.
  - Cập nhật tài liệu: `brd/02-ttm-concepts-and-rules.md` (mục 6, 6.1 mới, mục 9),
    `brd/03-mvp1-working-days-alert-rules.md` (§4.5 thêm R7), `HelpPanels.tsx` (đánh số lại mục 4-9,
    thêm mục 4 "Trục Release" mới).

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
