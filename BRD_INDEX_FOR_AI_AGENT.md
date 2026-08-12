# BRD Index for AI Agent — TTM Monitor

## 1. Mục đích của file này

File này là **bản chỉ mục điều hướng BRD** dành cho AI Agent khi lập trình hệ thống **TTM Monitor**.

Do BRD chính đã dài và phát sinh nhiều lần cập nhật, AI Agent không nên đọc toàn bộ nội dung như một khối duy nhất. Thay vào đó, Agent cần dùng file này để:

1. Xác định cần đọc phần BRD nào trước khi làm một task.
2. Biết phần nào là **source of truth mới nhất** khi có nội dung cũ bị thay thế.
3. Tránh nhầm giữa các phiên bản rule cũ và rule mới.
4. Biết phạm vi MVP1 so với các phần triển khai sau.
5. Tuân thủ các nguyên tắc triển khai theo Superpowers, coding skill, pentest skill và uiux skill.

---

# 1.1. UI design source of truth

Khi thay đổi giao diện, AI Agent phải đọc `brd/09-ui-ux-prototypes.md`, `design-system-spec.md` và skill `.agents/skills/gecko-inspired-ui-skill/SKILL.md`. Gecko-inspired dark, compact, data-first design system được ưu tiên hơn visual language Facebook/frosted-glass cũ.

Thiết lập giao diện là preference phía client: mặc định `light`, lưu tại local storage key `ttm-monitor.appearance-theme`, chỉ chấp nhận `light` hoặc `dark` và áp dụng bằng `data-theme` trên phần tử `html`.

Light mode phải tách rõ canvas xanh-xám, panel trắng và elevated/control light-blue bằng border xanh-xám; primary button dùng blue tương phản, không dùng panel hoặc button trắng trơn trên canvas nhạt.

# 2. Khuyến nghị tách BRD thành các file thành phần

Nên tách BRD thành nhiều file nhỏ theo module nghiệp vụ và kỹ thuật. Lý do:

- BRD hiện đã có nhiều nhóm nội dung: TTM rule, UI, RBAC, import dữ liệu, status rule, dashboard, security.
- AI Agent dễ bị nhiễu nếu phải đọc toàn bộ BRD cho một task nhỏ.
- Một số quyết định đã thay thế nội dung cũ, ví dụ từ ngày lịch sang ngày làm việc.
- Tách file giúp dễ review, dễ versioning và dễ giao task nhỏ cho Codex.
- Mỗi MVP có thể có bộ requirement, test và acceptance criteria riêng.

Cấu trúc khuyến nghị:

```text
/docs
  /brd
    00-ai-agent-index.md
    01-product-overview.md
    02-ttm-concepts-and-rules.md
    03-mvp1-working-days-alert-rules.md
    04-homepage-and-epic-monitoring.md
    05-auth-rbac-user-management.md
    06-master-data-management.md
    07-data-source-and-csv-import.md
    08-data-model.md
    09-ui-ux-prototypes.md
    10-security-and-non-functional.md
    11-mvp-roadmap.md
  /mvp
    /mvp-01
      requirements.md
      acceptance-criteria.md
      test-cases.md
      implementation-plan.md
```

---

# 3. Source of truth hiện tại

AI Agent phải ưu tiên các quyết định mới nhất dưới đây nếu phát hiện mâu thuẫn với nội dung cũ.

## 3.1. Quy tắc thời gian mới nhất

**Toàn bộ tính toán thời gian trong hệ thống sử dụng ngày làm việc.**

Ngày làm việc được hiểu là:

```text
Ngày trong năm
- Thứ Bảy
- Chủ Nhật
- Các ngày Holiday được cấu hình trong hệ thống
```

Các nội dung cũ nói rằng TTM dùng ngày lịch làm đơn vị chính đã bị thay thế.

## 3.2. Phân loại Epic

Hệ thống dùng hai loại Epic:

| Loại Epic | TTM-CNTT | TTM-E2E | Ý nghĩa |
|---|---:|---:|---|
| Epic đơn giản | 3 tuần = 15 ngày làm việc | 6 tuần = 30 ngày làm việc | Yêu cầu đơn giản, ít phức tạp |
| Epic phức tạp | 6 tuần = 30 ngày làm việc | 10 tuần = 50 ngày làm việc | Yêu cầu phức tạp hơn |

## 3.3. Hai mốc T của Epic

Epic có hai mốc T chính:

| Mốc | Tên | Field Jira | Ý nghĩa |
|---|---|---|---|
| T0 | Ngày duyệt ý tưởng | Epic.Ngày duyệt ý tưởng | Bắt đầu TTM-E2E |
| T1 | Start Date | Epic.Start Date | Bắt đầu TTM-CNTT |

## 3.4. TTM-CNTT

Trong MVP1, hệ thống ưu tiên TTM-CNTT.

```text
TTM-CNTT = T1 / Start Date → R4G Date
```

Trong đó:

