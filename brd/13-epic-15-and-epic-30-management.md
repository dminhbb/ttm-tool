# 13 — Quản trị Epic và các màn hình Dashboard

> **Cập nhật 11/10/2026 — gỡ 3 màn hình cũ:** `/epic-alerts` ("Quản trị Epic (rút gọn)" / Epic 30),
> `/epic-in-po` ("Epic in PO") và `/dashboard` ("Dashboard cũ") không còn tồn tại. `next.config.ts`
> chuyển hướng (307): `/epic-alerts` → `/epic-alerts-15`; `/epic-in-po` →
> `/epic-alerts-15?status=To Do,IN PO,Released` (tương đương quick filter "Epics in PO");
> `/dashboard` → `/ttm-dashboard-2`. Các feature `dashboard`, `epic_alerts_30`, `epic_in_po` đã bị
> xoá khỏi Ma trận phân quyền (migration `20261011_remove_legacy_screen_permissions.sql`). Các route
> lịch sử cảnh báo của một Epic (Epic History) chuyển từ `/api/epic-alerts/[epicKey]/…` sang
> `/api/epic-alerts-15/[epicKey]/alert-history` và `…/alert-timeline`. MCP `get_dashboard_summary` giữ
> lại như tên cũ của `get_ttm_dashboard`; `/api/epic-compliance` (không có client nào gọi) đã bị gỡ.
> Các đoạn bên dưới nhắc tới "rút gọn"/"Epic in PO"/"Dashboard cũ" là lịch sử, không còn áp dụng.
>
> **Tên cũ:** "Quản lý Epic 15" đã đổi tên trên UI thành **"Quản trị Epic"** (`/epic-alerts-15`);
> `feature_key` nội bộ vẫn là `epic_alerts_15`.

## Phân tách màn hình

- `/epic-alerts-15`: **Quản trị Epic**, theo các pha Design, Dev, Test, Pentest, R4Golive, Release.
  Mở cho **mọi role đã đăng nhập** kể cả `USER` (theo phạm vi dự án/Domain/Component được phân quyền).
- `/ttm-dashboard-2`: **TTM Dashboard 2** — màn hình mặc định sau đăng nhập (xem
  `docs/ttm-dashboard-2-spec.md`).
- `/data-normalization`: **Chuẩn hoá dữ liệu** (từ 12/10/2026, menu "Giám sát" ngay dưới Quản trị Epic,
  feature `data_normalization`) — xem mục "Màn hình Chuẩn hoá dữ liệu" bên dưới.

## Cột NHẬN XÉT và cột PASS của Quản trị Epic (từ 16/10/2026)

Thay cho danh sách badge cũ (`ScoringBadges.tsx`, `DataAnomalyBadge`). Logic gom nhóm thuần ở
`src/lib/epic-comment-groups.ts` (`summarizeEpicComments`, có test), hiển thị ở
`src/components/epic-alerts/EpicCommentCell.tsx`; dùng chung quy tắc kết luận với bộ lọc "Nhận xét"
(`src/lib/epic-row-verdicts.ts`) nên ô và bộ lọc luôn khớp nhau.

- **NHẬN XÉT** là một dải 1x4 ô, thứ tự cố định `Kết quả → Xử lý → Cảnh báo → Sai lệch dữ liệu`. Mỗi ô
  hiện số mục của nhóm (0 mục = "-", không bấm được):

  | Ô | Gồm | Màu |
  |---|---|---|
  | Kết quả | Fail / Đạt TTM-CNTT (QLDA), Fail / Đạt TTM-E2E | Xanh lá; **cam, chữ trắng** khi có Fail |
  | Xử lý | Thiếu lý do Fail TTM, Thiếu phòng chịu TN chính và các khuyến nghị khác | Xanh dương |
  | Cảnh báo | Cảnh báo muộn (/sớm ở engine legacy), Sai Status, Chờ golive, Giải trình Golive, Pending lâu | Tím |
  | Sai lệch dữ liệu | Mỗi rule đang vi phạm một mục ("R1 — Thiếu Start Date"…) | Hồng nhạt; **cam, chữ trắng** khi có |

  Rê chuột vào ô có dữ liệu mở panel chi tiết ngay dưới dải (cùng màu ô); panel không tự đóng khi rời
  chuột — đóng bằng nút ×, bấm lại ô, hoặc chuyển sang ô khác. Nội dung từng mục là message của finding.
