# Daily Change Log

> Nhật ký thay đổi lũy kế theo ngày, dùng để phát triển liên tục trên nhiều máy/nhiều phiên làm
> việc mà không cần đọc lại toàn bộ `git log`. Mọi AI agent (Claude Code, Codex, Cursor,
> Antigravity, hoặc con người) khi hoàn thành một yêu cầu có thay đổi code/schema/config PHẢI bổ
> sung một bullet vào block của ngày hiện tại — xem hướng dẫn đầy đủ ở `AGENTS.md` § "Daily change
> log". Ngày mới nhất nằm TRÊN CÙNG; không sửa/xoá bullet của các lần chạy trước trong cùng một ngày.

## 2026-10-05

- **Left panel — gom menu Quản trị vào 2 popup submenu** (`src/components/layout/AppShell.tsx`, không đổi schema, không đổi quyền):
  - `Admin: Cấu hình ứng dụng` (icon `Faders`): Quản lý User, Quản lý Dự án, Quản lý Domain, Cấu hình cảnh báo, Cấu hình ứng dụng.
  - `SuperAdmin: Quản trị hệ thống` (icon `GearSix`): Nguồn dữ liệu, Sao lưu / Phục hồi dữ liệu, Ma trận phân quyền, Quản trị hệ thống.
  - Popup mở bên phải sidebar (drawer mobile: mở xuống dưới), đóng khi click ngoài / Esc / cuộn. Chấm đỏ ticket chờ xử lý hiện trên
    nhóm Admin và trên dòng "Quản lý User". Quyền từng item giữ nguyên như trước (`roles` của item + `PAGE_ROLES`); nhóm không còn
    item nào hiển thị được với role thì ẩn luôn.
- **Left panel — chốt phạm vi role của 2 nhóm menu** (quyết định của owner, `src/components/layout/AppShell.tsx`): nhóm Admin hiển thị
  cho ADMIN / SUPERADMIN / SUPERVISOR (SUPERVISOR chỉ xem); nhóm SuperAdmin khai báo `SUPERADMIN_ONLY` — SUPERVISOR không thấy và
  không vào được trang nào của nhóm này. Hành vi không đổi so với bullet trên, chỉ ghi rõ ý định vào code.
- **Ma trận phân quyền — bắt đầu điều khiển menu left panel** (không đổi schema, không cần migration):
  - Khối "Chức năng khác" (`VIEW_ONLY`): SUPERADMIN bỏ/tick được quyền Xem của chính SUPERADMIN. Khối "Chức năng quản trị" vẫn khoá
    cột SUPERADMIN (API trả 400) để không tự khoá mình khỏi màn Ma trận phân quyền
    (`src/components/permission-matrix/PermissionMatrixSettings.tsx`, `src/app/api/permission-matrix/route.ts`).
  - Bỏ quyền Xem của role nào → menu item của chức năng đó ẩn với role đó; tick lại → hiện lại. `GET /api/auth/me` trả thêm
    `hiddenFeatureKeys` (`getViewDeniedFeatureKeys` trong `src/lib/permission-matrix-service.ts`); mỗi menu item khai báo `featureKey`
    trong `src/components/layout/AppShell.tsx`, 3 mục Logic cảnh báo / Logic xử lý dữ liệu / Tài liệu sản phẩm trong `UserMenu.tsx`.
  - Ma trận chỉ **ẩn bớt**, không mở thêm: `roles` hardcode của menu và `PAGE_ROLES` vẫn áp dụng (vd. tick Xem "Nguồn dữ liệu" cho
    ADMIN không làm menu đó hiện ra). Chỉ ẩn menu — gõ thẳng URL vẫn vào được trang, API chưa kiểm tra ma trận.
  - Tab vừa lưu ma trận cập nhật menu ngay (event `PERMISSION_MATRIX_CHANGED_EVENT`); phiên khác thấy thay đổi ở lần chuyển trang kế tiếp.
- **Fix lưu ma trận báo lỗi `"TTM Dashboard 2" chỉ có quyền Xem, không có Thêm/Sửa/Xóa`** khi bỏ quyền Xem của SUPERADMIN: dòng SUPERADMIN
  được seed Thêm/Sửa/Xóa = TRUE cả ở chức năng `VIEW_ONLY`, nay các dòng đó được gửi lên nên API từ chối. Màn hình xoá 3 cờ này cho
  mọi dòng `VIEW_ONLY` trước khi gửi (`src/components/permission-matrix/PermissionMatrixSettings.tsx`); lần lưu đầu sẽ dọn luôn dữ liệu seed cũ.
- **Epic ngoại lệ (black listed epics) + rule L02 mới** (`SCORING_CODE_VERSION` → `scoring-9`; legacy engine không đổi):
  - **Schema**: bảng mới `black_listed_epics` (`db/migrations/20261005_create_black_listed_epics.sql`) — 1 dòng / Epic có
    `ttm_black_listed = true`; bỏ ngoại lệ = XOÁ dòng. Đã migrate **Supabase**; **local CHƯA migrate** (Postgres local không chạy trên
    máy này lúc làm — chạy `npm run db:migrate:local` khi bật lại).
  - **Popup "Epic ngoại lệ"** (nhóm menu Admin, `src/components/settings/BlackListedEpicsModal.tsx`, API `/api/black-listed-epics`):
    textarea mỗi dòng `KEY:EPIC-1,EPIC-2`; nút "Kiểm tra thông tin" / "Lưu thông tin" dùng chung parser
    `src/lib/black-listed-epics-format.ts` (báo lỗi theo dòng + vị trí ký tự, bấm vào lỗi để bôi đen đúng ký tự). ADMIN/SUPERADMIN
    sửa, SUPERVISOR chỉ xem.
  - **Duyệt Epic**: form "TTM Black listed" true/false + nút Lưu + popup xác nhận (`EpicBrowserModal.tsx`).
  - **Chấm đen** cạnh Epic key (`src/components/ui/TtmBlackListDot.tsx`) ở Quản trị Epic, Epic in PO, Báo cáo Epic, Duyệt Epic.
  - **L02 = L01 − Cancelled − Epic ngoại lệ − Epic thuộc dự án `Time to Market = N`** (đổi tên L02 thành "Epic trong phạm vi tính TTM").
    Dòng Epic mang `ttmBlackListed` / `ttmExclusion` (`applyTtmExclusions`, `src/lib/black-listed-epic-service.ts`) khi dựng cache và
    khi tính live; phễu (`epic-row-verdicts.ts`, `ttm-funnel-summary.ts`), TTM-CNTT (QLDA/QA) và TTM-E2E (`ttm-cntt-qa.ts`), index
    flags của Scoring (`scoring/score-epic.ts`, badge `SCOPE_TTM_BLACK_LISTED` / `SCOPE_PROJECT_NON_TTM`) và bộ lọc SQL của Quản trị
    Epic đều bỏ các Epic này. Bộ lọc Nhận xét mới: `TTM_COUNTED_IN_SCOPE` (L02), `TTM_BLACK_LISTED`, `TTM_PROJECT_NON_TTM`.
    4 ô vận hành của Dashboard 2 (Chậm tiến độ, Sai lệch dữ liệu, Chờ / Giải trình golive) KHÔNG đổi. Badge đánh giá của từng Epic vẫn hiện.
  - **Cache**: lưu Epic ngoại lệ, hoặc đổi `Time to Market` / thêm / xoá dự án TTM = N (`src/app/api/projects/route.ts`) → rebuild
    cache trong `after()`. Cache TTM Dashboard 2 lên `PAYLOAD_VERSION` 6. Số liệu chỉ đổi sau lần rebuild cache kế tiếp.
  - **Lưu ý dữ liệu**: Supabase đang có 17 dự án TTM = N với 152 Epic đang tính (trên 862) — sẽ rời khỏi L02 và các chỉ số sau lần rebuild.
- **Menu popup — đồng bộ font**: `button { font: inherit }` (globals.css, không nằm trong layer) đè `text-sm font-semibold` của Tailwind
  trên dòng `<button>` nhưng không đè trên `<Link>` → class font chuyển sang nhãn bên trong (`AppShell.tsx`), áp dụng cho cả nút nhóm.

- **Scoring Engine — R8 theo ngày + workflow status** (`SCORING_CODE_VERSION` → `scoring-6`, spec §17; logic cũ không đổi, không đổi schema):
  - **R8** chỉ tính khi R4G Date đã tới (`R4G Date ≤ asOf`): R4G Date ở tương lai là ngày kế hoạch → không còn là Sai lệch dữ liệu,
    Epic ở nhóm "chưa kết luận" (L05ac) cho tới ngày đó (`src/lib/scoring/rules/data-quality.ts`, `catalog.ts`).
  - **Workflow** (`EPIC_WORKFLOW_ORDER`, `src/lib/scoring/derive.ts`): `… R4GOLIVE → MVP DONE → PILOT → DONE → RELEASED`
    (`MVPDONE` đổi thành `MVP DONE`, thêm PILOT / DONE); Pending và Reopened ngang hàng DEV (In Progress). **R9** chỉ xét status
    R4GOLIVE … RELEASED nên status lạ (Reopened…) không còn bị gắn "Thiếu R4G Date". `ttm-phase-rules.ts` (engine cũ) giữ nguyên.
  - Menu lọc Status ở Quản trị Epic / Epic in PO xếp theo thứ tự workflow (`compareWorkflowStatus`) thay vì ABC.
  - Đối chiếu: nhãn mới `D11_WORKFLOW_STATUSES` (pha của Epic Pending / Reopened) — `parity.ts`, `ScoringParityPanel.tsx`.
  - Cần "Tạo lại cache" để số liệu áp dụng rule mới.
- **TTM Dashboard 2 — Ma trận Phân bổ**: Epic Sai lệch dữ liệu tách thành cột riêng "Sai lệch dữ liệu" (`TtmBreakdownItem.anomaly`),
  không còn đếm vào "Đúng tiến độ" (engine scoring luôn cho các Epic này `alertLevel = NONE`). Cache `ttm_dashboard_2_cache` lên
  `PAYLOAD_VERSION = 4`, tự dựng lại (`ttm-funnel-summary.ts`, `DashboardInsights.tsx`).

- **Chỉ số TTM-E2E dùng cùng công thức TTM-CNTT** (không đổi schema): Tỷ lệ % Pass = Đạt TTM-E2E / (Đạt TTM-E2E + Fail TTM-E2E) thay cho
  `pass / eligible` — Epic Fail TTM-E2E chưa có R4G Date nay nằm trong mẫu số; Epic Sai lệch dữ liệu / chưa kết luận nằm ngoài
  (`summarizeE2e` trong `src/lib/ttm-cntt-qa.ts`, bỏ `summarizeE2eFromCounts`). Áp dụng cho vòng "Hoàn thành TTM-E2E" ở TTM Dashboard,
  TTM Dashboard 2 và chỉ số toàn công ty (`ttm-index-global-cache-service.ts` tính lại % từ số đếm đã lưu). Cache TTM Dashboard 2 lên
  `PAYLOAD_VERSION = 5`.
- **Scoring Engine — R8 áp dụng cả với status được miễn** (`SCORING_CODE_VERSION` → `scoring-7`, spec §18): Epic To Do / In PO / Backlog có
  R4G Date đã tới nay là Sai lệch dữ liệu (chỉ Cancelled không xét); các rule khác vẫn miễn (`src/lib/scoring/rules/data-quality.ts`).
  Cần "Tạo lại cache".

- **Scoring Engine — R1 "Thiếu Start Date" áp dụng cả với Pending** (`SCORING_CODE_VERSION` → `scoring-8`, spec §19): trước đây Epic Pending
  thiếu Start Date không bị R1, không có Target nên không bao giờ được chấm TTM-CNTT (`src/lib/scoring/rules/data-quality.ts`). Cần "Tạo lại cache".
- **Tài liệu tra cứu rule Sai lệch dữ liệu**: `public/docs/product-guide.html` thêm mục **9.1** — bảng R1–R9 đang áp dụng (điều kiện, miễn
  trừ, hệ quả, ví dụ); popup "Logic cảnh báo" cập nhật mô tả axis Chất lượng dữ liệu + R1 (`catalog.ts`, `HelpPanels.tsx`).

- **Màn hình mặc định sau khi đăng nhập = TTM Dashboard 2 cho mọi role** (không đổi schema; khớp ma trận phân quyền `ttm_dashboard_2` = mọi role,
  `dashboard_new` = SUPERADMIN): `login/page.tsx` chuyển về `/ttm-dashboard-2`; `AppShell.tsx` mở menu TTM Dashboard 2 cho mọi role, TTM Dashboard
  chỉ SUPERADMIN (`PAGE_ROLES`), trang chuyển hướng khi bị từ chối quyền cũng là `/ttm-dashboard-2`. API `/api/ttm-dashboard-2` (+ `/rows`) mở cho
  USER (thấy đúng phạm vi dữ liệu của mình; danh sách user "Xem dưới quyền" vẫn chỉ trả cho Admin/Supervisor/Superadmin); `/api/dashboard-new`
  trả 403 cho role khác SUPERADMIN. Ma trận phân quyền chỉ là khai báo — quyền thực tế nằm ở các file trên.

- **MCP — `get_ttm_dashboard` trả số liệu TTM Dashboard 2** (không đổi schema; TTM Dashboard không còn dùng cho MCP): phễu L01…L05bb, chỉ số
  TTM-CNTT (QLDA)/(QA), TTM-E2E, widget row, breakdown theo chiều — cùng cache/hàm tính với màn hình (`src/lib/ttm-dashboard-2-summary-service.ts`);
  tham số mới `pmSms`, `requestingUnits`, bỏ `pmSm`, `listLimit` và 4 tham số ghi đè "Phạm vi dữ liệu cho TTM". `list_epic_alerts` (dữ liệu Quản trị
  Epic) thêm `nhanXet` + `includeCancelled` để lấy danh sách Epic sau mỗi con số. Xoá `getTtmDashboardSummary` (`ttm-dashboard-summary-service.ts`
  chỉ còn `loadDashboardEpicRows`). `mcp-server.ts` lên version 1.2.0; cập nhật BRD 15, product-guide mục 16.

## 2026-10-04

- **TTM Dashboard 2 — thêm widget row, Ma trận Phân bổ và Pie chart** (không đổi schema; cache `ttm_dashboard_2_cache` lên `PAYLOAD_VERSION = 3`, tự dựng lại):
  - Số liệu mới nằm trong `TtmFunnelSummary.insights` (`src/lib/ttm-funnel-summary.ts`), tính cùng lượt với phễu nên luôn khớp phễu; `TTM_FUNNEL_ROW_KEYS`
    thêm `epicType`, `projectName`, `qaInScope`, `releaseAxisState`, `releaseGraceDeadline`, `scoringBadges`, `ttmE2eAlertLevel`.
  - Giao diện ở `src/components/ttm-dashboard-2/DashboardInsights.tsx`: **widget row** (Tổng số Epic = L02 + "Trừ Cancelled=", Fail TTM-CNTT = L05ab + L05ba +
    "/Số Epic=", 3 vòng TTM-CNTT (QLDA)/(QA)/TTM-E2E kèm tử số/mẫu số, và 4 widget Chậm tiến độ / Sai lệch dữ liệu / Chờ golive / Giải trình Golive như TTM
    Dashboard); **ma trận** (Tổng số Epic = L02, Pass TTM = L05aa, Epic đánh giá = L05aa + L05ab + L05ba, Fail TTM = L05ab + L05ba; Lead 4 tab, PM/SM 2 tab);
    **pie chart** theo 5 chiều (% Tổng số Epic = L02, % Pass TTM = L05aa, % Fail TTM = L05ab + L05ba).
  - Deep link Quản trị Epic nhận nhiều giá trị "Nhận xét" cùng lúc (`alert` là mảng — `epic-alerts-deep-link.ts`) để mở đúng danh sách Fail / Epic đánh giá.
  - Phễu: bỏ mã tiêu chí khỏi nhãn (mã chỉ còn trong popup chuột phải); chữ trong phễu dùng font của trang thay cho 'Plus Jakarta Sans' chưa được nạp
    (gây vỡ dấu tiếng Việt ở ghi chú nhóm phụ) — `FunnelLayers.tsx`.
  - Tài liệu: `docs/ttm-dashboard-2-spec.md` §7, `public/docs/product-guide.html` mục 21.6–21.8.
- **Tên tiêu chí L01–L05bb + công thức % mới của TTM-CNTT (QLDA) / TTM-CNTT (QA)** (không đổi schema):
  - Tên tiêu chí phễu TTM Dashboard 2 khai báo 1 chỗ ở `TTM_FUNNEL_CRITERIA` (`src/lib/ttm-funnel-summary.ts`): L01 Tổng epic, L02 Epic loại bỏ
    Cancelled, L03 Epic chuẩn hoá dữ liệu, L04a/L04b Epic hoàn thành / chưa hoàn thành, L05aa Đạt, L05ab Không đạt (nhóm 1), L05ac Chưa kết luận,
    L05ba Không đạt (nhóm 2), L05bb Trong hạn. Màn hình `ttm-dashboard-2/page.tsx` đổi toàn bộ nhãn/popup theo mã mới.
  - **Phễu chỉ tính trong "Phạm vi dữ liệu cho TTM"**: Epic ngoài phạm vi không còn nằm trong L01 (bỏ nhóm "4C"), hiện thành dòng số riêng dưới phễu
    (`ttmFunnelBucket` xét ngoài phạm vi trước tiên — `epic-row-verdicts.ts`). Bộ lọc "Nhận xét" mới `IN_SCOPE_CNTT` cho danh sách L01/L02.
  - **Công thức**: Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba); % Fail = (L05ab + L05ba) / cùng mẫu số — thay cho `pass / eligible`
    (`summarizeTtmCnttFromCounts`, `src/lib/ttm-cntt-qa.ts`; `TtmCnttSummary` thêm `denominator`, `failPct`, `failPctPrecise`; `fail` không còn đếm Epic
    Sai lệch dữ liệu ở engine cũ). TTM-CNTT (QA) dùng cùng công thức, chỉ lấy Epic MVP Done / Released. TTM-E2E giữ công thức cũ (`summarizeE2eFromCounts`).
  - Áp dụng cho chỉ số toàn công ty (`ttm-index-global-cache-service.ts` tính lại % từ số đếm đã lưu) và mọi chỉ số theo bộ lọc + phân quyền: TTM
    Dashboard (vòng KPI, ma trận — cột "Epic tính TTM" đổi tên "Epic hoàn thành"), Quản trị Epic (`queryTtmCnttIndexes`), TTM Dashboard 2, MCP. Số cạnh
    chỉ số nay là Đạt / (Đạt + Fail).
  - Cache `ttm_dashboard_2_cache` thêm `PAYLOAD_VERSION = 2` trong JSON — dòng cache cũ tự bị bỏ qua và dựng lại.
  - Tài liệu: chương 21 "TTM Dashboard 2" + mục 8.7 (công thức chung) trong `public/docs/product-guide.html`, `docs/ttm-dashboard-2-spec.md`,
    `brd/16-ttm-indexes.md` §0.1, popup "Logic cảnh báo" (`catalog.ts`, `HelpPanels.tsx`).
- **Scoring Engine — Chất lượng dữ liệu** (`SCORING_CODE_VERSION` → `scoring-5`, spec §16; logic cũ không đổi):
  - Rule mới **R8** `ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE` (có R4G Date nhưng status < R4GOLIVE) và **R9**
    `ANOMALY_R9_MISSING_R4G_DATE` (status ≥ R4GOLIVE, không Pending, thiếu R4G Date) — đều là "Sai lệch dữ liệu", kèm khuyến nghị
    `REC_FIX_R4G_STATUS` / `REC_FILL_R4G_DATE` (`src/lib/scoring/rules/data-quality.ts`, `catalog.ts`, `rules/recommendations.ts`).
  - **R1** "Thiếu Start Date" tính từ status DESIGN (trước đây từ DEV); **R5** "Thiếu Requirement Level" chỉ tính khi status > DESIGN.
  - Hệ quả của R8: Epic có R4G Date đúng hạn nhưng status < R4GOLIVE không còn "Đạt + Sai Status" mà thành Sai lệch dữ liệu
    (ra khỏi mẫu số TTM-CNTT); badge "Sai Status" TTM-CNTT/E2E chỉ còn hiện khi tắt R8.
  - `projection.ts` chiếu R8/R9 thành vi phạm mã `R4G_DATE_BEFORE_R4GOLIVE` (8) / `MISSING_R4G_DATE` (9) — chỉ thêm vào kiểu
    `EpicAnomalyCode` (`epic-data-anomaly.ts`), logic cũ không sinh ra nên không cần migration. Bộ lọc "Sai lệch dữ liệu" gồm cả R8/R9.
  - Đối chiếu: nhãn mới `D10_DATA_QUALITY_RULES` (`parity.ts`, `ScoringParityPanel.tsx`). Cần "Tạo lại cache" để số liệu áp dụng rule mới.
- **Cache cho TTM Dashboard 2**: bảng mới `ttm_dashboard_2_cache` (migration `20261004_create_ttm_dashboard_2_cache.sql`,
  đã chạy Supabase; local chưa chạy được — máy không có Postgres local). Lưu số liệu phễu chưa lọc + danh sách lựa chọn
  bộ lọc theo phạm vi: 1 bộ `ALL` dùng chung SUPERADMIN + SUPERVISOR, `ADMIN:<id>` cho từng Admin, `USER:<id>` cho từng User.
  - Lần mở đầu chỉ đọc cache (~2 KB, ~0.2 s thay vì ~320 KB / ~1.2 s); khi lọc mới tải dữ liệu Epic (`/api/ttm-dashboard-2/rows`)
    và tính lại trên trình duyệt bằng cùng hàm với lúc dựng cache (`src/lib/ttm-funnel-summary.ts`).
  - Cache tự làm ấm sau mỗi lần dựng lại cache dữ liệu (`refreshDerivedCaches`), tự bỏ khi cache dữ liệu đổi / đổi engine /
    phân quyền user–domain–dự án đổi (dấu vân tay phạm vi), và tự dựng lại khi thiếu (`src/lib/ttm-dashboard-2-cache-service.ts`).
    Đối chiếu 42/42 tài khoản: cache khớp 100% với tính trực tiếp. "Theo dõi cache dữ liệu" có thêm ô "Cache TTM Dashboard 2".
