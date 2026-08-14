# 00 — AI Agent Index for TTM Monitor BRD

## 1. Mục đích

File này là bản chỉ mục bắt buộc để AI Agent đọc trước khi triển khai ứng dụng **TTM Monitor**.

AI Agent không nên đọc một file BRD dài duy nhất. Thay vào đó, hãy xác định loại task đang làm và đọc đúng file BRD thành phần tương ứng.

## 2. Quy tắc ưu tiên tài liệu

Nếu các tài liệu cũ còn nhắc tới ngày lịch, logic cũ hoặc trạng thái cũ, hãy ưu tiên các quy tắc mới sau:

1. Toàn bộ tính toán thời gian trong hệ thống dùng **ngày làm việc**.
2. Ngày làm việc là ngày trong năm, không tính Thứ Bảy, Chủ Nhật và các ngày Holiday được cấu hình.
3. MVP1 chỉ tập trung **TTM-CNTT**.
4. TTM-E2E vẫn được mô hình hóa nhưng chưa phải trọng tâm cảnh báo của MVP1.
5. Epic có hai mốc T:
   - **T0** = Ngày duyệt ý tưởng.
   - **T1** = Start Date của Epic.
6. **Epic đơn giản** là Epic có TTM-CNTT 3 tuần, tương ứng TTM-E2E 6 tuần.
7. **Epic phức tạp** là Epic có TTM-CNTT 6 tuần, tương ứng TTM-E2E 10 tuần.
8. R4G Date và Due Date là field nhập tay trên Jira.
9. Phần mềm read-only đối với Jira, không ghi ngược lại Jira.
10. CSV Import là nguồn dữ liệu MVP đầu; sau này có thể thay bằng Jira API hoặc Jira DB Query thông qua Data Source Adapter.

## 3. Danh sách file BRD thành phần

| File | Mục đích | Khi nào cần đọc |
|---|---|---|
| `01-product-overview.md` | Tổng quan sản phẩm, mục tiêu, phạm vi | Khi cần hiểu sản phẩm tổng thể |
| `02-ttm-concepts-and-rules.md` | Khái niệm TTM-CNTT, TTM-E2E, Epic đơn giản/phức tạp, ngày làm việc, Pending | Khi code logic nghiệp vụ TTM |
| `03-mvp1-working-days-alert-rules.md` | Rule cảnh báo MVP1 cho Design/In Progress | Khi code cảnh báo, risk, cột Cảnh báo |
| `04-homepage-and-epic-monitoring.md` | Homepage 3 panel, cột bảng, filter From/To Date | Khi code dashboard hoặc danh sách Epic |
| `05-auth-rbac-user-management.md` | Login, session, password, role, phân quyền user/domain/project | Khi code auth, user CRUD, RBAC |
| `06-master-data-management.md` | Domain, Project, Holiday, Status Alert Rule, TTM config | Khi code menu Quản trị hệ thống |
| `07-data-source-and-csv-import.md` | Data Source Adapter, CSV import, import tự động 1 lần/ngày | Khi code nhập dữ liệu |
| `08-data-model.md` | Mô hình dữ liệu khuyến nghị | Khi thiết kế DB, migration, ORM |
| `09-ui-ux-prototypes.md` | Danh sách prototype và định hướng UI | Khi code giao diện |
| `10-security-and-non-functional.md` | Bảo mật, hiệu năng, logging, coding constraints | Khi code nền tảng và review an toàn |
| `11-mvp-roadmap.md` | Thứ tự MVP và phạm vi từng giai đoạn | Khi lập kế hoạch triển khai |

## 4. Mapping task → file cần đọc

### Nếu task liên quan cảnh báo TTM-CNTT

Đọc theo thứ tự:

1. `02-ttm-concepts-and-rules.md`
2. `03-mvp1-working-days-alert-rules.md`
3. `08-data-model.md`
4. `10-security-and-non-functional.md`

### Nếu task liên quan Homepage hoặc bảng Epic

Đọc theo thứ tự:

1. `04-homepage-and-epic-monitoring.md`
2. `03-mvp1-working-days-alert-rules.md`
3. `02-ttm-concepts-and-rules.md`
4. `09-ui-ux-prototypes.md`

### Nếu task liên quan login, password, user, role

Đọc theo thứ tự:

1. `05-auth-rbac-user-management.md`
2. `08-data-model.md`
3. `10-security-and-non-functional.md`

### Nếu task liên quan CSV hoặc Jira data

Đọc theo thứ tự:

1. `07-data-source-and-csv-import.md`
2. `08-data-model.md`
3. `02-ttm-concepts-and-rules.md`

### Nếu task liên quan danh mục quản trị

Đọc theo thứ tự:

1. `06-master-data-management.md`
2. `05-auth-rbac-user-management.md`
3. `08-data-model.md`

## 5. Các nguyên tắc bắt buộc cho AI Agent

Khi triển khai, project sẽ có 4 skill trong thư mục project:

- `superpowers`
- `coding skill`
- `pentest skill`
- `uiux skill`

AI Agent phải:

1. Đọc skill liên quan trước khi sửa code.
2. Lập implementation plan trước khi code.
3. Không mở rộng scope ngoài BRD/MVP đang làm.
4. Không hard-code business rules nếu BRD yêu cầu cấu hình được.
5. Viết test cho rule tính ngày làm việc, phân quyền và cảnh báo.
6. Không ghi dữ liệu ngược về Jira.
7. Không lưu mật khẩu plaintext.
8. Không log mật khẩu, token hoặc dữ liệu nhạy cảm.
9. Nếu tài liệu mâu thuẫn, hỏi lại hoặc ưu tiên file index này và file MVP1 mới nhất.

## 6. Checklist trước khi code MVP1

- [ ] Đã hiểu Epic đơn giản/phức tạp.
- [ ] Đã hiểu T0 và T1.
- [ ] Đã hiểu toàn bộ tính toán dùng ngày làm việc.
- [ ] Đã hiểu MVP1 chỉ cảnh báo TTM-CNTT.
- [ ] Đã hiểu cảnh báo chỉ áp dụng Epic status Design và In Progress.
- [ ] Đã hiểu Homepage có 3 panel.
- [ ] Đã hiểu menu quản trị được gom vào `Quản trị hệ thống`.
- [ ] Đã hiểu source dữ liệu ban đầu là CSV Import.
- [ ] Đã hiểu auth hiện tại là local account nhưng phải module hóa để thay bằng AD/Keycloak.
