# Hướng dẫn thiết kế màn hình Quản lý Epic cho PM-SM/User

## 1. Mục tiêu màn hình

Màn hình **Quản lý Epic của tôi** dành cho người dùng vai trò **PM-SM / User**. Đây là màn hình vận hành hằng ngày để user xem các Epic thuộc các dự án được phân quyền, nhận biết Epic nào đang có cảnh báo TTM-CNTT, và kiểm tra các mốc dự kiến theo giai đoạn.

Thiết kế tham chiếu trong file `pm_report_unified 1.html` đang dùng một bảng báo cáo duy nhất, trong đó kết hợp thông tin TTM tổng quan, lịch dự kiến 6 giai đoạn và highlight số ngày còn lại hoặc quá hạn ngay trên từng mốc đang chạy.

## 2. Nguyên tắc nghiệp vụ cần giữ khi thiết kế

### 2.1. Phạm vi dữ liệu theo user

- PM-SM chỉ thấy các Epic thuộc **dự án được phân quyền**.
- Lead thấy toàn bộ Epic thuộc các dự án trong **domain nghiệp vụ được phân quyền**.
- CBQL Phòng thấy toàn bộ dữ liệu.
- Màn hình này là **read-only đối với Jira**. Không có hành động ghi ngược Jira.

### 2.2. Đơn vị thời gian

Toàn bộ tính toán cảnh báo và target trong MVP1 dùng **ngày làm việc**.

Ngày làm việc là ngày trong năm không tính:

- Thứ Bảy.
- Chủ Nhật.
- Các ngày Holiday được khai báo trong ứng dụng.

### 2.3. Hai loại Epic

| Loại Epic | TTM-CNTT | TTM-E2E |
|---|---:|---:|
| Epic đơn giản | 15 ngày làm việc | 30 ngày làm việc |
| Epic phức tạp | 30 ngày làm việc | 50 ngày làm việc |

### 2.4. T0 và T1

| Mốc | Ý nghĩa |
|---|---|
| T0 | Ngày duyệt ý tưởng |
| T1 | Start Date của Epic |

MVP1 ưu tiên TTM-CNTT, do đó T1 là mốc quan trọng nhất để tính cảnh báo.

## 3. Cấu trúc layout

### 3.1. Header

Header gồm:

- Tên ứng dụng: `TTM Tracking Tool`.
- Tên người dùng đăng nhập.
- Role badge: `PM-SM`, `Lead`, hoặc `CBQL Phòng`.

Với PM-SM, nên hiển thị badge `PM-SM` thay vì chỉ `PM` để thống nhất với BRD.

### 3.2. Toolbar

Toolbar nên có các bộ lọc:

1. From Date.
2. To Date.
3. Dự án của tôi.
4. Cảnh báo.
5. Loại Epic.
6. Status.
7. Ngưỡng highlight.
8. Ô tìm kiếm gần đúng theo Epic Key hoặc Epic Name.

Vì dữ liệu của ứng dụng được thu thập tích lũy hằng ngày, filter ngày nên dùng cặp:

```text
From Date → To Date
```

Không nên chỉ dùng một report date duy nhất.

### 3.3. Button đồng bộ dữ liệu

Trong file demo đang có nút `Đồng bộ Jira ngay`. Với vai trò PM-SM/User, nút này không nên hiển thị hoặc phải ở trạng thái disabled, vì user không có quyền quản trị nguồn dữ liệu.

Khuyến nghị:

- Với PM-SM: chỉ hiển thị `Dữ liệu cập nhật lần cuối`.
- Với Lead: có thể xem trạng thái đồng bộ nhưng không trigger nếu chưa được cấp quyền.
- Với CBQL Phòng: có thể có nút import/sync theo module nguồn dữ liệu.

## 4. Thiết kế bảng Epic

### 4.1. Cấu trúc cột đề xuất

Các cột nên chia thành 4 nhóm:

#### Nhóm A — Nhận diện Epic

| Cột | Mô tả |
|---|---|
| Epic | Epic Key, tên Epic, nguồn dữ liệu |
| Project | Dự án hoặc project key |
| Domain | Domain nghiệp vụ |
| Owner/PM-SM | Người phụ trách |
| Loại Epic | Epic đơn giản hoặc Epic phức tạp |

#### Nhóm B — Mốc TTM

| Cột | Mô tả |
|---|---|
| T0 | Ngày duyệt ý tưởng |
| T1 | Start Date |
| Target R4G | Target TTM-CNTT |
| R4G Date | Ngày Ready for Golive nhập tay nếu có |

#### Nhóm C — Cảnh báo

| Cột | Mô tả |
|---|---|
| Cảnh báo | Trống, Cảnh báo sớm, Cảnh báo muộn, Fail TTM-CNTT |
| TTM-CNTT | Tiến độ theo ngày làm việc |
| Còn lại / Quá hạn | Số ngày làm việc còn lại hoặc quá hạn |
| Missing Standard Info | Các thiếu sót dữ liệu tiêu chuẩn |

#### Nhóm D — Mốc giai đoạn

| Cột | Mô tả |
|---|---|
| Design | Mốc cảnh báo giai đoạn Design |
| In Progress | Mốc cảnh báo giai đoạn In Progress |
| R4G | Mốc target Ready for Golive |
| Release | Mốc Due Date / Released cho phân tích E2E sau này |

