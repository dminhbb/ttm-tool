# Quản trị Epic — `/epic-alerts-15`

Cập nhật lần cuối: 2026-11-23. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

## Mục đích

Danh sách Epic của người đang đăng nhập (theo quyền dữ liệu), mỗi dòng có các ô pha (Design, Dev, Test, R4Golive...),
dải ngày TTM-CNTT / TTM-E2E, badge Scoring, kết quả "Đạt"/Fail, bình luận và trạng thái giao việc.
Cũng là màn hình đích khi bấm drill-down từ TTM Dashboard 2 (popup "Danh sách Epic - Fail TTM-CNTT"...).

BRD: `brd/13-epic-15-and-epic-30-management.md`, `brd/12-ttm-policy-and-epic-alert-ui.md`, `brd/16-ttm-indexes.md`.
Spec: `docs/superpowers/specs/2026-09-29-scoring-service-design.md`, `docs/superpowers/specs/2026-10-25-rule-groups-design.md`.

## Điểm vào

| Loại | Đường dẫn |
|---|---|
| Màn hình | `src/app/epic-alerts-15/page.tsx`, `epic-alerts-15.css` |
| API danh sách | `GET /api/epic-alerts-15` → `src/app/api/epic-alerts-15/route.ts` |
| API lịch sử / timeline 1 Epic | `src/app/api/epic-alerts-15/[epicKey]/alert-history/route.ts`, `.../alert-timeline/route.ts` |
| API bình luận, ẩn, giao việc | `src/app/api/epic-marks/[epicKey]/route.ts`, `src/app/api/epic-marks/assigned-notice/route.ts` |
| API cây issue của Epic | `src/app/api/epic-browser/route.ts` |
| API phụ | `/api/black-listed-epics`, `/api/project-components`, `/api/ttm-index-global` |
| Deep link từ dashboard | `src/lib/epic-alerts-deep-link.ts`, `src/components/ttm-dashboard-2/EpicAlertsIframeModal.tsx` |

## Luồng dữ liệu

```text
Jira crawl tool / CSV
  → import adapter (src/lib/adapters/*)                 → bảng issues
  → epic-alert-service.ts  (quyền xem, dữ kiện Epic: tên, PM/SM, ngày)
  → scoring/ (score-epic.ts, rules/*, projection.ts)    → verdict, badge
  → epic-alert-rows-service.ts + epic-row-geometry.ts   → EpicAlertRowPhased
  → epic-alert-row-cache-service.ts                     → bảng epic_alert_row_cache
  → epic-alert-row-cache-query-service.ts               (lọc, phân trang, đếm bằng SQL)
  → api/epic-alerts-15/route.ts  (+ epic-mark-service.ts đọc live bình luận/ẩn)
  → page.tsx
```

API có 2 chế độ (xem `route.ts`):

- **`mode: 'paged'`** (đa số request): đọc `epic_alert_row_cache`, lọc/phân trang trên server.
- **`mode: 'full'`**: khi có bộ lọc ngày nâng cao, xem layer cũ (`asOfDate`), đổi "Phạm vi dữ liệu cho TTM" khác mặc định,
  hoặc cache chưa có. Tính lại live bằng `getEpicAlertRowsForDisplay`, trình duyệt tự lọc. Chậm hơn nhiều.