- R4G Date là field nhập tay trên Jira.
- R4G Date là nguồn chính để tính kết thúc TTM-CNTT.
- Status history chỉ dùng để đối chiếu và cảnh báo chất lượng dữ liệu.

## 3.5. TTM-E2E

TTM-E2E vẫn được định nghĩa trong BRD nhưng chưa phải trọng tâm MVP1.

```text
TTM-E2E = T0 / Ngày duyệt ý tưởng → Due Date
```

Trong đó:

- Due Date là field nhập tay trên Jira.
- Due Date là nguồn chính để tính kết thúc TTM-E2E.
- Status history chỉ dùng để đối chiếu và cảnh báo chất lượng dữ liệu.

## 3.6. Pending

Pending không dừng TTM.

Khi Epic, Story hoặc Subtask chuyển Pending:

- TTM-CNTT vẫn tiếp tục chạy.
- TTM-E2E vẫn tiếp tục chạy.
- Target date không thay đổi.
- Thời gian Pending phải được lưu để phân tích nguyên nhân chậm.

---

# 4. MVP1 — Phạm vi ưu tiên

MVP1 chỉ tập trung vào:

1. TTM-CNTT.
2. Epic có Start Date.
3. Epic ở status Design hoặc In Progress.
4. Cảnh báo theo mốc ngày làm việc.
5. Homepage 3 panel.
6. Import dữ liệu CSV.
7. Local authentication và phân quyền cơ bản.
8. Quản trị các danh mục cần thiết để chạy được MVP1.

MVP1 chưa cần triển khai đầy đủ:

- TTM-E2E risk engine nâng cao.
- Story/Subtask stage risk chi tiết.
- Ghi ngược dữ liệu sang Jira.
- Kết nối Jira API thật.
- AD Server hoặc Keycloak.
- Job scheduler độc lập.

---

# 5. Rule cảnh báo Epic MVP1

## 5.1. Cột Cảnh báo trên danh sách Epic

Trong các panel danh sách Epic cần có cột:

```text
Cảnh báo
```

Nếu Epic không có cảnh báo thì ô này để trống.

Các mức cảnh báo:

1. Cảnh báo sớm.
2. Cảnh báo muộn.
3. Fail TTM-CNTT.

## 5.2. Status được áp dụng cảnh báo trong MVP1

MVP1 chỉ cảnh báo với Epic có status:

- Design.
- In Progress.

Các status khác chưa cần rule cảnh báo TTM-CNTT trong MVP1, trừ Fail TTM-CNTT khi đã quá hạn mà chưa đạt R4G theo quy định nghiệp vụ.

## 5.3. Rule cho Epic đơn giản

Epic đơn giản có TTM-CNTT = 15 ngày làm việc.

| Status | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---:|---:|---:|
| Design | T1 + 2 ngày làm việc | T1 + 3 ngày làm việc | T1 + 15 ngày làm việc |
| In Progress | T1 + 12 ngày làm việc | T1 + 13 ngày làm việc | T1 + 15 ngày làm việc |

## 5.4. Rule cho Epic phức tạp

Epic phức tạp có TTM-CNTT = 30 ngày làm việc.

| Status | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---:|---:|---:|
| Design | T1 + 5 ngày làm việc | T1 + 6 ngày làm việc | T1 + 30 ngày làm việc |
| In Progress | T1 + 19 ngày làm việc | T1 + 20 ngày làm việc | T1 + 30 ngày làm việc |

## 5.5. Nguyên tắc tính mốc T1 + N

T1 + N phải được tính theo ngày làm việc.

Không tính:

- Thứ Bảy.
- Chủ Nhật.
- Holiday đã khai báo trong hệ thống.

Cần thống nhất trong code bằng một service riêng, ví dụ:

```text
WorkingDayService.addWorkingDays(startDate, numberOfDays)
```

Không được tính trực tiếp bằng cộng số ngày lịch.

## 5.6. Nguyên tắc ưu tiên cảnh báo

Nếu nhiều điều kiện cùng đúng, hệ thống hiển thị mức nghiêm trọng nhất.

Thứ tự ưu tiên:

```text
Fail TTM-CNTT > Cảnh báo muộn > Cảnh báo sớm > Không cảnh báo
```

---

# 6. Homepage 3 panel

Homepage có 3 panel chính.

## 6.1. Panel 1 — Epic đã có Start Date

Mục đích:

- Đây là panel quan trọng nhất với khối CNTT.
- Theo dõi các Epic đã bắt đầu bị tính TTM-CNTT.
- Hiển thị rủi ro, tiến trình, cảnh báo và thiếu dữ liệu tiêu chuẩn.

Điều kiện:

```text
Epic.Start Date is not null
```

Các cột chung nên đặt trước:

1. Risk.
2. Cảnh báo.
3. Epic Key.
4. Epic Name.
5. Current Status.
6. Domain.
7. Dự án.
8. Assignee / Owner.
9. Missing Standard Info.

Các cột đặc thù của Panel 1 đặt sau:

- T1 / Start Date.
- Target R4G Date.
- R4G Date.
- TTM-CNTT Progress.
- Pending.
- Status.