MVP1 chỉ cần rule cảnh báo chính cho `Design` và `In Progress`. Các cột BA/Dev/SIT/UAT/Pentest trong file demo có thể giữ như thông tin tham khảo nếu dữ liệu nguồn đã có, nhưng không nên làm chúng trở thành rule chính của MVP1.

### 4.2. Cột Cảnh báo

Cột `Cảnh báo` có các giá trị:

| Giá trị | Hiển thị |
|---|---|
| Không cảnh báo | Ô trống hoặc `—` màu muted |
| Cảnh báo sớm | Badge vàng nhạt |
| Cảnh báo muộn | Badge cam |
| Fail TTM-CNTT | Badge đỏ |

Không nên dùng chung các nhãn cũ như `ON_TRACK`, `AT_RISK`, `DELAYED` cho rule MVP1 nếu backend đã chuẩn hóa sang `EARLY_WARNING`, `LATE_WARNING`, `FAIL_TTM_CNTT`.

## 5. Rule highlight trên bảng

### 5.1. Highlight theo số ngày còn lại

| Điều kiện | Cell class | Pill class |
|---|---|---|
| Quá hạn | `hl-overdue` | `overdue` |
| Còn 1 ngày làm việc | `hl-d1` | `d1` |
| Còn 2 ngày làm việc | `hl-d2` | `d2` |
| Còn 3 ngày làm việc | `hl-d3` | `d3` |
| Đã hoàn thành | Không highlight mạnh | `done` |
| Chưa tới | Không highlight mạnh | `upcoming` |

### 5.2. Mốc cảnh báo MVP1

| Loại Epic | Status | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---|---:|---:|---:|
| Epic đơn giản | Design | T1 + 2 | T1 + 3 | T1 + 15 |
| Epic đơn giản | In Progress | T1 + 12 | T1 + 13 | T1 + 15 |
| Epic phức tạp | Design | T1 + 5 | T1 + 6 | T1 + 30 |
| Epic phức tạp | In Progress | T1 + 19 | T1 + 20 | T1 + 30 |

Tất cả các phép cộng `T1 + N` đều tính theo **ngày làm việc**.

## 6. CSS component package

Package này tách CSS thành các file:

```text
css/
├── tokens.css
├── layout.css
├── components.css
├── epic-table.css
├── responsive.css
└── ttm-epic-management.css
```

Khi dùng nhanh, chỉ cần import:

```html
<link rel="stylesheet" href="css/ttm-epic-management.css" />
```

Khi dùng trong Next.js, có thể copy nội dung `ttm-epic-management.css` vào:

```text
src/app/globals.css
```

hoặc import từng file trong CSS entrypoint của project.

## 7. Mapping component sang React/Next.js

### 7.1. Component đề xuất

```text
EpicManagementPage
├── EpicManagementHeader
├── EpicFilterToolbar
├── EpicAlertLegend
├── EpicTable
│   ├── EpicIdentityCell
│   ├── TtmMetricCell
│   ├── AlertBadge
│   ├── StageCell
│   └── MissingInfoTags
└── Pagination
```

### 7.2. Props gợi ý

```ts
export type EpicAlertLevel =
  | 'NONE'
  | 'EARLY_WARNING'
  | 'LATE_WARNING'
  | 'FAIL_TTM_CNTT';

export type EpicType = 'SIMPLE' | 'COMPLEX';

export interface EpicRowViewModel {
  epicKey: string;
  epicName: string;
  sourceType: 'CSV' | 'JIRA_API' | 'JIRA_DB';
  projectName: string;
  domainName: string;
  ownerName: string;
  epicType: EpicType;
  t0IdeaApprovedDate?: string;
  t1StartDate?: string;
  targetR4gDate?: string;
  r4gDate?: string;
  ttmCnttElapsedWorkingDays?: number;
  ttmCnttTargetWorkingDays?: number;
  remainingWorkingDays?: number;
  alertLevel: EpicAlertLevel;
  missingStandardInfo: string[];
  currentStatus: 'To Do' | 'Design' | 'In Progress' | 'Ready for Golive' | 'Released' | 'Pending' | 'Cancelled';
}
```

## 8. Accessibility và UX

- Không chỉ dựa vào màu sắc; badge phải có text rõ ràng.
- Bảng nhiều cột cần horizontal scroll.
- Header bảng nên sticky.
- Các ô cảnh báo phải có title/tooltip giải thích rule.
- Các badge `Fail TTM-CNTT` cần độ tương phản cao.
- Các ô thiếu dữ liệu nên có text cụ thể, không chỉ tô màu đỏ.
- Trên màn hình nhỏ, ưu tiên hiển thị bảng dạng scroll ngang thay vì ép cột quá hẹp.

## 9. Ghi chú triển khai cho AI Agent

Khi implement màn hình này, AI Agent phải đọc thêm các file BRD:

```text
docs/brd/00-ai-agent-index.md
docs/brd/03-mvp1-working-days-alert-rules.md
docs/brd/04-homepage-and-epic-monitoring.md
docs/brd/05-auth-rbac-user-management.md
docs/brd/07-data-source-and-csv-import.md
```

Ưu tiên rule mới nhất:

- Tất cả thời gian dùng ngày làm việc.
- Epic đơn giản/phức tạp thay cho 3 tuần/6 tuần khi hiển thị cho user.
- MVP1 chỉ cảnh báo TTM-CNTT.
- Cảnh báo MVP1 chỉ xét status `Design` và `In Progress`.
- User PM-SM chỉ xem dự án được phân quyền.
- Không hard-code text tiếng Việt trong business logic; dùng enum kỹ thuật rồi map ra label UI.
