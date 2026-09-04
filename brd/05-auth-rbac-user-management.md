# 05 — Auth, RBAC and User Management

## 1. Role hệ thống

> **Cập nhật (thay thế nội dung "3 role" bên dưới):** ứng dụng hiện có **4 role**
> (`users.role` CHECK IN `('SUPERADMIN','ADMIN','SUPERVISOR','USER')`, thêm bởi
> `db/migrations/20260824_add_supervisor_role.sql`):
>
> | Role nghiệp vụ | Role kỹ thuật | Phạm vi |
> |---|---|---|
> | CBQL Phòng | SUPERADMIN | Toàn hệ thống, toàn quyền |
> | (không có tên nghiệp vụ riêng) | SUPERVISOR | Toàn hệ thống, **chỉ xem** — không tạo/sửa/xóa ở bất kỳ màn hình quản trị nào, không truy cập import/backup/purge dữ liệu |
> | Lead | ADMIN | Theo Domain nghiệp vụ được gán |
> | PM-SM | USER | Theo Dự án được gán, có thể bị thu hẹp thêm theo Component (xem §12b) |
>
> SUPERVISOR được thêm để có người xem/giám sát toàn hệ thống mà không có rủi ro ghi/xóa nhầm.
> Enforcement nằm ở `auth-service.ts`'s `requireUser` role arrays theo từng API, không phải một
> flag chung; Ma trận phân quyền (`/admin/permissions`, xem §12c) là nơi SUPERADMIN xem/điều chỉnh
> chi tiết theo từng tính năng.

Nội dung gốc bên dưới (3 role) đã lỗi thời, giữ lại để tham khảo lịch sử:

Ứng dụng có 3 role:

| Role nghiệp vụ | Role kỹ thuật tương đương | Phạm vi |
|---|---|---|
| CBQL Phòng | Superadmin | Toàn hệ thống |
| Lead | Admin | Theo domain nghiệp vụ |
| PM-SM | User | Theo dự án được phân quyền |

## 2. Quyền theo role

### 2.1. CBQL Phòng

CBQL Phòng có quyền:

- Xem toàn bộ dữ liệu.
- Quản lý user.
- Cấp lại mật khẩu user.
- Quản lý domain nghiệp vụ.
- Quản lý dự án.
- Quản lý holiday.
- Quản lý status alert rule.
- Quản lý cấu hình TTM.
- Quản lý nguồn dữ liệu.
- Import CSV.
- Xem import log.

### 2.2. Lead

Lead có quyền:

- Xem toàn bộ dự án thuộc domain được lead.
- Xem dữ liệu Epic trong domain.
- Có quyền vào một số tính năng quản trị sẽ được bổ sung sau.
- Không có quyền cấu hình toàn hệ thống nếu chưa được phân quyền.

### 2.3. PM-SM

PM-SM có quyền:

- Xem các dự án được phân quyền trực tiếp.
- Xem toàn bộ thông tin của dự án được phân quyền.
- Không quản trị user.
- Không cấu hình nguồn dữ liệu.
- Không chỉnh rule hệ thống.

## 3. Nguyên tắc phân quyền dữ liệu

Phần mềm read-only với Jira, nhưng có thể lưu dữ liệu locally theo phân quyền người dùng.

Quy tắc:

- PM-SM xem theo `user_projects`.
- Lead xem theo `user_domains` hoặc domain mà Lead phụ trách.
- CBQL Phòng xem tất cả.

## 4. Local authentication trong MVP đầu

MVP đầu dùng local account.

Thông tin mật khẩu được lưu trong CSDL local dưới dạng mã hóa/hash an toàn.

Không lưu plaintext password.

Khuyến nghị kỹ thuật:

- Hash bằng Argon2id hoặc bcrypt.
- Salt riêng cho từng password.
- Không log password.
- Có trạng thái user active/inactive.
- Có audit log cho reset password.

## 5. Module hóa Authentication