## 6.2. Panel 2 — Epic thiếu Start Date và đã sau To Do

Mục đích:

- Phát hiện Epic đã đi qua To Do nhưng thiếu Start Date.
- Đây là nhóm có vấn đề dữ liệu nghiêm trọng vì không tính được TTM-CNTT.

Điều kiện:

```text
Epic.Start Date is null
AND Epic.Status != To Do
```

Các cột chung giống Panel 1 và giữ cùng thứ tự.

Các cột đặc thù của Panel 2 đặt sau:

- Current Step Note / Progress Note.
- Pending.
- Data Quality Severity.

## 6.3. Panel 3 — Epic ở trạng thái To Do

Mục đích:

- Theo dõi backlog đang chờ đưa vào kế hoạch làm việc.
- Chưa tính TTM-CNTT vì chưa có Start Date.

Điều kiện:

```text
Epic.Status = To Do
```

Các cột chung giống Panel 1 và Panel 2, giữ cùng thứ tự.

Các cột đặc thù của Panel 3 đặt sau:

- T0 / Ngày duyệt ý tưởng.
- Backlog Note.
- Số ngày chờ kế hoạch.

## 6.4. Date filter trên Homepage

Homepage sử dụng filter dạng:

```text
From Date
To Date
```

Lý do:

- Dữ liệu nguồn được thu thập tích lũy hằng ngày.
- Người dùng cần xem tình hình theo khoảng ngày.
- Dashboard và panel cần hỗ trợ đối chiếu dữ liệu theo batch import hoặc snapshot date.

---

# 7. Phân quyền và vai trò

Hệ thống có 3 role chính:

| Role nghiệp vụ | Role kỹ thuật | Ý nghĩa |
|---|---|---|
| CBQL Phòng | superadmin | Quản trị toàn hệ thống |
| Lead | admin | Quản trị và xem theo domain được phân quyền |
| PM-SM | user | Xem theo dự án được phân quyền |

## 7.1. PM-SM / user

- Được phân quyền theo Dự án.
- Có toàn quyền xem thông tin trong các dự án được phân quyền.
- Không có quyền ghi ngược Jira.
- Có thể lưu một số dữ liệu local nếu được chức năng cho phép.

## 7.2. Lead / admin

- Được phân quyền theo Domain nghiệp vụ.
- Xem được toàn bộ dự án thuộc domain được lead.
- Có thể được cấp một số quyền quản trị bổ sung trong các MVP sau.

## 7.3. CBQL Phòng / superadmin

- Quản trị user.
- Cấp lại mật khẩu.
- Quản lý Domain.
- Quản lý Dự án.
- Quản lý Holiday.
- Quản lý Status Alert Rule.
- Quản lý nguồn dữ liệu.
- Quản lý cấu hình TTM.

---

# 8. Authentication

## 8.1. Local Account MVP1

MVP1 sử dụng tài khoản local lưu trong CSDL của phần mềm.

Yêu cầu:

- Password phải được hash bằng thuật toán an toàn.
- Không lưu plaintext password.
- Có chức năng CRUD user.
- Có chức năng cấp lại mật khẩu.
- Có audit log cho thao tác cấp lại mật khẩu.

## 8.2. Remember login

Màn hình đăng nhập có checkbox:

```text
Ghi nhớ đăng nhập
```

Quy tắc session:

| Trạng thái checkbox | Thời gian giữ đăng nhập |
|---|---:|
| Có check | 24 tiếng |
| Không check | 2 tiếng |

## 8.3. Username format

Trên form đăng nhập, label Username cần ghi chú:

```text
Username (không cần @mbbank.com.vn)
```

Không cần dòng subtitle cuối form về Authentication Provider.

## 8.4. Request change password

Không dùng form dài.

Quy trình:

1. User bấm `Request change password`.
2. Hệ thống mở popup nhỏ.
3. Popup hiển thị CAPTCHA.
4. User nhập CAPTCHA.
5. User bấm `Gửi`.
6. Hệ thống tự tạo yêu cầu cấp lại mật khẩu cho Admin hoặc Superadmin xử lý.

Không yêu cầu user nhập thêm họ tên, email hoặc lý do.

## 8.5. Module hóa Auth

Authentication phải thiết kế theo provider interface để sau này có thể thay bằng:

- AD Server.
- Keycloak.
- Provider nội bộ khác.

Không được hard-code local account vào toàn bộ ứng dụng.

---

# 9. Các màn hình quản trị chính

Các màn hình quản trị được gom dưới menu:

```text
Quản trị hệ thống
```

Các submenu:

- User Management.
- Domain.
- Dự án.
- Holiday.
- Status Mapping / Status Alert Rules.
- Nguồn dữ liệu.
- Cấu hình TTM.

---

# 10. Quản lý User

Triển khai MVP1: local authentication dùng bcrypt hash, session database qua cookie HttpOnly `SameSite=Lax`; session thường 2 giờ, ghi nhớ đăng nhập 24 giờ. Route `/login`, `/admin/users`; API User Management chỉ cho Superadmin. Dữ liệu seed: minhnd7@mbbank.com.vn (Superadmin), ngothanhha@mbbank.com.vn (Admin), congha@mbbank.com.vn (User); mật khẩu chỉ được lưu dạng bcrypt hash.

