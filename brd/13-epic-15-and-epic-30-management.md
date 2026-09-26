# 13 — Quản trị Epic (rút gọn/đầy đủ), Epic in PO và Dashboard

> **Cập nhật tên màn hình:** "Quản lý Epic 30"/"Quản lý Epic 15" đã đổi tên trên UI (nhãn menu trái
> và tiêu đề trang, `src/components/layout/AppShell.tsx`) thành **"Quản trị Epic (rút gọn)"**
> (`/epic-alerts`) và **"Quản trị Epic (đầy đủ)"** (`/epic-alerts-15`). Route không đổi. Tên cũ
> "Epic 30"/"Epic 15" chỉ còn sống sót ở `feature_key` nội bộ (`epic_alerts_30`/`epic_alerts_15`)
> trong bảng `permission_features` của Ma trận phân quyền — không đổi lại DB key để tránh phá seed
> data, nhưng đừng dùng tên cũ khi nói với người dùng hoặc viết UI mới.

## Phân tách màn hình

- `/epic-alerts`: **Quản trị Epic (rút gọn)**, theo các cột Design, In Progress, Ready4Golive,
  Release. Cần role `ADMIN`/`SUPERADMIN`/`SUPERVISOR` (không mở cho `USER`).
- `/epic-alerts-15`: **Quản trị Epic (đầy đủ)**, theo các pha Design, Dev, Test, Pentest, R4Golive,
  Release. Mở cho **mọi role đã đăng nhập** kể cả `USER` (không giới hạn role).
- `/epic-in-po`: **Epic in PO** — cùng dữ liệu/logic với "đầy đủ" (dùng chung
  `getEpicAlertRowsPhased`/API `/api/epic-alerts-15`), lọc client-side chỉ còn Epic ở trạng thái
  `TO DO`/`IN PO`/`RELEASED`. Mở cho mọi role như "đầy đủ".
- `/dashboard-new`: **TTM Dashboard** — màn hình trung tâm điều hành và theo dõi chính, là màn hình mặc
  định sau khi đăng nhập cho toàn bộ user. Tích hợp 2 chỉ số toàn phòng TTM-Index (QLDA) / QA-Index (QLDA),
  chế độ Lead view (9 KPI cards, Phễu 5 giai đoạn, Ma trận Đa chiều 4 tab, 5 Section Donut Charts) và PM/SM
  view (thừa hưởng KPI và Phễu, Ma trận 2 tab, Section Donut phân loại Epic, Bảng danh sách Epic 3 tab: Chờ
  golive, Pending, Anomaly). Toàn bộ widget và biểu đồ loại bỏ các Epic Cancelled ở cả tử số lẫn mẫu số.
- `/dashboard`: **Dashboard cũ** — thống kê tổng hợp theo dự án (đã ẩn khỏi thanh điều hướng sidebar).

**Không còn "dùng chung quyền truy cập"** như nội dung cũ — "rút gọn" hạn chế role, còn "đầy đủ"/
"Epic in PO"/Dashboard mở cho mọi role.

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
riêng "Fail TTM-E2E". Xem `resolveTtmE2eRelease` (`src/lib/epic-alert-service.ts`).

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
dữ liệu, kể cả khi đã thu gọn khối "Bộ lọc nâng cao...". `/api/epic-alerts-15` và `/api/epic-alerts`
dùng chung `parseEpicAlertFiltersFromSearchParams` để đọc 4 tham số trên.
