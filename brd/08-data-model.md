# 08 — Data Model

## 1. Nguyên tắc mô hình dữ liệu

Database sử dụng PostgreSQL.

Dữ liệu chia thành các nhóm:

- Auth và RBAC.
- Domain và Project.
- Jira/CSV canonical issue data.
- TTM config.
- Alert rules.
- Holiday và working day.
- Import batches.
- Audit logs.

## 2. users

```text
id
username
email
password_hash
full_name
status
last_login_at
created_at
updated_at
```

## 3. roles

```text
id
code
name
description
```

Role code mặc định:

```text
CBQL_PHONG
LEAD
PM_SM
```

## 4. user_roles

```text
user_id
role_id
```

## 5. business_domains

```text
id
code
name
description
lead_user_id
status
created_at
updated_at
```

## 6. user_domains

```text
id
user_id
domain_id
role_in_domain
created_at
updated_at
```

## 7. projects

```text
id
project_key
project_name
domain_id
source_type
source_project_key
lead_user_id
status
created_at
updated_at
```

## 8. user_projects

```text
id
user_id
project_id
permission_level
created_at
updated_at
```

## 9. issues (Bảng gộp lưu trữ tất cả các Issue)

Bảng gộp duy nhất lưu trữ tất cả các loại issue từ Jira (Epic, Story, Task, Bug, Subtask). Thiết kế này tối ưu hóa việc truy vấn phân cấp và tính toán tiến độ.

```text
id                          -- ID tự tăng trong hệ thống (Serial Primary Key)
jira_id                     -- ID gốc của Jira (số nguyên)
source_system
issue_key                   -- Key của issue (ví dụ: WM-31288)
issue_name                  -- Tên/Summary của issue
project_id                  -- FK tới bảng projects
domain_id                   -- FK tới bảng business_domains
issue_type                  -- Phân loại: EPIC, STORY, TASK, BUG, SUBTASK
current_status              -- Trạng thái hiện tại trên Jira
standard_status             -- Trạng thái chuẩn hóa
ttm_stage                   -- Giai đoạn TTM (Phân tích, Phát triển, SIT/UAT, etc.)
owner_user_id               -- ID chủ sở hữu
assignee_name               -- Tên người xử lý

-- Trường liên kết phân cấp tối ưu (phân giải nội bộ trong cùng một batch import)
parent_id                   -- Self-referencing FK tới issues.id (Ví dụ: Subtask chỉ tới Story cha)
epic_id                     -- Self-referencing FK tới issues.id (Chỉ thẳng từ Story/Subtask tới Epic gốc)

-- Các mốc thời gian (sử dụng ngày làm việc)
idea_approved_date          -- T0 (bắt đầu E2E, chỉ dùng cho Epic)
start_date                  -- T1 (bắt đầu CNTT)
r4g_date                    -- Ngày đạt R4G (kết thúc CNTT)
due_date                    -- Ngày Released (kết thúc E2E)
target_r4g_date             -- Ngày hạn R4G dự kiến
target_due_date             -- Ngày hạn E2E dự kiến

-- Các trường KPI / Cảnh báo (chủ yếu dùng cho Epic)
epic_complexity_type        -- Phân loại Epic: SIMPLE / COMPLEX
ttm_cntt_target_working_days
ttm_e2e_target_working_days
ttm_cntt_result             -- Đạt / Fail TTM-CNTT
ttm_cntt_risk_level         -- Mức độ rủi ro
ttm_cntt_alert_level        -- Mức độ cảnh báo (Cảnh báo sớm, Cảnh báo muộn, Fail)
current_alert_text          -- Nội dung text cảnh báo

-- Metadata chất lượng dữ liệu và Pending
missing_standard_info_json
pending_count
total_pending_working_days

source_import_batch_id      -- FK tới bảng import_batches
aggregated_at               -- Lớp dữ liệu (thời gian dữ liệu được tổng hợp/chốt, dd/mm/yyyy hh:mm)
created_at
updated_at
```

## 10. Chỉ mục hiệu năng cho bảng issues (Indexes)

Các chỉ mục bắt buộc được thiết lập trên PostgreSQL để đạt hiệu năng truy vấn tối ưu:

```sql
-- Tìm kiếm nhanh và đảm bảo tính duy nhất theo Jira Key trong mỗi đợt import (Composite Unique Index)
CREATE UNIQUE INDEX idx_issues_key_batch ON issues (issue_key, source_import_batch_id);

-- Tìm kiếm toàn bộ Story/Subtask con cháu của Epic trong 1 query (Không cần JOIN)
CREATE INDEX idx_issues_epic_id ON issues (epic_id) WHERE epic_id IS NOT NULL;

-- Tìm kiếm mối quan hệ cha con trực tiếp (Ví dụ: Story -> Subtasks)
CREATE INDEX idx_issues_parent_id ON issues (parent_id) WHERE parent_id IS NOT NULL;

-- Tìm kiếm và lọc theo Project
CREATE INDEX idx_issues_project_id ON issues (project_id);

-- Lọc danh sách Epic theo loại và trạng thái (Dùng cho Homepage 3 Panel)
CREATE INDEX idx_issues_type_status ON issues (issue_type, current_status);
```

## 11. holidays

Holiday có thể là một ngày hoặc nhiều ngày.