Màn hình User Management cần có:

- Danh sách user.
- Tạo user.
- Cập nhật user.
- Active / inactive user.
- Gán role.
- Gán domain.
- Gán dự án.
- Cấp lại mật khẩu.
- Xử lý request change password.

## 10.1. Popup phân quyền dự án

Vì số lượng dự án lớn, popup phân quyền dự án phải có:

- Danh sách dự án sắp xếp ABC mặc định.
- Ô tìm kiếm gần đúng theo mã dự án và tên dự án.
- Hỗ trợ chọn nhiều dự án.
- Hiển thị các dự án đã chọn dưới dạng chip/tag.
- Có nút xóa tìm kiếm.
- Không phụ thuộc vào việc cuộn chuột dài để tìm dự án.

---

# 11. Quản lý Holiday

Holiday có thể là một ngày hoặc một chuỗi ngày.

Form Holiday cần có:

- Tên ngày nghỉ.
- Loại ngày nghỉ.
- Toggle `Nhiều ngày`.
- Ngày bắt đầu.
- Ngày kết thúc.
- Mô tả.
- Trạng thái.

Quy tắc:

- Toggle `Nhiều ngày` mặc định tắt.
- Khi toggle tắt, holiday chỉ gồm 1 ngày.
- Khi toggle tắt, trường Ngày kết thúc bị disable/mờ đi.
- Khi toggle bật, người dùng được nhập Ngày kết thúc.
- Ngày kết thúc không được nhỏ hơn Ngày bắt đầu.
- Bỏ toggle `Áp dụng toàn hệ thống`.
- Bỏ nút `Import danh sách`.
- Có thể giữ nút `Copy từ năm trước` nếu cần.

---

# 12. Quản lý trạng thái Epic / Status Alert Rules

Trong MVP1, màn hình quản lý trạng thái Epic chỉ cần quản lý 2 trạng thái:

- Design.
- In Progress.

Màn hình này dùng để cấu hình mốc cảnh báo cho 2 loại Epic:

- Epic đơn giản.
- Epic phức tạp.

Các trường cấu hình:

- Loại Epic.
- Trạng thái Epic.
- Offset cảnh báo sớm.
- Offset cảnh báo muộn.
- Offset Fail TTM-CNTT.
- Active / inactive.

Bảng mặc định:

| Loại Epic | Status | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---|---:|---:|---:|
| Epic đơn giản | Design | T1 + 2 | T1 + 3 | T1 + 15 |
| Epic đơn giản | In Progress | T1 + 12 | T1 + 13 | T1 + 15 |
| Epic phức tạp | Design | T1 + 5 | T1 + 6 | T1 + 30 |
| Epic phức tạp | In Progress | T1 + 19 | T1 + 20 | T1 + 30 |

Tất cả offset đều tính theo ngày làm việc.

Triển khai MVP1:

- Route quản trị: `/admin/status-alert-rules`; menu `Cấu hình cảnh báo` dẫn trực tiếp đến màn hình này.
- Design và In Progress được seed mặc định. Người dùng có thể thêm rule cho trạng thái Epic khác; loại Epic vẫn là Epic đơn giản hoặc Epic phức tạp. Cặp Loại Epic/Trạng thái phải là duy nhất.
- API `GET`/`POST`/`PUT /api/status-alert-rules` validate offset là số nguyên 0–3650, tên trạng thái dài tối đa 50 ký tự và bắt buộc `cảnh báo sớm < cảnh báo muộn < fail`.
- Rule được lưu ở `epic_status_alert_rules`. Mỗi lần tải Theo dõi Epic, hệ thống chỉ nạp các rule active một lần và áp dụng cho toàn bộ Epic trong lần tải đó; khi rule inactive, cặp trạng thái/loại Epic tương ứng không phát sinh alert TTM-CNTT.
- API nghiệp vụ dùng chung `POST /api/epic-compliance` là nguồn duy nhất để đánh giá baseline, cảnh báo và tuân thủ. API nhận tối đa 500 Epic/Story/Subtask, dùng rule active và Holiday từ CSDL; Epic trả baseline Design/In Progress/R4G/Released, Story/Subtask kiểm tra liên kết phân cấp và chất lượng dữ liệu. Các màn hình cảnh báo phải gọi hoặc tái sử dụng rule engine của API này, không tự sao chép công thức.

---

# 13. Quản trị nguồn dữ liệu

## 13.1. Data Source Adapter

Nguồn dữ liệu phải được thiết kế dạng module/adapter.

MVP1 dùng:

```text
CSV Import Adapter
```

Các adapter tương lai:

- Jira API Adapter.
- Jira DB Query Adapter.
- Scheduled Job Adapter.

## 13.2. Import CSV MVP1

Ứng dụng ban đầu chưa kết nối Jira.

