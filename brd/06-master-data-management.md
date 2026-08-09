# 06 — Master Data Management

## 1. Menu Quản trị hệ thống

Các màn hình quản trị được gom dưới menu cha:

```text
Quản trị hệ thống
├── User Management
├── Domain
├── Dự án
├── Holiday
├── Status Mapping / Status Alert Rules
├── Nguồn dữ liệu
└── Cấu hình TTM
```

## 2. Danh mục Domain nghiệp vụ

Màn hình Domain cho phép CRUD domain nghiệp vụ.

Thông tin chính:

- Domain Code.
- Tên Domain.
- Mô tả.
- Lead phụ trách.
- User thuộc Domain.
- Trạng thái active/inactive.

Lead thuộc domain sẽ được xem toàn bộ dự án thuộc domain đó.

## 3. Danh mục Dự án

Màn hình Dự án cho phép CRUD dự án và mapping dự án với domain nghiệp vụ.

Thông tin chính:

- Project Key.
- Tên dự án.
- Domain nghiệp vụ.
- Jira Project Key hoặc Source Project Key.
- Lead phụ trách.
- User được phân quyền.
- Source Type.
- Trạng thái active/inactive.

PM-SM được xem toàn bộ dữ liệu của các dự án được phân quyền.

## 4. Quản lý Holiday

Holiday dùng để tính ngày làm việc.

Ngày nghỉ có thể là một ngày hoặc một chuỗi nhiều ngày.

### 4.1. Form thêm/cập nhật Holiday

Form gồm:

- Tên ngày nghỉ.
- Loại ngày nghỉ.
- Toggle `Nhiều ngày`.
- Ngày bắt đầu.
- Ngày kết thúc.
- Mô tả.
- Trạng thái.

### 4.2. Quy tắc toggle nhiều ngày

Mặc định toggle `Nhiều ngày` ở trạng thái tắt.

Khi toggle tắt:

- Holiday chỉ gồm 1 ngày.
- `Ngày kết thúc` bị mờ/disabled.
- Hệ thống hiểu `Ngày kết thúc = Ngày bắt đầu`.

Khi toggle bật:

- User phải nhập `Ngày bắt đầu` và `Ngày kết thúc`.
- Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.
- Toàn bộ ngày trong khoảng đều là holiday.

### 4.3. Thay đổi so với thiết kế cũ

- Bỏ toggle `Áp dụng toàn hệ thống`.
- Bỏ nút `Import danh sách`.
- Có thể giữ nút `Copy từ năm trước` nếu cần.

### 4.4. Tác động tính ngày làm việc

Một ngày không được tính là ngày làm việc nếu:

- Là Thứ Bảy.
- Là Chủ Nhật.
- Nằm trong một holiday range đang active.

## 5. Quản lý Status Alert Rules

MVP1 chỉ cần quản lý rule cho 2 trạng thái Epic:

- Design.
- In Progress.

Màn hình không cần quản lý toàn bộ status Jira phức tạp trong MVP1.

### 5.1. Dữ liệu quản lý

Mỗi dòng rule gồm:

- Loại Epic: Epic đơn giản hoặc Epic phức tạp.
- Trạng thái Epic: Design hoặc In Progress.
- Offset cảnh báo sớm.
- Offset cảnh báo muộn.
- Offset Fail TTM-CNTT.
- Active/inactive.

Tất cả offset tính bằng ngày làm việc sau T1.

### 5.2. Dữ liệu mặc định

| Loại Epic | Trạng thái | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---|---:|---:|---:|
| Epic đơn giản | Design | T1 + 2 | T1 + 3 | T1 + 15 |
| Epic đơn giản | In Progress | T1 + 12 | T1 + 13 | T1 + 15 |
| Epic phức tạp | Design | T1 + 5 | T1 + 6 | T1 + 30 |
| Epic phức tạp | In Progress | T1 + 19 | T1 + 20 | T1 + 30 |

### 5.3. Cảnh báo cấu hình sai

Hệ thống cần cảnh báo nếu:

- Cảnh báo sớm >= Cảnh báo muộn.
- Cảnh báo muộn >= Fail TTM-CNTT.
- Fail TTM-CNTT khác target của loại Epic.
- Trùng rule cho cùng loại Epic và trạng thái.

## 6. Cấu hình TTM

Màn hình Cấu hình TTM cho phép CBQL Phòng cấu hình:

- Epic đơn giản: TTM-CNTT 15 ngày làm việc, TTM-E2E 30 ngày làm việc.
- Epic phức tạp: TTM-CNTT 30 ngày làm việc, TTM-E2E 50 ngày làm việc.
- Tỷ trọng các giai đoạn TTM-CNTT.
- Quy tắc working days, nếu cần.

## 7. Acceptance Criteria

```gherkin
Given CBQL Phòng tạo holiday với toggle Nhiều ngày tắt
When chọn Ngày bắt đầu
Then Ngày kết thúc bị disabled
And holiday chỉ áp dụng cho một ngày
```

```gherkin
Given CBQL Phòng bật toggle Nhiều ngày
When nhập Ngày bắt đầu và Ngày kết thúc
Then tất cả ngày trong khoảng được loại khỏi ngày làm việc
```

```gherkin
Given CBQL Phòng mở màn hình Status Alert Rules
Then màn hình chỉ quản lý Design và In Progress cho Epic đơn giản/phức tạp trong MVP1
```