Tính năng đăng nhập phải được thiết kế dạng module/provider để sau này có thể thay đổi sang:

- AD Server.
- Keycloak.
- SSO khác.

Interface đề xuất:

```ts
interface AuthProvider {
  login(username: string, password: string): Promise<AuthResult>;
  logout(sessionId: string): Promise<void>;
  getUserProfile(userId: string): Promise<AuthUserProfile>;
  changePassword?(userId: string, newPassword: string): Promise<void>;
}
```

MVP đầu dùng:

```text
LocalAuthProvider
```

Các MVP sau có thể bổ sung:

```text
AdAuthProvider
KeycloakAuthProvider
```

## 6. Login form

> Lưu ý schema: `users` **không có cột `username`** — chỉ có `email` (UNIQUE). Ô "Username" trên
> form chỉ là UX: `normalizeUsername` (`auth-service.ts`) tự nối `@mbbank.com.vn` nếu người dùng gõ
> thiếu, rồi so khớp với `email`. Không có bảng/cột riêng lưu "username".

Login form gồm:

- Username.
- Ghi chú tại label Username: `(không cần @mbbank.com.vn)`.
- Password.
- Checkbox `Ghi nhớ đăng nhập`.
- Nút `Đăng nhập`.
- Link `Request change password`.

Không hiển thị subtitle cuối form về Authentication provider.

## 7. Session duration

Nút `Ghi nhớ đăng nhập` có quy tắc:

| Trạng thái checkbox | Thời gian giữ đăng nhập |
|---|---:|
| Checked | 24 tiếng |
| Unchecked | 2 tiếng |

Session phải hết hạn tự động sau thời gian tương ứng.

## 8. Login error

Yêu cầu ban đầu cho phép thông báo sai username hoặc sai mật khẩu.

Tuy nhiên khi triển khai cần cân nhắc an toàn thông tin. Nếu áp dụng đúng yêu cầu nghiệp vụ, giao diện có thể hiển thị:

- Sai username.
- Sai mật khẩu.

Cần rate limit login để giảm rủi ro dò tài khoản.

## 9. Request change password

Chức năng request change password không cần form yêu cầu chi tiết.

Khi user click `Request change password`, hệ thống mở popup gồm:

- Thông báo ngắn: hệ thống sẽ tạo yêu cầu cấp lại mật khẩu cho Admin/CBQL Phòng xử lý.
- CAPTCHA.
- Nút `Gửi`.
- Nút `Hủy`.

Sau khi user nhập CAPTCHA hợp lệ và bấm `Gửi`:

- Hệ thống tự tạo password reset request.
- Request được gửi tới Lead/Admin hoặc CBQL Phòng/Superadmin xử lý.
- User không cần nhập thêm thông tin.

## 10. Cấp lại mật khẩu

CBQL Phòng hoặc người có quyền có thể cấp lại mật khẩu cho user trên màn hình User Management.

Yêu cầu:

- Tạo mật khẩu mới.
- Lưu hash vào database.
- Có thể gửi thông báo hoặc hiển thị mật khẩu tạm theo chính sách công ty.
- Ghi audit log.
- Đánh dấu password reset request đã xử lý.

## 11. User Management CRUD

Màn hình User Management hỗ trợ:

- Tạo user.
- Cập nhật user.
- Active/inactive user.
- Gán role.
- Gán domain.
- Gán dự án.
- Cấp lại mật khẩu.
- Import user, nếu cần.
- Export CSV, nếu cần.

## 12. Popup phân quyền dự án

Do số lượng dự án rất nhiều, popup chọn dự án được phân quyền phải hỗ trợ:

- Danh sách sắp xếp theo ABC mặc định.
- Ô tìm kiếm gần đúng.
- Tìm kiếm theo mã dự án.
- Tìm kiếm theo tên dự án.
- Multi-select.
- Hiển thị danh sách đã chọn dưới dạng tag/chip.
- Nút xóa tìm kiếm.
- Nút lưu phân quyền.