MVP1 cho phép:

- Import file CSV.
- Validate dữ liệu: Hỗ trợ chế độ "Validate only" chỉ trả về danh sách lỗi và cảnh báo xem trước (preview) trên UI, hoàn toàn không ghi nhận bất kỳ dữ liệu nào vào CSDL.
- Lớp dữ liệu (Data Layering): Dữ liệu tích lũy theo từng lớp. Thêm trường `aggregated_at` (thời gian tổng hợp, lấy tự động từ tên file dạng `Jira YYYY-MM-DDTHH_mm_ss+zzzz.csv` hoặc điều chỉnh thủ công) để phân biệt các lớp dữ liệu của Epic. Khóa duy nhất trong bảng issues là `(issue_key, source_import_batch_id)`.
- Bảng tổng hợp dài hạn `issue_daily_snapshots` lưu vĩnh viễn các trường nghiệp vụ quan trọng của toàn bộ Epic, Story và Subtask cho từng `aggregated_at`. Khi raw batch bị dọn, `source_import_batch_id` trong snapshot được đặt `NULL`, nhưng snapshot vẫn còn để tra cứu lịch sử cảnh báo.
- Raw data gồm `import_batches`, `import_rows` và `issues` theo batch. Mặc định giữ 30 ngày; SUPERADMIN cấu hình 7–3650 ngày tại Quản trị nguồn dữ liệu. Sau mỗi import được lưu hệ thống tự dọn raw batch quá hạn, luôn bảo vệ batch vừa import và lớp dữ liệu mới nhất.
- Rule cảnh báo "Thiếu Epic Link": Chỉ áp dụng cho issue type là `STORY`, không áp dụng cho các loại issue khác.
- Lưu batch import khi thực hiện lưu chính thức.
- Ghi nhận lỗi import.
- Không làm ảnh hưởng toàn bộ hệ thống nếu sau này đổi nguồn dữ liệu.

## 13.2.1. Duyệt dữ liệu theo lớp import

- Mỗi record trong nhật ký import có action `Duyệt dữ liệu`, mở route `/data-review/[batchId]` của đúng lớp dữ liệu đó.
- Màn hình chỉ phân trang cấp Epic: 10 Epic mỗi trang, Epic đóng mặc định. Mở nhiều Epic đồng thời phải giữ nguyên state các Epic đã mở; Story và Subtask được tải/mở theo nhánh tương ứng.
- Cột cố định theo thứ tự: Project, ID, Issue type, Key, Status, Start date, R4G date, Due date, Summary, Assignee.
- Filter gồm Project, Status, Component/s. Các option lấy từ dữ liệu của batch; Component/s phụ thuộc Project đang chọn.
- Filter có thêm Issue type. Khi chọn type của Story/Subtask, danh sách vẫn giữ ngữ cảnh Epic và chỉ trả các Epic có nhánh chứa type đã chọn.
- Danh mục `project_components` tích lũy cặp Project/Component duy nhất sau mỗi import thành công. Component cũ vẫn được giữ; component mới được bổ sung; dropdown chỉ hiển thị component `active` của Project trong batch đang duyệt.
- Tham chiếu chi tiết: `brd/07-data-source-and-csv-import.md`, `brd/08-data-model.md`, `brd/09-ui-ux-prototypes.md` và `design-system-spec.md`.

## 13.3. Tự động import khi superadmin đăng nhập

Trong MVP1, hệ thống chỉ chạy tự động tối đa 1 lần/ngày khi CBQL Phòng / superadmin đăng nhập.

Quy tắc:

```text
Nếu hôm nay chưa có batch import tự động
AND user đăng nhập là CBQL Phòng / superadmin
THEN chạy auto import 1 lần
```

Sau này có thể thay bằng job scheduler độc lập.

---

# 14. Hướng dẫn AI Agent khi thực hiện task

Trước khi code, AI Agent phải xác định task thuộc nhóm nào và đọc đúng file BRD tương ứng.

| Loại task | File cần đọc |
|---|---|
| Rule TTM-CNTT, ngày làm việc, Epic đơn giản/phức tạp | `03-mvp1-working-days-alert-rules.md` |
| Homepage 3 panel, cột Cảnh báo, filter From/To | `04-homepage-and-epic-monitoring.md` |
| Login, password, request change password, RBAC | `05-auth-rbac-user-management.md` |
| Domain, Dự án, Holiday, Status Rule | `06-master-data-management.md` |
| CSV import, data source adapter | `07-data-source-and-csv-import.md` |
| Database schema | `08-data-model.md` |
| UI layout, prototype, responsive behavior | `09-ui-ux-prototypes.md` |
| Security, password hashing, session, audit log | `10-security-and-non-functional.md` |
| MVP planning | `11-mvp-roadmap.md` |

Nếu các file chưa được tách thật, Agent cần dùng section tương ứng trong BRD tổng và file index này để định vị nội dung.

---

# 15. Nguyên tắc xử lý mâu thuẫn tài liệu

Khi phát hiện nội dung mâu thuẫn, áp dụng thứ tự ưu tiên sau:

1. Quyết định mới nhất trong file index này.
2. BRD cập nhật về working days và alert rules MVP1.
3. BRD cập nhật về auth, RBAC và data source.
4. BRD cập nhật homepage 3 panel.
5. BRD gốc.

Ví dụ:

- Nếu tài liệu cũ nói dùng ngày lịch nhưng file này nói dùng ngày làm việc, phải dùng ngày làm việc.
- Nếu tài liệu cũ nói request change password có form dài nhưng file này nói chỉ dùng popup CAPTCHA, phải dùng popup CAPTCHA.
- Nếu tài liệu cũ có nhiều status mapping nhưng MVP1 chỉ cần Design và In Progress, phải triển khai MVP1 theo Design và In Progress.

---

# 16. Nguyên tắc triển khai với các skill dự án

Khi lập trình, AI Agent phải tuân thủ 4 nhóm skill trong project:

1. `superpowers` — quản lý quy trình làm việc, chia task, lập kế hoạch, review.
2. `coding skill` — quy tắc coding, maintainability, testability.
3. `pentest skill` — nguyên tắc an toàn thông tin.
4. `uiux skill` — nguyên tắc thiết kế giao diện và trải nghiệm người dùng.

AI Agent không được bỏ qua các skill này nếu chúng tồn tại trong thư mục project.

Trước mỗi task code, Agent nên thực hiện:

```text
1. Đọc skill liên quan.
2. Đọc file BRD tương ứng.
3. Xác định phạm vi task.
4. Liệt kê assumption nếu còn thiếu thông tin.
5. Lập implementation plan ngắn.
6. Viết hoặc cập nhật test.
7. Implement.
8. Chạy lint, typecheck, test.
9. Cập nhật tài liệu nếu rule thay đổi.
```

---

# 17. Checklist trước khi bắt đầu MVP1

Trước khi code MVP1, cần có các quyết định đã chốt sau:

- [x] Có 3 role: CBQL Phòng, Lead, PM-SM.
- [x] MVP1 dùng local account.
- [x] Password lưu local và phải hash.
- [x] Request change password dùng popup CAPTCHA.
- [x] Remember login: 24 tiếng nếu check, 2 tiếng nếu không check.
- [x] Nguồn dữ liệu MVP1 là CSV import.
- [x] Data source thiết kế dạng adapter.
- [x] TTM-CNTT là ưu tiên MVP1.
- [x] Toàn bộ thời gian tính theo ngày làm việc.
- [x] Epic có T0 và T1.
- [x] Epic đơn giản/phức tạp đã được định nghĩa.
- [x] Rule cảnh báo MVP1 chỉ áp dụng Design và In Progress.
- [x] Homepage có 3 panel.
- [x] Menu quản trị được gom vào `Quản trị hệ thống`.
- [x] Holiday hỗ trợ chuỗi ngày.
- [x] Popup phân quyền dự án có tìm kiếm gần đúng và sắp xếp ABC.

---

# 18. File prototype liên quan

Các prototype hiện có nên được tham chiếu trong file UI/UX:

- Homepage Dashboard 3 panel.
- Login + Request change password popup CAPTCHA.
- Epic Detail.
- User Management.
- Project permission modal.
- Domain Management.
- Project Management.
- Holiday Management.
- Status Alert Rules MVP1.
- CSV Import / Data Source Management.

Tên file ảnh có thể thay đổi theo artifact thực tế. Khi lập trình, AI Agent nên dùng prototype như tài liệu tham khảo giao diện, không coi text trong ảnh là source of truth tuyệt đối nếu khác với BRD index này.

## 18.1. Source of truth cho hệ thống giao diện

Từ bản nâng cấp UI ngày 2026-08-09, các màn hình mới và màn hình được chỉnh sửa phải tuân theo các quy tắc sau:

- Dùng Tailwind CSS v4 và semantic token khai báo tập trung trong `src/app/globals.css`.
- Phong cách màu lấy cảm hứng từ Facebook: accent xanh dương duy nhất, nền xám xanh nhạt, surface trắng và text trung tính có độ tương phản WCAG AA.
- Hiệu ứng kính mờ kiểu macOS chỉ là web frosted-glass approximation, chỉ dùng cho app shell, top dock và dialog. Phải có solid fallback khi trình duyệt không hỗ trợ blur hoặc người dùng giảm transparency.
- App shell dùng chung nằm tại `src/components/layout/AppShell.tsx`; không viết lại sidebar/header trong từng page.
- Primitive dùng chung nằm tại `src/components/ui/`. Form phải tái sử dụng `FormField`, `Input`, `Select`, `Button`, `Alert`, `Modal`, `EmptyState`, `Skeleton` và các primitive tương ứng.
- Mọi bảng dữ liệu mới phải tái sử dụng `TableContainer`, `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` tại `src/components/ui/Table.tsx`. Các quy tắc chung về surface, sticky header, border, row hover, typography, scroll ngang và responsive chỉ được đặt ở `globals.css`; component nghiệp vụ chỉ thêm class cho cell/row mang ý nghĩa đặc thù, không tạo table shell hoặc header style riêng.
- Trang `/epic-alerts` áp dụng gói thiết kế `ttm_epic_management_design_package`: toolbar cảnh báo, legend, Epic identity, badge cảnh báo và stage-pill/highlight theo số ngày làm việc. Các cấu trúc bảng trong trang vẫn phải đi qua primitive Table dùng chung.
- Không viết lại label, helper text, error text, focus state hoặc icon SVG trực tiếp trong từng form khi primitive dùng chung đã hỗ trợ.
- Component theo nghiệp vụ được đặt trong thư mục module, ví dụ `src/components/data-source/`; không khai báo component dùng lại trực tiếp bên trong hàm page/form.
- Desktop và mobile phải dùng cùng cấu trúc thông tin. Sidebar chuyển thành drawer trên màn hình nhỏ, không dùng margin cố định làm tràn viewport.
- Sidebar desktop mặc định ở trạng thái collapse rộng 72px và chỉ hiển thị icon. Người dùng có thể toggle sang trạng thái expand rộng 256px để hiển thị icon cùng tên menu. Mobile vẫn dùng drawer dạng expand.
- Khi sidebar collapse, hover hoặc focus icon phải hiển thị tooltip tên menu ngay lập tức. Toggle sidebar chỉ hiển thị icon collapse/expand, không hiển thị text trong footer.
- Right panel dùng chung `src/components/layout/RightPanel.tsx` cho các box phụ trợ. Desktop mặc định collapse rộng 56px, cao tối thiểu 360px; nút expand/collapse đặt ở đầu panel và các icon box được căn giữa cân đối theo chiều dọc. Tooltip icon right panel xuất hiện bên trái trigger để không che nội dung; expand rộng 360px để hiện box. Right panel dùng nền light grey, tách biệt với navy left panel; trên màn hình nhỏ chuyển thành panel ngang trong luồng nội dung.
- Toàn bộ body, form control, label, helper/error, component, popup, tooltip và menu item dùng chung semantic token `--text-app` bằng 11.5px, tương đương nội dung hướng dẫn trong box "Thông tin chung & Hướng dẫn". Phân cấp thị giác dùng font weight, màu và khoảng cách, không tạo thêm font-size cục bộ; semantic, focus và độ tương phản vẫn phải đạt yêu cầu accessibility.
- App canvas phải đủ tối để phân biệt rõ với surface trắng. Card và table dùng border mạnh cùng shadow xanh xám có kiểm soát.
- `Badge` và mọi action trong table dùng chiều cao cố định 32px, dạng pill, không wrap; chỉ chiều rộng thay đổi theo nội dung. Action trong table bắt buộc dùng `TableAction` (`neutral`, `info`, `warning`, `danger`) thay vì `Button` thường, để trạng thái và thao tác có cùng nhịp thị giác. Table dùng primitive chung trong `src/components/ui/Table.tsx`: header nền xám xanh nhạt, căn giữa, tối đa một dòng và font weight normal; mỗi dòng dữ liệu giữ trên một dòng, dùng zebra rows và hover state nhẹ. Bảng nhiều cột phải có chiều rộng tối thiểu và scroll ngang trong `TableContainer`, không ép cột làm dữ liệu xuống dòng.
- Giữ nguyên field name, field order, route, API contract và nghiệp vụ nếu task chỉ yêu cầu nâng cấp giao diện.

Chi tiết token, radius, state và quy ước component được định nghĩa tại `design-system-spec.md`. BRD giao diện liên quan là `brd/09-ui-ux-prototypes.md`.

---

# 19. Kết luận

BRD nên được tách thành nhiều phần nhỏ. File này đóng vai trò như **bản đồ điều hướng** để AI Agent biết cần đọc gì và ưu tiên rule nào.

Trong MVP1, mọi triển khai cần xoay quanh mục tiêu:

```text
Giám sát TTM-CNTT cho Epic đã có Start Date,
cảnh báo sớm/muộn/fail theo ngày làm việc,
và hỗ trợ quản trị dữ liệu nền tảng đủ để vận hành dashboard.
```
# Bổ sung MVP1 — Gán Domain và Lead phụ trách

- Một user có thể được gán một hoặc nhiều Domain đang active. Form thêm mới và chỉnh sửa user dùng multi-select dropdown có danh sách cuộn; API kiểm tra tất cả Domain được chọn tồn tại, active và không trùng lặp. User inactive có thể chưa có Domain; khi chuyển sang active, user bắt buộc phải có ít nhất một Domain.
- Form thêm mới và chỉnh sửa user có trường Dự án tùy chọn, cho phép chọn nhiều dự án mà user được phân công vai trò PM/SM. API kiểm tra các ID dự án được chọn tồn tại và không trùng lặp; user inactive, thêm mới hàng loạt và duyệt active không bắt buộc có Dự án.
- PM/SM của Project và phân công `user_projects` được đồng bộ hai chiều trong cùng transaction: sửa PM/SM của dự án sẽ cập nhật Dự án của user; sửa Dự án của user sẽ cập nhật PM/SM tương ứng. PM/SM được nhận diện an toàn theo họ tên hoặc email và chuẩn hóa về họ tên. Danh sách user hiển thị các Project Key đã được phân công.
- Người dùng đăng ký mới vẫn chọn một Domain active; Superadmin có thể bổ sung thêm Domain khi chỉnh sửa user.
- Lead phụ trách của một Domain phải được chọn từ danh sách user active, hiển thị theo Họ tên và email; không cho nhập Lead tự do.
- `user_domains` dùng khóa chính kết hợp `(user_id, domain_id)` để một user có thể thuộc nhiều Domain nhưng không thể có bản ghi gán Domain trùng lặp.