Sửa logic lọc phải sửa **cả hai** chế độ: SQL trong `epic-alert-row-cache-query-service.ts` và hàm lọc phía client
(`matchesAlertFilter` trong `epic-row-verdicts.ts`, `matchesPmSmFilter` trong `epic-pm-sm-assignment.ts`).

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|
| Cột, ô, icon, bộ lọc trên màn hình | `page.tsx`, `epic-alerts-15.css`, `src/components/epic-alerts/*` |
| Tên Epic, PM/SM, ngày, dải màu (stripe) của dòng | `epic-alert-rows-service.ts`, `epic-row-geometry.ts`, `epic-alert-service.ts` |
| "Đạt"/Fail, badge, cảnh báo | `src/lib/scoring/rules/*`, `catalog.ts`, `registry.ts` (không sửa ở màn hình) |
| Ý nghĩa bộ lọc "Lỗi/cảnh báo" | `epic-row-verdicts.ts` + SQL tương ứng trong `epic-alert-row-cache-query-service.ts` |
| Thứ tự sắp xếp | `epic-alert-sort-rules.ts` (cả SQL lẫn `compareEpicListRows`) |
| Quyền xem dữ liệu, "Quyền xem" bổ sung, "Xem dưới quyền" | `epic-alert-service.ts` (`resolveAccessScope`), `user-view-grants-service.ts`, `view-as-user-service.ts`, `buildAccessScopeClause` |
| Bình luận, ẩn Epic, giao việc, popup Thông tin Epic (bấm Epic key / ô Review mở `EpicMarkModal`, gồm cả công tắc `BlackListSwitch` "Epic ngoại lệ", tab Scoring / Duyệt Epic / Giải trình Fail TTM / **TTM Calendar** — `TtmCalendarTab` tái sử dụng timeline TTM Calculator) | `epic-mark-service.ts`, `src/components/epic-mark/*`, `epic-browser-service.ts` |
| Tham số URL của bộ lọc | `epic-alert-filter-params.ts`, `parseCacheFilters` trong `route.ts` |
| Kiểu dữ liệu dòng / response | `src/lib/epic-alert-types.ts` (`EpicAlertRowPhased`, `EpicAlertPhasedResponse`) |

## Bảng DB

- Đọc: `issues`, `import_batches`, `projects`, `users`, `user_projects`, `user_domains`, `user_project_components`,
  `epic_alert_row_cache`, `epic_comments`, `epic_hidden_by_users`, `epic_task_status`.
- Ghi (từ màn hình): `epic_comments`, `epic_hidden_by_users`, `epic_task_status`.
- Ghi (khi tạo lại cache): `epic_alert_row_cache`. `row_data` (jsonb) chứa nguyên `EpicAlertRowPhased`; các cột còn lại là bản sao để lọc/sắp xếp bằng SQL.

## Contract

- `EpicAlertRowPhased`, `EpicAlertPhasedResponse` (`epic-alert-types.ts`) — dùng chung với TTM Dashboard, báo cáo, MCP.
- Tham số query của `GET /api/epic-alerts-15` — TTM Dashboard 2 tạo deep link theo các tham số này.
- Cột của `epic_alert_row_cache` — nhiều service khác đọc trực tiếp (xem "Phụ thuộc chéo").

## Cache và khi nào phải tạo lại

- `refreshDerivedCaches` (`daily-cache-service.ts`) dựng lại `epic_alert_row_cache` và các cache dẫn xuất khác.
  Tự chạy sau khi import CSV và lần đầu trong ngày; các thao tác lưu cấu hình khác chỉ đánh dấu cache cũ, admin bấm "Tạo lại cache".
- Đổi cách tính dòng hoặc rule → tăng `SCORING_CODE_VERSION` (`src/lib/scoring/registry.ts`). Cache mang phiên bản cũ hơn sẽ bị coi là lỗi thời (`isRowCacheCodeOutdated`).
- Thêm trường vào `EpicAlertRowPhased`: dữ liệu cũ trong `row_data` không có trường đó cho tới khi tạo lại cache. Code đọc phải chịu được giá trị thiếu.

## Test

- `src/lib/scoring/__tests__/projection.test.ts`, `scoring.test.ts`, `rule-groups.test.ts` — verdict ghi lên dòng.
- `src/lib/__tests__/epic-row-geometry.test.ts`, `epic-list-sort.test.ts`, `epic-pm-sm-assignment.test.ts`,
  `epic-mark-format.test.ts`, `epic-comment-groups.test.ts`, `epic-scoring-notes.test.ts`, `user-view-grants.test.ts`, `view-as.test.ts`.