- **Phạm vi dữ liệu role ADMIN** = dự án thuộc domain được gán **+ dự án Admin trực tiếp làm PM/SM**, áp dụng mọi màn hình
  qua `resolveAccessScope` (`epic-alert-service.ts`): TTM Dashboard, TTM Dashboard 2, Quản trị Epic, Epic in PO, Dashboard cũ, MCP;
  hồ sơ user ("Dự án có quyền xem thông tin") cũng theo quy tắc này. Cập nhật BRD 05/08.
- **Báo cáo Epic áp dụng phạm vi dữ liệu** (trước đây mọi user xem được mọi dự án): danh sách Domain/Dự án/Component chỉ còn trong
  phạm vi; API từ chối (403) dự án ngoài phạm vi; PM/SM bị thu hẹp theo Component chỉ thấy Epic của Component được gán
  (`src/lib/report-access-scope.ts`, `api/reports/route.ts`, `reports-service.ts`). Công cụ MCP `list_report_filters` cùng phạm vi.
- **Thống kê truy cập**: thêm màn hình "TTM Dashboard 2" (`ttm_dashboard_2`, `visit-counter-types.ts`); "Dashboard" đổi tên
  hiển thị thành "TTM Dashboard"; biểu đồ cột tự co theo số màn hình.
- **Banner thông báo**: thêm vào TTM Dashboard và TTM Dashboard 2 (Thống kê truy cập, Báo cáo Epic đã có sẵn).
- **Quản trị nguồn dữ liệu**: "Nhật ký lớp dữ liệu tổng hợp (Epic)" và "Đối chiếu Scoring Service" ẩn/hiện bằng cách bấm tiêu đề
  (mặc định ẩn; Đối chiếu chỉ tải dữ liệu khi mở) — `src/components/ui/CollapsibleCardTitle.tsx`. Nút "Tạo lại cache" chuyển lên góc
  phải "Theo dõi cache dữ liệu"; bỏ box "Tổng hợp lại dữ liệu cache" ở right panel (xoá `RecomputeCachePanel.tsx`).

## 2026-10-03

- **TTM Dashboard 2 — sửa số liệu phễu, accordion, popup Quản trị Epic** (theo review; phương án a):
  - **Layer 2 "Lọc Cancelled" luôn = 0**: API trước đây lấy dữ liệu đã loại sẵn Epic Cancelled. Nay
    `loadDashboardEpicRows`/`queryDashboardEpicRows` có tuỳ chọn `includeCancelled` (chỉ TTM Dashboard 2 dùng).
  - **Một định nghĩa duy nhất cho mọi tầng/nhóm**: `ttmFunnelBucket` (`src/lib/epic-row-verdicts.ts`) xếp mỗi Epic
    vào đúng 1 lá; bộ lọc "Nhận xét" mới (`TTM_PASS_IN_SCOPE`, `TTM_LATE_IN_SCOPE`, `TTM_NOT_SCORED_IN_SCOPE`,
    `OVERDUE_MISSING_R4G_IN_SCOPE`, `WITHIN_TARGET_MISSING_R4G`, `OUT_OF_SCOPE_NO_ANOMALY`) có bản SQL song song
    trong `epic-alert-row-cache-query-service.ts`, nên số trên phễu luôn bằng số dòng danh sách mở ra.
  - **Nhóm 5AB chỉ còn Fail thật (Trễ R4G)**; thêm **nhóm 5AC "Chưa chấm"** (R4G Date tương lai / không tính được
    Target, vẫn trong mẫu số). Thêm **Layer 4C "Ngoài phạm vi TTM-CNTT"** (chỉ hiện khi > 0) để L3 = 4A + 4B + 4C.
  - **Xem dưới quyền**: logic chung `src/lib/view-as-user-service.ts` (dùng cho TTM Dashboard, TTM Dashboard 2 và
    `/api/epic-alerts-15`); Quản trị Epic nhận `viewAsUserId` từ deep-link nên danh sách đúng phạm vi user đang xem
    trước (có dòng báo "Đang xem danh sách dưới quyền của …").
  - **Popup Quản trị Epic** dùng chung `EpicAlertsIframeModal` với TTM Dashboard (cùng kích thước, nền mờ); bỏ
    `maxWidth="full"` vừa thêm vào `Modal`. Text quy tắc Layer 2 ghi đúng quy tắc `/cancel/i`.
  - **Accordion**: nguyên nhân không thấy hiệu ứng — Windows tắt "Animation effects" ⇒ `prefers-reduced-motion`,
    và CSS toàn cục ép mọi transition về 0.01ms. Nay accordion dùng `grid-template-columns`/`rows` (0.7s, class
    `!important`), có hiệu ứng cả khi mở lẫn khi đóng, hết tràn ngang 24px; Layer 4 bấm được bằng bàn phím.
  - Vẽ phễu tách ra `src/components/ttm-dashboard-2/FunnelLayers.tsx` (chia nhóm theo tỷ lệ, callout tự động);
    test `src/lib/__tests__/ttm-funnel-bucket.test.ts`. Đã đối chiếu phễu ↔ danh sách trên dữ liệu thật: 39 tổ
    hợp (admin + 31 user xem dưới quyền, lọc dự án/domain/PM-SM/đơn vị) khớp 100%.