## Bổ sung MVP1 — Thao tác theo lô User Management

- Tab cấp lại mật khẩu: chọn nhiều ticket, xóa có xác nhận một bước hoặc mở modal để đặt một mật khẩu mới dùng chung cho tất cả user đã chọn.
- Tab duyệt đăng ký mới: chọn nhiều user inactive, xóa có xác nhận một bước hoặc duyệt để kích hoạt đồng thời. Nếu một hay nhiều user được chọn chưa có Domain, hệ thống mở modal bắt buộc chọn một Domain active, gán thêm Domain đó cho các user chưa có Domain rồi mới kích hoạt; việc gán và kích hoạt được thực hiện trong một transaction.
- Duyệt một/nhiều đăng ký chỉ yêu cầu Domain active để kích hoạt user. Dự án và các thông tin phân công khác là tùy chọn, được chỉnh sửa riêng sau khi duyệt.
- Hai tab hàng chờ hiển thị badge số lượng động ngay trên nút tab: số ticket cấp lại mật khẩu đang chờ và số đăng ký user inactive. Badge tự cập nhật sau mọi thao tác duyệt, xóa hoặc tải lại dữ liệu.

## Bổ sung MVP1 — Danh mục Dự án

- Trang quản lý dự án có tìm kiếm gần đúng theo Mã hiển thị/tên, lọc Domain/PM-SM/trạng thái và phân trang 20 dòng.
- PM/SM được chọn từ user active. Import CSV nhiều dự án dùng cột Tên dự án, Loại hình dự án, PM-SM, Key, TTM; bắt buộc Tên dự án/Key/TTM. Key dùng cho Mã hiển thị và Source Project Key (Jira); Loại hình và PM/SM không hợp lệ được lưu trống.
- Thông tin dự án có Loại hình dự án tùy chọn: Dự án, Team Agile, Team Triển khai.
- Thông tin dự án có TTM bắt buộc (`Y`/`N`), mặc định `N`.

## Bổ sung MVP1 — Thêm nhiều user

- Superadmin nhập username phân tách bằng dấu phẩy. Hệ thống tạo user inactive chưa gán Domain, với email MB Bank và mật khẩu mặc định theo yêu cầu; user đã tồn tại được bỏ qua.

## Bổ sung MVP1 — Quy ước bảng danh sách

- Mọi bảng danh sách dữ liệu dùng component toolbar chung, luôn có tìm kiếm gần đúng và nút reset dạng icon để về trạng thái ban đầu.
- Bộ lọc theo trường chỉ được bổ sung khi có yêu cầu nghiệp vụ riêng; không tự thêm filter mặc định.

## Bổ sung MVP1 — Tách deadline Time to Market khỏi rule cảnh báo status

- Rule cảnh báo status Epic chỉ quản lý `Cảnh báo sớm` và `Cảnh báo muộn` theo ngày làm việc từ Start Date; không có trường hoặc dữ liệu `Offset Fail TTM-CNTT`.
- Deadline TTM được quản lý tại panel **Tiêu chí Time to Market**: Loại TTM (`TTM-CNTT`/`TTM-E2E`), loại Epic (đơn giản/phức tạp), From TTM Field, To TTM Field, số ngày làm việc và active/inactive. Chỉ tiêu chí active của đúng cặp Loại TTM/Loại Epic được engine sử dụng.
- Với TTM-CNTT, baseline là `From TTM Field + số ngày làm việc`; trạng thái thực tế luôn là dải thời gian từ From TTM Field đến Today. Cột TTM-CNTT tại `/epic-alerts` hiển thị hai dải này.
- API tính tuân thủ (`POST /api/epic-compliance`), `/api/epic-alerts` và `/api/epic-monitoring` phải dùng chung tiêu chí TTM active; không được tự hard-code deadline theo loại Epic.
- Xóa rule cảnh báo hoặc tiêu chí TTM phải dùng popup xác nhận một bước. Xóa rule chỉ thực hiện từ modal chỉnh sửa rule.
- `From TTM Field` và `To TTM Field` là text tự do (1–100 ký tự), không giới hạn dropdown. Engine nhận diện các alias chuẩn của Idea Approved Date, Start Date, R4G Date và Due Date; field mới được lưu sẵn để bổ sung mapping dữ liệu sau.
