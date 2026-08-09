# 05 — Auth, RBAC and User Management

## 1. Role hệ thống

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
