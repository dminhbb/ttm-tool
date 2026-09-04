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

> **Cập nhật — thêm 2 màn hình quản trị chưa có trong danh sách trên:**
> - **Ma trận phân quyền** (`/admin/permissions`, chỉ SUPERADMIN) — xem
>   `05-auth-rbac-user-management.md` §12c và `08-data-model.md` §14.
> - **Quản lý chung** — gồm Cấu hình Jira (`jira_settings`: `api_base_url`, `view_issue_base_url`
>   dùng để tạo link "Mở Epic trên Jira") và các cấu hình chung khác.
>
> Ngoài ra Holiday (§4) giờ có thêm bảng song song **Ngày làm bù** (`makeup_workdays`) — xem §4.2.

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

> **Cập nhật:** cột `projects.project_key` đã bị xóa (`db/migrations/20260827_drop_project_key_use_
> source_key.sql`). Không còn khái niệm "Mã hiển thị" tách biệt Source Project Key — chỉ còn MỘT
> trường **Project Key (Jira)** = `source_project_key`, có UNIQUE constraint, dùng vừa làm mã hiển
> thị vừa làm khóa join với `issues`/`project_components`.
>
> Popup thêm/sửa Dự án **không còn cho gán PM/SM** — chỉ hiển thị PM/SM hiện tại (đọc-only) kèm danh
> sách Component mà PM/SM đó được phân quyền cho dự án này (đọc từ `user_project_components`). Gán/
> đổi PM/SM cho dự án chỉ thực hiện tại màn hình Quản lý User (`/admin/users`) — xem
> `05-auth-rbac-user-management.md` §12b/§12c.

Thông tin chính (đã cập nhật, thay cho danh sách cũ bên dưới):

- Project Key (Jira) — `source_project_key`, duy nhất.
- Tên dự án.
- Domain nghiệp vụ.
- Loại hình dự án (Dự án / Team Agile / Team Triển khai).
- Time to Market (Y/N).
- PM/SM hiện tại — chỉ hiển thị, không sửa tại đây.
- Source Type (mặc định JIRA).
- Trạng thái active/inactive.

Danh sách cũ (đã lỗi thời — "Project Key" và "Source Project Key" từng là 2 trường riêng, "Lead
phụ trách"/"User được phân quyền" từng sửa được tại đây):

- Project Key.
- Tên dự án.
- Domain nghiệp vụ.
- Jira Project Key hoặc Source Project Key.
- Lead phụ trách.
- User được phân quyền.
- Source Type.
- Trạng thái active/inactive.

PM-SM được xem toàn bộ dữ liệu của các dự án được phân quyền (có thể bị thu hẹp theo Component —
xem `05-auth-rbac-user-management.md` §12b).

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

Ngoại lệ: nếu ngày đó nằm trong `makeup_workdays` đang active (xem §4.5) thì vẫn tính là ngày làm
việc — luôn thắng cả 2 điều kiện trên.

### 4.5. Ngày làm bù (`makeup_workdays`)

Bảng riêng, độc lập với `holidays`, dùng để khai báo một ngày Thứ Bảy/Chủ Nhật cụ thể là ngày làm
việc bình thường (bù cho một kỳ nghỉ dài trước/sau đó). Mỗi bản ghi: ngày làm bù (duy nhất), mô tả,
trạng thái active/inactive. Chỉ SUPERADMIN quản lý; được `working-days.ts` đọc cùng lúc với
Holiday qua `master-data-service.ts`'s `getActiveHolidaySet`.

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

### 5.4. Phạm vi vận hành MVP1

- Màn hình dùng route `/admin/status-alert-rules`; API đọc/cập nhật là `GET`/`PUT /api/status-alert-rules`.
- Design và In Progress là dữ liệu seed. Người dùng có thể thêm rule mới cho trạng thái Epic khác, với Loại Epic vẫn giới hạn Epic đơn giản hoặc Epic phức tạp; unique theo cặp Loại Epic/Trạng thái.
- API tạo/cập nhật chỉ nhận offset nguyên trong khoảng 0–3650, tên trạng thái tối đa 50 ký tự và bắt buộc `cảnh báo sớm < cảnh báo muộn < fail`.
- Khi tải màn hình Theo dõi Epic, ứng dụng nạp một lần tất cả rule active và dùng chúng để tính cảnh báo. Rule inactive làm cặp loại Epic/trạng thái tương ứng không phát sinh cảnh báo TTM-CNTT.

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
# Bổ sung MVP1 — Chọn Lead phụ trách

Lead phụ trách được chọn bằng dropdown từ danh sách user active, hiển thị họ tên và email. Không cho nhập tự do nhằm giữ nhất quán với danh sách user của hệ thống.

## Bổ sung MVP1 — Quản lý danh mục Dự án

- Danh sách dự án hỗ trợ tìm kiếm gần đúng theo Project Key hoặc tên dự án, lọc theo Domain, PM/SM và trạng thái; hiển thị 20 dự án/trang có phân trang.
- **Cập nhật:** Form tạo/sửa (popup Dự án) **không còn** trường `PM/SM` để chọn — PM/SM chỉ hiển
  thị đọc-only (xem §3 ở trên). Gán/đổi PM/SM thực hiện tại `/admin/users`.
- Có chức năng Thêm nhiều dự án từ CSV với các cột `Tên dự án`, `Loại hình dự án`, `PM-SM`, `Key`, `TTM` (chức năng import hàng loạt này vẫn cho set PM-SM lúc tạo mới, khác với popup sửa 1 dự án). `Tên dự án`, `Key` và `TTM` là bắt buộc; **Key chỉ còn dùng làm Project Key (Jira) duy nhất** (không còn khái niệm Mã hiển thị riêng). TTM chỉ nhận `Y`/`N`. Loại hình dự án hoặc PM/SM bỏ trống/không hợp lệ được lưu trống, không làm hủy import.
- Import giới hạn 500 dòng, 1 MB, kiểm tra Project Key (Jira) trùng trong file/trong CSDL và ghi toàn bộ bằng một transaction.
- Loại hình dự án là thông tin tùy chọn trong form tạo/sửa: Dự án, Team Agile hoặc Team Triển khai. CSDL chỉ chấp nhận ba giá trị này hoặc để trống.
- TTM là thông tin bắt buộc, chọn `Y` hoặc `N`, mặc định `N` khi tạo dự án; CSDL áp dụng default và CHECK constraint tương ứng.