- **Sửa lỗi lưu ma trận phân quyền cho role SUPERVISOR trên tính năng "Báo cáo Epic" (`/admin/permissions`)**:
  - **Nguyên nhân**: Migration tạo quyền `epic_reports` trước đó (`20260909_add_epic_reports_permission.sql`) thiếu dòng khởi tạo cho role `SUPERVISOR`. Đồng thời hàm `saveRoleFeaturePermissions` trong [permission-matrix-service.ts](file:///d:/git/ttm-tool/src/lib/permission-matrix-service.ts) chỉ dùng lệnh `UPDATE`, khiến các cặp `(feature_key, role)` chưa tồn tại trong bảng `role_feature_permissions` không được insert khi Superadmin bấm Lưu ma trận.
  - **Khắc phục**:
    - Chuyển câu lệnh cập nhật trong `saveRoleFeaturePermissions` sang dạng `INSERT ... ON CONFLICT (feature_key, role) DO UPDATE` (UPSERT) để tự động khởi tạo bản ghi nếu chưa có.
    - Tạo migration `20261003b_fix_epic_reports_supervisor_permission.sql` bổ sung toàn bộ các cặp role/feature còn thiếu cho tất cả các role trong hệ thống và đã chạy migrate lên database `supabase`.

- **Điều chỉnh tốc độ Accordion 1.5s & Đồng bộ chính xác tiêu chí lọc sang Popup Quản trị Epic (`/ttm-dashboard-2`)**:
  - **Tốc độ Animation Accordion 1.5s (`duration-[1500ms]`)**: Tăng thời gian chuyển động thu hẹp Panel 1 và mở rộng Panel 2/3 lên 1.5s giúp hiệu ứng accordion hiển thị rất mượt mà, trực quan và rõ nét khi người dùng click vào từng nửa của Layer 4.
  - **Đồng bộ bộ lọc chính xác khi mở Quản trị Epic từ Popup Diễn giải**:
    - `LAYER-04A` (Epic Hoàn thành): Gửi tham số `alert=TTM_ELIGIBLE_IN_SCOPE` để lọc chính xác các Epic đã có mốc `R4G Date` thực tế, không bị Data Anomaly và nằm trong phạm vi tính TTM-CNTT (khắc phục lỗi hiển thị 92 Epic sang đúng 34 Epic hoàn thành của dự án API).
    - `LAYER-04B` (Epic Chưa hoàn thành): Gửi tham số `alert=MISSING_R4G_IN_SCOPE` lọc đúng các Epic chưa có `R4G Date` trong phạm vi.
    - `GROUP-05AA` (Đạt TTM-CNTT): Gửi tham số `alert=ACHIEVED_CNTT`.
    - `GROUP-05AB` (Fail TTM-CNTT - Trễ hạn): Gửi tham số `alert=FAIL_LATE_R4G`.
    - `GROUP-05BA` (Fail TTM-CNTT - Quá Target): Gửi tham số `alert=FAIL_MISSING_R4G`.
    - `GROUP-05BB` (Chưa hoàn thành - Đang trong hạn): Bổ sung tiêu chí `alert=WITHIN_TARGET_MISSING_R4G` trên toàn bộ hệ thống (`epic-row-verdicts.ts`, `epic-alert-row-cache-query-service.ts`, `epic-alerts-deep-link.ts`).
    - `LAYER-03` (Sai lệch dữ liệu): Gửi tham số `alert=DATA_ANOMALY` và `dataIssue=true`.
    - `LAYER-02` (Epic Đã hủy): Gửi `status=Cancelled,Closed,Rejected`.


- **Hiệu ứng Accordion 0.7s, Tăng 100% kích thước Modal Diễn giải & Popup Nhúng Quản trị Epic (`/ttm-dashboard-2`)**:
  - **Hiệu ứng Accordion 0.7x (`transition-all duration-700 ease-in-out`)**: Khi bấm vào một trong hai nửa của Layer 4 (Epic Hoàn thành / Epic Chưa hoàn thành), Panel 1 chuyển đổi mượt mà từ chiều rộng 100% về 50%, đồng thời Panel 2 hoặc 3 mở rộng từ 0% sang 50% theo dạng accordion mượt mà với tốc độ 0.7s.
  - **Tăng 100% kích thước Popup Diễn giải số liệu**: Nâng cấp kích thước Modal lên `maxWidth="2xl"` (`max-w-6xl` = 1152px) và cấu trúc layout 2 cột thông thoáng: Cột trái thể hiện Số liệu tóm tắt & Quy tắc lọc chi tiết; Cột phải thể hiện Công thức tính toán, Thống kê phạm vi dữ liệu và Nút thao tác nhanh.
  - **Nút "Xem danh sách các Epic" mở Popup Quản trị Epic nhúng trong trang**: Bấm nút xem danh sách sẽ mở Modal toàn màn hình (`maxWidth="full"`) chứa `iframe` nhúng trực tiếp màn hình Quản trị Epic (`/epic-alerts-15?embedded=1&...`) kế thừa toàn bộ bộ lọc và ngữ cảnh dữ liệu hiện tại từ TTM Dashboard 2 (`domain`, `projects`, `pmSm`, `requestingUnit`, `alert`, `dataIssue`, `status`, `viewAsUserId`) mà không cần rời trang, kèm nút mở tab mới.


- **Cải tiến hiển thị động & Đưa toàn bộ text của nhóm nhỏ ra Callout Line (`/ttm-dashboard-2`)**:
  - **Mặc định ẩn Panel 2 & 3 (Full-width ban đầu)**: Mặc định khi vào màn hình, Panel 1 chiếm trọn $100\%$ chiều rộng màn hình. Chỉ khi người dùng bấm vào một trong hai nhóm của Layer 4 (Hoàn thành hoặc Chưa xong), Panel 1 mới tự động co lại $50\%$ chiều rộng bên trái để nhường chỗ cho Panel chi tiết tương ứng xuất hiện ở bên phải. Bổ sung nút đóng `X` để dễ dàng thu gọn lại toàn màn hình.
  - **Đưa toàn bộ Text + Số liệu của nhóm nhỏ ra ngoài đường kẻ Callout Line**: Với các nhóm nhỏ hơn (Nhóm 5ab `Fail Trễ hạn` và Nhóm 5ba `Fail Quá Target`), trong lòng layer hoàn toàn để trống để không bị chèn ép text; toàn bộ **Text chính (`Fail`)**, **Số liệu (`{count}`)**, và **Text phụ (`Trễ hạn` / `Quá Target`)** được đưa ra ngoài đầu đường kẻ chỉ dẫn màu đỏ gập khúc.
  - **Cập nhật tài liệu**: Đồng bộ đặc tả tại [docs/ttm-dashboard-2-spec.md](file:///d:/git/ttm-tool/docs/ttm-dashboard-2-spec.md).

- **Nâng cấp Layout 2 cột tương tác & Phễu phân nhánh tỉ lệ diện tích (`/ttm-dashboard-2`)**:
  - **Bổ sung Layer 4 chia 2 nửa vào Panel 1**: Tầng 4 của phễu chính được phân thành 2 nửa: **Epic Hoàn thành (4a)** và **Epic Chưa hoàn thành (4b)**. Click chuột trái vào nửa tương ứng sẽ tự động kích hoạt hiển thị phễu chi tiết bên phải.
  - **Bố cục 2 cột gọn gàng**: Đưa Panel 1 sang cột trái và Panel 2 (Epic Hoàn Thành) / Panel 3 (Epic Chưa Hoàn Thành) sang cột phải, ẩn các panel đáy dư thừa.
  - **Tỉ lệ diện tích động (Min 20% - Max 80%)**: Toàn bộ các tầng chia nhóm (Layer 4 của Panel 1, Layer 5a của Panel 2, Layer 5b của Panel 3) tự động tính toán tọa độ cắt hình học theo tỉ lệ số liệu thực tế kẹp trong khoảng $[20\%, 80\%]$.
  - **Đường chỉ dẫn gập khúc (Callout pointer line)**: Thiết kế đường line màu đỏ trỏ từ mép thân phễu ra nhãn chữ bên ngoài (`"Trễ hạn"`, `"Quá Target"`) như thiết kế mẫu, giúp text trong layer không bị chật chội.
  - **Khớp khít nắp 3D bằng `<clipPath>`**: Toàn bộ nắp elip đỉnh được cắt bằng SVG clip path theo chính xác tọa độ phân chia, khắc phục triệt để lỗi hở nắp và hở thân hình nón.
  - **Cập nhật tài liệu**: Đồng bộ tài liệu [ttm-dashboard-2-spec.md](file:///d:/git/ttm-tool/docs/ttm-dashboard-2-spec.md) với kiến trúc 2 cột mới.

- **Hoàn thiện TTM Dashboard 2 (`/ttm-dashboard-2`) theo thiết kế phễu phân nhánh**:
  - **Khớp kín hình học nắp nón (Conical Lids Geometry)**: Hiệu chỉnh chính xác phương trình tiếp tuyến của Elip nắp và thân phễu cho các Layer 1, 2, 3 và Layer 4a/4b, loại bỏ hoàn toàn hiện tượng tai bè/hở mép nắp phễu.
  - **Banner đầu trang & Xem dưới quyền User**: Đồng bộ hoàn toàn theo phong cách của TTM Dashboard (`dashboard-new`), tích hợp 3 chỉ số TTM-CNTT (QLDA), TTM-CNTT (QA), TTM-E2E toàn hệ thống và nút chuyển đổi góc nhìn Lead vs PM/SM.
  - **Tương tác Popup chỉ mở khi Chuột Phải**: Chuyển toàn bộ hành vi mở modal diễn giải công thức / quy tắc lọc sang sự kiện **Right-Click (Context Menu)**; click chuột trái giữ nguyên trải nghiệm trực quan.
  - **Mã định vị ID góc trái Popup**: Bổ sung badge mã định vị `[LAYER-01]`, `[LAYER-02]`, `[LAYER-03]`, `[LAYER-04A]`, `[GROUP-05AA]`, `[GROUP-05AB]`, `[LAYER-04B]`, `[GROUP-05BA]`, `[GROUP-05BB]` ở góc trái phía trên tiêu đề Popup để hỗ trợ kiểm tra và audit dữ liệu.
  - **Khu vực 2 Panel phễu phân nhánh (Tách từ Layer 3)**:
    - **Panel 2A (Bên trái) - Epic Hoàn thành**: Layer 4a (Tổng Epic có `r4gDate` thực tế) phân nhánh thành 2 nhóm song song: Nhóm 5aa (**Đạt TTM-CNTT**) và Nhóm 5ab (**Fail TTM-CNTT - Trễ hạn**).
    - **Panel 2B (Bên phải) - Epic Chưa hoàn thành**: Layer 4b (Tổng Epic chưa có `r4gDate` = Layer 3 - Layer 4a) phân nhánh thành 2 nhóm song song: Nhóm 5ba (**Fail TTM-CNTT - Quá Target**) và Nhóm 5bb (**Còn lại - Đang trong hạn**).
  - **Tài liệu đặc tả**: Khởi tạo và cập nhật chi tiết tài liệu [ttm-dashboard-2-spec.md](file:///d:/git/ttm-tool/docs/ttm-dashboard-2-spec.md) mô tả toàn bộ luồng dữ liệu, công thức toán học và điều kiện lọc.

- **Cải tiến giao diện TTM Dashboard 2 (`/ttm-dashboard-2`)**:
  - **Văn bản bên trong mỗi Layer**: Đặt số tổng to đậm ở chính giữa (`fontSize: 20-22px`, `fontWeight: 800`), dòng tiêu đề nhỏ hơn ở dưới và định dạng thường không đậm (`fontSize: 12px`, `fontWeight: 400`).
  - **Thanh bộ lọc 1 dòng**: Chuyển toàn bộ bộ lọc thành thanh toolbar ngang duy nhất ở trên cùng theo đúng phong cách của TTM Dashboard (`ttm-toolbar`: Domain, Dự án, PM/SM, Đơn vị yêu cầu, Đặt lại).
  - **Popup chi tiết & Công thức (Modal)**: Đưa toàn bộ mô tả chi tiết của từng tầng vào Popup Modal kích hoạt khi **Click chuột trái hoặc Click chuột phải (Context Menu)** vào tầng phễu / thẻ tóm tắt tương ứng.
  - **Khung nhìn Full-width & Bỏ layer đáy**: Mở rộng biểu đồ phễu chiếm trọn chiều rộng khung nhìn và loại bỏ khối hình nón đáy để tập trung trọn vẹn vào 3 lớp xử lý dữ liệu chính.

- **Thêm màn hình mới TTM Dashboard 2 (`/ttm-dashboard-2`)**:
  - Giao diện gồm **Biểu đồ Phễu 3D Nón (3D Conical Slice Funnel)** trực quan hóa 3 lớp xử lý dữ liệu:
    - **Layer 1 (Tổng Epic nguồn)**: Hiển thị tổng số Epic trong phạm vi phân quyền và bộ lọc; box mô tả thống kê chi tiết số lượng Domain, Dự án, PM/SM, Đơn vị yêu cầu.
    - **Layer 2 (Lọc Cancelled)**: Khấu trừ các Epic trạng thái Đã hủy (`Cancelled`, `Closed (Cancelled)`, `Rejected`...), hiển thị công thức và tỷ lệ giữ lại.
    - **Layer 3 (Lọc Sai lệch dữ liệu)**: Khấu trừ các Epic vi phạm toàn vẹn dữ liệu (Data Anomaly), hiển thị công thức, số lượng và danh sách top lỗi vi phạm phổ biến.
  - Cột bên phải gồm 4 bộ lọc đồng bộ với TTM Dashboard: **Chọn Domain**, **Chọn Dự án**, **Chọn PM/SM**, **Chọn 'Đơn vị yêu cầu'** cùng tính năng **User Preview Switcher** cho vai trò Quản trị/Giám sát.
  - Phân quyền & Điều hướng: Bổ sung quyền `ttm_dashboard_2` vào Ma trận phân quyền (migration `20261003_add_ttm_dashboard_2_permission.sql`), mở quyền cho role `Supervisor` trở lên (`SUPERADMIN`, `ADMIN`, `SUPERVISOR`); thêm menu điều hướng trên Left Panel (`src/components/layout/AppShell.tsx`, `src/lib/app-screens.ts`).

## 2026-10-01

- **Bộ lọc "Đơn vị yêu cầu" — chọn nhiều + tìm free-text** ở Quản trị Epic, Epic in PO (đổi từ `<select>` chọn 1 sang
  `ToolbarMultiSelect searchable`) và **thêm mới** vào thanh lọc TTM Dashboard (lọc mọi widget/ma trận, mang theo khi
  bấm sang Quản trị Epic). Truyền bằng tham số `requestingUnit` lặp lại (tên đơn vị có thể chứa dấu phẩy):
  `epic-alerts-deep-link.ts`, `api/epic-alerts-15/route.ts` (`getAll`), SQL `requesting_unit = ANY(...)`
  (`epic-alert-row-cache-query-service.ts`). Bộ lọc đã lưu kiểu cũ (1 đơn vị) vẫn đọc được.

- **Bộ lọc PM/SM có ô tìm free-text** (prop `searchable` của `ToolbarMultiSelect`) ở TTM Dashboard, Quản trị Epic,
  Epic in PO. Riêng Epic in PO: bộ lọc PM/SM đổi từ `<select>` chọn 1 sang chọn nhiều giống Quản trị Epic
  (`pmSmFilters`, gửi `pmSm` dạng danh sách — API `/api/epic-alerts-15` đã hỗ trợ sẵn) (`src/app/epic-in-po/page.tsx`).

- **Giao diện**: (1) TTM Dashboard — hàng widget đổi thứ tự: "Tổng số Epic" đứng đầu, kế đến "Fail TTM-CNTT (QLDA)",
  rồi 3 vòng TTM-CNTT (QLDA)/TTM-CNTT (QA)/TTM-E2E (`src/app/dashboard-new/page.tsx`). (2) Bộ lọc Dự án ở TTM
  Dashboard, Quản trị Epic, Epic in PO có ô tìm free-text (không phân biệt dấu/hoa thường) — prop `searchable` mới
  của `src/components/ui/ToolbarMultiSelect.tsx`; khi đang tìm, "Chọn tất cả/Bỏ chọn" chỉ áp dụng cho kết quả đang hiện.

- **TTM Dashboard — widget "Fail TTM-CNTT (QLDA)"** (hàng trên cùng): tách cùng cách với cột "Fail TTM" của ma trận —
  tiêu đề vẫn mở danh sách Fail, thêm 2 sub-link "n Trễ R4G · m Thiếu R4G" (`FAIL_LATE_R4G` / `FAIL_MISSING_R4G`),
  thay dòng chú thích "Vượt R4G Target" (`src/app/dashboard-new/page.tsx`).

- **TTM Dashboard — Ma trận Phân bổ: tách cột "Fail TTM"** thành 2 sub-link "n Trễ R4G · m Thiếu R4G" (giữ nguyên
  rule). Lý do: Fail gồm cả Epic chưa có R4G Date mà đã quá Target (ngoài mẫu số TTM-CNTT QLDA), nên Pass + Fail có
  thể lớn hơn "Epic tính TTM" (vd. WM: mẫu số 3, Pass 1, Fail 3 = 2 Trễ R4G + 1 Thiếu R4G). Thêm `ttmFailKind` và
  bộ lọc `FAIL_LATE_R4G` / `FAIL_MISSING_R4G` (`src/lib/epic-row-verdicts.ts`, `epic-alerts-deep-link.ts`, SQL trong
  `epic-alert-row-cache-query-service.ts`), hiển thị ở `src/app/dashboard-new/page.tsx`.

- **Scoring Service — đổi rule theo quyết định 01/10** (`SCORING_CODE_VERSION` → `scoring-4`, spec §15):
  - **Sai lệch dữ liệu xét trước**: `scoreEpic` chạy `dataQualityRule` trước, Epic có Sai lệch dữ liệu (R1, R3–R6)
    không được chấm Đạt/Fail/Cảnh báo muộn/Sai Status trên TTM-CNTT (QLDA/QA) và TTM-E2E (`score-epic.ts`,
    `rules/rule-types.ts` `hasDataAnomaly`, `registry.ts`).
  - **"Sai Status" vẫn tính Đạt** (TTM-CNTT): `CNTT_PASS` + `CNTT_STATUS_MISMATCH` cùng active, bỏ dòng che trong
    `catalog.ts`; cột Nhận xét (Quản trị Epic, Epic in PO) hiện cả 2 badge; Báo cáo Epic tính Đạt theo `CNTT_PASS`.
  - **TTM-E2E**: `Target_E2E = T0 +wd (N − 1)` (`derive.ts`); Fail khi ngày kết thúc > Target hoặc chưa có mà
    asOf > Target; Đạt khi ngày kết thúc ≤ asOf và ≤ Target, bỏ điều kiện Released; badge mới
    `E2E_STATUS_MISMATCH` ("Sai Status") khi status < R4GOLIVE (`rules/ttm-e2e.ts`, `ScoringBadges.tsx`);
    mẫu số chỉ số TTM-E2E loại Epic Sai lệch dữ liệu (`ttm-cntt-qa.ts`).
  - Đối chiếu: nhãn mới `D8_ANOMALY_CHECKED_FIRST`, `D9_E2E_RULE_REDEFINED` (`parity.ts`); dữ liệu thật 1.181 Epic,
    0 lệch chưa giải thích. Cập nhật popup "Logic cảnh báo", `brd/16-ttm-indexes.md`, `public/docs/product-guide.html`.
    44 test pass. **Cache cần tạo lại** (Quản trị nguồn dữ liệu → Tổng hợp lại ngay) để áp dụng rule mới.

- **Sửa 3 lỗi từ review commit `b0b1b39`**:
  - **Phân quyền user (bảo mật)**: `canGrantRole` chỉ kiểm tra role MỚI nên ADMIN vẫn đặt lại mật khẩu / hạ role /
    xoá được SUPERADMIN. Thêm `canManageUserWithRole` (`src/lib/auth-types.ts`) + `getUserRolesByIds`
    (`auth-service.ts`); `api/users` PUT/PATCH/DELETE và `api/password-reset-requests` PATCH (duyệt ticket — ai
    cũng tạo được ticket cho email bất kỳ) trả 403 khi user đích có role ngang/cao hơn actor.
  - **6 bộ lọc sub-link của TTM Dashboard trả danh sách rỗng ở luồng cache**: thêm `buildFieldFilterClause`
    (`src/lib/epic-alert-row-cache-query-service.ts`) cho `DATA_ANOMALY_IN_SCOPE`, `MISSING_R4G_IN_SCOPE`,
    `TTM_ELIGIBLE_IN_SCOPE`, `WAITING_GOLIVE_MISSING_R4G/WITHIN_GRACE/OVERDUE` — khớp đúng matcher phía client.
  - **"Chờ golive" bị "Giải trình Golive" che** (2 badge cùng tồn tại nhưng `releaseAxisState` chỉ giữ 1): thêm
    `isWaitingGolive`/`isJustifyGolive`/`waitingGoliveBucket` (`src/lib/epic-row-verdicts.ts`) đọc theo badge; dùng
    ở cột Nhận xét (Quản trị Epic, Epic in PO), widget + sub-link TTM Dashboard, MCP summary. Trên dữ liệu thật:
    widget 30 → 151 (khớp danh sách), "quá hạn" 6 → 127.

- **Scoring Service — rule mới "Chờ golive" (`RELEASE_WAITING_GOLIVE`)**: đổi sang theo status,
  không còn phụ thuộc R4G Date/grace — fire khi Epic trong phạm vi TTM-CNTT (QLDA) có
  `status = 'r4golive'` HOẶC (`status = 'released'` AND không có `due`). "Giải trình Golive" giữ
  nguyên, 2 badge độc lập/cùng tồn tại (`src/lib/scoring/rules/release.ts`, `catalog.ts`). Thêm tag
  đối chiếu `D7_WAITING_GOLIVE_REDEFINED` (`parity.ts`), bump `SCORING_CODE_VERSION` → `scoring-3`,
  thêm 4 test (`scoring.test.ts`).
- **TTM Dashboard — widget "Chờ golive"**: tính theo rule mới ở trên, bổ sung 3 sub-link (Thiếu R4G
  Date; Trong hạn — `now - r4gDate` ≤ `release.graceWorkingDays` ngày làm việc; Quá hạn — lớn hơn),
  bấm vào mở popup Quản trị Epic theo phạm vi dữ liệu user + filter dashboard + điều kiện sub-link
  (`src/app/dashboard-new/page.tsx`, `src/lib/epic-row-verdicts.ts`, `src/lib/epic-alerts-deep-link.ts`).
- **TTM Dashboard — widget "Tổng số Epic"**: thêm sub-link "Sai lệch dữ liệu" (đếm Epic Sai lệch dữ
  liệu trong đúng phạm vi tính của widget), cùng cơ chế deep-link như trên.
- **Widget TTM-E2E toàn công ty**: thêm vào page title banner của "TTM Dashboard" và "Quản trị Epic"
  (bên phải TTM-CNTT (QA)), tính giống nhau cho mọi user nên được gộp vào cache toàn ứng dụng
  (`ttm_index_global_cache` — migration `db/migrations/20261001_add_e2e_to_ttm_index_global_cache*`,
  `src/lib/ttm-index-global-cache-service.ts`, `src/lib/ttm-cntt-qa.ts` hàm `summarizeE2e` dùng chung
  với vòng KPI "Hoàn thành TTM-E2E" trên dashboard, API mới `src/app/api/ttm-index-global/route.ts`,
  header widget context `epic-header-widgets-context.tsx`/`AppShell.tsx`/`epic-alerts-15/page.tsx`).
- **Cập nhật tài liệu** theo rule "Chờ golive" mới: popup "Logic cảnh báo" (`catalog.ts`),
  `brd/02-ttm-concepts-and-rules.md` §6.1, `brd/16-ttm-indexes.md`, spec
  `docs/superpowers/specs/2026-09-29-scoring-service-design.md` (thêm mục 14), và
  `public/docs/product-guide.html` (viết lại §8.6, cập nhật §11.2/§11.5).
- **Fix bảo mật — chặn leo thang đặc quyền khi gán Role user**: trước đây ADMIN có thể tạo/sửa user
  với role bất kỳ kể cả SUPERADMIN. Thêm `canGrantRole()` (`src/lib/auth-types.ts`): actor chỉ được
  gán role THẤP HƠN role của chính mình (Superadmin > Admin > Supervisor > User); riêng SUPERADMIN
  được gán bất kỳ role nào. Chặn ở server (`src/app/api/users/route.ts` POST/PUT, trả 403 nếu vi
  phạm) và ẩn/khóa lựa chọn Role không được phép ở UI (`src/app/admin/users/page.tsx`). Thêm test
  `src/lib/__tests__/auth-types.test.ts`.
- **TTM Dashboard — widget "Tổng số Epic"**: thêm sub-link "Chưa có R4G Date" (trong phạm vi
  TTM-CNTT), tách biệt hoàn toàn với "Sai lệch dữ liệu" để phép trừ luôn đúng: Tổng số Epic − Sai
  lệch dữ liệu − Chưa có R4G Date = mẫu số TTM-CNTT (QLDA). Thêm filter `MISSING_R4G_IN_SCOPE`
  (`src/lib/epic-row-verdicts.ts`, `src/lib/epic-alerts-deep-link.ts`) dùng chung bởi sub-link và
  deep-link sang Quản trị Epic.
- **TTM Dashboard — widget "Cảnh báo muộn" → "Chậm tiến độ"**: đổi tên hiển thị (tiêu đề widget,
  modal/tooltip khi click, `ALERT_BADGE_LABEL.LATE`) ở chế độ Scoring Service; nhãn legacy
  "Cảnh báo (Sớm/Muộn)" giữ nguyên.
- **TTM Dashboard — bảng "Ma trận Phân bổ Tiến độ Epic Đa chiều"**: thêm cột "Epic tính TTM" (mẫu
  số TTM-CNTT QLDA = `item.qlda.eligible`) ngay bên phải cột "Tổng số Epic", sortable, click mở
  popup Quản trị Epic lọc đúng tập Epic này. Thêm filter `TTM_ELIGIBLE_IN_SCOPE`
  (`src/lib/epic-row-verdicts.ts`, `src/lib/epic-alerts-deep-link.ts`).

## 2026-09-30

- **Quy ước "TTM-CNTT" = "TTM-CNTT (QLDA)"** trên mọi màn hình + Scoring Service: đổi text hiển thị
  (badge/bộ lọc Nhận xét, cột TTM-CNTT, baseline pha, KPI/stat widget Fail, tiêu chí Time to Market, subtitle
  màn hình, nội dung finding trong `scoring/rules/*`, `catalog.ts`, Báo cáo, MCP). Không đổi logic: đã rà — phạm vi
  QA (`qaInScope`) chỉ dùng cho chỉ số TTM-CNTT (QA). Bump `SCORING_CODE_VERSION` → `scoring-2` (text finding
  lưu trong cache đổi; cache mới sau lần tổng hợp kế tiếp). Nhãn đối chiếu trong `scoring/parity.ts` giữ nguyên.
- **Cơ cấu lại 3 chỉ số TTM-CNTT (QLDA), TTM-CNTT (QA), TTM-E2E** (công thức không đổi; chỉ số mặc định
  tính theo phạm vi bảng đang hiển thị):
  - Quản trị Epic: bỏ 2 widget banner TTM-Index (QLDA)/QA-Index (QLDA); 2 widget còn lại đổi tên
    TTM-CNTT (QLDA)/TTM-CNTT (QA) và giờ tính theo **bảng Danh sách Epic đang lọc** (trước: toàn bộ phạm vi
    quyền, bỏ qua bộ lọc) — `queryTtmQaIndexPm` → `queryTtmCnttIndexes(scope, filters)` dùng chung
    `buildFilterClause`; chế độ 'full' tính từ `filteredRows`. `/api/epic-alerts-15` không trả `ttmIndexGlobal` nữa.
  - TTM dashboard: vòng KPI TTM-Index (PM)/QA-Index (PM) → TTM-CNTT (QLDA)/TTM-CNTT (QA); widget banner
    TTM-Index (QLDA)/QA-Index (QLDA) → TTM-CNTT (QLDA)/TTM-CNTT (QA) (vẫn toàn bộ Epic, cache toàn ứng dụng).
  - Đổi tên hiển thị đồng bộ: Cấu hình "Phạm vi dữ liệu cho TTM", popup Logic cảnh báo (`scoring/catalog.ts`
    — chỉ text, không đổi rule), panel cache, mô tả tool MCP, `public/docs/product-guide.html` mục 8.7/11.2/11.5,
    `brd/16-ttm-indexes.md` mục 0.
- **Cập nhật tài liệu Giới thiệu Sản phẩm (`public/docs/Product_brochures.html`)**:
  - Vẽ lại Sơ đồ SVG 1.1 (Mục 1.4) thông thoáng, bố cục 3 luồng rõ ràng (TTM-E2E, TTM-CNTT, Trục Release), sửa triệt để lỗi đè chữ/nút. Bổ sung chi tiết trường hợp T0 bị thiếu sẽ tự động fallback về ngày tạo Epic trên Jira (`jira_created_at`) kèm badge `E2E_BASELINE_FROM_JIRA_CREATED`.
  - Bổ sung **Mục 3.5: Chức năng Thu thập Dữ liệu, Cấu trúc Lớp Dữ liệu & Logic Multi-Layer**: Trình bày chi tiết cơ chế DataSourceAdapter (CSV/Jira), Validate Only vs Import & Validate, tự động import 1 lần/ngày, cấu trúc lớp dữ liệu `aggregated_at` (`layerDates`), truy vấn trạng thái mới nhất (`LATEST_ISSUES_CTE` / `latestIssuesAsOf`), logic chấm điểm quá khứ theo mốc `asOf` (Quyết định D3) và cơ chế cache scorecard GIN Index (`epic_alert_row_cache`).

- **Tạo tài liệu Giới thiệu Sản phẩm (`public/docs/Product_brochures.html`)**: Tạo file HTML tài liệu tóm tắt sản phẩm toàn diện, thiết kế theo chuẩn Gecko-inspired UI, tích hợp sidebar mục lục điều hướng sticky, tìm kiếm nhanh, switch Dark/Light theme, 4 sơ đồ SVG quy trình/kiến trúc/scoring engine, và bổ sung riêng Chương 4 quy định chi tiết 6 Axes, 5 Finding Groups, 35+ Badges Catalog, SUPPRESSIONS resolver và công thức TTM-Index / QA-Index của Epic Scoring Service.

- **Quản trị Epic — hàng Filters gọn 1 dòng + multi-select**: "Loại Epic" và "Nhận xét" đổi sang
  `ToolbarMultiSelect` (khớp BẤT KỲ giá trị nào đã chọn; API `alertFilter`/`epicType` nhận danh sách
  phân tách dấu phẩy — `epic-alert-row-cache-query-service.ts`, `api/epic-alerts-15/route.ts`; deep link
  và filter đã lưu kiểu cũ 1 giá trị vẫn đọc được). Nhãn rỗng rút gọn (Projects, PM/SM, Components,
  Nhận xét, Loại Epic, Status, Đơn vị yêu cầu, Domain); class `.ttm-toolbar-row` trong
  `epic-alerts-15.css` giữ mọi filter trên 1 hàng (co giãn đều, chỉ xuống dòng khi < 768px).
  "Bộ lọc nâng cao..." → "Advanced Filters". `ToolbarMultiSelect` nhận thêm option `{label, value}` và `title`.
- **TTM dashboard**: filter PM/SM đổi sang multi-select (`filterPmSms`, deep link sang Quản trị Epic mang theo cả danh sách).
- **Epic Scoring Service — M4: chuyển màn hình sang Scoring Service (công tắc chế độ, mặc định vẫn là logic cũ)**:
  - Công tắc `scoring_engine_settings.mode` (`legacy`/`scoring`, migration `20260930_create_scoring_engine_settings`
    — đã chạy Supabase, **local chưa chạy**), `scoring-mode-service.ts`, API `api/admin/scoring/mode`, nút bật/tắt
    trong panel "Đối chiếu Scoring Service"; đổi chế độ ⇒ tạo lại cache nền. `SCORING_ENGINE_MODE` trong
    `.env.local` chỉ ghi đè phần hiển thị trên 1 máy (cache chung luôn theo chế độ lưu trong DB).
  - `scoring/projection.ts`: chiếu scorecard lên `EpicAlertRowPhased` (+ `scoringBadges`/`scoringIndexFlags`/
    `scoringFindings`); `epic-scoring-display-service.ts` (`getEpicAlertRowsForDisplay`) dùng cho route Quản trị
    Epic, Dashboard, TTM Dashboard, MCP; cache ghi dòng đã chiếu khi chế độ `scoring`.
  - Bộ lọc SQL theo `badge_codes`, TTM-/QA-Index theo `index_flags` (SQL + `summarizeTtmCntt`/`summarizeQaIndex`).
  - `src/lib/epic-row-verdicts.ts` thay các bản copy logic "Đạt"/bộ lọc ở Quản trị Epic & Epic in PO; badge mới
    `components/epic-alerts/ScoringBadges.tsx` ("Sai Status (Release)", "Pending lâu", "Khuyến nghị (n)"); bộ lọc
    thêm "Pending lâu", ẩn "Cảnh báo sớm" khi chế độ `scoring`. TTM Dashboard, Báo cáo Epic, MCP (`danhGia`) theo scoring.
  - Kiểm chứng dữ liệu thật: TTM-Index 93,8% → 89,0% ở chế độ scoring; luồng cache và luồng tính trực tiếp cho
    cùng số liệu. 31 test pass (thêm test projection/verdict/Index).
  - Đã chạy `refreshDerivedCaches` bằng code mới (chế độ legacy) để điền cột shadow `badge_codes`/`index_flags`.

## 2026-09-29

- **Triển khai Epic Scoring Service — M1–M3 (chạy song song, màn hình vẫn dùng logic cũ)**:
  - Chốt quyết định vòng 2: bỏ badge "Cần ghi nhận Due Date"; Target_CNTT = T1 +wd (N − 1) cho mọi badge;
    R2 "Pending lâu" → nhóm Khuyến nghị (không còn là Sai lệch dữ liệu). Spec + popup "Logic cảnh báo" cập nhật.
  - Thư viện thuần `src/lib/scoring/` (catalog, derive, rules theo axis, resolver, `scoreEpic`, select, parity)
    + số học ngày làm việc trên chuỗi ISO (không phụ thuộc múi giờ server); lint cấm system clock/DB trong
    thư mục này. `npm test` mới (Node test runner, `scripts/test-register.mjs`) — 26 test pass.
  - Server: `scoring-context-service.ts` (cấu hình + `rulesetVersion`), `scoring-facts-service.ts` (facts tại
    asOf, story/subtask theo asOf qua `computeEpicPhaseCompletionByEpicKey(asOf)` / `latestIssuesAsOfCte`),
    `scoring-run-service.ts` (chấm điểm hàng loạt, shadow, đối chiếu).
  - Migration `20260929_create_scoring_service` (bảng `scoring_parameters`, `scoring_rule_settings`,
    `scoring_parity_runs`; 5 cột mới trên `epic_alert_row_cache`) — đã chạy Supabase; **local chưa chạy**
    (máy này không có Postgres local).
  - `refreshDerivedCaches` chấm điểm shadow + ghi scorecard vào cache + lưu kết quả đối chiếu; luồng import
    chuyển sang `refreshDerivedCaches` (tính 1 lần cho cả 2 cache).
  - SUPERADMIN: `api/admin/scoring/parity` + panel "Đối chiếu Scoring Service" (Quản trị nguồn dữ liệu).
  - Đối chiếu dữ liệu thật: 29/09 — 1.120 Epic, 1.040 khớp, 80 lệch có chủ đích, 0 chưa giải thích;
    15/09 — 897 Epic, 0 chưa giải thích. Phát hiện 2 lỗi logic cũ (E2E Fail khi ngày kết thúc = hạn trên
    server giờ VN; Epic Cancelled hiện "Đạt TTM-CNTT") — service không lặp lại.
  - `AGENTS.md`: mục mới "Epic Scoring Service — where Epic rules live".

- **Thiết kế Epic Scoring Service (bản nháp, chưa áp dụng vào tính toán)**:
  - Spec `docs/superpowers/specs/2026-09-29-scoring-service-design.md`: mô hình Axis → Finding Group
    (ALERT/PASS/FAIL/RECOMMENDATION/NOTE) → Badge, mốc `asOf` tương đối, schema cache/cấu hình, lộ trình
    chạy song song với logic cũ; đã chốt D1–D4, Q1–Q7; còn mở O1 (badge "Cần ghi nhận Due Date") và O2
    (mốc Target_CNTT lệch 1 ngày làm việc giữa badge Fail và baseline pha R4GOLIVE).
  - Danh mục badge dùng chung `src/lib/scoring/catalog.ts` (dữ liệu thuần, chưa có rule nào chạy).
  - Popup "Logic cảnh báo" (`src/components/layout/HelpPanels.tsx` → `AlertLogicModal`) thay toàn bộ nội
    dung: ma trận Axis × Finding Group, bảng ý nghĩa + công thức từng badge, thứ tự che, công thức
    TTM-Index/QA-Index, các thay đổi so với logic hiện tại — render trực tiếp từ catalog để duyệt.

## 2026-09-28

- **Sửa các vấn đề từ review sau khi pull (mục 1–4)**:
  - Chống 2 lần tính lại cache chạy chồng nhau (import / chạy hằng ngày / lưu Phạm vi TTM / lưu Domain /
    Recompute): `refreshEpicAlertRowCache` lấy `pg_advisory_xact_lock` trước khi `DELETE`+`INSERT` —
    trước đây lần sau bị lỗi trùng `epic_key`, rollback và giữ lại cache tính theo cấu hình cũ
    (`src/lib/epic-alert-row-cache-service.ts`). Thêm `refreshDerivedCachesInBackground` (bắt + log lỗi)
    cho các lời gọi `after()` ở `api/ttm-scope-config` và `api/domains` (`src/lib/daily-cache-service.ts`).
  - Đổi tên Domain giờ cũng tính lại cache (cache lưu `domainName` và dùng làm khoá lọc Domain/deep-link):
    `DomainSaveResult.nameChanged` (`src/lib/master-data-service.ts`, `master-data-types.ts`, `api/domains/route.ts`).
  - Thống nhất rule "Phạm vi dữ liệu cho TTM" là **tính cả 2 đầu mút** (`A ≤ R4G Date ≤ B`, `C ≤ R4G Date ≤ D`)
    đúng như code: sửa `brd/16-ttm-indexes.md`, `public/docs/product-guide.html` (mục 8.7), text hướng dẫn
    ở `StatusAlertRulesSettings.tsx`, `dashboard-new/page.tsx`, comment `ttm-scope-rules.ts`.
  - Xoá 25 file `*.bak`/`*.bak2` khỏi repo, thêm `*.bak`, `*.bak[0-9]*` vào `.gitignore`.

- **Quản lý Domain: cột "Dự án trong Domain" + chọn nhiều dự án khi Thêm/Sửa Domain** (để deep-link
  `domain=...` luôn map được sang danh sách dự án):
  - `listDomains` trả thêm `projects` (theo `projects.domain_id`, không đổi schema); `createDomain`/
    `updateDomain` nhận `projectIds` và đồng bộ trong 1 transaction (chọn dự án của domain khác = chuyển
    sang; bỏ chọn = `domain_id NULL`) — `src/lib/master-data-service.ts`, `master-data-types.ts`.
  - `api/domains/route.ts`: validate `projectIds`; nếu phân bổ thay đổi thì `after(refreshDerivedCaches)`
    tính lại cache ngầm (cache lưu `domainName` của Epic).
  - UI `src/app/admin/domains/page.tsx`: cột badge mã dự án (tooltip tên, sắp xếp theo số dự án, tìm theo
    dự án), `MultiSelect` "Dự án trong Domain" kèm nhãn "đang thuộc <domain khác>" và cảnh báo chuyển/gỡ.

- **Quản trị Epic: sửa "chớp 2 lần" khi mở từ màn khác (deep-link, vd. từ TTM dashboard)**:
  - Nguyên nhân 1: deep-link có `domain` nhưng không có `projects` → lần tải đầu chưa lọc domain (chưa
    có map domain→dự án) nên hiện danh sách chưa lọc, rồi mới áp domain và tải/hiển thị lại. Sửa: state
    `domainPending` giữ skeleton (ẩn cả stat widgets) cho tới khi danh sách đã phản ánh đúng domain
    (`src/app/epic-alerts-15/page.tsx`).
  - Nguyên nhân 2: TTM dashboard luôn gửi kèm `cnttFrom/cnttTo/qaFrom/qaTo` → API luôn đi đường tính
    live (chậm, mode `full`), và mỗi lần đổi filter/trang ở client lại gọi lại API tính live toàn bộ. Sửa:
    (a) `api/epic-alerts-15/route.ts` bỏ qua override khi trùng cấu hình mặc định (`dropNoOpTtmScopeOverride`)
    → đi đường cache nhanh; (b) ở mode `full`, đổi filter toolbar/trang không gọi lại API nữa (client tự
    lọc — `serverQueryKey`/`lastFetchRef`), chỉ gọi lại khi đổi lớp dữ liệu/bộ lọc ngày nâng cao.

- **Quản trị Epic (`/epic-alerts-15`): nhóm "Ngoài phạm vi TTM-CNTT" + option lọc mới**:
  - Thứ tự nhóm mới: Epic thường → In PO → To Do → **Ngoài phạm vi TTM-CNTT** (mọi status) → Released.
    Hàm mới `listGroupRankOf`/`LIST_GROUP_RANK_SQL` (`src/lib/epic-alert-sort-rules.ts`) dùng cho cả
    sort client (`epic-alerts-15/page.tsx`) lẫn `ORDER BY` SQL (`epic-alert-row-cache-query-service.ts`).
    Cột `bottom_status_rank` trong cache giữ nguyên ý nghĩa (3 = RELEASED, filter ACHIEVED_E2E dựa vào
    nó) → không cần migration, không cần rebuild cache.
  - Thêm option **"Ngoài phạm vi TTM-CNTT"** (`OUT_OF_SCOPE_CNTT`) vào filter "Tất cả nhận xét":
    `matchesAlertFilter` (client) + `buildAlertFilterClause` (SQL `NOT ttm_cntt_in_scope`), thêm vào
    type deep-link `EpicAlertsDeepLinkAlert`.
- **MCP Server: mở rộng phạm vi cho AI chatbot** (`src/lib/mcp-server.ts`, version 1.1.0, có `instructions`):
  - Tool `get_ttm_dashboard` — số liệu màn TTM dashboard (KPI, TTM-Index/QA-Index, pipeline 5 pha, top
    dự án rủi ro, breakdown theo chiều, danh sách Epic chi tiết), tính ở server trong service mới
    `src/lib/ttm-dashboard-summary-service.ts` bằng đúng helper/rule của `dashboard-new/page.tsx`.
    Tách `loadDashboardEpicRows` ra service và `api/dashboard-new/route.ts` dùng lại (không đổi hành vi).
  - Tool `search_product_docs` + `get_product_doc_section` — hỏi đáp trên "Tài liệu sản phẩm"
    (`public/docs/product-guide.html`, parse runtime theo mục h2/h3, tìm không phân biệt dấu) trong
    `src/lib/product-doc-service.ts`; `next.config.ts` thêm `outputFileTracingIncludes` để Vercel đóng
    gói file HTML vào function `/api/mcp`.
  - Cập nhật bảng tool MCP ở Tài liệu sản phẩm (mục 16.3) + `brd/15-mcp-sso-and-reports.md`; mô tả thứ
    tự nhóm/option lọc mới ở mục 11.2.
  - `next build` chưa chạy được trong môi trường làm việc này (không tải được Google Fonts); `tsc` pass.

- **Cấu hình cảnh báo: Sắp xếp lại giao diện panel "Phạm vi dữ liệu cho TTM"** ([`src/components/status-alert-rules/StatusAlertRulesSettings.tsx`](file:///d:/AI/ttm-tool/src/components/status-alert-rules/StatusAlertRulesSettings.tsx)):
  - Chuyển bố cục 2 cụm cấu hình ngày sang bảng 2 cột 1 hàng (cột 1: R4G for TTM (CNTT), cột 2: R4G for TTM (QA)) với header `TH` và `TableContainer` đồng bộ chuẩn giao diện.
  - Cập nhật các nút "Để trống" sang style primary button (`size="sm"`) đồng bộ với nút "Thêm tiêu chí" của panel Tiêu chí Time to Market trong cùng màn hình.
  - Bố trí dòng thông tin "Cập nhật lần cuối {......}" trực tiếp ngay dưới bảng cấu hình, cùng với nút "Lưu & tính toán lại cache".

- **"Phạm vi dữ liệu cho TTM" — gate theo khoảng ngày R4G cho TTM-Index/QA-Index, panel Admin, Advanced Filters ở Dashboard 2, tài liệu rule TTM-Index (Phase 2+3, đã thảo luận & thống nhất thiết kế trước khi làm)**:
  - **Schema**: bảng mới `ttm_scope_config` (1 dòng: `cntt_from/to`, `qa_from/to`, migration
    `20260927b_create_ttm_scope_config`); thêm cột `ttm_cntt_in_scope`/`qa_in_scope` vào
    `epic_alert_row_cache` (migration `20260927c_...`). Đã chạy `db:migrate:supabase`; `local` chưa
    chạy được từ máy này (không có Postgres local cấu hình).
  - **Lõi tính toán** (`src/lib/ttm-scope-rules.ts` — module thuần, không import `pool`, để dùng
    được cả ở client lẫn server): `computeTtmCnttInScope(r4gDate, targetR4gDate, config)` — lọc theo
    A<R4G Date<B, fallback sang TTM-CNTT baseline (targetR4gDate) khi chưa có R4G Date; cả 2 đầu
    trống = luôn `true` (không đổi hành vi mặc định). `computeQaInScope(r4gDate, config)` — lọc theo
    C<R4G Date<D, KHÔNG có fallback baseline (Epic thiếu R4G Date bị loại khi có thiết lập). Đã viết
    18 test case tay (`node --experimental-strip-types`) cho mọi biên (trống/1 đầu/2 đầu, có/thiếu
    R4G+baseline, r4g ưu tiên hơn baseline) — tất cả PASS.
  - `src/lib/ttm-scope-config-service.ts`: CRUD `ttm_scope_config` (server-only, dùng `pool`).
  - **Áp dụng vào pipeline tính TTM-CNTT** (`src/lib/epic-alert-service.ts`): `fetchEpicAlertContext`
    fetch cấu hình mặc định + gộp với override từ deep-link (`EpicAlertFilters.ttmScopeCnttFrom/To`,
    `ttmScopeQaFrom/To` — `undefined` = dùng mặc định Admin, `null`/`''` = ghi đè tường minh "không
    giới hạn"), tính `ttmCnttInScope`/`qaInScope` 1 lần/Epic, gắn vào `EvaluatedEpicEntry` →
    `EpicAlertRow` (`getEpicAlertRows`) và `EpicAlertRowPhased` (`getEpicAlertRowsPhased`,
    `epic-alert-phase-service.ts`). Thêm 2 field vào `epic-alert-types.ts` + `DASHBOARD_EPIC_ROW_KEYS`
    (kèm `targetR4gDate` — thiếu trước đó, cần cho fallback baseline ở Dashboard).
  - `src/lib/ttm-cntt-qa.ts`: `summarizeTtmCntt` loại `!ttmCnttInScope` khỏi tử/mẫu/tổng; thêm hàm
    mới `summarizeQaIndex` (loại theo `qaInScope`, tách khỏi `summarizeTtmCntt` vì 2 cờ độc lập nhau)
    — cập nhật mọi nơi gọi `summarizeTtmCntt(rows.filter(isTtmCnttQaInScope))` sang gọi thẳng
    `summarizeQaIndex(rows)` (`ttm-index-global-cache-service.ts`, `dashboard-new/page.tsx`,
    `epic-alerts-15/page.tsx`).
  - **Cache**: `epic-alert-row-cache-service.ts` ghi thêm 2 cột mới khi rebuild;
    `epic-alert-row-cache-query-service.ts` thêm `AND ttm_cntt_in_scope`/`qa_in_scope` vào
    `queryTtmQaIndexPm` và vào `failCntt`/`late` của `queryEpicAlertStatCounts` (không đụng
    `failE2e`/`dataIssue`/`pending`/`todo` — các số này không thuộc trục TTM-CNTT).
  - **Badge "Nhận xét"** (Quản trị Epic đầy đủ/rút gọn, Epic in PO — 3 file gần như trùng logic):
    `!row.ttmCnttInScope` luôn thắng mọi badge TTM-CNTT khác (Sai Status/Fail/Late/Early/Đạt), hiện
    badge mới **"Ngoài phạm vi TTM-CNTT"** (class `.ttm-badge.out-of-scope`, thêm CSS 3 file
    `epic-alerts-15.css`/`epic-alerts.css`/`epic-in-po.css`, cả light/dark) — Epic vẫn hiện trong
    bảng, chỉ ẩn phán quyết TTM-CNTT. `matchesAlertFilter` (lọc "Nhận xét" ở client) và
    `buildAlertFilterClause` (lọc SQL) đều thêm guard `ttm_cntt_in_scope`/`ttmCnttInScope` cho
    FAIL/LATE/EARLY/NONE/ACHIEVED_CNTT/STATUS_MISMATCH — KHÔNG đụng FAIL_E2E/ACHIEVED_E2E/
    WAITING_GOLIVE/RELEASE_EARLY/JUSTIFY_GOLIVE/DATA_ANOMALY (trục khác, không bị Phạm vi TTM chi
    phối). TTM-E2E xác nhận hoàn toàn KHÔNG bị ảnh hưởng bởi tính năng này ở bất kỳ đâu.
  - **Panel Admin** ("Cấu hình cảnh báo" → `StatusAlertRulesSettings.tsx`, component mới
    `TtmScopeConfigPanel`): 2 form ngày (R4G for TTM CNTT A-B, R4G for TTM QA C-D), mỗi ô có nút "Để
    trống" tường minh (không chỉ dựa vào việc xoá tay ô `input type=date`). Lưu → gọi
    `PUT /api/ttm-scope-config` (route mới, SUPERADMIN, validate A≤B/C≤D) → `saveTtmScopeConfig` rồi
    `after(() => refreshDerivedCaches(batchId))` (chạy nền, không block response — tái dùng đúng hàm
    `daily-cache-service.ts` đã dùng cho auto-cache hàng ngày, tính lại CẢ 2 cache
    `epic_alert_row_cache` và `ttm_index_global_cache` cùng lúc).
  - **Dashboard 2** (`dashboard-new/page.tsx`): section "Advanced Filters" mới ngay dưới toolbar bộ
    lọc chính, **thu gọn mặc định** (chỉ hiện icon+tiêu đề, cùng pattern "Bộ lọc nâng cao" đã có ở
    Quản trị Epic) — 2 khối "Filter R4G for TTM (CNTT)"/"Filter R4G for TTM (QA)", mỗi ô ngày có nút
    "Để trống". Giá trị mặc định lấy từ `GET /api/ttm-scope-config` khi trang tải (GET nới quyền cho
    mọi role đã đăng nhập, trước đó chỉ SUPERADMIN/SUPERVISOR — Dashboard cần mọi role đọc được).
    Áp dụng **live, không cache**: `filteredRows` tính lại `ttmCnttInScope`/`qaInScope` theo state 4 ô
    này (đè lên giá trị baked-in từ cache), mọi widget đọc từ `filteredRows` tự động theo (đã audit
    và sửa toàn bộ điểm đọc `alertLevel` trực tiếp mà thiếu guard: `executiveMetrics`
    lateWarning/earlyWarning, `dimensionMatrix` late/ok + `isQldaJudged`, `topRiskProjects`,
    `pipelinePhases.alertCount`, `computeDimensionDonuts`, badge ở tab Pending — tất cả giờ đều
    check `ttmCnttInScope` trước khi đếm alertLevel, trừ phần `ttmE2eAlertLevel` cố tình giữ nguyên).
  - **Deep-link mang filter sang Quản trị Epic** (`epic-alerts-deep-link.ts`): thêm 4 param
    `ttmScopeCnttFrom/To`, `ttmScopeQaFrom/To` (`undefined` = bỏ qua param, dùng mặc định màn đích;
    `null`/`''` = gửi tường minh "không giới hạn" — phân biệt bằng `URLSearchParams.has()` phía
    server, `searchParams.has()` phía client). `toEpicAlertsLink` ở Dashboard luôn gửi kèm 4 giá trị
    hiện tại (chỉ sau khi đã tải xong mặc định Admin — tránh gửi nhầm "không giới hạn" trong khoảnh
    khắc trước khi fetch xong). Phía Quản trị Epic: `parseDeepLinkFilters` đọc 4 param này,
    `fetchData` forward vào query string; API route (`/api/epic-alerts-15`) coi sự xuất hiện của bất
    kỳ param nào trong 4 param này là "advanced filter" → bỏ qua cache, tính live qua
    `fetchEpicAlertContext` (đúng pattern đã có sẵn cho `createdDateFrom`/`startDateFrom`/
    `dueDateFrom`) — không cần sửa gì thêm ở tầng cache SQL cho nhánh này.
  - **Không đụng tới**: `reports-service.ts` (Báo cáo Epic) — dùng engine tính toán hoàn toàn độc
    lập (`evaluateIssueCompliance`, không qua `fetchEpicAlertContext`), CHƯA áp dụng "Phạm vi dữ liệu
    cho TTM" ở đó — cần 1 lượt riêng nếu muốn mở rộng, không rush vào lần này để tránh sửa nhầm 1
    engine hoàn toàn khác mà chưa research kỹ.
  - **Tài liệu**: file mới `brd/16-ttm-indexes.md` (rule tính toán đầy đủ: tử/mẫu số, phạm vi dữ
    liệu, bảng liệt kê mọi trường hợp bị loại khỏi tính toán), đăng ký vào `brd/00-ai-agent-index.md`
    (mục 3 + mapping "task liên quan cảnh báo TTM-CNTT"). `public/docs/product-guide.html` mục 8.7
    mới (TTM-Index/QA-Index QLDA vs PM + Phạm vi dữ liệu cho TTM), không renumber các mục sau.
  - **Backup**: mọi file bị sửa đã copy nguyên bản trước khi sửa vào `/backups/<tên>-20260927-233007-backup`
    (thư mục mới, đã thêm vào `.gitignore` — chỉ là lưới an toàn thao tác tay, không thay thế git).
  - Đã xác minh bằng `tsc --noEmit`, `eslint` (không phát sinh lỗi mới so với trước khi sửa — đối
    chiếu qua `git stash`) và **2 lần `npm run build` thành công** (bắt lỗi ranh giới client/server
    khi tách `ttm-scope-rules.ts` client-safe khỏi `ttm-scope-config-service.ts` server-only).
    **Chưa kiểm thử được trên trình duyệt thật** (không có tài khoản đăng nhập trên máy này) — cần
    người dùng tự xác nhận UI/luồng thực tế trước khi coi là hoàn tất.

## 2026-09-27

- **Tối ưu tỷ lệ 40/60 & Responsive tối đa cho màn hình Thống kê truy cập (`/visit-stats`)**:
  - **Panel "Lượt truy cập theo 4 màn hình chức năng"**: Điều chỉnh tỷ lệ phần biểu đồ cột kép chiếm 40% (`lg:col-span-2`) và phần bảng thống kê chiếm 60% (`lg:col-span-3`) trên hệ lưới 5 cột (`lg:grid-cols-5`).
  - **Header bảng Domain**: Đổi tiêu đề cột `Hôm nay (T)` thành `Hôm nay` và `Tuần này (T-7 → T)` thành `Tuần này`.
  - **Responsive chống tràn ngang**: Áp dụng layout cố định `table-fixed w-full`, tỷ lệ cột theo phần trăm chính xác, thu gọn padding và xử lý `truncate` kèm tooltip/title cho các chuỗi dài (username, họ tên, email) trên cả bảng Domain (bảng cha + bảng top 5 user) và bảng "Danh sách 10 user login gần nhất", loại bỏ thanh cuộn ngang không cần thiết trên màn hình máy tính ([`src/components/visit-counter/VisitCounterPanel.tsx`](src/components/visit-counter/VisitCounterPanel.tsx)).

- **Tái cấu trúc bố cục giao diện màn hình Thống kê truy cập (`/visit-stats`)**:
  - **Hàng 1**: Bố trí cụm 3 widget thống kê (Tổng số, Tuần này, Hôm nay) ở bên trái chiếm 1/3 chiều rộng hàng theo dạng lưới 2 cột (Box 1 và Box 2 ở dòng trên, Box 3 ở dòng dưới) bên cạnh Biểu đồ "Xu hướng truy cập ứng dụng trong tuần (T-7 → T)" chiếm 2/3 chiều rộng (gấp 2 lần chiều dài của cụm widget).
  - **Khắc phục lỗi giãn hình/chữ của biểu đồ đường**: Chuyển nhãn trục Y và trục X sang HTML text kết hợp với SVG `vectorEffect="non-scaling-stroke"` và đường gióng HTML, loại bỏ hoàn toàn hiện tượng méo và giãn chữ theo tỷ lệ SVG `preserveAspectRatio="none"`.
  - **Hàng 2**: Đặt biểu đồ cột kép và bảng thống kê chi tiết của panel "Lượt truy cập theo 4 màn hình chức năng" cùng hàng, bảng thống kê chiếm 50% chiều dài panel.
  - **Hàng 3**: Đặt panel "Lượt truy cập theo Domain & Người dùng" cùng hàng với panel "Danh sách 10 user login gần nhất", mỗi panel chiếm 50% khung nhìn (`lg:grid-cols-2`).
  - **Bảng người dùng của từng Domain**: Chỉ hiển thị top 5 người dùng có lượt truy cập cao nhất, đồng thời căn giữa toàn bộ tiêu đề (header) và dữ liệu (data) trong bảng con này ([`src/components/visit-counter/VisitCounterPanel.tsx`](src/components/visit-counter/VisitCounterPanel.tsx)).

- **Chuyển "Thống kê truy cập" (Visit Counter) thành menu riêng, mở cho mọi role**:
  - Màn hình mới `/visit-stats` ([`src/app/visit-stats/page.tsx`](src/app/visit-stats/page.tsx)), menu "Thống kê truy cập" (icon `ChartLineUp`) ở nhóm **Giám sát** trên left panel, không gắn `roles` → mọi role đã đăng nhập đều thấy ([`src/components/layout/AppShell.tsx`](src/components/layout/AppShell.tsx), header trang ở [`src/lib/app-screens.ts`](src/lib/app-screens.ts)).
  - Bỏ tab Visit counter khỏi modal "Cấu hình ứng dụng" (`AppConfigModal.tsx`); panel chuyển sang `src/components/visit-counter/VisitCounterPanel.tsx`, thêm prop `hideTitle` (trang đã có header từ AppShell).
  - Ma trận phân quyền: migration `db/migrations/20260927_add_visit_counter_permission.sql` (+ down) thêm chức năng `visit_counter` "Thống kê truy cập" (VIEW_ONLY, display_order 107), quyền Xem cho SUPERADMIN/ADMIN/SUPERVISOR/USER. **Cần chạy `db:migrate:local` + `db:migrate:supabase`** (chưa chạy — phiên làm việc trên cloud không có kết nối DB).
  - Review/sửa nhỏ: `POST /api/visit-counter/track` trả 401 thay vì ghi lượt xem ẩn danh (`user_id` NULL); gom hàm nhận diện màn hình về 1 chỗ `resolveScreenKeyFromPath` trong `src/lib/visit-counter-types.ts` (trước đây trùng lặp ở `footer/route.ts` và `visit-counter-client.ts`, và route file export thêm hàm không phải handler); sửa lỗi lint `react-hooks/set-state-in-effect` trong `VisitCounterPanel`.
  - Cập nhật tài liệu: `README.md`, `public/docs/product-guide.html` (mục 13.2, 18.3, bảng quyền USER), `HelpPanels.tsx`.

## 2026-09-26

- **Tinh chỉnh giao diện Visit Counter Panel ([`src/components/settings/VisitCounterPanel.tsx`](file:///d:/git/ttm-tool/src/components/settings/VisitCounterPanel.tsx))**:
  - Chuyển đổi nút "Làm mới" ở header của panel Visit Counter thành nút chỉ có icon (`ArrowsClockwise`) kích thước `size-8`, bo tròn tinh tế và tích hợp `Tooltip` hiển thị nhãn "Làm mới" khi hover, tối ưu không gian và tính thẩm mỹ đồng bộ.

- **Triển khai tính năng Visit Counter (Bộ đếm truy cập ứng dụng & màn hình)**:
  - **CSDL & Migrations**:
    - Tạo migration `db/migrations/20260926b_create_visit_logs.sql` (và down migration) tạo bảng `visit_logs` gồm các trường `id`, `event_type` (`APP_LOGIN` | `SCREEN_VIEW`), `screen_key` (`dashboard`, `epic_alerts`, `epic_reports`, `epic_in_po`), `user_id`, `created_at` và 3 index tối ưu truy vấn theo `(event_type, created_at)`, `(screen_key, created_at)`, `(user_id, created_at)`.
    - Đã chạy migration thành công đồng bộ trên cả 2 môi trường `local` (63/63) và `supabase` (62/62).
  - **Dịch vụ Backend & Tích hợp Authentication**:
    - [`src/lib/visit-counter-types.ts`](file:///d:/git/ttm-tool/src/lib/visit-counter-types.ts): Định nghĩa kiểu dữ liệu màn hình, thống kê KPI, dữ liệu trend line 8 ngày, dữ liệu cột kép so sánh 2 tuần, phân rã domain/user và danh sách user login gần nhất.
    - [`src/lib/visit-counter-service.ts`](file:///d:/git/ttm-tool/src/lib/visit-counter-service.ts): Cung cấp các hàm `recordAppLogin`, `recordScreenView`, `getFooterVisitSummary`, `getDetailedVisitStats` xử lý chính xác theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh` / GMT+7) cho các khung trượt Hôm nay ($T$), Tuần này ($T-7 \to T$), Tuần trước ($T-15 \to T-8$) và Lũy kế toàn thời gian.
    - [`src/lib/auth-service.ts`](file:///d:/git/ttm-tool/src/lib/auth-service.ts): Tích hợp gọi `recordAppLogin(user.id)` trong `authenticateLocal()` ngay khi đăng nhập thành công.
  - **API Routes**:
    - `POST /api/visit-counter/track`: Ghi nhận sự kiện truy cập màn hình.
    - `GET /api/visit-counter/footer`: Trả về dữ liệu tóm tắt cho footer (Tổng số, tuần này, màn hình hiện tại theo param `path`, và 5 user login gần nhất).
    - `GET /api/visit-counter/stats`: Trả về dữ liệu thống kê chi tiết cho Panel Visit counter trong modal Cấu hình ứng dụng.
  - **Tracking tự động tại Client**:
    - [`src/lib/visit-counter-client.ts`](file:///d:/git/ttm-tool/src/lib/visit-counter-client.ts): Chuẩn hóa nhận diện đường dẫn (Dashboard: `/dashboard-new` và `/dashboard`; Quản trị Epic: `/epic-alerts-15` và `/epic-alerts`; Báo cáo Epic: `/reports`; Epic in PO: `/epic-in-po`) và cơ chế chống đếm lặp Client-side Debouncing 30s với `sessionStorage`.
    - [`src/components/layout/AppShell.tsx`](file:///d:/git/ttm-tool/src/components/layout/AppShell.tsx): Tự động kích hoạt `trackScreenVisit` khi user chuyển tới 1 trong 4 màn hình được theo dõi.
  - **Giao diện Page Footer chung (`SystemStatusFooter`)**:
    - [`src/components/layout/SystemStatusFooter.tsx`](file:///d:/git/ttm-tool/src/components/layout/SystemStatusFooter.tsx): Đổi layout thành 2 dòng căn giữa:
      - Dòng 1 (11px, text-slate-500): `TTM Tool | Version {version} | Total visit: A. Weekly: B. {This screen: C. }Last login users: D.` (ẩn `This screen: C.` nếu ngoài 4 màn hình trên; 5 user login gần nhất có hover Tooltip hiển thị đầy đủ Họ tên, username và ngày giờ login `DD/MM/YYYY HH:mm:ss` GMT+7).
      - Dòng 2 (10px, text-gray-400): `(C) minhnd7. db: {dbTarget} - {dbStatus}`.
  - **Panel "Thống kê truy cập (Visit counter)" trong Cấu hình ứng dụng**:
    - [`src/components/settings/AppConfigModal.tsx`](file:///d:/git/ttm-tool/src/components/settings/AppConfigModal.tsx): Bổ sung tab cấu hình với icon `ChartLineUp`.
    - [`src/components/settings/VisitCounterPanel.tsx`](file:///d:/git/ttm-tool/src/components/settings/VisitCounterPanel.tsx): 3 thẻ KPI (Tổng số, Tuần này, Hôm nay); biểu đồ SVG trend line 7 ngày qua kèm gradient fill và interactive tooltip; biểu đồ cột kép so sánh lượt truy cập 4 màn hình giữa 2 tuần ($T-15 \to T-8$ vs $T-7 \to T$) kèm bảng chi tiết; bảng thống kê theo Domain với khả năng mở rộng/thu gọn xem chi tiết từng User; bảng 10 user login gần nhất có hover tooltip ngày giờ login.
  - **Tài liệu sản phẩm & Markdown**:
    - Cập nhật [`public/docs/product-guide.html`](file:///d:/git/ttm-tool/public/docs/product-guide.html) (Mục 18 chuyên biệt, Mục 5 Data model 39 bảng, Mục 13.2, Mục 20 Thuật ngữ).
    - Cập nhật [`README.md`](file:///d:/git/ttm-tool/README.md) và [`brd/08-data-model.md`](file:///d:/git/ttm-tool/brd/08-data-model.md) (Mục 22, sơ đồ Mermaid ERD).

- **Ngừng dùng Aiven**: cập nhật `AGENTS.md` (mục Multi-database) — migration chỉ áp dụng cho `local` và `supabase`, không chạy `db:migrate:aiven` nữa (host Aiven đã không còn tồn tại).
- **Tự tạo cache 1 lần/ngày + panel "Theo dõi cache dữ liệu"** — Vercel không có lịch chạy, mà FAIL/LATE/số ngày còn lại trong cache tính theo ngày tạo, nên ngày không import cache bị lệch.
  - Bảng mới `daily_cache_runs` (1 dòng/ngày VN, `run_date` là PK → chỉ 1 request giành được lượt chạy, an toàn qua transaction pooler) — migration `db/migrations/20260926_create_daily_cache_runs.sql`, đã áp dụng local + supabase; **aiven lỗi `ENOTFOUND` (host không còn tồn tại) nên chưa áp dụng**.
  - `src/lib/daily-cache-service.ts`: trạng thái FRESH/STALE/RUNNING/FAILED, claim nguyên tử (RUNNING quá 10 phút hoặc FAILED sau 5 phút được claim lại), `refreshDerivedCaches` tính dữ liệu Epic 1 lần cho cả 2 cache (trước đây mỗi cache tự tính lại). `recompute-cache` cũng dùng hàm này.
  - `src/app/api/system/daily-cache/route.ts`: GET trạng thái; POST claim + chạy nền bằng `after()` (`maxDuration = 300`), trả về ngay.
  - `src/components/layout/DailyCacheWarmer.tsx` (gắn trong `AppShell`, không chạy trong iframe embedded): lần tải trang đầu trong ngày gọi POST, nếu đang chạy thì poll 4s/lần → toast "Caching dữ liệu trong ngày hoàn thành" + popup hỏi tải lại trang. Tab đã biết hôm nay FRESH thì không hỏi lại (sessionStorage).
  - `src/components/data-source/CacheStatusPanel.tsx` + `GET /api/admin/data-source/cache-status` (SUPERADMIN): trạng thái hôm nay, số Epic/thời điểm tạo cache, cache TTM/QA-Index, đợt import mới nhất, cảnh báo cache trống/lệch đợt import, lịch sử 10 ngày.
- **TTM Dashboard (`/dashboard-new`) đọc từ `epic_alert_row_cache` thay vì tính lại trực tiếp** — trước đây mỗi lần mở gọi `getEpicAlertRowsPhased` (~7–8s trên Supabase) và trả full row (testuser ~493KB).
  - `src/app/api/dashboard-new/route.ts`: fast path đọc cache theo phạm vi quyền (`resolveAccessScope` + `queryDashboardEpicRows`), fallback tính trực tiếp khi cache trống; `listManagedUsers` chạy song song.
  - `src/lib/epic-alert-types.ts`: thêm `DashboardEpicRow`/`DASHBOARD_EPIC_ROW_KEYS`/`toDashboardEpicRow` — chỉ các trường dashboard dùng, bỏ Epic Cancelled ở server (dashboard vốn loại Cancelled ở mọi chỗ). `queryDashboardEpicRows` (`src/lib/epic-alert-row-cache-query-service.ts`) dựng đúng shape này bằng `jsonb_build_object`.
  - `summarizeTtmCntt` (`src/lib/ttm-cntt-qa.ts`) nhận `Pick<...>` thay vì full row. Logic tính chỉ số/lọc trên client giữ nguyên.
  - Đã đối chiếu live vs cache trên Supabase cho superadmin/supervisor/admin/PM-SM: số Epic và từng trường khớp 100%; thời gian 7–8s → 0,3–1,3s (đo từ VN), payload testuser ~493KB → ~116KB.
- **Tăng tốc load Quản trị Epic (`/epic-alerts-15`)** — đo trên production (testuser, deep link `?alert=FAIL&projects=WM&type=SP-Lv34`): 2 request `/api/epic-alerts-15` chạy nối tiếp ~11s + ~10s, màn hình "nháy" giữa 2 lần.
  - Frontend (`src/app/epic-alerts-15/page.tsx`): bỏ request thứ 2 do effect mặc định Status (loại Cancelled) đổi `statusFilters` sau response đầu — tập "mọi status trừ Cancelled" giờ gửi như param rỗng (server hiểu giống hệt), nên không refetch; chờ khôi phục saved filters xong mới fetch lần đầu; hủy (AbortController) request cũ khi có request mới để response chậm không ghi đè và không tắt loading giữa chừng.
  - `src/lib/epic-alert-row-cache-service.ts`: `refreshEpicAlertRowCache` INSERT theo lô 200 dòng thay vì từng dòng. Nguyên nhân gốc: `epic_alert_row_cache` trên Supabase đang trống → API luôn rơi vào nhánh `mode: 'full'` tính lại toàn bộ (~10s, 500KB). Cần chạy lại "recompute-cache" trên production sau khi deploy.
  - `src/proxy.ts`: redirect về `/login?next=` giữ cả query string để deep link không mất filter sau khi đăng nhập.
- **Nâng cấp Quản trị Epic, TTM Dashboard & Tài liệu sản phẩm**:
  - **Mặc định lọc loại bỏ `Cancelled` trên Quản trị Epic (`/epic-alerts-15`)**:
    - [`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx): Cập nhật `hasAppliedDefaultStatusFilter` chỉ bỏ qua khi deep link có chỉ định rõ ràng `status` (`deepLinkFilters.status.length > 0`). Nếu truy cập trực tiếp hoặc từ các route màn hình khác (deep link không có `status`), bộ lọc Status tự động tích chọn (checked) tất cả các options ngoại trừ `Cancelled` (`!isCancelledStatus(status)`).
    - [`src/lib/epic-alert-row-cache-query-service.ts`](file:///d:/git/ttm-tool/src/lib/epic-alert-row-cache-query-service.ts): Trong `buildFilterClause`, khi không truyền `statuses` từ client, mặc định thêm điều kiện SQL `current_status !~* 'cancel'`.
  - **Mặc định mở rộng (expanded) Section 'Theo Phân loại Epic' trên TTM Dashboard** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - Khởi tạo `openSections.epicType = true` để khối biểu đồ Donut phân tích theo phân loại Epic luôn mở sẵn cho người dùng.
  - **Thiết lập mặc định vào TTM Dashboard sau khi đăng nhập** ([`src/app/login/page.tsx`](file:///d:/git/ttm-tool/src/app/login/page.tsx)):
    - Cập nhật hàm `safeNextPath` điều hướng người dùng tới `/dashboard-new` khi đăng nhập thành công (khi không có tham số `next` hoặc khi `next=/`).
  - **Bổ sung tab "Chờ golive" và thiết kế Switch Pills cho Danh sách Epic trong PM/SM View** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - Bổ sung tab 1: *1. Chờ golive* (`WAITING_GOLIVE`), lọc các Epic có `releaseAxisState === 'WAITING_GOLIVE'`. Thứ tự 3 tab: 1. Chờ golive, 2. Phân tích Pending, 3. Giám sát Dữ liệu bất thường R1-R6.
    - Chuyển đổi toàn bộ cụm điều hướng tab thành Card thống nhất, thiết kế bộ chuyển đổi tab (Switch Pills) bo góc trên CardHeader tương tự như bảng Ma trận Phân bổ Tiến độ Epic Đa chiều của Lead view để đồng bộ UI/UX.
  - **Cập nhật tài liệu sản phẩm và các markdown liên quan**:
    - [`public/docs/product-guide.html`](file:///d:/git/ttm-tool/public/docs/product-guide.html): Bổ sung tài liệu chi tiết về màn hình TTM Dashboard (mục 11.5) gồm 2 chế độ Lead view / PM/SM view, 2 widget chỉ số QLDA trên header, popup Quản trị Epic in-page, quy tắc loại bỏ Epic Cancelled ở tử/mẫu số; bổ sung quy tắc mặc định check bỏ Cancelled trong Quản trị Epic (mục 11.2); ghi chú ẩn Dashboard cũ (mục 11.4).
    - [`README.md`](file:///d:/git/ttm-tool/README.md), [`brd/04-homepage-and-epic-monitoring.md`](file:///d:/git/ttm-tool/brd/04-homepage-and-epic-monitoring.md), [`brd/13-epic-15-and-epic-30-management.md`](file:///d:/git/ttm-tool/brd/13-epic-15-and-epic-30-management.md): Cập nhật danh mục route và vai trò của TTM Dashboard là màn hình hạ cánh mặc định.


- **Loại bỏ các Epic có trạng thái `Cancelled` khỏi mọi tính toán trên màn hình TTM Dashboard (Lead view & PM/SM view)**:
  - [`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx):
    - Thêm điều kiện lọc `!isCancelledStatus(row.currentStatus || '')` vào `filteredRows` để loại trừ hoàn toàn các Epic có trạng thái Cancelled (không phân biệt chữ hoa/thường) ra khỏi tập dữ liệu phân tích của trang.
    - Nhờ đó, tất cả 9 KPI widget (TTM-Index PM, QA-Index PM, Tổng số Epic, Fail TTM-CNTT, Fail TTM-E2E, Cảnh báo sớm/muộn, Sai lệch Dữ liệu, Chờ golive, Giải trình golive), Phễu tiến độ 5 giai đoạn (`pipelinePhases`), Bảng Ma trận Phân bổ Tiến độ Epic Đa chiều (`dimensionMatrix`), toàn bộ 5 Section Biểu đồ Donut (3 biểu đồ mỗi section), và các tab vận hành Pending/Anomaly đều không tính Epic Cancelled ở cả tử số lẫn mẫu số.
    - Loại bỏ Epic Cancelled khỏi các danh sách lựa chọn bộ lọc (`projectOptions`, `domainOptions`, `pmSmOptions`) và ánh xạ dự án (`domainProjectKeys`) nhằm tránh các option rỗng.
    - Cập nhật `computeDimensionDonuts` kiểm tra thêm `isCancelledStatus` đảm bảo tuyệt đối không có Epic Cancelled nào được phân bổ vào các biểu đồ Donut.
    - Làm sạch điều kiện `isBacklogLike` trong `pipelinePhases`, không gom Epic Cancelled vào giai đoạn "1. To Do".
  - [`src/lib/ttm-cntt-qa.ts`](file:///d:/git/ttm-tool/src/lib/ttm-cntt-qa.ts):
    - Cập nhật hàm lõi `summarizeTtmCntt` tự động bỏ qua các dòng có `isCancelledStatus(row.currentStatus || '')`, không tính vào `eligible`, `pass`, `fail`, cũng như `total`. Đảm bảo mọi tính toán TTM-CNTT và QA-Index ở cả tử số và mẫu số đều loại bỏ triệt để Epic Cancelled.
  - [`src/lib/epic-alert-row-cache-query-service.ts`](file:///d:/git/ttm-tool/src/lib/epic-alert-row-cache-query-service.ts):
    - Thêm điều kiện `AND current_status !~* 'cancel'` vào truy vấn tổng hợp SQL `queryTtmQaIndexPm` để loại bỏ trạng thái Cancelled khỏi các chỉ số TTM/QA Index.


- **Ẩn menu item "Dashboard" trên menu bên trái (Left Sidebar)** ([`src/components/layout/AppShell.tsx`](file:///d:/git/ttm-tool/src/components/layout/AppShell.tsx)):
  - Ẩn mục điều hướng `Dashboard` (`/dashboard`) khỏi danh sách navigation ở thanh bên trái (sidebar), chỉ hiển thị `TTM dashboard` (`/dashboard-new`) cùng các màn hình Báo cáo và Quản trị Epic.

- **Nâng cấp TTM Dashboard: Cải tiến PM/SM View toàn diện và bổ sung 2 Widget TTM-Index/QA-Index (QLDA) trên Header**:
  - **Widget TTM-Index (QLDA) & QA-Index (QLDA) trên Header Banner** ([`src/app/api/dashboard-new/route.ts`](file:///d:/git/ttm-tool/src/app/api/dashboard-new/route.ts), [`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - Bổ sung 2 widget thống kê độc lập `TTM-Index (QLDA)` và `QA-Index (QLDA)` ngay bên trong hộp tiêu đề `'TIME TO MARKET DASHBOARD'`, bố trí ở bên trái nút bấm chọn `Lead | PM/SM view`.
    - Dữ liệu được đọc trực tiếp từ cache toàn phòng `ttm_index_global_cache` (không bị giới hạn bởi quyền của user), hiển thị tỷ lệ % và số lượng `(pass/eligible)`.
    - Hỗ trợ click để mở Popup Quản trị Epic lọc nhanh danh sách toàn bộ Epic hoặc các Epic hoàn thành của phòng.
  - **Tối ưu hóa và đồng bộ trải nghiệm cho PM/SM View (`OPERATIONAL`)** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - **Ẩn bộ lọc PM/SM**: Bỏ chọn lọc PM/SM trên thanh công cụ khi đang ở PM/SM View (chỉ hiển thị ở Lead View); dữ liệu tự động gắn chặt vào quyền hạn và bộ lọc của user đăng nhập.
    - **Đưa toàn bộ 9 KPI Widgets từ Lead View vào PM/SM View**: Hiển thị đầy đủ vòng đo TTM-Index (PM), QA-Index (PM), Tổng số Epic, Fail TTM-CNTT, Fail TTM-E2E, Cảnh báo sớm/muộn, Sai lệch dữ liệu, Chờ golive, Giải trình golive với số liệu được tính toán chuẩn xác theo phạm vi phân quyền và bộ lọc active của user.
    - **Tái thiết kế 5 Widget của "Phễu Tiến độ Epic theo Giai đoạn"**: Đồng bộ thiết kế 3 tầng (tiêu đề in hoa, số lượng lớn 20px, phụ đề trạng thái cảnh báo/đúng tiến độ) tương tự các KPI cards của Lead view; hỗ trợ click để mở modal Quản trị Epic theo từng giai đoạn.
    - **Bổ sung "Ma trận Phân bổ Tiến độ Epic Đa chiều" vào PM/SM View**: Hỗ trợ 2 tab *'Theo Phân loại Epic'* và *'Theo Dự án'* với đầy đủ tương tác mở modal Quản trị Epic theo từng ô số liệu.
    - **Bổ sung Section Biểu đồ Donut "Theo Phân loại Epic"**: Accordion lazy-loading chứa 3 biểu đồ Donut phân tích theo phân loại Epic (Tổng số Epic, Pass TTM-CNTT, Fail TTM).
    - **Tinh gọn danh sách Epic**: Bỏ tab số 1 (Tiến độ TTM & Danh sách Epic) do đã có tính năng mở modal Quản trị Epic chi tiết ngay tại chỗ; chỉ giữ lại 2 tab chuyên sâu: *'1. Phân tích Pending'* và *'2. Giám sát Dữ liệu bất thường R1-R6'*.
  - **Lọc nhiều PM/SM khi chuyển tiếp sang Quản trị Epic** ([`src/lib/epic-alerts-deep-link.ts`](file:///d:/git/ttm-tool/src/lib/epic-alerts-deep-link.ts), [`src/lib/epic-alert-row-cache-query-service.ts`](file:///d:/git/ttm-tool/src/lib/epic-alert-row-cache-query-service.ts), [`src/app/api/epic-alerts-15/route.ts`](file:///d:/git/ttm-tool/src/app/api/epic-alerts-15/route.ts), [`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx), [`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - Với các item biểu đồ/ma trận có nhiều hơn 1 PM/SM (ví dụ `'longnx1, tanlt4'`), hệ thống tự động tách chuỗi thành mảng danh sách PM/SM và truyền dạng danh sách qua URL param `pmSm=longnx1,tanlt4`.
    - Phía API `epic-alerts-15` và service truy vấn cache Postgres sử dụng toán tử mảng Postgres `owner_names && $N::text[]` để lấy ra toàn bộ các Epic thuộc về bất kỳ PM/SM nào trong danh sách.
    - Phía giao diện Quản trị Epic (`/epic-alerts-15`), nâng cấp thanh lọc PM/SM thành `ToolbarMultiSelect` hỗ trợ chọn đồng thời nhiều PM/SM và tự động nhận diện danh sách PM/SM từ deep link.
  - **Chuẩn hóa thông báo Toast và di chuyển thông báo thành công trên toàn bộ tính năng Quản trị** ([`src/components/ui/Toast.tsx`](file:///d:/git/ttm-tool/src/components/ui/Toast.tsx), [`src/app/admin/*`](file:///d:/git/ttm-tool/src/app/admin), [`src/components/*`](file:///d:/git/ttm-tool/src/components)):
    - Bổ sung tham số thời gian hiển thị `durationMs` trong `showToast` với mặc định là 3 giây (`3000ms`).
    - Rà soát toàn bộ các màn hình Quản trị hệ thống (`admin/users`, `admin/domains`, `admin/projects`, `admin/database`, `PermissionMatrixSettings`, `StatusAlertRulesSettings`, `HolidaysPanel`, `HolidaysAndWorkdaysSection`, `MakeupWorkdaysPanel`, `ApiKeysPanel`, `JiraConfigPanel`, `AdPopupsPanel`, `InfoBannersPanel`, `IssueTypeRolesPanel`, `McpServerPanel`, `PersonalAccessTokensPanel`, `RawImportRetentionSettings`, `RecomputeCachePanel`, `ComponentManagementTab`, `CompleteDataModal`): chuyển đổi toàn bộ thông báo kết quả thực hiện thành công sang dạng Toast với thời gian hiển thị 5 giây (`showToast(..., 5000)`). Các thông báo lỗi vẫn giữ nguyên ở dạng Alert/inline error.
  - **Bổ sung liên kết mở popup Quản trị Epic cho toàn bộ chỉ số trong Ma trận Phân bổ Tiến độ Đa chiều** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - Người dùng có thể click vào tên item/danh mục để mở popup xem toàn bộ Epic thuộc item đó.
    - Click vào thanh tiến độ và chỉ số % của TTM-CNTT QLDA hoặc TTM-CNTT QA để mở popup xem danh sách Epic tương ứng của mục được chọn.
  - **Đổi tên màn hình Dashboard New thành TTM dashboard**:
    - Cập nhật định danh màn hình trong `src/lib/app-screens.ts` (`title: 'TTM dashboard'`).
    - Cập nhật menu điều hướng trên thanh sidebar/header (`src/components/layout/AppShell.tsx`).
    - Tạo migration `20260926_rename_dashboard_new_to_ttm_dashboard.sql` cập nhật bảng `permission_features` trên các target database (`local`, `supabase`).
    - Cập nhật tiêu đề lớn thành `'TIME TO MARKET DASHBOARD'` và phụ đề phân quyền: `'Dashboard quản lý cho CBQL/Lead'` và `'Dashboard quản lý cho PM/SM'`.

- **Tinh gọn thanh công cụ bộ lọc (Filters toolbar) trên Dashboard New** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
  - Loại bỏ 5 ô filter cấp độ chi tiết khỏi thanh Filters toolbar trên màn hình Dashboard New: *Lọc Nhận xét*, *Loại Epic*, *Status*, *Đơn vị yêu cầu* và ô tìm kiếm *Tìm epic*.
  - Giữ lại các bộ lọc vĩ mô phục vụ phân cấp lãnh đạo/quản lý: *Domain* (dành cho Admin/Supervisor), *Dự án* (multi-select) và *PM/SM* (select), cùng nhãn *Filters:* và tem thời gian cập nhật dữ liệu.
  - Tinh gọn hàm tạo liên kết deep-link `toEpicAlertsLink`, loại bỏ các state và options thừa (`statusOptions`, `requestingUnitOptions`, `EPIC_COMPLEXITY_TYPES`, `filterAlert`, `filterType`, `filterStatuses`, `filterRequestingUnit`, `searchQuery`), giữ nguyên khả năng nhận tham số ngữ cảnh khi người dùng click vào KPI Cards, Ma trận Đa chiều hay Biểu đồ Donut để mở Modal Quản trị Epic.

- **Triển khai tính năng In-Page Popup Modal Quản trị Epic trong Dashboard New**:
  - **Chế độ hiển thị nhúng `embedded=true`** ([`src/components/layout/AppShell.tsx`](file:///d:/git/ttm-tool/src/components/layout/AppShell.tsx), [`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx)):
    - Khi nhận cờ `embedded=true` qua URL query, `AppShell` tự động ẩn Header điều hướng, Sidebar, Footer hệ thống và banner để màn hình bên trong iframe được tối ưu không gian hiển thị toàn màn hình.
    - Màn hình Quản trị Epic ẩn khối `EpicStatWidgets` tổng phía trên để đưa Toolbar bộ lọc và Bảng dữ liệu lên ngay đầu trang.
  - **Component EpicAlertsIframeModal** ([`src/components/dashboard-new/EpicAlertsIframeModal.tsx`](file:///d:/git/ttm-tool/src/components/dashboard-new/EpicAlertsIframeModal.tsx)):
    - Xây dựng Modal kích thước lớn (`96vw x 92vh`) nhúng iframe trỏ đến URL route deep-link của Quản trị Epic kèm cờ `embedded=true`.
    - Hỗ trợ tiêu đề ngữ cảnh động, nút *Mở tab mới* (`ArrowSquareOut`) để mở trang độc lập, nút đóng (`X`), phím `Esc`, khóa cuộn trang nền và spinner tải mượt mà.
  - **Tích hợp điểm mở Modal trên Dashboard New** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx), [`src/components/dashboard-new/DonutChartCard.tsx`](file:///d:/git/ttm-tool/src/components/dashboard-new/DonutChartCard.tsx)):
    - **Cụm KPI Cards**: Click các thẻ *Tổng số Epic, Fail TTM-CNTT, Fail TTM-E2E, Cảnh báo sớm/muộn, Sai lệch dữ liệu, Chờ golive, Giải trình golive* để mở popup lọc danh sách Epic tương ứng.
    - **Ma trận Phân bổ Tiến độ Đa chiều**: Click vào các số liệu ở cột *Tổng số Epic, Pass TTM, Fail TTM, Đúng tiến độ, Chậm tiến độ* của từng dòng (Domain, PM/SM, Dự án, Loại Epic) để mở popup kết hợp bộ lọc dòng + cột.
    - **5 Section Biểu đồ Donut**: Bổ sung prop `onItemClick` trên `DonutChartCard`, cho phép click vào từng lát cắt hoặc dòng số liệu của 5 section (Đơn vị yêu cầu, Domain, PM/SM, Loại hình, Dự án) để mở popup duyệt danh sách Epic tương ứng.


- **Triệt tiêu hiện tượng rung giật (layout shift) và tinh chỉnh tương tác Biểu đồ Donut**:
  - **Giữ nguyên 100% độ rõ (không làm mờ các item khác)** ([`src/components/dashboard-new/DonutChartCard.tsx`](file:///d:/git/ttm-tool/src/components/dashboard-new/DonutChartCard.tsx)):
    - Loại bỏ hoàn toàn cơ chế làm mờ `opacity: 0.4` của các lát cắt Donut và `opacity-35` của các dòng trong bảng chú giải. Mọi lát cắt và mục dữ liệu luôn hiển thị rõ ràng, chỉ làm nổi bật duy nhất lát cắt/mục được chọn.
  - **Triệt tiêu hoàn toàn hiện tượng rung giật/rung lắc khi hover**:
    - Cố định chiều cao tuyệt đối của từng dòng bảng chú giải (`h-8 flex items-center`) và áp dụng `tabular-nums` cho số lượng và tỷ lệ %, tránh co giãn kích thước bảng khi hover.
    - Cố định cỡ chữ `text-xs` xuyên suốt (không tăng lên `text-sm` khi hover) và cố định kích thước chấm màu `size-2.5` (không dùng `scale-110`).
    - Cố định kích thước khu vực biểu đồ SVG `h-44` và tiêu đề `h-5`, loại bỏ thuộc tính `justify-between` gây biến động khoảng cách khi nội dung co giãn.
    - Loại bỏ hiệu ứng trễ chuyển vị trí `transition-all duration-75` ở tooltip nổi và bỏ filter `drop-shadow` nặng của SVG, giúp biểu đồ mượt mà và không bị giật khung hình.


- **Nâng cấp tương tác biểu đồ Donut: Hover Tooltip % và Highlight hai chiều**:
  - **Tương tác biểu đồ Donut** ([`src/components/dashboard-new/DonutChartCard.tsx`](file:///d:/git/ttm-tool/src/components/dashboard-new/DonutChartCard.tsx)):
    - Khi di chuột vào từng lát cắt của biểu đồ Donut: hiển thị hover tooltip nổi theo con trỏ chuột gồm tên danh mục, số lượng Epic và tỷ lệ `%` nổi bật màu vàng hổ phách. Đồng thời tâm vòng tròn donut chuyển sang hiển thị số `%` và tên danh mục đang hover.
    - Lát cắt đang hover được phóng to nét vẽ (`strokeWidth + 4`) kèm hiệu ứng đổ bóng (`drop-shadow`), các lát cắt còn lại làm mờ nhẹ (`opacity: 0.4`).
    - Dòng tương ứng trong bảng chú giải/số liệu phía dưới được tự động **highlight nổi bật** (`bg-blue-50 ring-1 ring-blue-300`, chữ in đậm màu xanh).
    - Hỗ trợ tương tác hai chiều: khi rê chuột vào từng dòng của bảng chú giải phía dưới, lát cắt tương ứng trên biểu đồ Donut cũng tự động highlight đồng bộ.


- **Triển khai cải tiến toàn diện Dashboard New (User Selector phân cấp, Lazy Loading & 5 Section Biểu đồ Donut)**:
  - **Phân cấp User Switcher** ([`src/app/api/dashboard-new/route.ts`](file:///d:/git/ttm-tool/src/app/api/dashboard-new/route.ts)):
    - Áp dụng thang cấp bậc phân quyền `ROLE_RANK` (`SUPERADMIN` > `SUPERVISOR` > `ADMIN` > `USER`).
    - Lọc danh sách `managedUsers` và kiểm tra bảo vệ `viewAsUserId` để user chỉ được xem góc nhìn của các tài khoản có role bằng hoặc thấp hơn role của mình.
  - **Component DonutChartCard chuẩn thiết kế** ([`src/components/dashboard-new/DonutChartCard.tsx`](file:///d:/git/ttm-tool/src/components/dashboard-new/DonutChartCard.tsx)):
    - Xây dựng component vẽ SVG Donut Chart card chuẩn Figma: hiển thị số tổng và nhãn `Epic` tại tâm biểu đồ, bảng chú giải legend (chấm màu, tên danh mục, số lượng, tỷ lệ %).
    - Giới hạn tối đa 5 lát cắt (Top 4 danh mục lớn nhất + tự động gộp các danh mục còn lại vào lát cắt thứ 5 có tên `"Khác.."`).
  - **Cơ chế Lazy Loading & 5 Section phân tích LEAD** ([`src/app/dashboard-new/page.tsx`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx)):
    - Khi vào trang, hiển thị ngay cụm KPI widgets và bảng *Ma trận Phân bổ Tiến độ Epic Đa chiều*.
    - Thiết kế 5 section accordion bên dưới dạng lazy loading: chỉ tính toán và render 3 biểu đồ Donut (`% Tổng số Epic`, `% Epic Pass TTM-CNTT (pm)`, `% Epic Fail TTM (pm)`) khi người dùng bấm mở section tương ứng.
    - Tiêu đề section đồng bộ icon `CaretRight`/`CaretDown` và font chữ `text-xs font-bold text-black` với section *"Bộ lọc nâng cao..."*, các section cách nhau bởi đường kẻ ngang `border-t border-slate-300`.
    - Áp dụng các điều kiện hiển thị thông minh: Section *Theo Domain nghiệp vụ* tự ẩn nếu user chỉ có 1 domain; Section *Theo PM/SM* tự ẩn nếu user có role `USER`; Section *Theo Dự án* tự ẩn nếu user có role `USER` và chỉ có 1 dự án.


- **Bổ sung title `Filters:` ở thanh bộ lọc toolbar và đồng bộ tuyệt đối font style/size**:
  - **Title `Filters:` ở toolbar bộ lọc** ([`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx), [`src/app/epic-in-po/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-in-po/page.tsx), [`src/app/epic-alerts/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts/page.tsx)):
    - Bổ sung label title `Filters:` ở đầu hàng toolbar các dropdown filter với icon [`CaretRight`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx) (`text-[#1463f7]`) và kiểu chữ in đậm đồng nhất (`text-xs font-bold text-black`).
  - **Đồng bộ Typography giữa Filters, Quick filters và Bộ lọc nâng cao**:
    - Chuẩn hóa cả 3 tiêu đề nhóm (`Filters:`, `Quick filters:`, `Bộ lọc nâng cao...`) dùng chung chuẩn kích thước (`text-xs`), độ đậm (`font-bold`), màu chữ (`text-black`), icon `CaretRight` màu xanh (`#1463f7`, weight `bold`) và khoảng cách (`gap-1.5`).


- **Đồng bộ Typography và ép thẳng hàng 1 dòng duy nhất cho cụm Quick Filters**:
  - **Sửa font style và font size của title Quick filters** ([`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx)):
    - Chuyển `Quick filters:` về chuẩn `text-xs text-black` đồng nhất hoàn toàn về font-size và font-style với chữ *"Bộ lọc nâng cao..."*.
  - **Bố trí tất cả các nút Quick Filters trên cùng một hàng ngang duy nhất** ([`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx)):
    - Khắc phục triệt để việc component `<Tooltip>` mặc định có `w-full` làm cho các nút bị ngắt dòng rơi xuống nhiều hàng dọc bằng cách gắn `className="inline-flex w-auto shrink-0"` cho tất cả các tooltip trong thanh Quick Filters và nút hành động.
    - Cố định container với `flex items-center gap-2 shrink-0 flex-nowrap` kết hợp `whitespace-nowrap`, đảm bảo title `Quick filters:`, các nút quick filter (`Pending Epics`, `Epics in PO`, `not Epics in PO`) và các icon Lưu/Reset luôn nằm thẳng hàng trên 1 hàng duy nhất.


- **Chuẩn hóa giao diện Quick Filters theo section "Bộ lọc nâng cao..." & đổi màu chữ Toast sang White**:
  - **Giao diện Quick Filters** ([`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx)):
    - Chuẩn hóa title của hàng Quick Filters với icon mũi tên xanh [`CaretRight`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx) (`text-[#1463f7]`) và font chữ đậm (`text-xs font-bold text-black`), đồng bộ hoàn toàn với font-style của mục *"Bộ lọc nâng cao..."*.
    - Bố trí title `Quick filters:`, các nút quick filter (`Pending Epics`, `Epics in PO`, `not Epics in PO`) và các nút chức năng (Lưu/Đặt lại filter) cùng nằm gọn gàng trên **1 hàng duy nhất**.
    - Bổ sung đường kẻ ngang phân cách (`border-t border-slate-300 pt-3 mb-3`) phía trên thanh Quick Filters và phía dưới cụm 6 Stat Widgets (`border-b border-slate-300 pb-3 mb-3`) tương đồng với đường kẻ ngang tại section *"Bộ lọc nâng cao..."*.
  - **Toast message** ([`src/components/ui/Toast.tsx`](file:///d:/git/ttm-tool/src/components/ui/Toast.tsx)):
    - Chuyển màu chữ hiển thị (`font-color`) của Toast message từ vàng nhạt sang màu **trắng (`#ffffff`, `text-white`)** để độ tương phản cao, rõ ràng và dễ đọc trên nền đen mờ 40%.


- **Triển khai hệ thống Toast message, bổ sung Quick Filter `not Epics in PO` và màn hình `Epic in PO` vào Ma trận phân quyền**:
  - **Hệ thống Toast message** ([`src/components/ui/Toast.tsx`](file:///d:/git/ttm-tool/src/components/ui/Toast.tsx), [`src/components/layout/AppShell.tsx`](file:///d:/git/ttm-tool/src/components/layout/AppShell.tsx)):
    - Xây dựng component `ToastProvider`, hook `useToast` và hàm phát thông báo `showToast(message, durationMs = 2000)` dùng chung toàn ứng dụng.
    - Định dạng Toast đúng chuẩn: nền màu đen với độ trong suốt 40% (`rgba(0, 0, 0, 0.4)` kèm backdrop-blur), bo tròn mềm mại (`rounded-full`), tự co giãn theo độ dài nội dung, chữ in đậm (`font-bold`), màu vàng nhạt (`light yellow`, `#fef08a`), tự động biến mất sau đúng 2s.
    - Áp dụng Toast message cho các thao tác Lưu trạng thái filter (`"Đã lưu trạng thái filter"`) và Đặt lại bộ lọc (`"Đã đặt lại bộ lọc mặc định"`), loại bỏ hoàn toàn text thông báo cũ bên cạnh nút.
  - **Nâng cấp thanh Quick Filters** ([`src/app/epic-alerts-15/page.tsx`](file:///d:/git/ttm-tool/src/app/epic-alerts-15/page.tsx)):
    - Đổi tên quick filter `Epic in PO` thành **`Epics in PO`**.
    - Bổ sung quick filter mới **`not Epics in PO`** (`Sparkle` icon): lọc toàn bộ các Epic ở tất cả các trạng thái ngoại trừ nhóm `Cancelled`, `To Do`, `In PO`, `Released`.
    - Bổ sung hover `Tooltip` hiển thị chi tiết rule lọc cho từng nút Quick Filter (Pending Epics, Epics in PO, not Epics in PO).
  - **Ma trận phân quyền (Permission Matrix)** (`db/migrations/20260926_add_epic_in_po_permission.sql`):
    - Tạo migration bổ sung feature `epic_in_po` (màn hình "Epic in PO", nhóm `VIEW_ONLY`, `display_order = 105`) vào bảng `permission_features` và phân quyền mặc định cho các role trong `role_feature_permissions`.
    - Đã chạy migration thành công trên các cơ sở dữ liệu (local & hosted Supabase).


- **Khắc phục lỗi React Hydration Mismatch & chuyển nút Lưu/Đặt lại bộ lọc sang dạng icon-only** (`src/app/epic-alerts-15/page.tsx`):
  - **Khắc phục lỗi Hydration**: Do cấu hình bộ lọc đã lưu được đọc từ `localStorage` ngay trong bước khởi tạo state đồng bộ khiến HTML phía Server (SSR không có `localStorage`) lệch với Client (`has-filter` xuất hiện sớm), gây ra lỗi *Hydration failed because the server rendered text didn't match the client*. Đã chuyển việc đọc và nạp cấu hình bộ lọc từ `localStorage` vào `useEffect` sau khi mount xong phía client, đảm bảo SSR và Client đồng nhất hoàn toàn khi render ban đầu.
  - **Nút icon-only**: Chuyển nút **Lưu trạng thái filter** (`FloppyDisk`) và nút **Đặt lại bộ lọc mặc định** (`ArrowCounterClockwise`) sang định dạng chỉ hiển thị icon gọn gàng (không kèm text), giữ nguyên hover tooltip đầy đủ và hiệu ứng bấm.


- **Bổ sung Quick Filters, Lưu trạng thái Filter và đưa 6 Stat Widgets lên đầu trang "Quản trị Epic"** (`src/app/epic-alerts-15/page.tsx`):
  - **Quick Filters**:
    - Thêm thanh Quick Filters với giao diện pill riêng biệt, nổi bật đặt ngay phía trên "Bộ lọc nâng cao".
    - Tích hợp 2 quick filter ban đầu:
      - `Pending Epics`: Lọc nhanh danh sách Epic có status chứa 'Pending'.
      - `Epic in PO`: Lọc nhanh danh sách Epic có status thuộc nhóm 'To Do', 'In PO', 'Released'.
    - Hỗ trợ click bật/tắt (toggle) nhịp nhàng, tự động đồng bộ trạng thái khi người dùng tùy chỉnh thủ công danh sách status ở dropdown.
    - Tuân thủ đầy đủ phạm vi phân quyền người dùng và các bộ lọc dự án/domain hiện thời.
  - **Lưu & Đặt lại trạng thái bộ lọc (Local Storage)**:
    - Bổ sung nút **Lưu bộ lọc** (`FloppyDisk` icon) và **Đặt lại** (`ArrowCounterClockwise` icon) ở cùng hàng Quick Filters (căn phải).
    - Lưu toàn bộ cấu hình bộ lọc đang chọn vào `localStorage` (`ttm_epic_alerts_15_saved_filters`). Khi truy cập lại màn hình qua menu chính (không có deep link), hệ thống tự động khôi phục cấu hình cá nhân đã lưu. Nếu truy cập qua deep link từ Dashboard/báo cáo, deep link được ưu tiên xử lý.
    - Nút Đặt lại đưa toàn bộ bộ lọc về giá trị mặc định ban đầu và xóa lưu trữ tạm.
  - **Đưa 6 Stat Widgets lên vị trí trên cùng**:
    - Di chuyển component [`EpicStatWidgets`](file:///d:/git/ttm-tool/src/components/epic-alerts/EpicStatWidgets.tsx) lên đầu trang (ngay dưới banner thông báo và trên thanh toolbar bộ lọc chính) giúp người dùng nắm bắt nhanh ngay các chỉ số cảnh báo tổng quan (Epic Fail TTM-CNTT, Fail TTM-E2E, Cảnh báo muộn, Sai lệch dữ liệu, Pending, To Do).


- **Đồng bộ hóa & dùng chung component bộ lọc cho màn hình Dashboard New** (`src/app/dashboard-new/page.tsx`):
  - Chuyển đổi toàn bộ thanh bộ lọc riêng lẻ trên `Dashboard New` sang sử dụng chung chuẩn component và styling của màn hình **Quản trị Epic** (`.ttm-toolbar`, `.ttm-select`, `.ttm-field.ttm-search-field`, `.has-filter`, `.ttm-report-date`).
  - Dùng chung component [`ToolbarMultiSelect`](file:///d:/git/ttm-tool/src/components/ui/ToolbarMultiSelect.tsx) cho bộ lọc **Dự án** (hỗ trợ chọn nhiều dự án) và **Status** (chọn nhiều trạng thái).
  - Bổ sung đầy đủ các dropdown lọc chuẩn theo màn Quản trị Epic: **Domain**, **Dự án**, **PM/SM**, **Lọc Nhận xét (Cảnh báo)**, **Loại Epic** (`EPIC_COMPLEXITY_TYPES`), **Status**, **Đơn vị yêu cầu** và ô **Tìm kiếm**.
  - Liên kết tương tác Domain → Dự án: Khi chọn một Domain, hệ thống tự động lọc danh sách các dự án thuộc Domain đó tương tự như Quản trị Epic.
  - Cập nhật hàm điều hướng deep link [`toEpicAlertsLink`](file:///d:/git/ttm-tool/src/app/dashboard-new/page.tsx) để truyền đầy đủ các tham số lọc đa dạng sang `/epic-alerts-15`.


- **Nâng cấp Tooltip thông minh & sửa hover tooltip ở 4 widget chỉ số đầu trang "Quản trị Epic"** (`src/components/ui/Tooltip.tsx`, `src/components/layout/AppShell.tsx`):
  - Tái cấu trúc component `Tooltip` với thuật toán nhận diện và định vị va chạm 4 chiều linh hoạt (`top`, `bottom`, `left`, `right`, `auto`), có hỗ trợ `align` (`start`, `center`, `end`).
  - Tooltip tự động tính toán khoảng trống khả dụng của viewport (trên/dưới/trái/phải) để chọn hướng hiển thị tối ưu nhất, đảm bảo:
    - **Không vượt ra ngoài khung cửa sổ**: Tự động clamp toạ độ theo `VIEWPORT_MARGIN = 8px`.
    - **Không che lấp đối tượng hover**: Đảm bảo toạ độ tooltip luôn cách mép trigger và không đè lên phần tử kích hoạt.
  - Cập nhật 4 widget chỉ số ở sticky header (`TTM-Index (QLDA)`, `TTM-Index (PM)`, `QA-Index (QLDA)`, `QA-Index (PM)`) sang `side="bottom"` và `align="end"` kèm hiệu ứng hover/cursor rõ ràng. Tooltip mở xuống phía dưới thanh header, hoàn toàn thông thoáng và không bị che khuất các widget lân cận.


- **TTM-E2E: chuyển field "ngày kết thúc" (R4G Date) từ hard-code sang đọc theo cấu hình ở màn
  "Tiêu chí Time to Market"** (`src/lib/epic-alert-service.ts`, `resolveTtmE2eRelease`):
  - Xác nhận đúng nghi ngờ của người dùng: rule đổi ngày 24/9 (TTM-E2E kết thúc = R4G Date thay vì
    Due Date) được hard-code thẳng trong `resolveTtmE2eRelease` (đọc cứng `row.r4gDate`), trong khi
    bảng `ttm_policy_configs` (nguồn dữ liệu của màn "Tiêu chí Time to Market") đã có sẵn cột
    `to_ttm_field` đúng mục đích này nhưng lại đứng yên, không được đọc bởi hàm này.
  - Thêm `resolveTtmE2eEndDateField(row, toTtmField)`: đọc `to_ttm_field` của policy (TTM_E2E theo
    từng loại Epic) — giá trị `DUE_DATE` → dùng Due Date, mọi giá trị khác (kể cả `R4G_DATE`, mặc
    định) → dùng R4G Date như hiện tại. `resolveTtmE2eRelease` nhận thêm tham số `toTtmField`; 3 nơi
    gọi hàm này (`epic-alert-service.ts`, `import-service.ts`, `reports-service.ts`) đều đã cập nhật
    truyền `findActiveTtmPolicy(ttmPolicies, 'TTM_E2E', complexity)?.toTtmField ?? 'R4G_DATE'`.
  - **Quan trọng — đã sửa dữ liệu cũ**: 4 dòng policy `TTM_E2E` (theo từng loại Epic) trong DB vẫn
    còn lưu `to_ttm_field='DUE_DATE'` từ TRƯỚC lần đổi rule 24/9 (khi đó cột này chỉ là nhãn hiển thị,
    chưa ảnh hưởng tính toán) — nếu wire code xong mà không sửa dữ liệu này, hành vi sẽ ÂM THẦM quay
    lại tính theo Due Date ngay khi deploy. Đã UPDATE trực tiếp `to_ttm_field='R4G_DATE'` cho cả 4
    dòng trên **local và Supabase** (Aiven không kết nối được, như đã biết) để giữ đúng hành vi hiện
    tại trước khi đổi code.
  - Đã kiểm chứng qua API thật: chạy `POST recompute-cache`, xác nhận 1 Epic có R4G Date và Due Date
    khác nhau (`API-166616`) cho `ttmE2eActualToDate` = R4G Date; đổi thử `to_ttm_field='DUE_DATE'`
    qua DB, recompute lại, xác nhận giá trị chuyển đúng sang Due Date; sau đó phục hồi lại
    `R4G_DATE` và recompute lần cuối. Từ nay có thể đổi rule này trực tiếp ở màn "Tiêu chí Time to
    Market" (sửa "To TTM Field" của dòng TTM-E2E tương ứng), không cần sửa code nữa — chỉ cần bấm
    "Tổng hợp lại ngay" ở "Quản trị nguồn dữ liệu" sau khi đổi để áp dụng ngay, không cần đợi import.

- **Thêm nút "Tổng hợp lại dữ liệu cache" (SUPERADMIN-only) ở "Quản trị nguồn dữ liệu"**: cho phép
  chủ động chạy lại 2 cache tổng hợp hiện có (`ttm_index_global_cache`, `epic_alert_row_cache` —
  vốn chỉ tự refresh sau mỗi đợt import CSV, xem `import-service.ts`) mà không cần đợi đợt import
  mới. Hữu ích khi sửa dữ liệu trực tiếp trong DB, mới restore dữ liệu, hoặc nghi ngờ lần refresh
  tự động lúc import trước bị lỗi (2 hàm refresh này thiết kế "never throw" nên lỗi có thể bị nuốt
  âm thầm).
  - Route mới `POST /api/admin/data-source/recompute-cache` — gọi lại đúng `refreshTtmIndexGlobal
    Cache` + `refreshEpicAlertRowCache` (không viết logic tính mới), lấy kèm `sourceImportBatchId`
    từ đợt import mới nhất để gắn nhãn cache theo đúng lô dữ liệu hiện có.
  - UI mới `RecomputeCachePanel` (component), thêm vào `ImportIssuesTab` cạnh các panel quản trị
    khác (Lưu trữ dữ liệu import, Xóa N lớp dữ liệu gần nhất).
  - `epic_alert_row_cache` tính 1 lần, không phân theo role — 1 lần bấm phục vụ TTM-Index(PM)/QA-
    Index(PM) và "Quản trị Epic"/"Epic in PO" cho **cả 4 role** cùng lúc (SUPERADMIN/SUPERVISOR/
    ADMIN/USER), không cần chạy riêng từng role.
  - Đã kiểm chứng qua API thật (curl với session SUPERADMIN thật): chạy thành công trong ~3.4s cho
    992 Epic, đúng `sourceImportBatchId`; request không có session → 401 đúng như thiết kế. Đã bấm
    thử trên UI, xác nhận dialog xác nhận + gọi API đúng nội dung.
  - **Chưa làm** (đã thảo luận, cố tình để ngoài phạm vi lần này do rủi ro cao hơn — xem thảo luận
    trong hội thoại): chuyển Dashboard New/Dashboard cũ (`dashboard-service.ts`) sang đọc từ
    `epic_alert_row_cache` — 2 màn này hiện vẫn luôn tính sống mỗi request qua
    `getEpicAlertRowsPhased`, nút tổng hợp mới KHÔNG làm chúng nhanh hơn. Cũng chưa đổi ngữ nghĩa
    TTM-Index(PM)/QA-Index(PM) cho SUPERADMIN/SUPERVISOR/ADMIN theo hướng đã chốt trong thảo luận
    (tính theo grant PM/SM cá nhân thực tế thay vì theo phạm vi quyền xem) — vẫn giữ hành vi cũ.

- **Sửa lỗi `duplicate key value violates unique constraint "idx_epic_alert_timeline_open_run"` khi
  import file "Export theo lớp dữ liệu"** (`src/lib/db-backup-service.ts`, `importSqlFile`):
  - Nguyên nhân: `epic_alert_timeline` có 2 ràng buộc unique — primary key `id`, và partial unique
    index `idx_epic_alert_timeline_open_run (epic_key, alert_type) WHERE end_date IS NULL` (chỉ 1
    "run" đang mở cho mỗi epic/loại cảnh báo). File export chỉ nhúng sẵn `ON CONFLICT ("id") DO
    UPDATE` (Postgres chỉ cho khai báo 1 arbiter mỗi câu INSERT) — khi import dữ liệu từ một DB khác
    (production) có `id` độc lập, DB đích (local, đã tự chạy import/transition riêng bao lâu nay)
    thường đã có sẵn 1 run đang mở khác `id` cho cùng epic/loại cảnh báo đó → INSERT không đụng
    unique(id) nên không được ON CONFLICT xử lý, nhưng lại đụng unique index kia → crash.
  - Sửa bằng cách thêm 1 bước `DELETE` trước mỗi lô INSERT của riêng bảng `epic_alert_timeline`:
    xoá run đang mở ở local trùng (epic_key, alert_type) với run đang mở trong lô sắp import, để
    INSERT ngay sau đó luôn chạy sạch (ghi đè bằng dữ liệu từ file, đúng tinh thần "import = đồng bộ
    theo file" giống các cột khác đã làm qua ON CONFLICT DO UPDATE).
  - Đã kiểm chứng trực tiếp bằng test mô phỏng đúng kịch bản báo lỗi (rollback-wrapped, không đụng
    dữ liệu thật): tạo sẵn 1 run mở ở local, import 1 run mở khác `id` cho cùng epic/loại cảnh báo —
    trước khi sửa sẽ crash đúng như lỗi người dùng báo; sau khi sửa, run cũ bị xoá và run mới từ file
    được insert sạch, không còn lỗi.
  - Cũng cần lưu ý (đã trao đổi với người dùng, không phải sửa code): lỗi `invalid input syntax for
    type json` báo trước đó là do file export được sinh ra từ **production** — nơi chưa có bản fix
    `formatSqlValue` (đã có sẵn ở local) — nên deploy fix đó lên production là điều kiện cần để các
    lần export/import sau này không còn lỗi JSON nữa.

- **Rà soát tác động của thay đổi pagination hôm nay lên "Epic in PO", "Báo cáo Epic", "Dashboard
  New" — phát hiện và sửa 1 lỗi thật (Epic in PO), 2 màn còn lại không bị ảnh hưởng**:
  - **Lỗi phát hiện (đã sửa)**: `src/app/epic-in-po/page.tsx` gọi chung `/api/epic-alerts-15` rồi tự
    lọc client-side xuống 3 status TO DO/IN PO/RELEASED — từ khi API đó chuyển sang trả về `mode:
    'paged'` (đã tải sẵn phân trang, tối đa `pageSize` dòng thay vì toàn bộ), Epic in PO chỉ còn
    nhận đúng 1 trang (tối đa 20 dòng) của TOÀN BỘ phạm vi quyền rồi mới lọc còn lại — gần như trống
    dữ liệu ở đa số trường hợp. Sửa bằng cách cho Epic in PO tự gửi `statuses=<các biến thể "To
    Do"/"IN PO"/"Released" thật trong dữ liệu>` cùng `page`/`pageSize` riêng của nó tới API (giống
    hệt cách epic-alerts-15/page.tsx đã làm) — giờ Epic in PO cũng được hưởng lợi ích phân trang
    server-side y hệt Quản trị Epic thay vì tải hết. Đã kiểm chứng qua API thật: 487 Epic In PO
    đúng, thay vì bị cắt còn ≤20.
  - **Lỗi phụ đi kèm (đã sửa luôn)**: dòng "Hiển thị X–Y / Z Epic" ở cả `epic-alerts-15/page.tsx`
    và `epic-in-po/page.tsx` dùng `filteredRows.length` làm tổng số — đúng ở chế độ cũ (client giữ
    hết rows) nhưng sai ở `mode:'paged'` (chỉ còn 1 trang trong `filteredRows`), hiển thị tổng sai
    (ví dụ "20" thay vì "487"). Sửa dùng `data.totalCount` khi `mode==='paged'`.
  - **Báo cáo Epic (`/reports`)**: hoàn toàn độc lập — `reports-service.ts` tự chạy SQL riêng trên
    `issues`, không gọi `getEpicAlertRowsPhased`/đọc `epic_alert_row_cache`. Không có rủi ro, không
    có lợi ích gì từ cache mới.
  - **Dashboard New (`/dashboard-new`, kể cả `/dashboard` cũ qua `dashboard-service.ts`)**: KHÔNG
    dùng cache mới — API (`api/dashboard-new/route.ts`, `api/dashboard/route.ts`) vẫn gọi
    `getEpicAlertRowsPhased` sống mỗi request như trước giờ (chỉ có 2 badge "(QLDA)" là đã cache từ
    trước qua `ttm_index_global_cache`, không đổi). Không bị hỏng bởi thay đổi hôm nay, nhưng vẫn
    còn nguyên rủi ro performance ở quy mô lớn mà người dùng từng nêu ban đầu — CHƯA làm, để ngỏ nếu
    người dùng muốn áp dụng cùng pattern cache cho 2 màn hình dashboard sau này.

- **"Quản trị Epic" (`/epic-alerts-15`): chuyển sang server-side pagination + filter thật sự, thay
  vì tải hết rồi cắt trang ở client** — theo yêu cầu thảo luận trước của người dùng về rủi ro
  performance khi scale lên ~20.000 epic / ~500 người dùng đồng thời:
  - Phát hiện quan trọng trước khi làm: `alertLevel`/`hasDataAnomaly`/`releaseAxisState`/5 phase
    cell... đều được TÍNH TRONG JS mỗi request (dựa lịch ngày làm việc/ngày lễ + trạng thái
    story/subtask sống), không phải cột SQL — nên "server-side filter" thật sự đòi hỏi tính toán
    trước rồi cache lại, không thể chỉ thêm `WHERE`/`LIMIT` vào câu SQL gốc.
  - Bảng mới `epic_alert_row_cache` (migration `20260925_create_epic_alert_row_cache.sql` +
    `20260925_epic_alert_row_cache_sort_ranks.sql`, đã áp dụng `local`+`supabase`, `aiven` vẫn
    không kết nối được): lưu sẵn toàn bộ row đã tính (kiểu `EpicAlertRowPhased`, dạng JSONB) +
    vài cột phẳng để lọc/sort nhanh (`project_key`, `current_status`, `alert_level`,
    `has_data_anomaly`, `owner_names`, `components`, và 2 cột rank `alert_rank`/
    `bottom_status_rank` dùng cho `ORDER BY`).
  - `src/lib/epic-alert-row-cache-service.ts` (`refreshEpicAlertRowCache`): tính lại toàn bộ bảng
    này 1 lần ngay sau mỗi lần import CSV commit thành công (giống cơ chế
    `refreshTtmIndexGlobalCache` có sẵn), gọi trong `import-service.ts` — không tính lại mỗi lần
    xem màn hình nữa.
  - `src/lib/epic-alert-row-cache-query-service.ts`: đọc/lọc/sort/phân trang bằng SQL thường
    (`WHERE`/`ORDER BY`/`LIMIT`/`OFFSET`) trên bảng cache, cộng thêm 2 aggregate query cho
    statCounts (thay vì tính trên toàn bộ rows đã lọc phía client) và TTM-Index(PM)/QA-Index(PM).
  - `src/app/api/epic-alerts-15/route.ts`: chỉ dùng cache khi KHÔNG có "lớp dữ liệu cũ hơn" hay bộ
    lọc ngày nâng cao đang bật (những filter đó đổi tập Epic ngay từ SQL gốc, cache không đại diện
    được) — các trường hợp đó vẫn rơi về đường tính live như cũ, không đổi hành vi.
  - `src/app/epic-alerts-15/page.tsx`: khi API trả `mode:'paged'`, bỏ hẳn việc client tự
    filter/sort/cắt trang/tính statCounts — dùng thẳng dữ liệu server trả về; mỗi lần đổi filter
    (có debounce 400ms cho ô tìm kiếm) hoặc đổi trang đều gọi lại API thay vì tính lại trong bộ
    nhớ trình duyệt. Khi rơi về đường live (`mode:'full'`) thì giữ nguyên pipeline client-side cũ.
  - `src/lib/epic-alert-sort-rules.ts` (mới): gom `ALERT_RANK`/`BOTTOM_STATUS_RANK` dùng chung giữa
    client và cache-write service, tránh lệch logic giữa 2 nơi.
  - Đã kiểm thử trực tiếp qua API (`fetch` trong console trình duyệt, không qua UI): xác nhận thứ
    tự sort đúng In PO → To Do → Released, statCounts/TTM-Index(PM)/QA-Index(PM)/filterOptions
    (dropdown Dự án/PM-SM/Status/Đơn vị yêu cầu) đều tính đúng trên toàn bộ phạm vi quyền chứ không
    chỉ trang hiện tại, và phân trang/tìm kiếm gọi đúng API với query param tương ứng.

## 2026-09-25

- **Bổ sung màn hình "Dashboard" (`/dashboard`) vào Ma trận phân quyền + đổi default/sort Status
  filter ở "Quản trị Epic"**:
  - Migration `db/migrations/20260925_add_dashboard_permission.sql` (+ `.down.sql`): thêm feature
    `dashboard` (VIEW_ONLY, display_order=83, ngay trước `dashboard_new`) vào `permission_features` /
    `role_feature_permissions` — trước đây `/dashboard` (khác `/dashboard-new`, đã có sẵn từ
    20260923) không có dòng nào trong ma trận. Đã áp dụng cho profile `local` và `supabase`
    (`aiven` vẫn không kết nối được — `ENOTFOUND ttm-tool-dminhbb.d.aivencloud.com`, không chặn vì
    `DB_CONNECTION=local`).
  - `src/app/epic-alerts-15/page.tsx`: `DEFAULT_EXCLUDED_STATUSES` bỏ `TO DO`/`IN PO`/`RELEASED`
    (chỉ còn `CANCELLED`) nên 3 status này giờ hiển thị mặc định trên "Quản trị Epic"; thêm
    `BOTTOM_STATUS_RANK` + `.sort()` (stable) trên `filteredRows` để đẩy 3 status này xuống cuối
    danh sách theo đúng thứ tự In PO → To Do → Released, các status khác giữ nguyên thứ tự cũ.
  - `public/docs/product-guide.html`: bổ sung mục 11.5 "Dashboard New" (trước đây thiếu hẳn khỏi tài
    liệu) và mục 9 (R7 `RELEASE_STATUS_MISMATCH`) + mục 8.6 "Trục Release" (Chờ golive/Cảnh báo
    sớm/Giải trình Golive) — các tính năng đã lên production nhưng chưa được viết vào tài liệu sản
    phẩm.
- **Sửa lỗi `invalid input syntax for type json` khi import file "Export theo lớp dữ liệu"**:
  - `src/lib/db-backup-service.ts` (`formatSqlValue`): thiếu nhánh xử lý giá trị kiểu object (cột
    `jsonb`, ví dụ `epic_alert_timeline.detail`) — node-pg trả JSONB đã parse sẵn thành object JS
    thuần, rơi vào nhánh mặc định `String(value)` cho ra literal `"[object Object]"` (không phải
    JSON hợp lệ) thay vì `JSON.stringify(value)`. Postgres từ chối khi import với đúng lỗi người
    dùng báo. Cùng dạng lỗi đã sửa trước đây cho cột mảng (`TEXT[]`) — giờ thêm nhánh
    `typeof value === 'object'` (sau nhánh `Array.isArray`) dùng `JSON.stringify`.
  - Đã kiểm chứng trực tiếp trên dữ liệu thật: export bằng `POST
    /api/admin/db-backup/export-layer-range` (không kèm raw data, giống thao tác người dùng báo lỗi)
    → câu INSERT sinh ra đúng JSON hợp lệ (`'{"fromDate":"...","targetDate":"..."}'` thay vì
    `'[object Object]'`) → chạy thử trực tiếp qua Postgres (transaction rollback) xác nhận
    `jsonb_typeof` = `object`, không còn lỗi.
  - Sửa chung trong hàm dùng chung cho cả export toàn bảng lẫn export theo lớp dữ liệu, nên áp dụng
    luôn cho mọi cột `jsonb` khác nếu phát sinh sau này, không chỉ riêng `epic_alert_timeline`.

- **Dọn sạch 16 lỗi `eslint` có sẵn trong `src`** (phát hiện khi review sau khi pull code mới; không
  liên quan tính năng nào cụ thể, rải ở các file SSO mới thêm + `Table.tsx`):
  - `src/lib/sso-service.ts`: `SsoClientValidation` đổi thành discriminated union theo `isValid`
    (`{isValid:true; apiKey:ApiKey}` / `{isValid:false; apiKey:ApiKey|null; reason:string}`) thay vì
    `apiKey: null as any` — mọi nơi gọi (`api/sso/authorize`, `api/sso/verify-client`) đã sẵn pattern
    `if (!validation.isValid) return ...` nên TS tự narrow `apiKey` không cần ép kiểu.
  - `src/app/api/sso/authorize/route.ts`, `src/app/api/sso/token/route.ts`,
    `src/app/api/sso-demo/callback/route.ts`, `src/app/sso/authorize/page.tsx` (3 chỗ),
    `src/app/sso-demo/page.tsx` (1 chỗ + ép kiểu response `/api/admin/api-keys`): `catch (e: any)` →
    `catch (e: unknown)` + `e instanceof Error ? e.message : fallback`.
  - `src/app/sso-demo/page.tsx`: effect xử lý `code` từ URL redirect gọi `setExchangeError` đồng bộ
    ngay trong thân effect khi thiếu `savedKey` — dời nhánh kiểm tra đó vào bên trong hàm async
    `processCode()` (cùng hàm với các `setState` khác, vốn không bị lint bắt) thay vì đứng trước nó.
  - `src/app/dashboard-new/page.tsx`: `useEffect` gọi thẳng `loadData(previewUserId)` (hàm này set
    `loading`/`error` đồng bộ trước `await` đầu tiên) — bọc qua `Promise.resolve().then(...)` như
    quy ước đã dùng nhiều nơi khác trong file để tách khỏi thân effect.
  - `src/components/ui/Table.tsx`: vòng lặp `requestAnimationFrame` tự đệ quy (`tick` gọi lại chính
    nó) bị `react-hooks/immutability` bắt lỗi tự tham chiếu `useCallback` trong thân nó — chuyển
    sang giữ hàm trong `useRef` (gán 1 lần trong `useEffect([])`, không gán lúc render) và gọi qua
    `tickRef.current()`; `startScrolling` không còn phụ thuộc `tick` nữa.
  - `npx tsc --noEmit` và `npx eslint src` đều sạch tuyệt đối sau khi sửa.

- **Thêm filter PM/SM + Đơn vị yêu cầu ở Dashboard 2, sửa `Tooltip` dùng chung để không bị che/tràn màn hình**:
  - `src/app/dashboard-new/page.tsx`: thêm 2 dropdown lọc "PM/SM" và "Đơn vị yêu cầu" vào thanh Bộ
    lọc chung (cùng style với Dự án/Domain hiện có), áp dụng lên `filteredRows` — dùng cùng quy ước
    tách `ownerName` (comma-joined) với `epic-alerts-15`. `toEpicAlertsLink` forward thêm 2 filter
    này vào deep-link sang `epic-alerts-15` để số liệu ở màn đích khớp đúng số trên KPI tile.
  - `src/components/ui/Tooltip.tsx`: viết lại cơ chế định vị — trước đây tính vị trí 1 lần dựa trên
    rect của trigger rồi neo bằng CSS transform (`-translate-y-1/2`/`-translate-x-full`), không biết
    kích thước thật của tooltip nên bị tràn/che khuất khi nội dung dài và trigger nằm gần mép màn
    hình (ví dụ 4 badge TTM/QA-Index mới thêm ở header, sát mép phải + gần đỉnh màn hình). Nay dùng
    `useLayoutEffect` đo kích thước tooltip THẬT sau khi mount, tự lật sang bên còn lại nếu bên ưu
    tiên (`side`) không đủ chỗ, rồi kẹp (clamp) cả 2 trục trong viewport (chừa margin 8px) — tooltip
    ẩn (`visibility: hidden`) cho tới khi tính xong vị trí cuối để không bị nhấp nháy sai vị trí 1
    frame. Giảm font chữ tooltip từ `text-app` (14px) xuống `text-xs` (12px).


- **Chuyển 4 widget TTM/QA-Index (QLDA/PM) lên header dùng chung của AppShell + thêm tooltip**:
  - `src/lib/epic-header-widgets-context.tsx` (mới): Context cho phép 1 trang "bắn" dữ liệu widget
    (label/value/tooltip đã format sẵn) lên header sticky của `AppShell` mà KHÔNG cần AppShell tự
    fetch gì thêm — tránh lặp lại đúng loại query nặng vừa được bàn ở mục cache hôm 24/9.
  - `src/components/layout/AppShell.tsx`: tách `AppShellInner` (giữ nguyên toàn bộ logic cũ) ra khỏi
    `AppShell` (nay chỉ là wrapper bọc `EpicHeaderWidgetsProvider`) vì component tạo Context Provider
    và component đọc Context không thể là cùng 1 hàm. Header (`pathname === '/epic-alerts-15'`) render
    4 badge nhỏ (label mờ phía trên, % đậm phía dưới, màu xanh cho TTM/tím cho QA) kèm `Tooltip`
    (component dùng chung với badge "Nhận xét"), `side="left"` vì badge nằm sát mép phải màn hình.
  - `src/app/epic-alerts-15/page.tsx`: bỏ khối JSX 4 badge cũ trong nội dung trang, thay bằng 2
    `useEffect` gọi `setItems(...)` của context — tách riêng effect cleanup (chỉ chạy khi unmount)
    khỏi effect set dữ liệu, để tránh nhấp nháy ẩn/hiện mỗi lần data refresh (cleanup của
    `useEffect` chạy trước MỌI lần effect chạy lại, không chỉ lúc unmount).
  - Tooltip 2 dòng theo đúng yêu cầu: dòng 1 mô tả phạm vi tính, dòng 2 là `{pass}/{eligible}` (số
    Epic đạt trên số Epic đủ điều kiện tính — cùng "phạm vi tính" dùng cho mẫu số của %). Với 2 badge
    "(QLDA)", cả % và cặp số `{pass}/{eligible}` này đều lấy thẳng từ `ttm_index_global_cache` (cache
    ghi 1 lần/import từ 24/9) — không tính lại, kể cả phần hiển thị trong tooltip.

- **Tách TTM-Index/QA-Index thành 2 loại "(QLDA)" (toàn công ty) và "(PM)" (theo phân quyền) + cache "(QLDA)" sau mỗi import**:
  - `src/lib/ttm-index-global-cache-service.ts` (mới): tính `TTM-Index (QLDA)` và `QA-Index (QLDA)`
    — toàn bộ Epic trong hệ thống, KHÔNG phụ thuộc phân quyền user — bằng cách gọi
    `getEpicAlertRowsPhased(0, 'SUPERVISOR', {})` (role SUPERVISOR có `sourceProjectKeys: null`,
    tức không lọc project) rồi `summarizeTtmCntt`, cache kết quả vào bảng mới
    `ttm_index_global_cache` (1 dòng duy nhất, migration `20260925_create_ttm_index_global_cache`).
  - `src/lib/import-service.ts` (`processImport`): sau `COMMIT` của mỗi import, gọi
    `refreshTtmIndexGlobalCache(batchId)` để tính lại cache — lỗi ở bước này chỉ log, không làm fail
    import. **Lý do cache thay vì tính live**: query "toàn bộ Epic, không lọc theo project" là query
    nặng nhất hệ thống; nếu tính lại mỗi lần xem màn hình Quản trị Epic (nhiều lượt xem/ngày, trong
    khi import chỉ chạy ~1 lần/ngày) sẽ tăng tải đúng loại query từng làm cạn connection pool Aiven
    (xem `ALERT_HISTORY_RECORDING_ENABLED`). Cache rỗng cho tới lần import kế tiếp sau khi deploy
    thay đổi này — 2 badge "(QLDA)" sẽ hiện "—" cho tới đó.
  - `src/app/api/epic-alerts-15/route.ts`: trả thêm field `ttmIndexGlobal` (đọc từ cache, ghép song
    song với query chính, không tính lại) trong response.
  - `src/app/epic-alerts-15/page.tsx`: thêm 4 badge góc phải đầu trang — `TTM-Index (QLDA)`,
    `TTM-Index (PM)`, `QA-Index (QLDA)`, `QA-Index (PM)`. 2 badge "(PM)" tính trực tiếp từ `rows` màn
    hình đã fetch sẵn (không cần query thêm, không cache) — phạm vi toàn bộ Epic user được phân
    quyền, KHÔNG bị thu hẹp thêm bởi filter Dự án/Domain/Status đang chọn trên toolbar (đọc như một
    chỉ số cố định "phạm vi quyền của tôi", không đổi theo filter).
  - `src/lib/ttm-cntt-qa.ts`: export thêm `formatTtmPct1` (format % 1 số thập phân dùng chung, gộp
    từ bản local trước đây trong `dashboard-new/page.tsx`).
  - `src/app/dashboard-new/page.tsx`: đổi tên 2 ring widget "TTM Index (QLDA)" → `TTM-Index (PM)`,
    "TTM Index (QA)" → `QA-Index (PM)` — công thức/phạm vi giữ nguyên (vẫn lọc theo quyền + filter
    Dự án/Domain/Tìm kiếm của Dashboard 2 như cũ), chỉ đổi tên cho khớp quy ước mới.
  - Đã chạy `db:migrate:supabase` (áp dụng thành công). `local`/`aiven` chưa migrate được từ máy này
    (cùng lý do thiếu cấu hình như các mục trước).

## 2026-09-24

- **Thu hẹp rule "Chờ golive" + thêm 2 widget Dashboard New + sort bảng ma trận Dashboard 2 + format % 1 số thập phân**:
  - `src/lib/epic-alert-service.ts` (`resolveReleaseAxis`): "Chờ golive" nay CHỈ áp dụng khi Epic đã
    có R4G Date và hôm nay còn trong khoảng R4G Date → R4G Date + 5 ngày làm việc (trước đó áp dụng
    cho mọi Epic status ≤ R4GOLIVE bất kể có R4G Date hay không, kể cả Epic còn ở DESIGN/DEV — sai).
    Viết lại toàn bộ hàm theo luồng: chưa có R4G Date → NONE; có R4G Date → so Due Date/hôm nay với
    hạn R4G Date + 5 ngày làm việc như cũ, chỉ khác ở nhánh còn trong hạn mà chưa có Due Date (chia
    "Chờ golive" nếu status ≤ R4GOLIVE, "Cảnh báo sớm" nếu đã qua R4GOLIVE). Cập nhật tooltip ở cả 3
    màn hình (`epic-alerts`, `epic-alerts-15`, `epic-in-po`) và tài liệu (`brd/02`, `HelpPanels.tsx`).
  - `src/app/dashboard-new/page.tsx`: thêm 2 widget KPI mới ở Executive view — "Chờ golive" và
    "Giải trình Golive" (đếm `row.releaseAxisState`), deep-link sang `epic-alerts-15` qua
    `toEpicAlertsLink({ alert: 'WAITING_GOLIVE' | 'JUSTIFY_GOLIVE' })`. Mở rộng
    `EpicAlertsDeepLinkAlert` (`src/lib/epic-alerts-deep-link.ts`) để nhận 3 giá trị Trục Release.
  - `src/app/dashboard-new/page.tsx`: bảng "Ma trận Phân bổ Tiến độ Epic Đa chiều" nay sort được
    bằng cách bấm vào header (dùng lại hook `useSortableList`/`compareValues` từ
    `src/lib/use-sortable-list.ts`, cùng pattern với `admin/projects`/`admin/domains`), mặc định
    sort giảm dần theo cột TTM-CNTT (QLDA).
  - `src/lib/ttm-cntt-qa.ts`: `summarizeTtmCntt` trả thêm `pctPrecise` (tỷ lệ chưa làm tròn) bên
    cạnh `pct` (số nguyên, giữ nguyên cho bảng ma trận). 2 widget "TTM Index (QLDA)"/"TTM Index
    (QA)" ở Dashboard New nay hiển thị `pctPrecise` làm tròn 1 số thập phân, dùng dấu phẩy kiểu Việt
    Nam (`Intl.NumberFormat('vi-VN', {minimumFractionDigits:1, maximumFractionDigits:1})`) — trước
    đó hiện số nguyên làm tròn 0 chữ số thập phân.

- **Đổi rule TTM-E2E sang tính tới R4G Date (thay vì Due Date) + rule "Trục Release" mới**:
  - `src/lib/epic-alert-service.ts`: `resolveTtmE2eRelease` nay lấy R4G Date làm điểm kết thúc thực
    tế (trước đó Due Date); "Đạt TTM-E2E" (frontend) nay yêu cầu thêm status = Released. Bỏ hẳn
    `resolveTtmE2eStatusMismatch`/`ttmE2eStatusMismatch` (khái niệm "Sai Status TTM-E2E" cũ dựa trên
    Due Date) — thay bằng 2 cơ chế mới:
    1. Hàm `resolveReleaseAxis` mới (+ type `ReleaseAxisState`): badge thứ 3 ở cột Nhận xét — "Chờ
       golive" (status ≤ R4GOLIVE, chưa có Due Date), "Cảnh báo sớm" (đã qua R4GOLIVE, trong hạn R4G
       Date + 5 ngày làm việc), "Giải trình Golive" (quá hạn đó mà chưa Released đúng hạn/Due Date
       vượt hạn).
    2. Rule sai lệch dữ liệu mới **R7 `RELEASE_STATUS_MISMATCH`** (`src/lib/epic-data-anomaly.ts`,
       `EPIC_ANOMALY_RULE_INDEX`): Due Date đúng hạn (≤ R4G Date + 5 ngày làm việc) nhưng status
       chưa Released — ưu tiên hơn 2 badge Cảnh báo sớm/Giải trình Golive ở trên.
  - Hằng số dùng chung `RELEASE_DUE_GRACE_WORKING_DAYS = 5` đặt tại `src/lib/ttm-rules.ts` để 2 nơi
    trên không bao giờ lệch nhau về mốc 5 ngày làm việc.
  - `breaksTtmE2eCalculation` đổi sang kiểm tra R4G Date < T0 (trước đó kiểm tra Due Date < T0).
  - Cập nhật đồng bộ cả 3 màn hình (`epic-alerts`, `epic-alerts-15`, `epic-in-po`: badge, filter
    "Lọc Nhận xét" thêm 3 giá trị mới, dải TTM-E2E bỏ marker "Sai Status") và `reports-service.ts`
    (Bảng Đạt TTM-e2e giờ đòi status Released + R4G Date, không còn dùng Due Date).
  - Migration `20260924_add_release_status_mismatch_anomaly_rule.sql`: mở rộng CHECK constraint
    `rule_code` của `epic_data_anomaly_violations` để nhận `RELEASE_STATUS_MISMATCH`. Đã áp dụng lên
    Supabase; `local`/`aiven` chưa migrate được từ máy này (cùng lý do thiếu cấu hình như các mục
    trước) — cần chạy `npm run db:migrate:local` / `db:migrate:aiven` trên đúng máy.
  - Cập nhật tài liệu: `brd/02-ttm-concepts-and-rules.md` (mục 6, 6.1 mới, mục 9),
    `brd/03-mvp1-working-days-alert-rules.md` (§4.5 thêm R7), `HelpPanels.tsx` (đánh số lại mục 4-9,
    thêm mục 4 "Trục Release" mới).

- **Thiết lập `daily_change_log.md`**: tạo file nhật ký lũy kế theo ngày ở repo root (khởi tạo lại
  lịch sử 2026-09-22/23 từ commit log) và bổ sung mục "Daily change log" vào `AGENTS.md` yêu cầu mọi
  AI agent tự động bổ sung bullet vào ngày hiện tại sau mỗi lần hoàn thành yêu cầu có thay đổi
  code/schema/config — để phát triển liên tục trên nhiều máy chỉ cần đọc file này thay vì `git log`.
- **Sửa lỗi phát hiện ở Dashboard 2 / TTM-CNTT-QA sau khi pull code mới**:
  - `src/lib/ttm-cntt-qa.ts`: khôi phục fallback 2 tầng cho `pct` — trước đó khi chưa có Epic nào
    tới R4G (`eligible=0`) thì luôn hiện 100% dù đã có Epic Fail TTM-CNTT trước hạn; giờ fallback về
    `(total-fail)/total` như logic Dashboard 2 gốc.
  - `dashboard-new/page.tsx` (Ma trận Phân bổ): mỗi Epic giờ luôn rơi vào đúng 1 trong 2 nhóm cột
    (Pass/Fail TTM-CNTT QLDA hoặc Đúng/Chậm tiến độ) — trước đó Epic Released nhưng thiếu R4G Date
    hoặc có sai lệch dữ liệu bị đếm vào "Tổng số Epic" nhưng không hiện ở cột nào.
  - `dashboard-new/page.tsx` (`toEpicAlertsLink`): forward thêm `searchQuery` vào deep-link sang
    `epic-alerts-15` để số liệu ở màn đích khớp đúng số trên KPI tile đã lọc theo từ khoá tìm kiếm.
  - `src/lib/csv-parser.ts`: bổ sung mapping cột `Custom field (Đơn vị yêu cầu)` cho adapter Pure
    Jira Export — trước đó chỉ adapter Py Jira API set được `requestingUnit`, import qua Pure Jira
    Export luôn ra `null` âm thầm.
  - Đã kiểm tra riêng và xác nhận là false positive (không sửa): mismatch giữa tile "Fail TTM-E2E"
    và filter `FAIL_E2E` — `ttmE2eStatusMismatch` và `ttmE2eAlertLevel==='FAIL'` loại trừ lẫn nhau
    theo `resolveTtmE2eStatusMismatch`, nên tình huống review nêu ra không thể xảy ra trong thực tế.
  - Đã chạy `db:migrate:supabase` (0 migration mới — cột `requesting_unit` đã có sẵn). `local` và
    `aiven` chưa migrate được từ máy này (thiếu cấu hình Postgres local và thiếu `db/ca.pem`) — cần
    chạy `npm run db:migrate:local` / `db:migrate:aiven` trên đúng máy đang dùng 2 profile đó.

## 2026-09-23

- **Dashboard 2 (beta)**: thêm màn `/dashboard-new` gồm 2 chế độ — Lead Command Center (Executive)
  và PM/SM Workbench (Operational), API `GET /api/dashboard-new`, quyền mới `dashboard_new`
  (migration `20260923_add_dashboard_new_permission`).
- **Pink theme**: cập nhật bảng màu theme (`src/lib/theme-brand.ts`).
- **Fix Dashboard 2**: sửa các lỗi phát hiện khi review — cột "Chi tiết vi phạm" dùng lại component
  chung `DataAnomalyList` thay vì tự check thiếu rule; sửa `isReleased` dùng AND thay vì OR; API map
  lỗi auth về đúng 401/403 thay vì luôn 500; chặn race-condition khi đổi "Xem dưới dạng User" nhanh;
  thêm phân trang cho tab "Tiến độ TTM & Danh sách Epic"; đổi tên "TTM Health Index" →
  "TTM Index (QLDA)"; đổi toggle Lead/PM-SM — chuyển sang PM/SM sẽ mở popup chọn user thay vì có nút
  riêng.
- **Đơn vị yêu cầu (Requesting Unit)**: thêm cột `requesting_unit` (migration
  `20260923_add_epic_requesting_unit`), hiển thị & filter tại `epic-alerts-15`, `epic-alerts`,
  `epic-in-po`, và trong popup Epic Browser (`EpicBrowserModal.tsx`, `getEpicBrowserSummary`).
- **Rule TTM-CNTT-QA**: thêm `src/lib/ttm-cntt-qa.ts` (tách logic tính tỷ lệ đạt TTM-CNTT dùng
  chung cho Dashboard 2), thêm deep-link giữa Dashboard 2 và `epic-alerts-15`
  (`src/lib/epic-alerts-deep-link.ts`), tái cấu trúc Ma trận Phân bổ & Phase Pipeline tại
  `dashboard-new`.

## 2026-09-22

- **Dashboard 2 (beta)** — khởi tạo lần đầu (chi tiết đã gộp vào mục 2026-09-23 ở trên vì được sửa
  tiếp ngay hôm sau).
- **Sửa lỗi import file CSV**.
- **Update rule Sai lệch dữ liệu** (cập nhật rule phát hiện dữ liệu bất thường R1-R6).