- **PASS** (bên phải NHẬN XÉT, trước TTM-CNTT): chỉ icon — `CheckCircle` xanh khi Đạt TTM-CNTT (QLDA),
  `XCircle` cam khi Fail TTM-CNTT (QLDA); để trống khi chưa có kết luận (đang triển khai, ngoài phạm vi,
  không tính được, Sai lệch dữ liệu).
- Tiêu đề cột viết hoa (`EPIC`, `NHẬN XÉT`, `STATUS`); `Release` đổi thành `DUE DATE`, `START-CNTT` thành
  `START-DATE`. Mọi ô căn trái và căn trên (trừ PASS căn giữa), bảng co theo bề rộng màn hình.

## Màn hình Chuẩn hoá dữ liệu (`/data-normalization`, từ 12/10/2026)

Danh sách Epic cần sửa dữ liệu trên Jira, mỗi rule một panel (mặc định đóng, tiêu đề luôn hiện số Epic):

1. **Thiếu lý do Fail TTM** — Epic Fail TTM-CNTT có R4G Date muộn hơn Target nhưng chưa ghi khâu fail
   (`REC_MISSING_FAIL_REASON`) hoặc chưa có phòng chịu TN chính (`REC_MISSING_RESPONSIBLE_DEPARTMENT`) —
   đúng tập Epic của widget THIẾU LÝ DO trên TTM Dashboard 2; chỉ có ở engine Scoring.
2. **R1, R3–R6, R7 (Sai Status Release), R8–R10** — theo thứ tự R, tên/giải thích lấy từ
   `scoring/catalog.ts`, phụ đề "Cách chuẩn hoá" lấy từ badge Khuyến nghị tương ứng. R8–R10 chỉ có ở engine
   Scoring; ở engine legacy R1/R5/R7 hiện đúng điều kiện legacy (`describeNormalizationPanel`). R2 "Pending
   lâu" không có panel.

Một Epic có thể nằm ở nhiều panel. Dữ liệu theo phạm vi của user và cùng bộ lọc với TTM Dashboard 2
(Domain, Dự án, Component, PM/SM, Đơn vị yêu cầu); Epic Cancelled và Epic ngoại lệ bị loại. Bảng 25
Epic/trang; chỉ panel đang mở mới tải dòng Epic (`open=`), danh sách bộ lọc chỉ gửi ở lần đầu
(`options=1`). Code: `src/lib/data-normalization.ts` (thuần), `data-normalization-service.ts`,
`/api/data-normalization`, `src/modules/ttm/application/get-data-normalization.ts`.

## Thứ tự trạng thái Epic

```text
To Do → IN PO → Design → DEV → TEST → PENTEST → R4GOLIVE → MVPDONE → Released
```

Alias tương thích dữ liệu Jira: `In Progress`/`In Dev` = DEV; `Pen Test` = PENTEST; `Ready For Golive`/`Ready4Golive` = R4GOLIVE. Pending và Cancelled không nằm trong chuỗi tuần tự.

## TTM-CNTT và rule pha Epic 15

Tổng số ngày TTM-CNTT lấy từ tiêu chí TTM-CNTT active theo loại Epic. Baseline tính theo ngày làm việc từ Start Date, bỏ cuối tuần và holiday active, theo tỷ trọng từng pha (`TTM_PHASE_PERCENTAGE`, `src/lib/ttm-phase-rules.ts`): Design 20%, Dev 30%, Test 30%, Pentest 10%, R4Golive 10% — mốc tích lũy tương ứng là 20% / 50% / 80% / 90% / 100% tổng TTM-CNTT:

| Pha | Tỷ lệ tích lũy | Baseline |
|---|---:|---|
| Design | 20% | Start Date + ⌈total × 20%⌉ ngày làm việc (làm tròn **lên**) |
| Dev | 50% | Nối tiếp từ Design, cộng thêm ⌊total × 30%⌋ ngày làm việc (làm tròn **xuống**) |
| Test | 80% | Nối tiếp từ Dev, cộng thêm ⌊total × 30%⌋ ngày làm việc (làm tròn **xuống**) |
| Pentest | 90% | Nối tiếp từ Test, cộng thêm ⌊total × 10%⌋ ngày làm việc (làm tròn **xuống**) |
| R4Golive | 100% | **Gán trực tiếp** = Start Date + (total − 1) ngày làm việc — không dùng chuỗi cộng dồn 4 pha trước, để luôn khớp tuyệt đối với Target TTM-CNTT tổng, không lệch do sai số làm tròn |

DESIGN làm tròn lên (ceiling) còn DEV/TEST/PENTEST làm tròn xuống (floor) và tính nối tiếp từ ngày
cộng dồn của pha trước — không phải `round()` đơn giản trên từng pha độc lập như cách diễn giải cũ.
Nhờ R4GOLIVE được gán trực tiếp (không cộng dồn), tổng 5 baseline luôn khớp đúng TTM-CNTT dù 4 pha
trước có làm tròn lệch bao nhiêu. Khi chưa cấu hình rule status riêng, DEV/TEST/PENTEST dùng offset cảnh báo sớm/muộn của `In Progress`.

## Cột TTM-E2E, START-E2E và Release — độc lập với Start Date

Cả 3 màn hình (rút gọn/đầy đủ/Epic in PO) đều có cột TTM-E2E (baseline + stripe thực tế) và
START-E2E, tính từ T0 (Idea Approved Date, fallback ngày tạo Epic trên Jira nếu thiếu) —
**không phụ thuộc Start Date**. Cột Release (đầy đủ/Epic in PO) cũng vậy, baseline = T0 + số ngày
làm việc TTM-E2E. Do đó các cột này vẫn hiển thị bình thường ngay cả với Epic thiếu Start Date; chỉ
nhóm cột phụ thuộc trực tiếp Start Date (TTM-CNTT, Design/In Progress/Ready4Golive hoặc
DESIGN/DEV/TEST/PENTEST/R4GOLIVE) mới hiện "Không tính được" khi đó — xem
`03-mvp1-working-days-alert-rules.md` §4.5 và §9.

Mỗi Epic còn có cảnh báo **Fail TTM-E2E** độc lập với Fail TTM-CNTT — badge riêng ở cột Nhận xét
(chỉ FAIL/NONE, không có mức Cảnh báo sớm/muộn), filter "Cảnh báo" trên cả 3 màn hình đều có option
riêng "Fail TTM-E2E". Xem rule `E2E_FAIL` (`src/lib/scoring/rules/ttm-e2e.ts`).

## Bộ lọc nâng cao (cả 3 màn hình giám sát)

Ngoài filter "Cảnh báo"/Dự án/Domain/Component ở trên cùng, khối **"Bộ lọc nâng cao..."** (thu gọn
mặc định, dưới thanh filter chính) cung cấp thêm (`src/lib/epic-alert-filter-params.ts`,
`EpicAlertFilters`):

- **Chọn lớp dữ liệu** — chip chọn 1 trong 5 lớp dữ liệu (`aggregated_at`) gần nhất, cộng dropdown
  cho các lớp cũ hơn (tối đa 365 lớp gần nhất, `availableLayerDates`). Dữ liệu tự "drill" xuống lớp
  cũ hơn kế tiếp nếu lớp đã chọn thiếu dữ liệu cho một Epic. Mặc định luôn dùng lớp mới nhất.
- **Epic tạo mới từ (Created Date ≥)** — lọc theo `createdDateFrom`.
- **Epic start date từ (Start CNTT / T1 ≥)** — lọc theo `startDateFrom`.
- **Epic golive sau (Due Date ≥)** — lọc theo `dueDateFrom`.

Mỗi ô filter đang có giá trị được viền đỏ (`has-filter`) để người dùng nhận ra ngay đang lọc thu hẹp
dữ liệu, kể cả khi đã thu gọn khối "Bộ lọc nâng cao...". `/api/epic-alerts-15` đọc 4 tham số trên
bằng `parseEpicAlertFiltersFromSearchParams` (`/api/epic-alerts` đã gỡ cùng màn hình rút gọn, 11/10/2026).
