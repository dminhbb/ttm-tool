# Knowledge base — chỉ mục chức năng TTM Monitor

Đọc file này đầu tiên ở bước 1 (Rà soát) của `QUY_TRINH_PHAT_TRIEN.md`: tìm chức năng theo tên hoặc từ khoá người dùng
hay gọi, mở card tương ứng, chỉ đọc source ở những file card chỉ ra.

Quy tắc:

- Mỗi chức năng một card trong `docs/kb/features/`, theo khung của `docs/kb/features/_TEMPLATE.md`.
- Chức năng chưa có card: khi có yêu cầu sửa lần đầu, viết card ngay sau bước rà soát rồi đổi trạng thái ở bảng dưới.
- Đổi file chính, bảng DB, API hay contract của một chức năng thì sửa card trong cùng commit.

| Chức năng | Từ khoá người dùng hay gọi | Điểm vào chính | Card |
|---|---|---|---|
| Quản trị Epic | Epic 15, danh sách Epic, Fail TTM-CNTT, giao việc, ẩn Epic, bình luận | `src/app/epic-alerts-15/`, `src/app/api/epic-alerts-15/` | [epic-alerts-15](features/epic-alerts-15.md) |
| TTM Dashboard 2 | Dashboard, phễu TTM, xu hướng, ticker | `src/app/ttm-dashboard-2/`, `src/app/api/ttm-dashboard-2/`, `src/lib/ttm-dashboard-2-*` | Chưa có |
| Scoring Service / Rule | Rule, badge, Đạt/Fail, nhóm rule, Logic cảnh báo | `src/lib/scoring/`, `src/app/admin/rule-management/` | Chưa có (xem spec `docs/superpowers/specs/2026-09-29-scoring-service-design.md`) |
| Import dữ liệu | Import CSV, crawl Jira, Từ chối import, Epic ngoại lệ | `src/lib/import-service.ts`, `src/lib/adapters/`, `src/lib/import-admission-rules.ts`, `src/components/data-source/` | Chưa có |
| Cache dữ liệu dẫn xuất | Tạo lại cache, Theo dõi cache dữ liệu | `src/lib/daily-cache-service.ts`, `src/components/data-source/CacheStatusPanel.tsx` | Chưa có |
| Chuẩn hoá dữ liệu | Data normalization, Epic thiếu thông tin | `src/app/data-normalization/`, `src/lib/data-normalization*.ts` | Chưa có |
| Báo cáo | Báo cáo Epic, Báo cáo bắt đầu sớm | `src/app/reports/`, `src/lib/reports-service.ts`, `src/lib/early-start-report*.ts` | Chưa có |
| Người dùng, phân quyền | User, PM/SM, quyền xem, ma trận quyền, Xem dưới quyền | `src/app/admin/users/`, `src/app/admin/permissions/`, `src/lib/permission-matrix-*`, `src/modules/iam/` | Chưa có |
| Danh mục | Domain, Project, Component, ngày nghỉ, Tiêu chí TTM | `src/app/admin/domains/`, `src/app/admin/projects/`, `src/app/admin/holidays/`, `src/app/admin/status-alert-rules/` | Chưa có |
| Lịch sử dữ liệu, sao lưu | Layer, snapshot tuần, backup DB | `src/lib/data-layer-retention*.ts`, `src/lib/db-backup-*.ts`, `src/app/admin/database/` | Chưa có |
| Bản tin | News letter | `src/app/news-letter/`, `src/lib/news-letter/` | Chưa có |
| MCP, SSO | MCP tool, OAuth, SSO | `src/lib/mcp-*.ts`, `src/app/api/mcp/`, `src/lib/sso-service.ts` | Chưa có |

Tài liệu nền dùng chung cho mọi card: `AGENTS.md` (môi trường, quy tắc bắt buộc), `BRD_INDEX_FOR_AI_AGENT.md`,
`docs/database-erd.md` (bảng DB), `docs/architecture/PMS-HLAD.md`.
