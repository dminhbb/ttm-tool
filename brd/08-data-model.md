# 08 — Data Model

> Nguồn sự thật là `db/schema.sql` (bootstrap cho DB mới) + toàn bộ file trong `db/migrations/*.sql`
> (không tính `.down.sql`). File này diễn giải lại đúng theo hai nguồn đó; khi có khác biệt, luôn ưu
> tiên đọc trực tiếp `db/schema.sql`/`db/migrations`. Ứng dụng chạy song song 3 profile DB (local,
> Aiven, Supabase — xem `AGENTS.md`), migration phải áp dụng cho cả 3 khi thay đổi schema.

## 1. Nguyên tắc mô hình dữ liệu

Database dùng PostgreSQL. Không có bảng `roles`/`user_roles`/`business_domains`/`alerts`/
`data_source_configs` — đây là các khái niệm cũ đã bị thay bằng thiết kế đơn giản hơn (role là 1
cột CHECK trên `users`, alert được tính live không lưu bảng riêng, xem bên dưới).

Dữ liệu chia thành các nhóm:

- Auth và RBAC (`users`, `user_domains`, `user_projects`, `user_project_components`,
  `auth_sessions`, `password_reset_requests`, `permission_features`, `role_feature_permissions`).
- Domain và Project (`domains`, `projects`, `project_components`).
- Jira/CSV canonical issue data (`issues`, `import_batches`, `import_rows`).
- Cấu hình TTM và cảnh báo (`ttm_policy_configs`, `epic_status_alert_rules`,
  `issue_type_role_mapping`).
- Lịch làm việc (`holidays`, `makeup_workdays`).
- Lịch sử/audit (`epic_alert_history`, `epic_milestone_history`, `epic_ttm_snapshots`,
  `issue_daily_snapshots`, `audit_logs`, `user_usage_daily_stats`).
- Cấu hình chung (`jira_settings`, `data_retention_configs`).

## 2. users

```text
id
email                -- UNIQUE, dùng để đăng nhập — KHÔNG có cột username riêng
full_name
password_hash        -- bcrypt hash, không lưu plaintext
role                  -- CHECK IN ('SUPERADMIN','ADMIN','SUPERVISOR','USER') — 4 role, không phải 3
is_active
last_login_at
created_at
updated_at
```

Không tồn tại bảng `roles`/`user_roles` — role là một cột CHECK trực tiếp trên `users`.

**4 role** (không phải 3 như tài liệu cũ):

| Role kỹ thuật | Role nghiệp vụ | Phạm vi | Ghi chú |
|---|---|---|---|
| SUPERADMIN | CBQL Phòng | Toàn hệ thống | Toàn quyền |
| SUPERVISOR | (không có tên nghiệp vụ riêng) | Toàn hệ thống, **read-only** | Xem như SUPERADMIN nhưng không có quyền tạo/sửa/xóa ở bất kỳ màn hình quản trị nào, không truy cập các thao tác xử lý dữ liệu (import/backup/purge). Thêm bởi `20260824_add_supervisor_role.sql`. |
| ADMIN | Lead | Theo Domain được gán (`user_domains`) | |
| USER | PM-SM | Theo Dự án được gán (`user_projects`, có thể bị thu hẹp theo Component — xem `user_project_components`) | |

Seed mặc định (`db/schema.sql`): `minhnd7@mbbank.com.vn` (SUPERADMIN), `ngothanhha@mbbank.com.vn`
(ADMIN), `congha@mbbank.com.vn` (USER).

## 3. user_domains / user_projects / user_project_components

```text
user_domains(user_id, domain_id)              -- PK kết hợp, nhiều-nhiều
user_projects(user_id, project_id)            -- PK kết hợp, nhiều-nhiều — cấp quyền PM/SM full 1 dự án
user_project_components(user_id, project_id, component_name)
                                                -- PK kết hợp, FK tới (user_id, project_id) của user_projects
                                                -- thu hẹp 1 dự án đã cấp trong user_projects xuống
                                                -- chỉ những Epic có issues.components giao với danh sách
                                                -- component_name này. Không có dòng nào cho 1 dự án
                                                -- = không giới hạn (full quyền dự án đó), giữ đúng
                                                -- hành vi user_projects cũ.
```

