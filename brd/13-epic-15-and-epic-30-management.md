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
- `/dashboard`: **Dashboard** — thống kê tổng hợp theo dự án (số Epic, phân bố trạng thái, số lượng
  Fail TTM-CNTT/Fail TTM-E2E/Cảnh báo sớm/muộn, tỷ lệ Đạt TTM, Epic sắp đến hạn, top Epic cần chú
  ý), tái dùng cùng pipeline `getEpicAlertRowsPhased` — không có bảng tổng hợp riêng cho Dashboard.
  Role `SUPERVISOR`/`SUPERADMIN`/`ADMIN`, hoặc `USER` có từ 4 dự án có dữ liệu Epic trở lên, phải
  chọn 1–3 dự án ở màn hình "Welcome to Dashboard" trước khi xem số liệu; `USER` có dưới 4 dự án xem
  thẳng toàn bộ dự án của mình. Xem `src/lib/dashboard-service.ts`.

**Không còn "dùng chung quyền truy cập"** như nội dung cũ — "rút gọn" hạn chế role, còn "đầy đủ"/
"Epic in PO"/Dashboard mở cho mọi role.

## Thứ tự trạng thái Epic

```text
To Do → IN PO → Design → DEV → TEST → PENTEST → R4GOLIVE → MVPDONE → Released
```

Alias tương thích dữ liệu Jira: `In Progress`/`In Dev` = DEV; `Pen Test` = PENTEST; `Ready For Golive`/`Ready4Golive` = R4GOLIVE. Pending và Cancelled không nằm trong chuỗi tuần tự.

## TTM-CNTT và rule pha Epic 15

Tổng số ngày TTM-CNTT lấy từ tiêu chí TTM-CNTT active theo loại Epic. Baseline tính theo ngày làm việc từ Start Date, bỏ cuối tuần và holiday active:

| Pha | Tỷ lệ tích lũy | Baseline |
|---|---:|---|
| Design | 20% | Start Date + round(total × 20%) |
| Dev | 50% | Start Date + round(total × 50%) |
| Test | 80% | Start Date + round(total × 80%) |
| Pentest | 90% | Start Date + round(total × 90%) |
| R4Golive | 100% | Start Date + total |

Phần ngày của mỗi pha là chênh lệch giữa hai mốc tích lũy liên tiếp, nên tổng luôn bằng đúng TTM-CNTT. Khi chưa cấu hình rule status riêng, DEV/TEST/PENTEST dùng offset cảnh báo sớm/muộn của `In Progress`.

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