Không được bắt người dùng cuộn chuột trong danh sách dài để tìm dự án.

## 13. Acceptance Criteria

## 14. Triển khai MVP1

- LocalAuthProvider xác thực bằng bcrypt hash và session lưu database; cookie session là HttpOnly, Secure trên production và SameSite=Lax.
- User Management tại `/admin/users` và API `/api/users` chỉ cho role Superadmin. Form hiện quản lý email, họ tên, role và active/inactive; dữ liệu phân quyền domain/project được lưu bằng bảng `user_domains` và `user_projects` để mở rộng giao diện phân quyền tiếp theo.
- Seed gồm minhnd7@mbbank.com.vn (SUPERADMIN), ngothanhha@mbbank.com.vn (ADMIN), congha@mbbank.com.vn (USER). Password seed chỉ tồn tại dưới dạng bcrypt hash trong database.

```gherkin
Given user không chọn Ghi nhớ đăng nhập
When đăng nhập thành công
Then session hết hạn sau 2 tiếng
```

```gherkin
Given user chọn Ghi nhớ đăng nhập
When đăng nhập thành công
Then session hết hạn sau 24 tiếng
```

```gherkin
Given user click Request change password
When popup mở ra
Then popup chỉ yêu cầu CAPTCHA
And có nút Gửi
And không yêu cầu nhập form cấp lại mật khẩu chi tiết
```

```gherkin
Given CBQL Phòng mở popup phân quyền dự án
When danh sách dự án được hiển thị
Then danh sách được sắp xếp A-Z
And có ô tìm kiếm gần đúng theo mã hoặc tên dự án
```
# Bổ sung MVP1 — Gán Domain

- Form tạo user và chỉnh sửa user dùng multi-select dropdown có danh sách cuộn hiển thị toàn bộ Domain active; Superadmin chọn được một hoặc nhiều Domain.
- User inactive có thể không có Domain. API chỉ từ chối danh sách Domain rỗng khi user được đặt trạng thái active; đồng thời từ chối Domain có ID trùng lặp hoặc Domain không tồn tại/inactive. User đăng ký mới tiếp tục chọn một Domain active trong luồng đăng ký.
- Bảng `user_domains` dùng khóa chính `(user_id, domain_id)`, cho phép một user thuộc nhiều Domain và ngăn bản ghi gán trùng lặp.
- Form tạo/chỉnh sửa user có thêm trường Dự án multi-select, tùy chọn, để gán các project mà user là PM/SM. `user_projects` dùng khóa chính `(user_id, project_id)`; API từ chối ID dự án không tồn tại hoặc trùng lặp, nhưng không bắt buộc user phải có dự án trong mọi trạng thái.
- **Cập nhật:** `projects.lead_name` và `user_projects` là hai hình chiếu đồng bộ của phân công PM/SM, nhưng chiều gán chỉ còn **một hướng**: đổi Dự án trên form user (`/admin/users`) cập nhật `lead_name` tương ứng trong transaction. Popup thêm/sửa Dự án (`/admin/projects`) **không còn** cho sửa PM/SM — chỉ hiển thị `lead_name` hiện tại (đọc-only) kèm danh sách Component mà PM/SM đó được phân quyền cho dự án này (đọc từ `user_project_components`, xem §12b). Nội dung "Khi Superadmin đổi PM/SM trên dự án..." bên dưới đã lỗi thời.

## Bổ sung MVP1 — Xử lý hàng loạt tại User Management