- Chưa có test cho SQL của `epic-alert-row-cache-query-service.ts` (lọc/phân trang): phải kiểm tra bằng test thông luồng.

## Phụ thuộc chéo

Đọc `epic_alert_row_cache` hoặc `getEpicAlertRowsForDisplay`: TTM Dashboard 2 (`ttm-dashboard-2-cache-service.ts`,
`ttm-dashboard-summary-service.ts`, `ttm-dashboard-trend-service.ts`), TTM-Index toàn công ty (`ttm-index-global-cache-service.ts`),
Báo cáo bắt đầu sớm (`early-start-report-service.ts`), Chuẩn hoá dữ liệu (`data-normalization.ts`), Epic browser,
Xoá Epic, Sao lưu DB (`db-backup-*`), Báo cáo người dùng, MCP (`mcp-server.ts`). Đổi cột/ý nghĩa cột của cache phải kiểm tra lại các nơi này.

## Bẫy đã biết

- Mọi rule đánh giá Epic nằm trong `src/lib/scoring/`; màn hình chỉ đọc kết quả qua `epic-row-verdicts.ts` (quyết định 2026-10-24).
- **Phân loại Epic 14 giá trị + R6** (quyết định 23/11/2026): "Loại yêu cầu" tách thành 7 loại (Cải tiến, Tính năng mới, Sản phẩm, Hệ thống mới, Quy trình, Dịch vụ, Giải pháp nền tảng). `computeEpicComplexity` (`src/lib/epic-complexity.ts`) trả về **9 tổ hợp hợp lệ** (`CT-Lv12, CT-Lv34, TNM-Lv12, TNM-Lv34, HTM-Lv34, SP-Lv34, QT-Lv34, DV-Lv34, GPNT-Lv34`) + **5 tổ hợp nhóm "Phân loại sai Epic"** (`HTM-Lv12, SP-Lv12, QT-Lv12, DV-Lv12, GPNT-Lv12`). **Tính năng mới Level 1-2 (TNM-Lv12) là hợp lệ** (bổ sung cùng ngày). **Map các giá trị legacy → SP**: `Sản phẩm/dịch vụ/quy trình mới`, `Sản phẩm mới`, `Phát triển mới` (khớp text parser). **Đã backfill** (migration `20261203`): 2.364 dòng legacy có `requirement_level` về đúng SP (level 1/2 → `SP-Lv12`, level 3/4 → `SP-Lv34`); 2.341 dòng `requirement_level` NULL / `Chưa xác định` giữ `CT-Lv12` để Scoring đánh dấu Sai lệch dữ liệu (R5). `issues.epic_complexity_type` lưu đủ 14 để R6 (`rules/data-quality.ts`, tên "R6 — Phân loại sai Loại yêu cầu", `scoring-34`) phát hiện nhóm sai bằng helper thuần `isMisclassifiedEpicComplexity`. Hai bảng cấu hình `ttm_policy_configs` + `epic_status_alert_rules` nhận đủ 14 tổ hợp **và được seed sẵn 9 tổ hợp hợp lệ** (migration `20261202_seed_epic_complexity_valid_combos.sql`, `ON CONFLICT DO NOTHING`, copy giá trị nhóm SP); dòng nhóm sai disable + API từ chối (400) lưu. Đổi classification/rule → tăng `SCORING_CODE_VERSION` + tạo lại cache (mục Cache ở trên).
- Rule "Từ chối import" nằm ở `src/lib/import-admission-rules.ts`, không đưa vào scoring (quyết định 2026-10-14).
- Icon theo mục "Icons standard" trong `AGENTS.md` (`Warning`, `ArrowSquareOut`, `ArrowBendUpRight`/`CheckCircle`, `Checks`...).
- `/epic-in-po`, `/epic-alerts` đã bỏ (2026-10-11), chỉ còn redirect trong `next.config.ts`.
- Tên Epic hiển thị đúng như trong `issues.issue_name`. Màn hình không che dữ liệu; nếu thấy tên bị che (`***`) thì nguồn là dữ liệu crawl/import.