`user_project_components` thêm bởi `20260821_add_component_level_permissions.sql`, cùng lúc với cột
`issues.components TEXT[]` (Epic's Jira Component/s, dùng để so khớp). Chỉ áp dụng cho role USER
(PM/SM) — ADMIN/SUPERVISOR/SUPERADMIN không bị giới hạn theo Component.

## 4. domains

```text
id
domain_code           -- UNIQUE
domain_name
description
lead_name             -- text tự do, chọn từ user active trên UI (không phải FK)
is_active
created_at
updated_at
```

Tên bảng thật là `domains`, **không phải** `business_domains`. Không có cột `lead_user_id`.

## 5. projects

```text
id
project_name
domain_id             -- FK domains(id) ON DELETE SET NULL
source_project_key    -- UNIQUE, NOT NULL — Jira Project Key, DÙNG DUY NHẤT một trường project key
                       -- (cột project_key cũ đã bị DROP — xem 20260827_drop_project_key_use_source_key.sql)
source_type           -- mặc định 'JIRA'
project_category      -- CHECK IN ('Dự án','Team Agile','Team Triển khai'), nullable
ttm                    -- CHAR(1) CHECK IN ('Y','N'), mặc định 'N'
lead_name             -- PM/SM hiện tại — CHỈ ĐỌC trên popup Dự án, chỉ được set/sửa từ màn Quản lý User
is_active
created_at
updated_at
```

Không còn khái niệm "Mã hiển thị" tách biệt Source Project Key — `source_project_key` vừa là khóa
join với `issues`/`project_components` vừa là mã hiển thị duy nhất trên UI. Popup thêm/sửa Dự án
không cho gán PM/SM (chỉ hiển thị `lead_name` hiện tại + component được phân quyền của PM/SM đó,
đọc từ `user_project_components`); gán/đổi PM/SM thực hiện tại `/admin/users`, đồng bộ hai chiều
trong transaction (`auth-service.ts`'s `replacePermissions`).

## 6. project_components

```text
id
project_key          -- = projects.source_project_key (Jira key), KHÔNG phải project_id
component_name
is_active
created_at
updated_at
```

Unique `(project_key, component_name)`. Tích lũy tự động từ mỗi lần import CSV issue (Epic/Story's
Component/s field) qua `project-component-service.ts`, và có thể bổ sung thủ công qua tab
"Import Components" ở Nguồn dữ liệu (cùng bảng, cùng semantics upsert). Component cũ không bị xóa
khi không còn xuất hiện trong batch mới; `is_active` quyết định có hiện trong dropdown hay không.

## 7. issues (bảng gộp lưu mọi issue — Epic/Story/Subtask)

```text
id
source_system              -- mặc định 'JIRA'
jira_id                    -- BIGINT, ID gốc Jira
issue_key                  -- ví dụ WM-31288
issue_name
issue_type                 -- EPIC/CTNB (cấp 1), STORY/TASK/ENABLER STORY (cấp 2), còn lại = Subtask (cấp 3)
current_status
standard_status
ttm_stage
assignee_name
epic_key                   -- set trực tiếp bởi Py Jira API adapter trên mọi cấp, kể cả Subtask
parent_key
parent_id                  -- self-FK issues.id, ON DELETE SET NULL
epic_id                    -- self-FK issues.id, ON DELETE SET NULL
idea_approved_date         -- T0 (bắt đầu TTM-E2E)
start_date                 -- T1 (bắt đầu TTM-CNTT)
r4g_date                   -- kết thúc TTM-CNTT (nhập tay trên Jira)
due_date                   -- kết thúc TTM-E2E (nhập tay trên Jira)
target_r4g_date
target_due_date
jira_created_at            -- epic_created (Py Jira API adapter)
jira_updated_at             -- epic_updated (Py Jira API adapter)
epic_complexity_type       -- SIMPLE / COMPLEX
requirement_level
components                 -- TEXT[], Epic/Story's Jira Component/s — dùng cho lọc theo Component
epic_stories                -- TEXT[], danh sách Story key con trực tiếp của Epic (Py Jira API adapter)
story_subtasks              -- TEXT[], danh sách Subtask key con trực tiếp của Story (Py Jira API adapter)
source_import_batch_id     -- FK import_batches(id) ON DELETE CASCADE
aggregated_at               -- lớp dữ liệu (thời điểm chốt dữ liệu)
created_at
updated_at
```

Không có `project_id`/`domain_id` FK trực tiếp trên `issues` — Project được suy ra live từ
`issue_key` prefix hoặc `import_rows.normalized_data_json->>'projectKey'` (xem
`epic-alert-service.ts`). Không có `owner_user_id`.

**Không tồn tại các cột KPI/cảnh báo đã lưu sẵn** (`ttm_cntt_result`, `ttm_cntt_risk_level`,
`ttm_cntt_alert_level`, `current_alert_text`, `missing_standard_info_json`, `pending_count`,
`total_pending_working_days`, `ttm_cntt_target_working_days`, `ttm_e2e_target_working_days`) —
toàn bộ được tính **live** mỗi request trong `epic-alert-service.ts`/`epic-alert-phase-service.ts`/
`epic-compliance-engine.ts`, không cache trong DB. `epic_ttm_snapshots`/`issue_daily_snapshots` (mục
12) chỉ ghi, hiện KHÔNG có màn hình sống nào đọc lại từ đó.

Khóa duy nhất: `(issue_key, source_import_batch_id)` — cho phép cùng 1 issue xuất hiện ở nhiều batch
(lớp dữ liệu) khác nhau; "trạng thái mới nhất" của 1 issue luôn là bản ghi có `aggregated_at` lớn
nhất trong toàn bộ lịch sử (`LATEST_ISSUES_CTE`, `issue-resolution-sql.ts`), không phải bản ghi
trong batch gần nhất.

## 8. Chỉ mục hiệu năng trên issues

```sql
CREATE UNIQUE INDEX idx_issues_key_batch ON issues (issue_key, source_import_batch_id);
CREATE INDEX idx_issues_epic_id ON issues (epic_id) WHERE epic_id IS NOT NULL;
CREATE INDEX idx_issues_parent_id ON issues (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_issues_batch_id ON issues (source_import_batch_id);
CREATE INDEX idx_issues_aggregated_at ON issues (aggregated_at);
CREATE INDEX idx_issues_type_status ON issues (issue_type, current_status);
-- 20260828: tăng tốc LATEST_ISSUES_CTE (DISTINCT ON issue_key ORDER BY aggregated_at DESC)
CREATE INDEX idx_issues_key_aggregated_at ON issues (issue_key, aggregated_at DESC);
```

## 9. holidays / makeup_workdays

```text
holidays: id, name, holiday_type, is_multi_day, start_date, end_date, description, is_active, created_at, updated_at
makeup_workdays: id, work_date (UNIQUE), description, is_active, created_at, updated_at
```

- `holidays`: nếu `is_multi_day = false` thì `end_date = start_date`; nếu `true` thì
  `end_date >= start_date` (CHECK constraint).
- `makeup_workdays` ("Ngày làm bù", thêm bởi `20260904_create_makeup_workdays.sql`) — **ngược lại**
  với `holidays`: khai báo một ngày Thứ Bảy/Chủ Nhật cụ thể là ngày làm việc bình thường (bù cho kỳ
  nghỉ dài trước/sau đó). Một ngày nằm trong `makeup_workdays` luôn thắng cả rule cuối tuần lẫn
  `holidays` khi tính working-day (`working-days.ts`'s `HolidaySet`, nạp qua
  `master-data-service.ts`'s `getActiveHolidaySet`).

## 10. epic_status_alert_rules

```text
id
epic_complexity_type      -- SIMPLE / COMPLEX
epic_status                -- Design / In Progress / ... (không giới hạn dropdown, tối đa 50 ký tự)
early_alert_offset_days
late_alert_offset_days
is_active
created_at
updated_at
-- KHÔNG CÒN fail_offset_days — cột này đã bị DROP (20260816_separate_ttm_policy_from_alert_offsets.sql)
```

Ràng buộc: unique `(epic_complexity_type, epic_status)`; `early_alert_offset_days <
late_alert_offset_days` (không còn ràng buộc 3 chiều với fail vì fail không còn nằm ở bảng này).
Mốc Fail TTM giờ tính hoàn toàn từ `ttm_policy_configs` (mục 11), tách khỏi rule Cảnh báo sớm/muộn.

Dữ liệu seed (`db/schema.sql`): SIMPLE/Design 2-3, SIMPLE/In Progress 12-13, COMPLEX/Design 5-6,
COMPLEX/In Progress 19-20 (đơn vị ngày làm việc, không có cột fail nữa).

## 11. ttm_policy_configs

```text
id
ttm_type              -- CHECK IN ('TTM_CNTT','TTM_E2E')
epic_complexity_type  -- CHECK IN ('SIMPLE','COMPLEX')
from_ttm_field        -- CHECK IN ('IDEA_APPROVED_DATE','START_DATE')
to_ttm_field           -- CHECK IN ('R4G_DATE','DUE_DATE')
working_days           -- 1–3650
is_active
created_at
updated_at
```

Unique `(ttm_type, epic_complexity_type)`. Đây là **nguồn duy nhất** của mốc hạn TTM (thay
`fail_offset_days` cũ). Seed mặc định: TTM_CNTT SIMPLE=15 ngày, TTM_CNTT COMPLEX=30 ngày, TTM_E2E
SIMPLE=30 ngày, TTM_E2E COMPLEX=50 ngày.

**Fail TTM-E2E là cảnh báo độc lập với Fail TTM-CNTT** (không phải chỉ tham chiếu như tài liệu cũ mô
tả) — tính bởi `resolveTtmE2eRelease` (`epic-alert-service.ts`): T0 = Idea Approved Date, nếu thiếu
thì fallback `jira_created_at` (luôn có), nên baseline TTM-E2E luôn tính được bất kể Start Date có
hay không; chỉ có FAIL/NONE, không có mức Cảnh báo sớm/muộn riêng cho TTM-E2E.

## 12. Lịch sử/audit (append-only, không phải bảng nghiệp vụ sống)

### epic_alert_history

```text
id
epic_key
alert_type              -- CHECK IN ('LATE','FAIL')
alert_status
alert_date
phase                    -- CHECK IN ('OVERALL','DESIGN','DEV','TEST','PENTEST','R4GOLIVE'), mặc định 'OVERALL'
source_import_batch_id  -- ON DELETE SET NULL
created_at
```

Unique `(epic_key, alert_date, alert_type, phase)`. Ghi 1 lần/ngày mỗi Epic khi phát hiện Cảnh báo
muộn/Fail TTM-CNTT (`phase='OVERALL'`) hoặc khi 1 pha Epic 15 (DEV/TEST/PENTEST) đang Cảnh báo muộn
(`phase=<tên pha>`). Dùng để: (a) quyết định Epic Released có tiếp tục hiển thị trên "Quản trị Epic
(rút gọn)" hay không (chỉ hiện nếu từng có lịch sử cảnh báo), (b) hiển thị popup lịch sử cảnh báo.
Việc ghi hiện đang **tắt tạm thời** (`ALERT_HISTORY_RECORDING_ENABLED = false` trong
`epic-alert-phase-service.ts`, do giới hạn connection của Aiven free tier) — code path vẫn còn
nguyên, chỉ không gọi.

### epic_milestone_history

```text
id
epic_key
milestone           -- ví dụ DESIGN_DONE
milestone_date
source_import_batch_id  -- ON DELETE SET NULL
created_at
```

Unique `(epic_key, milestone)` — ghi một lần duy nhất, không ghi đè khi mốc đã tồn tại (giữ đúng
ngày phát hiện đầu tiên). Khác `epic_alert_history` (chỉ ghi cảnh báo LATE/FAIL) — bảng này ghi các
mốc hoàn thành nội bộ dùng để xác định pha hiện tại của Epic 15.

### epic_ttm_snapshots / issue_daily_snapshots

Hai bảng tổng hợp compact/đầy đủ, ghi 1 lần mỗi `aggregated_at` để giữ lịch sử dài hạn sau khi raw
batch bị dọn (`source_import_batch_id` được set `NULL` khi đó, snapshot vẫn còn). **Hiện KHÔNG có
màn hình sống nào đọc lại từ 2 bảng này** — mọi màn hình Epic Alerts/Dashboard đều tính live từ
`issues`. Cột giống `issues` (rút gọn), unique `(issue_key, aggregated_at)` /
`(epic_key, aggregated_at)`.

## 13. issue_type_role_mapping

```text
id
issue_type    -- UNIQUE, ví dụ 'BA', 'UAT', 'Sub test execution'
team_role      -- CHECK IN ('BA','DEV','TEST','PM')
created_at
updated_at
```

Map một Issue Type Jira cụ thể (thường là loại Subtask) sang team-role BA/DEV/TEST/PM, dùng để xác
định Epic 15 đã hoàn thành pha DESIGN/DEV/TEST hay chưa (`epic-milestone-history-service.ts`), thay
vì hard-code tên issue type trong service code.

## 14. permission_features / role_feature_permissions (Ma trận phân quyền)

```text
permission_features(feature_key PK, feature_name, category CHECK IN ('ADMIN','VIEW_ONLY'), display_order)
role_feature_permissions(feature_key FK, role CHECK IN ('SUPERADMIN','ADMIN','SUPERVISOR','USER'),
                          can_view, can_add, can_edit, can_delete, PK (feature_key, role))
```

Màn hình `/admin/permissions` ("Ma trận phân quyền", SUPERADMIN-only) cấu hình quyền
Xem/Thêm/Sửa/Xóa cho từng cặp (tính năng, role). `category='ADMIN'` cho phép bật/tắt cả 4 quyền;
`category='VIEW_ONLY'` chỉ có ý nghĩa với `can_view` (dùng cho các màn hình theo dõi Epic, popup
help, tài liệu sản phẩm). SUPERADMIN luôn được seed đủ 4 quyền TRUE trên mọi feature và API từ chối
sửa dòng SUPERADMIN. Lưu ý: seed feature key `epic_alerts_30`/`epic_alerts_15` vẫn giữ tên gọi cũ
"Quản lý Epic 30"/"Quản lý Epic 15" dù UI đã đổi nhãn thành "Quản trị Epic (rút gọn)"/"(đầy đủ)" —
đây chỉ là key nội bộ, không đổi tên field để tránh phá dữ liệu đã seed.

## 15. jira_settings

```text
id            -- luôn = 1 (singleton)
api_base_url  -- dự phòng cho tích hợp Jira API trực tiếp sau này
view_issue_base_url  -- prefix nối trực tiếp với Epic Key để tạo link "Mở Epic trên Jira"
updated_at
```

Cấu hình tại "Quản lý chung".

## 16. user_usage_daily_stats

```text
user_id       -- FK users(id) ON DELETE CASCADE
stat_date     -- DATE
login_count
feature_count  -- số lần bấm menu trái + menu avatar
data_count     -- số lần thao tác trên các màn Epic Alerts (lịch sử cảnh báo, Epic Browser, phân trang...)
PRIMARY KEY (user_id, stat_date)
```

Hiển thị dạng tổng all-time (SUM theo `stat_date`) tại popup "Thông tin cá nhân" và bảng Quản lý
User; lưu theo ngày để dành sẵn cho báo cáo theo ngày sau này.

## 17. auth_sessions / password_reset_requests / audit_logs

```text
auth_sessions: token_hash (PK, SHA-256 của cookie token), user_id, expires_at, created_at
password_reset_requests: id, email, status CHECK IN ('PENDING','RESOLVED'), created_at, resolved_at, resolved_by
audit_logs: id, user_id, action, entity_type, entity_id, created_at
```

`password_reset_requests` khóa theo **email**, không có `username`/`captcha_verified`/`handled_by`/
`note` như tài liệu cũ mô tả — CAPTCHA được xác thực ở tầng API trước khi tạo request, không lưu cờ
riêng trong bảng.

## 18. import_batches / import_rows

```text
import_batches: id, source_type, file_name, import_type (MANUAL/AUTO), imported_by, imported_at,
                aggregated_at, total_rows, success_rows, warning_rows, error_rows,
                status (SUCCESS/FAILED/COMPLETED_WITH_WARNINGS), metadata_json, created_at, updated_at
import_rows: id, import_batch_id, row_number, raw_data_json, normalized_data_json,
             validation_status (VALID/INVALID/WARNING), validation_errors_json, created_at
```

`normalized_data_json` lưu thêm `projectKey`/`components` để Duyệt dữ liệu tạo option Project/
Component mà không sửa canonical schema. Từ bản downgrade validate (xem `07-data-source-and-csv-
import.md`), 2 rule "R4G Date trước Start Date"/"Due Date trước T0" chỉ còn ở mức `WARNING`, không
còn `INVALID` — dòng vẫn được ghi vào `issues` (`validIssues` chỉ loại `INVALID`), chỉ bị đánh dấu
là dữ liệu bất thường ở tầng đọc (`hasDataAnomaly`, xem `03-mvp1-working-days-alert-rules.md`).

## 19. data_retention_configs

```text
id                          -- singleton, luôn bằng 1
raw_import_retention_days   -- mặc định 30, 7–3650
updated_at
```

Chỉ SUPERADMIN được cập nhật. Sau mỗi import lưu chính thức, hệ thống tự dọn raw batch quá hạn
(`import_batches`/`import_rows`/`issues`), luôn giữ batch vừa import và lớp dữ liệu mới nhất;
`epic_ttm_snapshots`/`issue_daily_snapshots` không bị dọn theo — đó là lý do 2 bảng snapshot tồn
tại.

---

# Bổ sung MVP1 — Cardinality user/domain

Bảng `user_domains(user_id, domain_id)` là quan hệ nhiều-nhiều, dùng khóa chính kết hợp
`(user_id, domain_id)`: một user có thể có một hoặc nhiều Domain và không thể có bản ghi gán trùng.
User active bắt buộc có ít nhất một Domain; user inactive có thể chưa có Domain. Mọi Domain được
gán phải active và không trùng lặp.