- Tab Yêu cầu cấp lại mật khẩu hỗ trợ checkbox từng dòng, xóa hàng loạt với xác nhận một bước, và cấp lại một mật khẩu mới cho toàn bộ yêu cầu đã chọn.
- Tab Duyệt đăng ký mới hỗ trợ checkbox từng dòng, xóa hàng loạt với xác nhận một bước, và duyệt nhiều đăng ký bằng cách chuyển toàn bộ user đã chọn sang active. Nếu bất kỳ user nào chưa có Domain, Superadmin phải chọn một Domain active trong modal; hệ thống gán thêm Domain này cho những user chưa có Domain rồi kích hoạt toàn bộ danh sách trong cùng transaction.
- Luồng duyệt không yêu cầu Dự án hay thông tin phân công khác: Domain active là điều kiện duy nhất để kích hoạt user; các trường tùy chọn được cập nhật sau bằng modal sửa user.
- API chỉ xử lý tối đa 100 bản ghi/lần. Khi cấp lại mật khẩu, ticket phải còn PENDING và phải khớp với user đích.
- Nút tab `Yêu cầu cấp lại mật khẩu` hiển thị badge số ticket đang chờ; nút tab `Duyệt đăng ký mới` hiển thị badge số user inactive. Cả hai badge lấy từ dữ liệu mới nhất và tự cập nhật sau thao tác quản trị.

## Bổ sung MVP1 — Thêm nhiều user

- Superadmin có thể nhập tối đa 100 username, ngăn cách bằng dấu phẩy, không cần hậu tố `@mbbank.com.vn`.
- Mỗi username hợp lệ tạo user có họ tên bằng username, email `username@mbbank.com.vn`, role `USER`, trạng thái inactive, chưa gán Domain và mật khẩu mặc định theo yêu cầu nghiệp vụ.
- Username đã tồn tại được bỏ qua và báo lại số lượng; quá trình ghi dữ liệu mới dùng transaction.

## Bổ sung — Phân quyền theo Component (§12b)

- Bảng `user_project_components(user_id, project_id, component_name)` (khóa chính kết hợp, FK tới
  `user_projects(user_id, project_id)` ON DELETE CASCADE) thu hẹp một dự án đã cấp trong
  `user_projects` xuống chỉ những Epic có `issues.components` giao với danh sách component đã chọn.
  Không có dòng nào cho một dự án = không giới hạn (toàn quyền dự án đó) — hành vi mặc định không
  đổi so với trước khi có tính năng này.
- Chỉ áp dụng cho role **USER** (PM/SM). ADMIN (theo Domain) và SUPERADMIN/SUPERVISOR (toàn hệ
  thống) không bị giới hạn theo Component.
- Epic không có Component nào trong Jira (`issues.components` rỗng) luôn hiển thị, kể cả với user bị
  giới hạn theo Component — coi là "chung", không thuộc phạm vi giới hạn.
- Form user (`/admin/users`) hiển thị 1 khối MultiSelect Component riêng cho mỗi dự án đã chọn ở
  trường Dự án, dữ liệu Component lấy từ danh mục `project_components` (lọc theo
  `source_project_key` của dự án đó).
- Danh mục Component tích lũy tự động qua import CSV (Epic/Story's Component/s) và có thể bổ sung
  thủ công qua tab "Import Components" tại Nguồn dữ liệu (CSV 2 cột `project_key`/`component`,
  upsert vào cùng bảng `project_components`).

## Bổ sung — Ma trận phân quyền (§12c)

- Màn hình `/admin/permissions` ("Ma trận phân quyền", chỉ SUPERADMIN) cấu hình quyền
  Xem/Thêm/Sửa/Xóa cho từng cặp (tính năng, role), lưu ở `permission_features` +
  `role_feature_permissions` (xem `08-data-model.md` §14). Đây là lớp RBAC **chi tiết hơn** so với
  phân quyền Domain/Dự án ở trên — cho phép SUPERADMIN bật/tắt riêng từng hành động của ADMIN/
  SUPERVISOR/USER trên từng màn hình quản trị, thay vì chỉ dựa vào role cứng trong code.
- SUPERADMIN luôn có đủ 4 quyền trên mọi tính năng; API từ chối sửa dòng SUPERADMIN để tránh tự khóa
  quyền quản trị cao nhất.
