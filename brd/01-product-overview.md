# 01 — Product Overview

## 1. Tên sản phẩm

**TTM Monitor** — công cụ giám sát rủi ro Time to Market cho Epic phát triển phần mềm.

## 2. Bối cảnh

Công ty quản lý yêu cầu phát triển phần mềm trên Jira. Mỗi yêu cầu phát triển được ghi nhận là một **Epic**. Dưới Epic có các **Story**, dưới Story là các **Subtask** của development team.

TTM Monitor được xây dựng để theo dõi rủi ro chậm Time to Market, ưu tiên cho khối CNTT.

## 3. Hai tiêu chí Time to Market

Mỗi Epic thuộc phạm vi theo dõi sẽ được đánh giá đồng thời theo hai tiêu chí:

1. **TTM-CNTT**
2. **TTM-E2E**

Trong MVP1, hệ thống chỉ cần tập trung vào **TTM-CNTT**.

## 4. Mục tiêu kinh doanh

Hệ thống cần hỗ trợ:

- Theo dõi các Epic phát triển phần mềm theo TTM.
- Phát hiện sớm Epic có nguy cơ chậm TTM-CNTT.
- Phát hiện Epic thiếu thông tin tiêu chuẩn như Start Date, T0, loại Epic, owner.
- Phân loại Epic theo ba nhóm trên Homepage.
- Cảnh báo trạng thái Design và In Progress theo mốc ngày làm việc.
- Theo dõi Pending và nguyên nhân Pending để cải tiến liên tục.
- Cung cấp Dashboard cho CBQL Phòng, Lead và PM-SM.
- Quản lý người dùng, phân quyền, domain nghiệp vụ và dự án.
- Quản lý dữ liệu import CSV trong MVP đầu.

## 5. Phạm vi MVP1

MVP1 tập trung:

- Local login.
- RBAC theo 3 role.
- Quản lý user/domain/project/holiday/status alert rule.
- Import CSV làm nguồn dữ liệu ban đầu.
- Homepage 3 panel.
- Cảnh báo TTM-CNTT cho Epic status Design và In Progress.
- Tính thời gian bằng ngày làm việc.

## 6. Ngoài phạm vi MVP1

Các nội dung chưa cần làm trong MVP1:

- Ghi ngược dữ liệu lên Jira.
- Jira API live sync.
- Jira DB Query trực tiếp.
- TTM-E2E full dashboard.
- Story/Subtask risk chi tiết.
- Notification email/Teams/Slack.
- SSO AD Server hoặc Keycloak.
- Tự động scheduled job chạy nền ngoài trigger khi CBQL Phòng đăng nhập.

## 7. Nguyên tắc Jira read-only

TTM Monitor chỉ đọc dữ liệu từ nguồn ngoài, gồm CSV trong MVP đầu và Jira trong các MVP sau.

Phần mềm **không có chức năng ghi ngược trở lại Jira**.

Dữ liệu quản trị riêng như phân quyền, rule, cấu hình, import log và ghi chú xử lý được lưu locally trong PostgreSQL của ứng dụng.

## 8. Đối tượng sử dụng

Ba nhóm người dùng chính:

- **CBQL Phòng** — tương đương superadmin.
- **Lead** — tương đương admin theo domain.
- **PM-SM** — tương đương user theo dự án.

Chi tiết phân quyền xem tại `05-auth-rbac-user-management.md`.
