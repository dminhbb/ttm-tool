# 11 — MVP Roadmap

> **Cập nhật:** đây là roadmap dự kiến ban đầu — nhiều mục đã build xong và vượt phạm vi mô tả ở
> đây (Dashboard, TTM-E2E có cảnh báo Fail riêng, Py Jira API adapter đang có groundwork trong
> schema `issues.jira_created_at`/`epic_stories`/`story_subtasks`, Ma trận phân quyền, phân quyền
> theo Component, SUPERVISOR role, Ngày làm bù...). Đừng dùng file này để suy ra "chưa làm" — luôn
> đối chiếu với `db/schema.sql`/`db/migrations` và các file BRD theo chủ đề (xem bảng định tuyến ở
> `BRD_INDEX_FOR_AI_AGENT.md` §14) để biết trạng thái thật.

## MVP 0 — Foundation, Auth và RBAC

### Mục tiêu

Xây dựng nền tảng ứng dụng.

### Phạm vi

- Next.js + TypeScript.
- PostgreSQL.
- ORM/migration.
- Local authentication.
- Session 2h/24h theo checkbox ghi nhớ đăng nhập.
- Role CBQL Phòng, Lead, PM-SM.
- User CRUD.
- Reset password.
- Request change password với CAPTCHA.
- RBAC backend.

## MVP 1 — CSV Data Source và Canonical Data

### Mục tiêu

Có nguồn dữ liệu ban đầu để vận hành.

### Phạm vi

- Data Source Adapter interface.
- CSV Import Adapter.
- Upload CSV.
- Validate CSV.
- Import log.
- Import tự động một lần mỗi ngày khi CBQL Phòng đăng nhập.
- Canonical tables cho Epic.

## MVP 2 — Homepage ba panel và TTM-CNTT cơ bản

### Mục tiêu

Xây dựng màn hình vận hành chính.

### Phạm vi

- Homepage 3 panel.
- Filter From date / To date.
- Phân loại Epic vào Panel 1/2/3.
- Cột Missing Standard Info.
- Cột Cảnh báo.
- Cột chuẩn dùng chung giữa các panel.
- Tính target R4G Date theo ngày làm việc.

## MVP 3 — Holiday, Epic Status Alert Config và Rule Engine

### Mục tiêu

Cho phép cấu hình rule và ngày nghỉ.

### Phạm vi

- CRUD Holiday với ngày bắt đầu/ngày kết thúc.
- Toggle nhiều ngày.
- Rule engine ngày làm việc.
- Màn hình Status Alert Rules cho Design/In Progress.
- Rule cảnh báo Epic đơn giản/phức tạp.
- Unit test cho ngày làm việc và cảnh báo.

## MVP 4 — Story/Subtask, Pending và Overdue

### Mục tiêu

Mở rộng theo dõi xuống Story/Subtask và Pending.

### Phạm vi

- Import Story/Subtask.
- Quan hệ Epic → Story → Subtask.
- Pending periods.
- Pending reason.
- Subtask quá hạn.
- Alert Center.

## MVP 5 — TTM-E2E và Dashboard kết hợp

### Mục tiêu

Bổ sung quản trị toàn trình E2E.

### Phạm vi

- Tính TTM-E2E từ T0 đến Due Date.
- Target TTM-E2E 30/50 ngày làm việc.
- Phân rã T0 → T1 → R4G Date → Due Date.
- Dashboard TTM-E2E.
- Combined Dashboard.

## MVP 6 — Jira Adapter thay CSV

### Mục tiêu

Thay nguồn CSV bằng kết nối Jira.

### Phạm vi

- Jira API Adapter hoặc Jira DB Query Adapter.
- Mapping field Jira.
- Epic Link cho Story → Epic.
- parent cho Subtask → Story.
- Đồng bộ tự động theo job.
- Giữ nguyên downstream modules.

## Nguyên tắc triển khai MVP

Mỗi MVP cần có:

- Requirement markdown.
- Data model chi tiết.
- API spec.
- UI spec.
- Acceptance Criteria.
- Test cases.
- Implementation plan.
- Review checklist.

Không chuyển sang MVP tiếp theo nếu MVP hiện tại chưa có test cho rule critical.
