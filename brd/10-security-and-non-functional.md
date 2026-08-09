# 10 — Security and Non-Functional Requirements

## 1. Bảo mật xác thực

- Không lưu mật khẩu plaintext.
- Password phải hash bằng Argon2id hoặc bcrypt.
- Session cookie dùng HttpOnly.
- Bật Secure cookie trong production.
- Có SameSite phù hợp.
- Rate limit login.
- Ghi audit log khi cấp lại mật khẩu.
- Không log password, token, captcha answer hoặc secret.

## 2. CAPTCHA cho Request change password

Request change password phải có CAPTCHA để giảm spam request.

Sau khi CAPTCHA hợp lệ:

- Tạo password reset request.
- Không tự động đổi mật khẩu.
- Admin/CBQL Phòng xử lý cấp lại mật khẩu.

## 3. Phân quyền backend

Mọi kiểm tra phân quyền phải thực hiện ở backend.

Không chỉ ẩn menu ở frontend.

Quy tắc dữ liệu:

- CBQL Phòng xem toàn bộ.
- Lead xem theo domain.
- PM-SM xem theo project.

## 4. Read-only với Jira

Ứng dụng không ghi ngược Jira.

Nếu sau này dùng Jira API thì token/API credential chỉ dùng quyền đọc nếu có thể.

## 5. Data import safety

CSV import cần:

- Validate trước khi ghi canonical data.
- Không execute công thức hoặc macro trong CSV.
- Giới hạn kích thước file.
- Kiểm tra định dạng cột.
- Ghi import log.
- Cho phép validate-only.

## 6. Hiệu năng

- Table phải phân trang phía server.
- Search và filter nên chạy phía server với dữ liệu lớn.
- Popup chọn dự án phải hỗ trợ search gần đúng, không load/render toàn bộ nếu dữ liệu quá lớn.
- Dashboard không tải toàn bộ issue tree nếu không cần.

## 7. Logging và audit

Cần log:

- Login success/fail.
- Password reset request.
- Admin reset password.
- CRUD user/domain/project/holiday/status rule.
- Import CSV.
- Rule calculation error.
- Data quality alert.

## 8. Tính toán ngày làm việc

Hàm tính ngày làm việc phải có unit test cho:

- Bỏ qua Thứ Bảy/Chủ Nhật.
- Bỏ qua Holiday một ngày.
- Bỏ qua Holiday nhiều ngày.
- Holiday trùng cuối tuần.
- T1 rơi vào ngày nghỉ.
- Cộng offset cảnh báo theo ngày làm việc.

## 9. Coding constraints

AI Agent phải tuân thủ:

- TypeScript strict mode.
- Không hard-code rule nếu BRD yêu cầu cấu hình được.
- Tách business logic khỏi UI.
- Rule engine có unit test.
- Auth provider và Data Source Adapter có interface rõ ràng.
- Không bỏ qua lỗi TypeScript/lint bằng cách dùng `any` tùy tiện.

## 10. Skill project

Khi triển khai, AI Agent phải đọc và tuân thủ các skill trong project:

- `superpowers` để lập kế hoạch và chia task.
- `coding skill` cho chuẩn coding.
- `pentest skill` cho an toàn thông tin.
- `uiux skill` cho thiết kế giao diện.

## 11. Non-functional requirements

- Hệ thống phải chạy ổn định trên môi trường nội bộ công ty.
- Có cấu hình môi trường qua `.env`.
- Không commit secret vào source code.
- Có migration database.
- Có seed data cho local development.
- Có README hướng dẫn chạy local.
- Có test cho các module critical.