```text
id
name
holiday_type
is_multi_day
start_date
end_date
description
status
created_at
updated_at
```

Quy tắc:

- Nếu `is_multi_day = false`, `end_date = start_date`.
- Nếu `is_multi_day = true`, `end_date >= start_date`.

## 12. epic_status_alert_rules

```text
id
epic_complexity_type      -- SIMPLE / COMPLEX
epic_status              -- Design / In Progress
early_alert_offset_days
late_alert_offset_days
fail_offset_days
is_active
created_at
updated_at
```

Dữ liệu mặc định:

| epic_complexity_type | epic_status | early | late | fail |
|---|---|---:|---:|---:|
| SIMPLE | Design | 2 | 3 | 15 |
| SIMPLE | In Progress | 12 | 13 | 15 |
| COMPLEX | Design | 5 | 6 | 30 |
| COMPLEX | In Progress | 19 | 20 | 30 |

Ràng buộc triển khai:

- Tên bảng vật lý: `epic_status_alert_rules`.
- Unique `(epic_complexity_type, epic_status)`; `epic_complexity_type` chỉ nhận `SIMPLE`/`COMPLEX`. Design và In Progress là dữ liệu seed, nhưng `epic_status` cho phép trạng thái Epic mới dài tối đa 50 ký tự.
- Các offset là số nguyên không âm và phải tuân thủ `early_alert_offset_days < late_alert_offset_days < fail_offset_days`.
- Có partial index theo `is_active` để nạp rule dùng cho tính Epic Monitoring.

## 13. ttm_policy_configs

## 12.1 Local authentication và RBAC

Các bảng triển khai: `users`, `user_domains`, `user_projects`, `auth_sessions`, `password_reset_requests`, `audit_logs`. `users.password_hash` lưu bcrypt hash; `auth_sessions.token_hash` lưu SHA-256 của token cookie thay vì token thô. Role bị giới hạn `SUPERADMIN`, `ADMIN`, `USER`.

```text
id
code
name
epic_complexity_type
ttm_cntt_working_days
ttm_e2e_working_days
is_active
created_at
updated_at
```

## 14. password_reset_requests

```text
id
username
user_id
requested_at
status
captcha_verified
handled_by
handled_at
note
created_at
updated_at
```

## 15. data_source_configs

```text
id
source_type
name
config_json
is_active
last_auto_import_date
created_at
updated_at
```

## 16. import_batches

```text
id
source_type
file_name
import_type      -- MANUAL / AUTO_ON_LOGIN
imported_by
imported_at
total_rows
success_rows
warning_rows
error_rows
status
metadata_json
created_at
updated_at
```

## 17. import_rows

```text
id
import_batch_id
row_number
raw_data_json
normalized_data_json
validation_status
validation_errors_json
created_at
```

`normalized_data_json` giữ payload đã chuẩn hóa của dòng CSV để tra cứu theo batch. Với Jira CSV mới, payload lưu thêm `projectKey` và `components` (giá trị cột `Component/s`/`Components`) để màn hình Duyệt dữ liệu tạo option Project và Component/s mà không thay đổi canonical schema.

## 17.1. project_components

```text
id
project_key
component_name
is_active
created_at
updated_at
```

Catalog này có unique key `(project_key, component_name)`. Import thành công chỉ thêm cặp mới hoặc cập nhật timestamp; không xóa component đã từng xuất hiện. Trạng thái `is_active` quyết định component có xuất hiện trong dropdown Duyệt dữ liệu hay không.

## 18. alerts

```text
id
alert_code
alert_type
severity
entity_type
entity_id        -- Tham chiếu tới issues.id
epic_id          -- Tham chiếu tới issues.id (Epic gốc)
status
title
message
first_detected_at
last_detected_at
resolved_at
metadata_json
created_at
updated_at
```

## 19. audit_logs

```text
id
user_id
action
entity_type
entity_id
old_value_json
new_value_json
created_at
ip_address
```
# Bổ sung MVP1 — Cardinality user/domain

Bảng `user_domains(user_id, domain_id)` là quan hệ nhiều-nhiều, dùng khóa chính kết hợp `(user_id, domain_id)`: một user có thể có một hoặc nhiều Domain và không thể có bản ghi gán trùng. User active bắt buộc có ít nhất một Domain; user inactive có thể chưa có Domain. Mọi Domain được gán phải active và không trùng lặp.

## Bổ sung MVP1 — Snapshot lịch sử và cấu hình raw retention

### issue_daily_snapshots

```text
id
issue_key
issue_type                 -- EPIC / STORY / SUBTASK và loại issue được import
issue_name
jira_id
project_key
epic_key
parent_key
assignee_name
current_status
epic_complexity_type
requirement_level
idea_approved_date
start_date
r4g_date
due_date
target_r4g_date
source_import_batch_id     -- ON DELETE SET NULL
aggregated_at
created_at
```

Unique `(issue_key, aggregated_at)`. Đây là bảng tổng hợp lịch sử vĩnh viễn, tách khỏi raw import để hỗ trợ lịch sử cảnh báo sau khi dọn batch cũ.

### data_retention_configs

```text
id                          -- singleton, luôn bằng 1
raw_import_retention_days   -- mặc định 30, 7–3650
updated_at
```

Chỉ SUPERADMIN được cập nhật cấu hình này.
