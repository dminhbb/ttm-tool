# Daily Change Log — Lưu trữ

> Các entry cũ hơn 30 ngày được chuyển từ daily_change_log.md sang đây bởi scripts/archive-daily-log.mjs. Không sửa tay.

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

## 2026-10-05

- **Tinh chỉnh giao diện & Bảng màu 2 nhóm Widget KPI - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Thu nhỏ cỡ chữ phần hiển thị phép tính (`pass / denominator`) ở vị trí trung tâm 3 widget chỉ số (TTM-CNTT QLDA, TTM-CNTT QA, TTM-E2E) xuống còn 70% (`text-[8px]` đến `text-[10px]`), giúp bố cục số liệu cân đối, thanh thoát.
  - Phân tách và chuẩn hóa màu nền 2 nhóm thẻ: nhóm 5 thẻ bên trái sử dụng tông **Light navy pastel** (`bg-[#eaf1fb]` viền `#d0e0f3`), nhóm 4 thẻ bên phải sử dụng tông **Light grey** (`bg-[#f1f5f9]` viền `#e2e8f0`).
  - Bỏ biểu tượng icon tại widget "TỔNG EPIC"; chuẩn hóa tiêu đề thẻ thứ 2 thành "FAIL TTM-CNTT".

- **Tinh chỉnh tỷ lệ Font & Bố cục 3 tầng thẻ KPI - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Giảm kích thước font toàn bộ text của 9 widget xuống 70% (`text-[7px]-text-[8px]` cho title, `text-[6.5px]-text-[7.5px]` cho subtitle) và đặc biệt giảm con số chính trung tâm xuống 60% (`text-[11px]-text-[14px]` font-extrabold).
  - Tái cấu trúc thống nhất chuẩn 3 tầng cho mọi widget: `widget title` -> `con số chính` -> `subtitle`.
  - Tại 3 thẻ chỉ số (TTM-CNTT QLDA, TTM-CNTT QA, TTM-E2E): đã có % hiển thị trong vòng tròn tiến độ thì không lặp lại % ở bên cạnh; thay vào đó con số chính hiển thị tỷ lệ phân số đánh giá (ví dụ `234 / 281`), subtitle hiển thị tên phạm vi (`QLDA`, `QA`, `Đạt / Đánh giá`), ngắn gọn, rõ ràng và chống tràn dòng tuyệt đối.

- **Tái thiết kế hàng widget KPI theo phong cách Enterprise Banking / IT Control Tower - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Chuyển đổi giao diện hàng 9 thẻ KPI sang phong cách hiện đại, thanh lịch, chuẩn ngân hàng: nền sáng (`bg-white/95`), bo góc mềm mại `rounded-[16px]`, bóng mờ tinh tế, viền nhạt `border-[#d9e3ef]`, phân tách 2 nhóm bằng vách ngăn dọc mảnh.
  - Sử dụng bảng màu pastel dịu mắt (`bg-[#eff6ff]` cho nhóm tổng quan/e2e, `bg-[#f0fdf4]` cho tỷ lệ đạt/chờ golive, `bg-[#fffbeb]` cho cảnh báo, `bg-[#fef2f2]` cho sai lệch/fail).
  - Tích hợp biểu đồ vòng tiến độ tròn (`KpiProgressRing`) cho 3 thẻ tỷ lệ (TTM-CNTT QLDA, TTM-CNTT QA, TTM-E2E) hiển thị số % trong tâm vòng tròn.
  - Tích hợp bộ icon tròn (`KpiIconBadge` với `@phosphor-icons/react`: Stack, WarningCircle, Bell, Warning, CheckCircle, Clock) cho các thẻ chỉ số còn lại.
  - Rút gọn tiêu đề và phụ đề (TỔNG EPIC, FAIL TTM-CNT, TTM-CNTT, TTM-E2E, CẢNH BÁO, SAI LỆCH, CHỜ GOLIVE, GIẢI TRÌNH) cùng quy tắc chống ngắt dòng tuyệt đối (`whitespace-nowrap overflow-hidden text-ellipsis`) trên 1 hàng ngang desktop.
  - Bảo lưu 100% logic dữ liệu động và liên kết drill-down tới màn hình Quản trị Epic.

- **Chuẩn hóa hiển thị Epic ngoại lệ & Dự án không tính TTM trong Quản trị Epic** (`src/app/epic-alerts-15/page.tsx`, `epic-alerts-15.css`, `src/app/epic-in-po/page.tsx`, `epic-in-po.css`):
  - Bỏ chấm đen chỉ thị (`TtmBlackListDot`) cạnh Epic key ở màn hình Quản trị Epic (`/epic-alerts-15`) và Quản trị Epic trong PO (`/epic-in-po`).
  - Đổi cách hiển thị cho các Epic ngoại lệ (nằm trong TTM Black list) và các Epic thuộc dự án không tính TTM (`Time to Market = N`): đặt mã Epic trong dấu ngoặc đơn `(EPIC-KEY)` và dùng font chữ thường không đậm (`font-weight: 400` / `.is-ttm-excluded !font-normal`).
  - Các Epic thông thường nằm trong phạm vi tính TTM giữ nguyên định dạng chữ đậm (`font-weight: 800`) không có ngoặc đơn.

- **Nâng cấp Toggle Epic ngoại lệ & Chuẩn hóa Widget dạng Capsule Pill - TTM Dashboard 2** (`src/components/ui/PillToggle.tsx`, `EpicBrowserModal.tsx`, `DashboardInsights.tsx`, `page.tsx`):
  - **Component PillToggle & BooleanPillToggle**: Xây dựng component toggle dạng viên nhộng (`rounded-full border border-slate-300 bg-[#f0f3f1]`, nút active xanh lá đậm `#1b6b3e`) theo đúng thiết kế toggle Lead - PM/SM.
  - **Form Epic ngoại lệ**: Chuyển select box đánh dấu TTM Black listed trong popup Duyệt Epic (`EpicBrowserModal.tsx`) sang dạng toggle True/False trực quan; bỏ hoàn toàn popup confirmation, khi chuyển sang True lập tức lưu và bắn toast message cảnh báo tác động loại Epic khỏi phạm vi tính TTM.
  - **Hàng widget KPI TTM Dashboard 2**: Thiết kế lại toàn bộ 9 thẻ widget thành dạng viên nhộng (capsule pill `rounded-full`) tương tự các widget toàn công ty; giữ nguyên và phân biệt màu font chữ giữa 2 nhóm (Navy `#1e3a8a` cho 5 thẻ bên trái và Xám đậm `#334155` / `slate-800` cho 4 thẻ bên phải).
  - **Widget "Fail TTM-CNTT"**: Bỏ toàn bộ subtitle; gắn liên kết tra soát trực tiếp vào số liệu chính để mở Quản trị Epic với bộ lọc Fail TTM-CNTT.
  - **Giảm độ tương phản Funnel Chart**: Giảm độ chói và tương phản gắt của các tầng phễu 3D SVG (chuyển đỏ chói `#ff4d4f` sang rose `#e11d48`, cyan chói sang ocean blue `#0284c7`, amber dịu `#d97706`), giảm độ đổ bóng (`drop-shadow-sm`), điều chỉnh dải chỉ số toàn công ty và dải tổng kết chân phễu sang tông màu trầm, dịu mắt và hài hòa.

- **Tinh chỉnh giao diện hàng widget KPI - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Bỏ toàn bộ viền xung quanh thẻ widget (`border`) và dải màu định vị ở đỉnh mỗi widget (`border-t-[3px]`), giữ nguyên màu sắc chữ và số liệu của 2 nhóm (Navy `#1e3a8a` bên trái và Xám đậm `#334155` bên phải).
  - Điều chỉnh độ bo cong góc của tất cả các widget tương đương độ cong của box bao ngoài (`rounded-2xl`), tạo cảm giác mềm mại và liền mạch thị giác.
  - Tại widget "Fail TTM-CNTT", đổi text của subtitle từ "Mẫu số đánh giá" thành `/{giá trị mẫu số}` (ví dụ: `/{fmt(qlda.denominator)}`), ngắn gọn và hiển thị trực diện tỷ lệ so với mẫu số.
  - Tăng kích thước font chữ của tiêu đề widget (title) thêm 20% (từ `text-[7px]` lên `text-[8.5px]`) và làm đậm hơn (`font-extrabold uppercase tracking-wider`).

- **Cập nhật màu nhóm widget bên trái thành Navy - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Chuyển màu chủ đạo của nhóm 5 widget bên trái sang màu **Navy** (`#1e3a8a`): đồng nhất cho viền đỉnh thẻ (`border-t-[3px] border-t-[#1e3a8a]`), tiêu đề, giá trị số liệu và thanh tiến độ Metric Gauge, mang lại vẻ ngoài đầm chắc, hiện đại và độ tương phản cao.

- **Cập nhật màu chủ đạo hàng widget KPI - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Nhóm 5 widget bên trái: chuyển sang đồng nhất **màu chủ đạo của theme** (`#1463f7` / Blue theme) cho viền đỉnh, tiêu đề, số liệu và thanh đo Metric Gauge.
  - Nhóm 4 widget bên phải: chuyển sang đồng nhất **màu xám đậm** (`#334155` / `slate-700`) cho viền đỉnh, tiêu đề, số liệu chính và các liên kết tác nghiệp, tạo độ tương phản đầm chắc, hiện đại và chống chói tối đa.
- **Chuẩn hóa màu sắc & Typography hàng widget KPI - TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Đồng nhất bảng màu cho 2 nhóm widget: nhóm 5 widget bên trái dùng chung màu **Navy** (`#1e3a8a`), nhóm 4 widget bên phải dùng chung màu **Vàng đất** (`#92400e`), loại bỏ hoàn toàn sự phân mảnh đa màu sắc.
  - Giảm tỷ lệ font chữ: font chữ tiêu đề giảm xuống 70% (`text-[7px] font-bold uppercase tracking-wider`), số liệu chính giảm xuống 80% (`text-[15px] sm:text-[16px] font-black`), subtitle và nhãn phụ giảm xuống 80% (`text-[8px]`).
  - Đổi subtitle thẻ "Tổng số Epic" thành "Phạm vi tính", đổi subtitle thẻ "Sai lệch dữ liệu" thành "Cần điều chỉnh.".
  - Chuyển phần hiển thị phép chia tỷ lệ của các widget chỉ số TTM (ví dụ `234/281`) vào hover tooltip (`title`) để mặt thẻ thông thoáng, tập trung vào con số % và thanh Metric Gauge.
- **Tinh chỉnh hàng widget KPI - TTM Dashboard 2 (Thanh tiến độ Metric Gauge & Giảm chiều cao)** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Bỏ toàn bộ các dòng subtitle của thẻ "Tổng số Epic" (các thông tin trừ Cancelled, ngoại lệ, TTM=N đã có ở popup giải thích L02).
  - Đổi title thẻ "Cảnh báo (Sớm/Muộn)" thành "Cảnh báo".
  - Đổi title thẻ "Fail TTM-CNTT (QLDA)" thành "Fail TTM-CNTT".
  - Đổi 3 đồng hồ tròn (`IndexRing`) thành **Thanh tiến độ dạng Metric Gauge** (`MetricGaugeCard`): Header tiêu đề rõ ràng, số % nổi bật kèm số phân số, thanh bar ngang bo góc cao 6px sinh động với animation.
  - Giảm chiều cao toàn hàng widget hơn 35% (từ ~120px xuống chỉ còn ~74px), tất cả 9 thẻ có cùng 3 tầng nội dung cân đối.
  - Tăng cường tương phản, giảm triệt để độ chói (lightness): bọc hàng widget trong container nền Slate xám đậm hơn (`bg-slate-100 border-slate-300`), loại bỏ hoàn toàn các nền pastel cực nhạt, số liệu dùng font bão hòa sâu đậm nét.
- **Tối ưu thiết kế hàng widget KPI (Phương án 2 - TTM Dashboard 2)** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Khắc phục triệt để lỗi chèn ép không gian và xô lệch/ngắt dòng chữ vụn vặt khi ở zoom 100% trên 1 hàng ngang.
  - Chuyển 3 đồng hồ tròn (`IndexRing`: TTM-CNTT QLDA, QA, E2E) sang layout dọc cân đối: vòng conic-gradient thu gọn `size-12` (48px) ở trung tâm, tiêu đề phân tách dứt khoát 2 dòng `TTM-CNTT` và `(QLDA)`/`(QA)`/`(Hoàn thành)` với `whitespace-nowrap`, tỷ lệ số phụ căn giữa chân card.
  - Chuẩn hóa layout 2 cột key-value (`justify-between`) cho chi tiết trừ Epic (Tổng số Epic) và trạng thái Chờ Golive (Thiếu R4G, Trong hạn, Quá hạn), nhãn căn trái, số liệu căn phải, không còn bị ngắt số xuống hàng.
  - Tăng cường tương phản và giảm độ chói sáng của theme: bọc toàn bộ hàng widget trong container nền Slate xám dịu (`bg-slate-50/70 border border-slate-200/90`), tất cả 9 thẻ dùng nền trắng sắc nét với viền đỉnh màu nhận diện (`border-t-[3px]` theo chuẩn màu nhận diện của từng chỉ số), typography đậm và sắc nét chuẩn WCAG.
  - **Ma trận / pie theo PM/SM (TTM Dashboard 2)**: mỗi PM/SM một dòng — Epic nhiều PM/SM ("A, B") được tính cho từng người
    thay vì gom theo nguyên chuỗi, nên danh sách mở ra (`owner_names && [A]`) khớp đúng con số; có ghi chú "tổng các dòng có thể
    lớn hơn Tổng số Epic" (`BREAKDOWN_KEYS` trong `src/lib/ttm-funnel-summary.ts`, `DashboardInsights.tsx`). Cache Dashboard 2 lên
    `PAYLOAD_VERSION = 7`. TTM Dashboard cũ (SUPERADMIN) chưa đổi.
  - **"Xem dưới quyền" theo phạm vi dữ liệu**: ADMIN chỉ xem dưới quyền được user mà MỌI dự án của user đó nằm trong phạm vi
    ADMIN (domain được gán + dự án mình làm PM/SM); SUPERADMIN/SUPERVISOR không đổi. Áp dụng cả danh sách chọn user và API
    (`listPreviewableUsers` / `resolveViewAsTarget` trong `src/lib/view-as-user-service.ts`; TTM Dashboard 2, TTM Dashboard,
    Quản trị Epic).
  - **Chỉ số khi mẫu số = 0 hiển thị "—"** thay cho 100% (vòng KPI, badge banner, ô ma trận, sắp xếp) — `hasTtmVerdict` /
    `formatTtmPassPct` / `formatTtmFailPct` trong `src/lib/ttm-cntt-qa.ts`; MCP vốn đã trả `null`.
  - **R8 không áp dụng với Reopened** (`SCORING_CODE_VERSION` → `scoring-10`, spec §20): Epic đã golive rồi bị mở lại giữ R4G
    Date và kết quả TTM, không gắn "Sai Status" TTM-CNTT/E2E. Pending không đổi. Cần "Tạo lại cache" để áp dụng.
  - **Khoá rebuild cache**: bảng mới `derived_cache_refresh_lock` (migration `20261005b_…`, đã chạy local + Supabase) — chỉ 1 lượt
    `refreshDerivedCaches` chạy tại một thời điểm trên mọi instance; lượt đến sau chỉ "xin" thêm và lượt đang chạy sẽ chạy lại 1 lần
    với dữ liệu mới nhất trước khi nhả khoá (`src/lib/daily-cache-service.ts`). Nút "Tạo lại cache" báo khi bị gộp vào lượt đang chạy.
  - **Ma trận phân quyền chặn đúng quyền "Xem" trang**: bỏ tick Xem của role → `src/proxy.ts` chuyển hướng khỏi trang đó (về trang
    đầu tiên còn quyền, hoặc `/no-access`) và trả 403 cho API riêng của trang (`/api/ttm-dashboard-2`, `/api/dashboard-new`,
    `/api/reports`); AppShell chặn luôn trong tab vừa lưu ma trận. Bảng ánh xạ trang ↔ chức năng: `src/lib/feature-access.ts`.
    Ma trận vẫn chỉ thu hẹp (role hardcode vẫn áp dụng). Lưu ý: DB local đang bỏ tick Xem "TTM Dashboard 2" cho USER (Supabase thì có).
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

## 2026-10-06

- **Hàng widget KPI — TTM Dashboard 2: đồng bộ cỡ chữ, tách màu 2 nhóm** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`):
  - Title / con số chính / subtitle dùng CHUNG một kiểu chữ ở cả 9 widget (`KPI_TITLE_CLASS`, `KPI_VALUE_CLASS`, `KPI_SUBTITLE_CLASS`) — thẻ tỷ lệ (`351 / 409`) không còn nhỏ hơn các thẻ khác. Cỡ chữ tăng ~20% (17 / 9,5 / 9px) và co theo bề rộng hàng (`cqw`, hàng là `@container`) để màn hình hẹp (1366) không bị cắt số; chiều cao thẻ tăng ~9%.
  - Nhóm trái nền navy pastel đậm hơn (`#d6e4fa`), nhóm phải xám trung tính (`#eef0f2`); icon / vòng tiến độ nền trắng, cùng kích thước. Bề rộng cột chia theo nội dung từng thẻ.
  - Vòng tiến độ: mẫu số = 0 thì vòng rỗng + "—" (trước đây vẫn tô kín 100%); phân số cạnh vòng dùng cùng điều kiện `hasTtmVerdict` (cả dải chỉ số toàn công ty ở `src/app/ttm-dashboard-2/page.tsx`).
  - Thẻ "Cảnh báo" (engine legacy): bấm thẻ mở cả Muộn + Sớm, khớp con số hiển thị.
  - Thẻ bấm được là `<button>` phủ nền, link con trong subtitle là `<button>` riêng (dùng được bằng bàn phím, không lồng phần tử tương tác); bỏ class `scrollbar-none` không tồn tại.
- **Lease tạo lại cache — tự phục hồi khi lượt đang chạy bị chết giữa chừng** (`src/lib/daily-cache-service.ts`, `src/app/api/system/daily-cache/route.ts`): lease còn chủ nhưng đã hết hạn = lượt rebuild chết, các yêu cầu đến trong lúc đó (daily, import, lưu black list…) chưa được tính lại. Trạng thái này giờ là `DailyCacheStatus.rebuildInterrupted` → cache coi như STALE và lần tải trang kế tiếp được claim lại lượt trong ngày kể cả khi đã SUCCESS. Dừng sau `MAX_REBUILDS_PER_LEASE` cũng để lại lease ở trạng thái đó thay vì bỏ rơi yêu cầu đang chờ. Không đổi schema.
- **Mở URL gốc `/` không còn toast "không có quyền"** (`src/proxy.ts`): vai trò không có quyền "Nguồn dữ liệu" vẫn được chuyển về màn hình mặc định nhưng không gắn `?denied=`.
- **PM/SM trùng tên trong một Epic ("An, An") chỉ đếm một lần** (`ownerNames` trong `src/lib/ttm-funnel-summary.ts`, có test).
- **Quản trị Epic — bảng danh sách rộng thêm 10% (1540 → 1694px)**, phần tăng dồn vào 5 cột Epic / Nhận xét / TTM-CNTT (QLDA) / TTM-E2E / Status; các cột ngày và pha giữ nguyên (`src/app/epic-alerts-15/page.tsx`, `epic-alerts-15.css`):
  - Epic: min-width 180 → 230px, tóm tắt Epic hiện 60 ký tự (trước 50). Nhận xét / Status: thêm padding ngang (`.ttm-col-roomy`). TTM-CNTT / TTM-E2E: thanh strip dài hơn 25% (`BASE_WIDTH` 56 → 70, tối đa 112 → 140).
  - Khung nội dung của riêng `/epic-alerts-15` nới 1600 → 1760px (`src/components/layout/AppShell.tsx`) để bảng rộng hơn hiện đủ trên màn hình lớn. Chế độ thu gọn (ẩn hết cột pha) không đổi.
- **Popup Quản trị Epic (drill-down từ TTM Dashboard 2) phủ gần hết khung nhìn** (`src/components/dashboard-new/EpicAlertsIframeModal.tsx`): bỏ giới hạn 96vw / 1750px / 92vh, chỉ chừa lề 8px.
- **3 widget chỉ số — TTM Dashboard 2** (`src/components/ttm-dashboard-2/DashboardInsights.tsx`): vòng tròn to hơn (34 → 46px) và số % bên trong to, đậm hơn — đây là con số chính của widget; phép tính bên cạnh (`351 / 409`) thu nhỏ (17 → 13px, `KPI_FRACTION_CLASS`). Subtitle đổi thành "Toàn phòng QLDA" và "Phạm vi của QA". Tỷ lệ tròn 100 hiện "100%"; số 4 chữ số bỏ khoảng trắng quanh dấu "/" để không bị cắt.
- **Popup TTM Dashboard 2**: popup Quản trị Epic quay lại 96% bề ngang / 92% chiều cao khung nhìn (không còn trần 1750px) (`src/components/dashboard-new/EpicAlertsIframeModal.tsx`); popup chi tiết mở từ phễu (chuột phải vào tầng L01…L05bb, nút "Ngoài phạm vi") làm mờ nền phía sau giống popup Quản trị Epic — `Modal` có thêm prop `blurBackdrop` (`src/components/ui/Modal.tsx`), các popup khác trong hệ thống không đổi.

## 2026-10-08

- **Scoring Engine — R8 áp dụng cả khi R4G Date ở tương lai** (`SCORING_CODE_VERSION` → `scoring-11`, spec §22; không đổi schema): bỏ ngoại lệ "R4G Date
  tương lai là ngày kế hoạch" của 05/10. Epic có R4G Date mà status chưa tới R4GOLIVE là Sai lệch dữ liệu dù ngày đó chưa tới
  (`src/lib/scoring/rules/data-quality.ts`, `catalog.ts`); Epic đã ở R4GOLIVE trở lên với R4G Date tương lai vẫn là "chưa kết luận". Phát hiện từ
  PAMS-98275 / PAMS-98347 (In Progress, R4G Date 13/10 và 16/10) đang nằm ở L05ac; cùng với MO-32292 sẽ chuyển sang Sai lệch dữ liệu. **Cần "Tạo lại
  cache"** để áp dụng. Cập nhật product-guide mục 9.1, Giới thiệu sản phẩm, test.
- **MCP tuân theo Ma trận phân quyền** (không đổi schema; `mcp-server.ts` lên 1.3.0): mỗi tool gắn với feature key của màn hình hiển thị cùng dữ
  liệu (`MCP_TOOL_FEATURES` trong `src/lib/feature-access.ts`); role bị bỏ quyền Xem thì tool trả thông báo từ chối thay vì dữ liệu — trước đây bỏ quyền
  Xem TTM Dashboard 2 chặn trang + API nhưng `get_ttm_dashboard` vẫn trả số liệu. Cả 11 tool đăng ký qua wrapper `registerTool` (kiểm tra ma trận trước
  handler). `get_epic_detail` cần còn Xem Quản trị Epic hoặc Epic in PO. Chỉ thu hẹp, điều kiện role của tool vẫn áp dụng. Với ma trận hiện tại trên
  Supabase, thay đổi thực tế duy nhất: `get_dashboard_summary` (Dashboard cũ) chỉ còn SUPERADMIN gọi được. Có test (`feature-access.test.ts`); tài liệu:
  product-guide mục 16.3 + mục 2, BRD 05 / 15.
- **Đổi Domain của dự án → tạo lại cache** (không đổi schema): cache dòng Epic lưu `domainName` của dự án tại lúc dựng, nhưng trước đây chỉ màn Quản lý
  Domain (đổi danh sách dự án / đổi tên) mới kích hoạt tạo lại. Nay tạo lại cả khi: sửa Domain hoặc trạng thái active của dự án ở Quản lý Dự án, tạo dự án
  có Domain, xoá dự án đang có Domain (`cachesAffected` trong `src/app/api/projects/route.ts`); bật/tắt Domain (`DomainSaveResult.activeChanged`,
  `master-data-service.ts`); xoá Domain (`src/app/api/domains/route.ts`). Trước đó thống kê theo Domain giữ giá trị cũ tới lần import / lượt cache đầu ngày kế
  tiếp. Tài liệu sản phẩm mục 6.4 ghi rõ Domain là thông tin hiện hành (không theo lịch sử).
- **Review các commit 05–06/10 (a2dfa0f … 147cffd) — sửa đối chiếu Scoring + cập nhật tài liệu** (không đổi schema, không đổi rule chấm điểm):
  - **Đối chiếu Scoring Service**: lần chạy 08/10 báo 52 Epic "Chưa giải thích được", tất cả là Epic ngoại lệ / Epic của dự án Time to Market = N
    (service không đếm vào TTM-Index từ `scoring-9`, engine cũ vẫn đếm) nhưng chưa có nhãn. Thêm nhãn `D12_TTM_EXCLUSION`
    (`src/lib/scoring/parity.ts`, `ScoringParityPanel.tsx`, test mới `src/lib/scoring/__tests__/parity.test.ts`); về 0 sau lần tạo lại cache kế tiếp.
  - Popup "Logic cảnh báo": công thức chỉ số ghi đúng "mẫu số = 0 hiển thị —" (`INDEX_PERCENT_FORMULA`, `catalog.ts`); sửa comment cũ về mẫu số ở
    bộ lọc `FAIL_LATE_R4G` / `FAIL_MISSING_R4G` (`epic-row-verdicts.ts`).
  - **Tài liệu sản phẩm** (`public/docs/product-guide.html`): mục 2 — Ma trận phân quyền đã có hiệu lực với quyền Xem (bỏ ghi chú "chỉ tham chiếu");
    mục 5.2 — bổ sung 11 bảng cache / scoring / cấu hình (tổng 50 bảng, gồm `black_listed_epics`, `derived_cache_refresh_lock`); mục 6.4 mới — cache dẫn
    xuất & khoá tạo lại cache; mục 13 — 2 nhóm menu popup + mục 13.4 "Epic ngoại lệ"; chương 21 — mở cho mọi role, "xem dưới quyền" theo phạm vi, mẫu số
    = 0 hiện "—", danh sách L02, hàng 9 thẻ KPI sau thiết kế lại, ma trận theo từng PM/SM.
  - **Giới thiệu sản phẩm** (`public/docs/Product_brochures.html`, v2026.10): R1 / R8 / R9 theo rule hiện hành, 2 badge SCOPE mới, mục 4.5 viết lại theo
    công thức Đạt / (Đạt + Fail), mục 4.8 mới tóm tắt cập nhật tháng 10/2026.
  - **Markdown**: `docs/ttm-dashboard-2-spec.md` (quyền truy cập, thứ tự phân nhóm, §7.1 widget row, ma trận PM/SM), spec Scoring §21 (D12),
    `brd/08-data-model.md` §23 (bảng cache, lease, Epic ngoại lệ), `brd/05` (ma trận có hiệu lực, xem dưới quyền, màn hình mặc định), `brd/16`.
  - **Ghi nhận khi review** (chưa sửa, cần quyết định của owner): MCP `get_ttm_dashboard` chưa kiểm tra quyền Xem `ttm_dashboard_2` của Ma trận phân
    quyền; TTM Dashboard cũ vẫn đếm / liệt kê Epic ngoại lệ ở ô Fail và pie chart; TTM-CNTT (QA) chỉ lấy MVP Done / Released (Pilot, Done chưa tính);
    3 lỗi lint có từ trước (`dashboard-new/page.tsx`, `EpicAlertsIframeModal.tsx`). Postgres local trên máy này không chạy nên chưa kiểm tra được
    migration `20261005*` ở local (Supabase đã đủ 73 migration).

## 2026-10-09

- **Cập nhật Tooltip và các trường thuộc tính tab Details trong Popup Duyệt Epic (`EpicBrowserModal.tsx`)**:
  - **Sử dụng Hover Tooltip chung**: Chuyển nút toggle `'Epic ngoại lệ'` sang dùng component `<Tooltip>` chung của ứng dụng (`@/components/ui/Tooltip`), với hiệu ứng hiển thị nhất quán, shadow và positioning chuẩn như các badge nhận xét ở màn hình Quản trị Epic.
  - **Cập nhật thuộc tính tab Details**: Bổ sung hiển thị 2 trường dữ liệu thực tế **Phân loại Epic** (`summary.epicType` / `summary.epicComplexityType`) và **Requirement Level** (`summary.requirementLevel`). Bỏ trường `Epic Status:` trùng lặp (đã có ở mục Status cột phải) và bỏ nhãn `Priority:` giả định từ ảnh ví dụ Jira. Cập nhật query trong `getEpicBrowserSummary` (`epic-browser-service.ts`) để cung cấp 2 trường này.

- **Bổ sung Badge nhận xét TTM-CNTT (`Pass TTM-CNTT` / `Fail TTM-CNTT`) trong Popup Duyệt Epic (`EpicBrowserModal.tsx`)**:
  - Thêm badge căn lề bên phải trên cùng dòng tiêu đề `'Giải trình Fail TTM'` hiển thị trực quan trạng thái nhận xét TTM-CNTT của Epic (như `Pass TTM-CNTT`, `Fail TTM-CNTT`, `Sai lệch dữ liệu`, `Epic ngoại lệ`).
  - Cập nhật `getEpicBrowserSummary` (`epic-browser-service.ts`) đánh giá Epic thông qua Epic Scoring Service (`loadScoringContext`, `loadEpicFacts`, `scoreEpic`) để trả về `ttmCnttVerdict` và `ttmCnttVerdictLabel`. Badge giúp người dùng nhận biết nhanh để rà soát đầy đủ các thông tin giải trình khi Epic bị Fail.

- **Tái thiết kế giao diện Popup "Duyệt Epic" (`EpicBrowserModal.tsx`) theo chuẩn Jira Issue View**:
  - **Header & Nút toggle đơn**: Breadcrumb hiển thị `<ProjectKey> / <EpicKey>`, tiêu đề Epic Summary cỡ lớn. Hàng nút phía trên thay bằng **nút toggle đơn duy nhất `'Epic ngoại lệ'`** kèm hover tooltip hiển thị diễn giải trạng thái True/False; bỏ phần 'Epic ngoại lệ' cũ ở chân popup.
  - **Tab Details**: Bố trí 2 cụm cột Trái / Phải hiển thị đầy đủ các thuộc tính của Epic; đã loại bỏ link `(View Workflow)` cạnh mục Status.
  - **Bỏ tab Description**.
  - **Tab "Issues in Epic" & Bảng phân cấp 4 cột** (`EpicIssuesTree.tsx`): Đổi tên tab Attachments thành `Issues in Epic`, giữ khung border nét đứt xung quanh, bỏ icon đám mây và text tải file. Bên trong hiển thị bảng phân cấp 4 cột (`Issue Type | Issue Key | Summary | Status`). Quy tắc lùi lề: Story lùi 3ch so với Epic, Subtask lùi 3ch so với Story.
  - **Panel "Giải trình Fail TTM" mới**: Đặt bên dưới panel `Issues in Epic`, thiết kế dạng 2 cụm cột Trái / Phải tương tự Details. Hiển thị thông tin nguyên nhân các khâu (BA, CO, DEV, PM/SM, PO, Pentest, SA, SIT/UAT, Lý do khác) được lấy trực tiếp từ DB/CSV (hiển thị `-` nếu rỗng). Cập nhật `getEpicBrowserSummary` (`epic-browser-service.ts`) để truy vấn đầy đủ 9 trường khâu này.
- **Bổ sung 10 trường mới vào CSV import adapter và bảng `issues`** (migration `20261009_add_epic_previous_status_and_khau_fields.sql`):
  - **Trường status trước đó**: `epic_previous_status` (CSV) -> `previous_status` (DB `VARCHAR(50)`), lưu trữ status trước đó của Epic (chủ yếu rỗng, chỉ xuất hiện ở một số trường hợp đặc biệt).
  - **9 trường thông tin vai trò nguyên nhân Fail TTM-CNTT & Ghi chú**: `epic_khau_ba`, `epic_khau_co`, `epic_khau_dev`, `epic_khau_pm_sm`, `epic_khau_po`, `epic_khau_pentest`, `epic_khau_sa`, `epic_khau_sit_uat`, `epic_note_ly_do_khac` (CSV) -> `khau_ba`, `khau_co`, `khau_dev`, `khau_pm_sm`, `khau_po`, `khau_pentest`, `khau_sa`, `khau_sit_uat`, `note_ly_do_khac` (DB `TEXT`).
  - **Cập nhật Import Engine & Adapters**: Cập nhật `RawJiraIssue` interface (`csv-parser.ts`), `mapCSVToRawIssues`, adapter Py Jira API (`py-jira-api-adapter.ts`) và quy trình upsert `processImport` (`import-service.ts`).
  - **Cập nhật Mô tả Schema & Tài liệu**: Cập nhật `db/schema.sql`, spec `brd/08-data-model.md` §7, tài liệu `public/docs/product-guide.html` §3.3. Đã chạy migration thành công trên Supabase và viết bổ sung unit test `py-jira-api-adapter.test.ts` (104 tests pass 100%).

- **PMS Project Core — 5 migration expand-only + DB local trên Docker (CHƯA áp dụng lên Supabase)**:
  - **Lý do**: module Projects bắt đầu ngày mai, nhưng bảng `projects` hiện tại chưa làm master được cho PMS: cột `ttm` (thuộc TTM) nằm trong bảng
    dùng chung; `source_project_key` kiêm cả định danh + khoá tích hợp Jira + khoá phân quyền + khoá cache; `project_category` chỉ là CHECK text nên
    không biểu diễn được năng lực theo loại. Nếu xây Projects lên nền này sẽ phải sửa lại.
  - **5 migration mới** (`20261009a`…`20261009e`), toàn bộ **chỉ THÊM**, không xoá cột nào đang dùng:
    - `project_types` + `project_type_capabilities` — danh mục loại dự án, seed 3 loại map từ `project_category` qua cột `legacy_category`;
      capability `DELIVERY_PROJECT` = CHECKLIST/MILESTONE/GANTT/IMPLEMENTATION_PLAN, `AGILE_TEAM` = PLANNING_PERIOD/BACKLOG/CAPACITY.
      **`DEPLOYMENT_TEAM` (Team Triển khai) đang gán tạm CHECKLIST+MILESTONE — cần chủ sở hữu nghiệp vụ xác nhận.**
    - `projects.project_code` + `projects.project_type_id` — mã nghiệp vụ PMS tách khỏi Jira key, backfill `project_code = source_project_key`.
    - `project_external_bindings` — ánh xạ project PMS ↔ hệ thống ngoài (JIRA/OPMS...), có `valid_from`/`valid_to`, unique theo
      `(system_code, UPPER(external_project_key))` để chặn đúng rủi ro "ABC" vs "abc" thành 2 master record.
    - `ttm_project_configs` — đưa cấu hình TTM ra khỏi `projects`; backfill `is_enabled = (projects.ttm = 'Y')`.
    - `project_members` — roster nhân sự nghiệp vụ (vai trò, allocation %, thời gian vào/ra), KHÁC `user_projects` vốn là grant phân quyền của IAM;
      backfill PM/SM hiện có thành `role_in_project = 'PM_SM'`.
  - **TTM không bị ảnh hưởng**: `projects.ttm`, `source_project_key`, `project_category` và `user_projects` giữ nguyên, mọi code TTM đọc như cũ.
    Khi làm UI Projects phải **dual-write** (`ttm_project_configs` + `projects.ttm`) cho tới khi TTM chuyển hẳn sang bảng mới.
  - **Trigger `trg_projects_fill_project_code`** (`projects_fill_project_code()`): phát hiện khi test với dữ liệu thật rằng đặt `project_code NOT NULL`
    làm **vỡ việc tạo dự án mới** — `saveProject` (`master-data-service.ts`) và route bulk import không biết cột này. `DEFAULT` không dùng được vì
    không tham chiếu được cột khác cùng dòng, nên dùng trigger điền từ `source_project_key`. Đây là cơ chế chuyển tiếp, bỏ ở bước contract.
  - **Sửa 3 migration lịch sử để `db:init` chạy được trên DB trắng** (lỗi có sẵn, không do lần này): `db/schema.sql` đã bị hand-edit bỏ
    `projects.lead_name` và `projects.project_key`, nên `20260811_sync_project_lead_assignments` + `20260812_reconcile_project_pm_sm_assignments` vỡ với
    "column project.lead_name does not exist", và `20260827_drop_project_key_use_source_key` vỡ ở `DROP COLUMN project_key`. Hai migration đầu là
    backfill dữ liệu một lần → bọc guard `information_schema` + `EXECUTE` (SQL động, vì SQL tĩnh vẫn bị phân giải tên cột kể cả trong nhánh IF không
    chạy); migration thứ ba đổi sang `DROP COLUMN IF EXISTS` + chỉ thêm UNIQUE khi chưa có. Các DB cũ đã ghi 3 file này trong `schema_migrations` nên
    không chạy lại.
  - **DB local trên Docker**: tạo database `ttm_tool` trong container `nextjs_postgres` đang chạy (từ `database/docker-compose.yml`, PostgreSQL 16.15)
    để không tranh cổng 5432. `.env.local` chuyển `DB_CONNECTION=local` với `devuser`/`ttm_tool`; đổi lại `supabase` để quay về DB hosted.
  - **Kiểm chứng**: `db:init` trên DB trắng chạy hết 78 migration (exit 0, 57 bảng). Chạy **down → up 2 lần**, lần thứ hai có dữ liệu thật (4 dự án,
    2 `user_projects`): backfill cho `UPDATE 4` project_code, `UPDATE 3` project_type_id (dự án không có `project_category` để NULL — đúng),
    `INSERT 4` binding, `INSERT 4` ttm config, `INSERT 2` member. Ba phép đối chiếu nhất quán (`ttm` ↔ `is_enabled`, binding ↔ `source_project_key`,
    `project_code` ↔ `source_project_key`) đều `true`. `npm test` 104/104, `tsc` pass, `next build` pass, app báo `dbTarget: local` / `dbStatus: pass`.
    Lint vẫn đúng 29 problems / 2 errors `set-state-in-effect` có từ trước, không phát sinh lỗi mới.
  - **CHƯA làm**: áp 5 migration này lên Supabase (chờ xác nhận — lưu ý `AGENTS.md` yêu cầu không để lệch schema giữa 2 DB lâu dài); code đọc/ghi các
    bảng mới; UI module Projects; `project_id` cho các bảng TTM; tách schema `iam`/`project`/`ttm`.
  - DB local hiện có 4 dự án dữ liệu mẫu (`WM`, `PAMS`, `NC`, `XX`) để màn Quản lý Dự án có nội dung khi test.
- **HLAD kiến trúc PMS + wave 1 cô lập module (không đổi schema, không đổi API/response/behavior của TTM)**:
  - **`docs/architecture/PMS-HLAD.md`** (mới): HLAD cho việc đưa TTM thành một bounded context trong PMS Platform — module ownership
    (IAM / Projects / TTM / Integration / Audit), schema ownership dự kiến (`iam`, `project`, `ttm`, `integration`, `audit`), `ProjectId` nội bộ tách
    khỏi Jira/OPMS key (`integration.project_external_bindings`), Ports & Adapters cho OPMS (API / IL / Excel / Markdown — kênh **chưa chốt**),
    transactional outbox + durable job trên OCP (`pms-web` / `pms-worker` / CronJob), 8 sơ đồ Mermaid, 8 ADR, risk register 14 mục và roadmap 14 increment.
    Tài liệu tách rõ *hiện trạng* / *chuyển tiếp* / *mục tiêu*; tên module–schema–API ở trạng thái mục tiêu **chưa tồn tại** trong source.
  - **`src/modules/{iam,ttm,integration}/public.ts`** (mới): facade công khai cho wave 1. Implementation vẫn gọi nguyên các service cũ
    (`auth-service`, `view-as-user-service`, `reports-service`, `report-access-scope`, `import-service`, `adapters/index`, `ttm-dashboard-2-cache-service`,
    `ttm-index-global-cache-service`) nên rule chấm điểm, parser CSV và semantics import **không đổi** — kể cả thứ tự tham số và default
    `MANUAL`/`System` của `processImport` (export lại dưới tên `executeImport`).
  - **6 route chuyển sang facade**: `auth/login`, `ttm-dashboard-2`, `ttm-dashboard-2/rows`, `reports`, `data-source/import`, `data-source/import/auto`.
    Giữ nguyên URL, JSON response, status code, thông báo lỗi và cookie. Riêng `ttm-dashboard-2` được rút orchestration + câu SQL `import_batches` ra khỏi
    Route Handler: chuyển vào use case `src/modules/ttm/application/get-ttm-dashboard-2.ts` và repository
    `src/modules/integration/infrastructure/legacy-import-batch-repository.ts` (`getLatestImportAggregatedAt`) — đây là route duy nhất trong nhóm từng
    `import pool from '@/lib/db'` trực tiếp.
  - **Enforcement**: thêm 6 block `no-restricted-imports` trong `eslint.config.mjs` (domain không phụ thuộc Next/pg/infrastructure; cross-module chỉ qua
    `public`; 6 route đã migrate không được import `@/lib/db` và các service cũ) — **chỉ áp cho `src/modules` và 6 route đó**, không áp toàn `src/lib`/`src/app`
    để không phá legacy. Thêm `src/modules/__tests__/module-boundaries.test.ts` (chạy bằng Node test runner sẵn có).
  - **Validation**: `npm test` 104/104 pass (102 cũ + 2 boundary test mới); `tsc --noEmit` pass; `next build` pass. Lint còn **2 error `set-state-in-effect`
    có từ trước** (`dashboard-new/page.tsx:206`, `EpicAlertsIframeModal.tsx:28`) — không nằm trong phạm vi thay đổi này; `src/modules` và 6 route đã migrate
    không phát sinh error/warning nào.
  - **Ghi chú môi trường (máy này)**: PowerShell chặn `npm.ps1` (Execution Policy) nên phải gọi `npm.cmd`, hoặc gọi trực tiếp
    `node node_modules/eslint/bin/eslint.js` / `node node_modules/typescript/bin/tsc` / `node node_modules/next/dist/bin/next build`. Terminal của agent
    không trả exit code đáng tin (luôn `-1`) và có thể trả về **trước khi** lệnh dài chạy xong — cách kiểm chứng đáng tin là ghi kết quả + file sentinel rồi đọc file.
  - **Chưa làm (theo đúng kế hoạch)**: module Projects nghiệp vụ (checklist / milestone-Gantt / backlog / health / risk / nhân sự), `ProjectId` + external
    binding, durable job/outbox, event-driven cache generation, multi-schema migration và `/api/v1`.

- **Review commit `b788207` ("Fix bug rules") và sửa các điểm phát hiện** (không đổi schema, không đổi code rule chấm điểm — giữ `scoring-11`):
  - **R8 — ghi rõ quy định "R4G Date không được khai báo trước"** (chủ sở hữu xác nhận là quy định công ty): Epic ghi trước R4G Date khi status chưa
    tới R4GOLIVE luôn là Sai lệch dữ liệu; Epic owner xoá trường R4G Date và ghi ngày dự kiến ở trường phụ khác. Hệ quả có chủ đích: Sai lệch dữ liệu
    thắng Fail — Epic có R4G Date tương lai muộn hơn Target, hoặc đang Fail vì quá Target rồi được nhập R4G Date tương lai, rời mẫu số cho tới khi
    sửa. Ghi vào spec §22, product-guide (Điều chỉnh R8), `meaning` của `REC_FIX_R4G_STATUS` (`catalog.ts`), comment `data-quality.ts`; thêm test
    "R8 (2026-10-09)" trong `scoring.test.ts`.
  - **Tạo lại cache khi đổi tên dự án / PM-SM**: dòng Epic trong cache còn lưu `projectName` và tên PM/SM, trước đây không kích hoạt tạo lại.
    `src/app/api/projects/route.ts` so sánh `cacheFootprint` trước/sau (key, Time to Market, và với dự án active: tên + Domain) cho tạo / sửa / xoá;
    import CSV luôn tạo lại. `src/app/api/users/route.ts` tạo lại khi danh sách dự án của user, hoặc họ tên / việc xoá user đang là PM/SM, thay đổi
    (`getPmSmCacheFootprint` trong `auth-service.ts`; route có `maxDuration = 300`).
  - **Bớt tạo lại cache thừa**: đổi tên / bật-tắt / xoá Domain chỉ tạo lại khi Domain có dự án active (`deleteDomain` trả về cờ này); đổi Domain của
    dự án inactive không tạo lại. Xoá Domain trả thêm `cacheRefreshing` và màn Quản lý Domain báo "đang tính lại".
  - **`scheduleDerivedCacheRefresh(source)`** (`daily-cache-service.ts`) thay cho cặp `getLatestImportBatchId()` + `after(...)` lặp ở 6 chỗ (domains,
    projects, black-listed-epics, ttm-scope-config, admin/scoring/mode) và thay `refreshDerivedCachesInBackground`. Batch id nay đọc trong `after()`,
    nên lỗi đọc batch không còn biến một lần lưu đã thành công thành 500.
  - **MCP ↔ Ma trận phân quyền** (`mcp-server.ts` 1.3.1, `feature-access.ts`): `list_epic_alerts` được giữ khi còn Xem Quản trị Epic **hoặc** Epic in
    PO; `get_epic_detail` khi còn Xem một trong 5 màn mở được Duyệt Epic (thêm Báo cáo Epic, TTM dashboard, Dashboard cũ) — trước đó chặn chặt hơn chính
    quy tắc "còn một màn hiển thị dữ liệu là được". Role của tool (`MCP_TOOL_ROLES`) nay kiểm tra **trước** ma trận, đúng như tài liệu. `registerTool`
    nhận `McpToolName` nên tool chưa khai báo bị `tsc` chặn (bỏ `throw` lúc chạy và `isMcpToolName`). Cập nhật test, product-guide 16.3, BRD 15.
  - Dọn: JSDoc `ttmFailKind` (`epic-row-verdicts.ts`) ghi đúng cả hai loại Fail đều trong mẫu số; `storedTtmFlag` → `storedProject`.
- **Scoring Engine — R10 "R4G Date ở tương lai"** (`SCORING_CODE_VERSION` → `scoring-12`, spec §23; không đổi schema): theo quy định công ty "R4G Date
  không được khai báo trước", Epic đã ở status ≥ R4GOLIVE (hoặc Reopened) mà R4G Date còn ở tương lai nay là Sai lệch dữ liệu — badge mới
  `ANOMALY_R10_R4G_DATE_IN_FUTURE` + khuyến nghị `REC_CLEAR_FUTURE_R4G_DATE` (`rules/data-quality.ts`, `recommendations.ts`, `catalog.ts`, `select.ts`,
  `projection.ts`, `parity.ts` — nhãn đối chiếu D10). Cùng với R8, mọi Epic có R4G Date tương lai đều là Sai lệch dữ liệu (trừ Cancelled); nhóm "chưa
  kết luận" L05ac chỉ còn Epic không tính được Target (đổi nhãn ở `ttm-dashboard-2/page.tsx`, `epic-row-verdicts.ts`, `ttm-funnel-summary.ts`).
  `EpicAnomalyCode` thêm `R4G_DATE_IN_FUTURE` (index 10) chỉ để dòng chiếu mang được vi phạm; bảng `epic_data_anomaly_violations` không nhận rule này
  nên không cần migration. Reopened + R4G tương lai tính là R10 (diễn giải của agent — xem spec §23). **Cần "Tạo lại cache"** để áp dụng. Cập nhật
  popup "Logic cảnh báo" (mục 8), product-guide mục 9.1 / chương 21, Giới thiệu sản phẩm, BRD 16, `docs/ttm-dashboard-2-spec.md`, test.
- **Chuẩn popup chung cho toàn ứng dụng** (BRD 09 §8, product-guide mục 13): mọi popup (thông tin, xác nhận, form) dùng chung style của popup
  "Quản trị Epic" ở TTM Dashboard 2 — nền tối + blur, khung `rounded-2xl` / `shadow-2xl`, header 56px có ô icon và nút đóng vuông.
  - `src/components/ui/Modal.tsx` là nguồn duy nhất: `Modal` (bỏ prop `blurBackdrop` — nay luôn blur; thêm `icon`, `layer`, cỡ `3xl` = 1600px) và các
    mảnh dùng chung `MODAL_BACKDROP_CLASS`, `MODAL_FRAME_CLASS`, `ModalHeader`, `useModalBehavior`. Các popup bố cục riêng chuyển sang dùng các mảnh
    này: `AppConfigModal`, `SystemAdminModal`, `EpicBrowserModal`, `EpicAlertsIframeModal`, `AdPopupCard`.
  - `useModalBehavior`: popup chồng nhau thì chỉ popup trên cùng nhận Escape, và trang chỉ cuộn lại khi popup cuối cùng đóng (trước đây Escape đóng
    cả hai, popup con đóng là mở khoá cuộn của popup cha).
  - **Bỏ `confirm()` / `alert()` / `prompt()` của trình duyệt** (15 + 3 + 1 chỗ): thay bằng `confirmDialog` / `alertDialog` / `promptDialog`
    (`src/components/ui/dialogs.tsx`, host `DialogHost` gắn ở `AppShell`). Nút "Chèn liên kết" của `RichTextEditor` giữ và khôi phục vùng chọn vì
    popup lấy focus khỏi editor.
  - Popup "Logic cảnh báo" rộng hơn: `maxWidth="3xl"` (1600px, cao tối đa 92dvh) thay cho 1152px.
  - Chưa kiểm tra bằng mắt trên trình duyệt (phiên này chưa chạy app); `next build`, `tsc`, test đều qua. 2 lỗi lint `set-state-in-effect`
    có từ trước (`dashboard-new/page.tsx`, `EpicAlertsIframeModal.tsx`) vẫn còn.
- **TTM Dashboard 2 — popup của dòng "Chưa gán Domain" / "Chưa gán PM/SM" liệt kê sai Epic** (không đổi schema): dòng placeholder có
  `linkValue = null` nên drill-down mở Quản trị Epic **không kèm bộ lọc** và liệt kê Epic của mọi Domain (ON, TESAV…), trong khi con số trên ma
  trận vẫn đúng. Nay dòng này mang theo danh sách dự án của chính nó (`TtmBreakdownItem.linkProjects`, `src/lib/ttm-funnel-summary.ts`) và popup lọc
  theo các dự án đó (`dimensionScope` trong `DashboardInsights.tsx`) — Domain và PM/SM đều là thuộc tính của dự án nên danh sách khớp đúng con số.
  `PAYLOAD_VERSION` của `ttm_dashboard_2_cache` lên 8 (cache cũ tự dựng lại). Lát cắt "Chưa xác định" của pie Đơn vị yêu cầu vẫn chưa lọc được
  (thuộc tính theo từng Epic, Quản trị Epic chưa có bộ lọc "không có đơn vị"). Kiểm tra dữ liệu Supabase 09/10: 35 Epic "Chưa gán Domain" đều là Epic
  `DT-…` — Jira project `DT` chưa được khai báo ở Quản lý Dự án (nên không có Domain / tên dự án / PM-SM); ngoài ra dự án `NC` (Time to Market = N)
  cũng chưa gán Domain nhưng đã bị loại từ L02.
- **Epic ngoại lệ — Scoring Service không xét, widget TTM Dashboard 2 không đếm** (`SCORING_CODE_VERSION` → `scoring-13`, spec §24; không đổi
  schema). "Epic ngoại lệ" nay là tên gọi chung của Epic trong danh sách Black listed **và** Epic thuộc dự án Time to Market = N.
  - **Scoring Service** (`src/lib/scoring/score-epic.ts`): Epic có `ttmExclusion` không chạy rule Chất lượng dữ liệu / TTM-CNTT / TTM-E2E / Release /
    Pha / khuyến nghị — scorecard chỉ còn badge ghi nhận ngoại lệ (+ "Ngoài phạm vi" nếu có, để L01 của phễu không đổi). Trước đó các Epic này vẫn
    được chấm đầy đủ, chỉ không vào chỉ số. Hệ quả trên dòng hiển thị: không Sai lệch dữ liệu / Fail / Chậm tiến độ / Chờ – Giải trình golive, ô
    pha không còn dấu hoàn thành / trễ; cột ngày (Target, baseline) giữ nguyên.
  - **TTM Dashboard 2** (`summarizeInsights` trong `src/lib/ttm-funnel-summary.ts`): 4 thẻ vận hành CẢNH BÁO, SAI LỆCH, CHỜ GOLIVE, GIẢI TRÌNH nay
    bỏ Epic ngoại lệ (chỉ số, ma trận, pie chart đã bỏ từ 05/10). `PAYLOAD_VERSION` của `ttm_dashboard_2_cache` → 9. Dữ liệu Supabase 09/10 (87 Epic
    ngoại lệ không Cancelled): SAI LỆCH 194 → 151, GIẢI TRÌNH 166 → 164, hai thẻ còn lại không đổi.
  - Badge đổi nhãn: "Epic ngoại lệ (Black listed)" / "Epic ngoại lệ (dự án TTM = N)" (`catalog.ts`); bộ lọc Nhận xét và popup L02 dùng cùng cách gọi.
    Đối chiếu Scoring: mọi lệch kết luận của Epic ngoại lệ mang nhãn D12 (`parity.ts`).
  - **Cần "Tạo lại cache"** để áp dụng. Ở engine `legacy`, danh sách mở từ 4 thẻ vận hành vẫn còn Epic ngoại lệ (engine cũ vẫn chấm chúng) — lệch
    đã biết, production đang chạy `scoring`. Cập nhật popup "Logic cảnh báo", product-guide mục 13.4 / chương 21, Giới thiệu sản phẩm, BRD 16,
    `docs/ttm-dashboard-2-spec.md`, mô tả MCP; test mới trong `black-listed-epics.test.ts`, `parity.test.ts`.

## 2026-10-10

- **Cấu hình cảnh báo: Bổ sung panel 'Phạm vi rule Sai lệch dữ liệu', cập nhật Scoring Service và thu gọn các panel (`/admin/status-alert-rules`)**:
  - **Màn hình Cấu hình cảnh báo (`StatusAlertRulesSettings.tsx`)**:
    - Chuyển toàn bộ các panel cấu hình sang chế độ mặc định thu gọn (collapse). Cho phép click vào header/title của mỗi panel để đóng/mở linh hoạt kèm icon `CaretDown`.
    - Thêm panel cấu hình **'Phạm vi rule Sai lệch dữ liệu'** (`AnomalyScopeConfigPanel.tsx`):
      - Master toggle (`Enabled` / `Disabled`) trên cùng để Bật/Tắt toàn bộ form áp dụng phạm vi đánh giá.
      - Ma trận cấu hình ma trận gồm 8 rule Sai lệch dữ liệu (`R1`, `R3`, `R4`, `R5`, `R6`, `R8`, `R9`, `R10`) theo chiều dọc; 4 cột điều kiện ngày: `'Ngày tạo Epic >'`, `'Ngày Start Date >'`, `'Ngày R4G Date >'`, `'Ngày Due Date >'`. Mỗi ô gồm date input kèm nút reset icon `ArrowCounterClockwise` để xoá rỗng cấu hình.
      - Cuối mỗi hàng là 'Rule toggle' (`Enabled` / `Disabled`) để bật/tắt áp dụng phạm vi cho riêng rule đó.
  - **Scoring Service (`parameters.ts`, `registry.ts`, `data-quality.ts`, `scoring.test.ts`)**:
    - Bổ sung cấu hình `anomaly.scopeConfig` trong `ScoringParameters`, nâng `SCORING_CODE_VERSION` lên `scoring-15`.
    - Khi Master toggle = `Enabled`: từng rule có Rule toggle = `Enabled` chỉ đánh giá các Epic thỏa mãn đồng thời các điều kiện ngày được cấu hình: `(jiraCreatedAt > Ngày tạo) AND (startDate > Start Date) AND (r4gDate > R4G Date) AND (dueDate > Due Date)`. Bỏ qua điều kiện nếu trường cấu hình rỗng hoặc `"none"`. Epic không thỏa mãn điều kiện phạm vi sẽ không bị coi là vi phạm rule đó.
    - Lớp dữ liệu L03 tự động giữ lại các Epic không bị gán Sai lệch dữ liệu trong phạm vi này (`L03 = L02 − Sai lệch dữ liệu`). Khi Master toggle = `Disabled`, áp dụng toàn bộ như hiện nay.
  - **Backend API & Service (`anomaly-scope-config-service.ts`, `api/anomaly-scope-config/route.ts`)**:
    - Quản lý đọc/ghi cấu hình qua `scoring_parameters` (param_key `'anomaly.scopeConfig'`), tự động đồng bộ hóa phiên bản và trigger tính lại cache khi lưu.

- **Bổ sung khuyến nghị 'Thiếu lý do Fail TTM' & Cải tiến TTM Dashboard 2, Quản trị Epic và Duyệt Epic**:
  - **Scoring Service (`src/lib/scoring/rules/recommendations.ts`, `catalog.ts`, `registry.ts`, `types.ts`, `src/lib/scoring-facts-service.ts`)**:
    - Bổ sung khuyến nghị `REC_MISSING_FAIL_REASON` (`Thiếu lý do Fail TTM`) thuộc trục `TTM_CNTT`.
    - Điều kiện áp dụng: Epic bị ghi nhận `CNTT_FAIL` (Đánh giá fail TTM-CNTT) và toàn bộ 9 trường lý do fail TTM (`epic_khau_ba`, `epic_khau_co`, `epic_khau_dev`, `epic_khau_pm_sm`, `epic_khau_po`, `epic_khau_pentest`, `epic_khau_sa`, `epic_khau_sit_uat`, `epic_note_ly_do_khac`) đều rỗng, chỉ gồm khoảng trắng hoặc có giá trị `"none"`.
    - Tăng `SCORING_CODE_VERSION` lên `scoring-14`.
  - **Quản trị Epic (`/epic-alerts-15`) & Bộ lọc (`ScoringBadges.tsx`, `epic-row-verdicts.ts`, `scoring/select.ts`)**:
    - Hiển thị badge `'Thiếu lý do Fail TTM'` màu cam (recommendation) cho Epic thỏa mãn điều kiện.
    - Hỗ trợ bộ lọc preset `MISSING_FAIL_REASON` và deep link `alert=MISSING_FAIL_REASON`.
  - **TTM Dashboard 2 (`DashboardInsights.tsx`, `ttm-funnel-summary.ts`, `ttm-dashboard-2-cache-service.ts`)**:
    - Thay thế subtitle của widget KPI `'Fail TTM-CNTT'`: hiển thị `{số lượng} thiếu lý do Fail` với `{số lượng}` in đậm màu đỏ (`text-[#dc2626] font-bold`).
    - Gắn link mở popup Quản trị Epic lọc danh sách tương ứng (`alert: 'MISSING_FAIL_REASON'`).
    - Nâng cấp `PAYLOAD_VERSION` của cache TTM Dashboard 2 lên 10.
  - **Popup Duyệt Epic (`EpicBrowserModal.tsx`, `epic-browser-service.ts`)**:
    - Cho phép click vào `Epic Key` (ở breadcrumb và header) để mở trực tiếp issue Jira trong tab mới của trình duyệt web (`target="_blank"` kèm icon `ArrowSquareOut`).
    - Tại tab "Giải trình Fail TTM", bổ sung badge `'Thiếu lý do Fail TTM'` bên cạnh badge `'Fail TTM-CNTT'` nếu Epic bị Scoring Service gán badge này.

- **Cải tiến Popup Duyệt Epic (`EpicBrowserModal.tsx`) & Giám sát tiến trình Cache toàn hệ thống**:
  - **Thêm trường Created Date**: Bổ sung `Created Date` vào cụm cột 2 (cột phải) trong tab Details của `EpicBrowserModal.tsx`, đọc từ `jiraCreatedAt` / `createdAt` trong DB.
  - **Popup cảnh báo khi toggle 'Epic ngoại lệ'**: Tích hợp `ConfirmDialog` trước khi thực hiện toggle:
    - Khi chuyển False -> True: cảnh báo *"Đánh dấu Epic này ngoại lệ sẽ loại bỏ khỏi tất cả các tính toán và cảnh báo Time to Market, bạn có đồng ý không ?"*.
    - Khi chuyển True -> False: cảnh báo *"Epic sẽ được đưa trở lại các tính toán và cảnh báo Time to Market, bạn có đồng ý không ?"*.
  - **Thông báo Toast & Chỉ báo Cache toàn hệ thống**: Nâng cấp `DailyCacheWarmer` (`DailyCacheWarmer.tsx`) theo dõi trạng thái `isRebuilding` từ `derived_cache_refresh_lock` trên tất cả các màn hình:
    - Hiển thị toast `'Hệ thống đang tính toán lại cache'` kèm floating indicator khi có tiến trình tạo cache chạy.
    - Hiển thị toast `'Tạo Cache hoàn thành'` khi tiến trình hoàn tất.
    - Cơ chế kích hoạt nhanh: phát sự kiện `notifyCacheRefreshTriggered()` ngay sau các thao tác thay đổi ngoại lệ/dự án/domain/import để phản hồi ngay lập tức.
  - **Tối ưu triệt để tốc độ mở Popup Duyệt Epic**:
    - Thay thế các CTE quét toàn bộ database (`LATEST_ISSUES_CTE`, `STORIES_CTE`, `RESOLVED_DESCENDANTS_CTE`) trong `getEpicBrowserRoot` bằng truy vấn có chỉ mục trực tiếp theo `epicKey`.
    - Tối ưu `getEpicBrowserSummary` và `computeEpicPhaseCompletionByEpicKey` (`epic-phase-completion-service.ts`) lọc chính xác theo `epicKeys`, không quét Story/Subtask toàn bộ DB.
    - Rút ngắn thời gian tải popup từ 3-5 giây trên production xuống chỉ còn dưới 50ms.

- **Gỡ font `.otf` bản quyền và `mockup.rar` khỏi git.** Repo đang **public**, nên 8 file
  `Intelligent_Design_-_AvertaStdCY-*.otf` (~1MB, font desktop nguyên bản, cài được) ở
  `projects/business/mockup/assets/fonts/` là phân phối lại font thương mại — EULA foundry thường
  cấm, kể cả khi công ty có licence dùng trong sản phẩm. Thêm `*.otf`/`*.ttf`/`*.rar` vào
  `.gitignore`; file vẫn còn trên đĩa, chỉ không còn được track.
  - `projects/business/mockup/assets/pms-tokens.css`: 8 `@font-face` trỏ `.otf` → **3 `@font-face`**
    trỏ `../../../../src/app/fonts/averta-std-cy-{400,600,700}.woff2`, tức dùng chung đúng bộ
    WOFF2 đã subset mà app thật nạp. Mockup giờ render **giống production** thay vì giống bộ font
    đầy đủ — chính xác hơn khi đối chiếu thiết kế. Hệ quả weight theo thuật toán khớp font của CSS:
    300 và 500 render bằng 400, 800 render bằng 700 (không phải faux-bold).
  - **NGOẠI LỆ CÓ CHỦ ĐÍCH**: `src/app/fonts/*.woff2` VẪN được commit, vì `src/app/layout.tsx` nạp
    trực tiếp qua `next/font/local` và build trên Vercel không có `../ias-design/fonts` để sinh lại.
    Không gỡ 3 file này nếu không muốn vỡ deploy.
  - Đã cập nhật `projects/business/mockup/index.html` (3 chỗ tài liệu còn ghi "8 weight,
    `assets/fonts/`") cho khớp thực tế.
  - Kiểm chứng: `node scripts/check-mockup.mjs` sạch (11 HTML · 8 JS · 74 icon) · 3 đường dẫn
    WOFF2 mới resolve đúng · `tsc --noEmit` sạch · `npm test` **272/272**.
  - **CHƯA XỬ LÝ XONG**: commit cũ `62f2235` vẫn còn trong lịch sử public qua `refs/pull/2/head`
    (ref do GitHub quản lý, admin cũng không xoá được). Muốn sạch hẳn cần owner `dminhbb` chuyển
    repo sang **private** hoặc yêu cầu GitHub Support purge. Đã báo owner.

- **Đóng gói đợt IAS Design System thành nhánh `feature/ias-design-system-adoption`** để chủ sở
  hữu review trước khi vào `main`. Lưu ý cho phiên sau: `origin/main` đã chạy trước 4 commit
  (`a5d5034` Phạm vi Sai lệch dữ liệu, caching services, Epic details dialog, import adapter)
  trong khi `main` local có 2 commit PMS chưa push, nên nhánh này **đã phân kỳ** với remote.
  Bốn file giao nhau cần resolve khi merge: `daily_change_log.md`, `version.json`,
  `src/components/epic-browser/EpicBrowserModal.tsx`,
  `src/components/ttm-dashboard-2/DashboardInsights.tsx`.

- **IAS Design System — Nhịp B/Task 10-13 + Task 14: codemod token toàn app, dọn doc, đóng đợt**.
  - **Codemod** `scripts/codemod-ias-tokens.mjs` (bảng map tường minh, đọc review được, có
    `--dry`): **193 hex + 527 class palette thô + 62 cỡ chữ** trên **25 file**. Phạm vi CÓ CHỦ
    ĐÍCH chỉ là màu trong **ngữ cảnh CSS** — class Tailwind arbitrary value
    (`text-[#1463f7]` → `text-[var(--color-text-brand)]`) và class bảng màu mặc định
    (`text-slate-500` → `text-fb-text-placeholder`). **KHÔNG** đổi hex trong chuỗi JS /
    thuộc tính SVG, vì thuộc tính SVG không phải CSS nên `fill="var(--x)"` không resolve —
    phải chuyển sang `style={{ fill }}`, tức sửa cấu trúc.
  - Chuẩn bị bằng `scripts/audit-distinct-colors.mjs` (mới): liệt kê **80 hex + 142 class màu
    riêng biệt** đang dùng, để dựng bảng map từ số liệu thật thay vì đoán. Phát hiện
    `#1463f7` một mình chiếm **144/322 hex**.
  - **Hạ sàn lint từ 12px về 11px** — quyết định quan trọng: `text-[11px]` chiếm **127/201**
    chỗ "dưới sàn", và **11px chính là spec component của IAS** (header bảng 11px/700, Badge
    medium, status pill). Ép 127 chỗ lên 12px sẽ nới mỗi ô bảng ra và **tái sinh đúng lỗi
    tràn** mà cả đợt này đi sửa. Nâng các NHÃN ngoài bảng lên Caption 12px là việc theo từng
    màn hình. Hai sàn giờ tách bạch: 12px cho chữ tự đặt, **11px là sàn cứng**.
  - Thêm 2 token `--color-fb-accent` / `--color-fb-accent-soft` vào `@theme`: app dùng tím cho
    một vai trò THỨ TƯ bên cạnh success/warning/danger (chỉ số QA, "Sai lệch dữ liệu", nhãn
    phân loại), trước đây đi bằng `text-purple-700`/`bg-purple-600` — bảng màu thô.
  - **Task 13**: thêm 3 entry thiếu vào `PAGE_HEADERS` (`src/lib/app-screens.ts`) cho
    `/data-review`, `/sso/authorize`, `/sso-demo` — trước đây header của chúng hiện SAI thành
    "Quản trị nguồn dữ liệu" do AppShell fallback về `PAGE_HEADERS['/']`. Sửa lỗi hiển thị,
    không đổi hành vi.
  - **Hoàn tác một thay đổi của chính codemod**: ở Alert trang login, nó đổi riêng màu chữ
    `#8B4513` → `--color-text-warning` (#946200) trong khi giữ nền hồng `#FFC0CB` — tương
    phản TỤT từ ~4.6:1 xuống ~4.0:1. Đã trả về nguyên bản. Chuyển cả tổ hợp sang bộ error của
    IAS thì đúng chuẩn nhưng bỏ màu hồng chủ sở hữu chọn, tức đổi ý định thiết kế → cần
    quyết định của chủ sở hữu, đã ghi vào baseline.
  - **Kết quả**: hex **341 → 133** (−61%) · class palette thô **593 → 42** (−93%) · chữ dưới
    sàn 11px **215 → 4** (−98%) · `!important` trong CSS route **18 → 4**.
    Còn lại là loại nợ KHÁC: màu trong chuỗi JS/SVG prop (41 chỗ ở phễu ttm-dashboard-2,
    21 chỗ bảng tra màu trạng thái 3 màn Epic, 7 chỗ `PALETTE` donut), 40 class palette ở
    `VisitCounterPanel` (chip nền tối, map sang token mặt sáng sẽ phá tương phản), và các
    ngoại lệ hợp lệ (swatch brand, HTML server-render, canvas captcha, `#000000` của AGENTS.md).
  - **Task 14**: `docs/design/IAS-DESIGN-ADOPTION.md` cập nhật đầy đủ — hai cái sàn 12/11px,
    mục Codemod, bảng ngoại lệ hợp lệ, bảng việc còn lại kèm lý do từng việc cần sửa cấu trúc.
    `design-system-spec.md` đánh dấu HẾT HIỆU LỰC kèm bảng đối chiếu 5 điểm sai so với code.
    `DESIGN.md` đánh dấu SUPERSEDED (vẫn là tài liệu của brand `wise`). Xoá
    `tailgrids.config.json`.
  - `tsc --noEmit` sạch · `npm test` **272/272** · `next build` thành công cả 22 route.
    Lưu ý: `eslint src` có 1 error `setState synchronously within an effect` — đã kiểm chứng
    qua `git diff` là **có trước**, 12 chỗ khớp "effect/setState" trong diff của tôi đều chỉ
    là `onClick={() => setX('')}` nằm trong câu className.

- **IAS Design System — Nhịp B/Task 10 (phần 1): sửa tràn chữ ở KPI strip của `/dashboard-new`**.
  Nguyên nhân gốc do user chỉ ra qua ảnh chụp tile "TTM-CNTT (QA) / Chưa có Epic MVP Done/Released":
  ô text có `min-w-0` nên được phép CO LẠI, nhưng `<p>` bên trong **không có `overflow: hidden`**
  → chữ vẫn vẽ ra ngoài hộp đã co, và token `Done/Released` không có khoảng trắng để ngắt nên
  tràn hẳn qua viền card. Cộng thêm ring 56px + gap 12 + padding 24 = 92px cố định trong tile chỉ
  ~115px ở `lg:grid-cols-5`.
  - Thêm class `.ias-truncate` (`src/app/ias-tokens.css`) cho flex/grid child — khác
    `.ias-td-truncate` ở chỗ không khoá `max-width: 220px` (ô bảng cần, flex child thì bề rộng
    đã do cha chặn). `TruncationTooltip` giờ nhận cả hai selector, nên **hover ra bubble đầy đủ**
    đúng như yêu cầu.
  - `src/app/dashboard-new/page.tsx` — viết lại `renderKpiStrip`: hai grid
    `grid-cols-2 sm:grid-cols-4 lg:grid-cols-5|4` → `.ias-tile-grid`
    (`repeat(auto-fit, minmax(190px, 1fr))`, tile **xuống dòng thay vì bị nén**); nhãn 10px
    uppercase → 12px Caption sentence case; MỌI dòng chữ mang `.ias-truncate`; ba dòng phụ chứa
    2-3 link bỏ `flex flex-wrap` (mỗi link một dòng → tile cao 5-6 dòng, kéo cao cả hàng 9 tile)
    về một dòng nowrap — **mọi link vẫn bấm được**, không đổi deep-link nào.
  - Thêm helper `ringGradient()` gom 3 biểu thức `conic-gradient` trùng nhau: hex cung
    `#0866ff`/`#7c3aed`/`#059669` → `--color-bg-brand`/`--color-accent-500`/`--color-bg-success-solid`,
    track `#e4e6eb` (màu control của Facebook, không thuộc hệ màu nào của app) →
    `--color-border-default`. Ring nhỏ lại 48px để phần cố định còn 82px.
  - Sắc thái cảnh báo chuyển từ viền màu + class palette thô (`border-red-200 bg-red-50/50
    text-amber-700 border-purple-200 bg-sky-50/50` …) sang **nền tint + màu chữ** của IAS
    (`--color-bg-error`/`--color-bg-warning`/`--color-accent-100`/`--color-primary-50`) — IAS chỉ
    có một màu viền card duy nhất.
  - Nợ kỹ thuật giảm: chữ dưới sàn 12px **215 → 201** (`dashboard-new` 38 → 24) · hex
    **331 → 322** (`dashboard-new` 46 → 37) · class palette thô **591 → 567**. Baseline trong
    `ias-typography.test.ts` + `design-debt.test.ts` đã hạ theo — chính hai test đó fail để
    nhắc hạ, đúng cơ chế "baseline chỉ được co lại".
  - `tsc --noEmit` sạch · `npm test` 271/271 pass.

- **Chuẩn hoá toàn bộ giao diện theo IAS Design System — Nhịp A: dựng bộ design system (Task 1-9)**.
  Mục tiêu: sửa tràn chữ / tràn viền / màu không nhất quán, KHÔNG đổi function hay non-function.
  Chuẩn mới: `docs/design/IAS-DESIGN-ADOPTION.md` (nguồn tham chiếu thiết kế duy nhất từ nay).
  - **Cửa gate font**: `scripts/check-font-vietnamese.mjs` + `src/lib/design-system/font-cmap.ts`
    (parser cmap WOFF2/sfnt tự viết, không thêm dependency). Kiểm chứng "Averta Std CY" — CY là
    biến thể **Cyrillic**, nếu thiếu khối U+1EA0–U+1EF9 thì browser fallback theo TỪNG GLYPH và
    chữ có dấu lệch ngay trong cùng một từ. Kết quả: **ĐỦ 100%** (134/134 codepoint × 3 weight).
    `scripts/build-brand-font.py` subset Latin+Vietnamese → `src/app/fonts/averta-std-cy-{400,600,700}.woff2`,
    ~30KB/weight (từ ~131KB mỗi file .otf). **Bộ font không có weight 500** → type scale 500 render bằng 400.
  - **Tầng token 3 tầng** (`src/app/ias-tokens.css` mới): raw scale IAS + 36 semantic alias →
    compat layer `:root[data-brand="ias"]` trong `globals.css` → `@theme` → class có sẵn trong JSX.
    Nhờ vậy 22 route đổi màu **không sửa một dòng JSX nào**. Chữa xung đột nặng nhất: `--accent`
    từ `#1c6e2e` (xanh lá rừng, brand wise) / `#0284c7` (legacy) về `#141ED2`, khớp với hex
    `#0866ff`/`#1463f7` mà dashboard đang vẽ ring.
  - **Brand mới `ias` làm mặc định** (`src/lib/theme-brand.ts`, `AppearancePanel.tsx`). Giữ
    nguyên cả 3 brand `wise`/`legacy`/`pink` để không lấy đi lựa chọn nào. Sidebar sang navy
    `#0D0D2B` — token navy scope trong `.sidebar-surface`, kèm rule reset cho popover UserMenu
    (nó `position:absolute` BÊN TRONG sidebar, khác `NavigationGroupMenu` đã portal ra body).
  - **Sửa lỗi font toàn app** (`src/app/layout.tsx:43`): bỏ `font-sans` khỏi `<body>`. Class đó
    (0-1-0) đè `body { font-family }` (0-0-1) nên app **render bằng Segoe UI**, không phải Inter
    đã preload — metric chữ Việt rộng hơn làm mọi con số px cứng (`w-9`, `min-w-[1160px]`,
    `grid-cols-[0.62fr…]`) lệch, một tác nhân hệ thống của lỗi tràn chữ. Cùng lỗi này làm
    `[data-brand="legacy"] body` và `[data-brand="pink"] body` chưa từng có hiệu lực.
  - **Type scale + sàn 12px**: 10 utility class `.ias-*`. Overline 10px bị loại (IAS không phát
    hành class cho nó). Thêm contract chống tràn: `.ias-td-truncate`, `.ias-clamp-2`,
    `.ias-shrinkable`, `.ias-tile-grid`, `.ias-filter-control`, `.ias-tooltip-bubble`.
  - **Primitive**: `.ias-btn` (5 variant × 3 size), `.ias-card`, `.ias-status` (6 trạng thái
    dot+pill), `.ias-tag`, `.ias-table` (header sentence case, lưới td 0.5px, `.ias-sticky-col`
    cho cột định danh, `.ias-total-row`). Mỗi rule mang CẢ selector mới và
    `[data-brand="ias"] .ui-*`, nên `ui/Button.tsx`/`Card.tsx`/`Badge.tsx`/`Table.tsx` đổi diện
    mạo mà **giữ nguyên API props**. `Badge.tsx` thêm prop `dot`/`shape` (mặc định tắt).
  - **Tooltip cho ô bị cắt** (`src/components/ui/TruncationTooltip.tsx`, mount 1 lần trong
    AppShell): `position:fixed` + `getBoundingClientRect()` thay cho attribute `title`, vì
    `overflow-x:auto` của vùng cuộn bảng làm `overflow-y` thành auto và clip bubble absolute.
    Khôi phục dữ liệu đang bị mất ở các ô `truncate` không có `title`.
  - **Dọn CSS leak chéo route** (`src/app/ttm-shared.css` mới): hai dashboard thôi
    `import '@/app/epic-alerts-15/epic-alerts-15.css'` (global CSS của route khác, kéo theo
    `:root{--ttm-*}` và `.has-filter{…!important}` ra toàn document, giá trị cuối phụ thuộc thứ
    tự nạp chunk). Remap `--ttm-*` sang semantic alias IAS, đặt ở `:root[data-brand="ias"]`
    (0-2-0) để thắng `:root` của 3 file route bất kể thứ tự nạp. Bỏ `!important` trong nhóm
    `.has-filter` của cả 3 file. **Phát hiện thêm**: `--ttm-font` khoá cứng `"Segoe UI"` +
    `.ttm-app{font-family}` khiến 5 màn hình nặng nhất chưa bao giờ dùng font brand. Clamp bề
    rộng `.ttm-select`/`.ttm-field` giờ là MẶC ĐỊNH (trước chỉ có trong biến thể
    `.ttm-toolbar-row` mà 2 dashboard không dùng) → sửa tràn hàng filter.
  - **Lint chống tái phát** (`src/lib/design-system/__tests__/`, 7 file test, +118 test):
    baseline đo được hex 331 · rgb 8 · class palette thô 591 · chữ dưới sàn 12px 215 ·
    `<Button>` không ghi variant 83/131. Baseline **chỉ được co lại**. Cộng lint: không
    `font-sans`, không import CSS chéo route, `.ias-td-truncate` phải có `max-width`, bubble
    phải `position:fixed`. Công cụ đo: `scripts/audit-design-debt.mjs`,
    `scripts/audit-token-contrast.mjs`, `npm run ds:check-font`.
  - **Kết quả contrast WCAG AA**: brand `ias` sạch nhất (1 cặp dưới AA) so với wise 4 / legacy 5
    / pink 4. Ghi nhận 2 khiếm khuyết của chính palette IAS: `--color-text-success` `#00966D`
    chỉ 3.76:1 (đã chữa bằng `--color-success-300` `#0B7659`, token có sẵn trong IAS), và
    `--color-text-secondary` `#6E7191` trên nền trang đạt 4.38:1 (thiếu 2.7%, chưa sửa).
  - **Tài liệu**: `design-system-spec.md` đánh dấu HẾT HIỆU LỰC (nó ghi 11.5px vs 14px thật,
    `#0866ff` vs xanh lá, Geist vs Inter, và trộn 3 visual language). `DESIGN.md` đánh dấu
    SUPERSEDED, giữ làm tài liệu brand `wise`. Xoá `tailgrids.config.json` (metadata vô dụng,
    TailGrids không có trong `package.json`).
  - **Chưa làm — Nhịp B (Task 10-13)**: dọn hex/class palette thô trong JSX và sửa các chỗ tràn
    còn lại theo từng màn hình (dashboard-new + ttm-dashboard-2 → epic-alerts-15 + epic-in-po +
    reports → admin/* → màn phụ + legacy). Các màn này **đã nhận** toàn bộ thay đổi của Nhịp A
    qua tầng token. Phân đợt chi tiết ở cuối `docs/design/IAS-DESIGN-ADOPTION.md`.
  - `npm test` 271/271 pass · `next build` thành công cả 22 route.

- **Mockup Quản lý dự án: bỏ luồng phê duyệt + sửa icon vỡ + làm lại bảng danh mục** (`projects/business/mockup/`):
  - **Bỏ hết phần phê duyệt** theo yêu cầu "nội dung chỉ dừng ở bước khai báo": xoá màn `04-project-approval.html`,
    bỏ nav "Phê duyệt dự án" (`pms-shell.js`), bỏ mục RowMenu "Gửi duyệt" (màn 02 + `pms-detail.js`), bỏ nút
    "Trình phê duyệt" ở màn chỉnh sửa, wizard màn 03 kết thúc ở bước "Xác nhận & lưu" (lưu thẳng vào danh mục).
    Trạng thái dự án còn 4 giá trị `Mới khai báo → Đang triển khai → Tạm dừng → Hoàn thành` (`mock-data.js`:
    `STATUSES`/`STATUS_TONE`, `portfolio().pending` → `declared`, `approveProject()` → `setProjectStatus()`;
    dự án DLH/ESIGN đổi sang "Mới khai báo"). Giữ nguyên các hạng mục checklist nghiệp vụ có chữ "phê duyệt"
    (CK01 chủ trương, CK09 ARB, CK21 go-live) vì đó là giao phẩm được theo dõi, không phải bước duyệt của tool.
    Màn 05–11 đánh số lại thành 04–10; `docs/architecture/PMS-HLAD.md` không bị ảnh hưởng (chỗ nhắc "phê duyệt"
    trong HLAD là duyệt tài liệu/hạ tầng, không phải vòng đời dự án).
  - **Nguyên nhân mockup trông vỡ**: `pms-tokens.css` nạp Material Symbols Outlined qua `@import` Google Fonts.
    Máy không có internet → font không về → trình duyệt in nguyên tên ligature ("search", "tune",
    "keyboard_double_arrow_right"…) thành chữ đè lên bảng. Đã bỏ toàn bộ `@import` CDN và thay bằng
    `assets/pms-icons.js`: 74 icon Phosphor dạng inline SVG, sinh bởi `scripts/gen-mockup-icons.mjs` đọc path thật
    từ `@phosphor-icons/react` trong `node_modules` (đúng chuẩn icon ở `AGENTS.md`, hết xung đột ghi nhận trước đó).
    Markup không đổi (`<span class="msym">ten_icon</span>`), kích thước vẫn theo `font-size`; renderer dùng
    MutationObserver nên bắt cả nội dung render bằng JS và trường hợp đổi icon bằng `textContent`.
    `.msym` khi chưa vẽ có `font-size:0` để không bao giờ lọt tên icon ra UI. Mockup giờ chạy offline hoàn toàn.
  - **Bảng danh mục dự án (màn 02) làm lại cho đúng tính chất quản lý danh mục**: 12 cột (`min-width:1480px`,
    phải cuộn ngang mới thấy cột Trạng thái) gộp còn 8 cột xếp tầng (`min-width:1240px`); thêm dải phân loại
    danh mục `.pf-strip` (Toàn danh mục · Mới khai báo · Đang triển khai · Lệch tiến độ · Rủi ro cao · Hoàn thành)
    vừa là cơ cấu danh mục vừa là bộ lọc 1 nhấp; bảng đổi từ kẻ lưới 4 phía sang kẻ ngang + header sticky +
    header kiểu Overline (`pms-ias.css`); thêm pill lệch tiến độ `.delta` và `.risk-count`.
  - **Verify**: `node scripts/check-mockup.mjs` (mới) — parse 8 file JS, kiểm tra mọi link màn hình tồn tại,
    mọi tên icon có trong bảng, không còn dấu vết luồng duyệt trong code: 0 vấn đề. Thêm smoke test tạm chạy
    `pms-icons.js` trên DOM giả: 6/6 icon ra `<svg>`, icon thiếu mapping ra ô trống, vẽ lại đúng khi đổi
    `textContent` (file tạm đã xoá). Không chạm `src/`, không đổi schema → không chạy `db:migrate:*`.

- **Mockup HTML module Quản lý dự án (`projects/business/mockup/`) — 11 màn hình, dựng theo skill `ias-design`**:
  - **Mục đích**: chốt luồng nghiệp vụ và layout 6 cấu phần (thông tin chung · checklist · tiến độ/Gantt · phạm vi · rủi ro ·
    chất lượng & hiệu quả) trước khi viết route Next.js và trước khi thiết kế chi tiết schema `project.*`. Prototype HTML/CSS/JS
    thuần, không chạm `src/`, không đổi schema → không chạy `db:migrate:*`.
  - **Làm lại nền tảng theo MB Internal Design System** (`E:\workspace\ias-design`) sau khi đọc `SKILL.md` + `references/`:
    bản dựng đầu tiên theo ảnh `projects/business/Phê duyệt dự án.png` đã bị thay thế. Thay đổi lớn: primary `#1F5FBF` → `#141ED2`,
    nền trang `#F4F6FA`, sidebar trắng 240px → `AppSidebar` navy `#0D0D2B` (mini 64px / hover 248px), **bỏ top bar**
    (`AppHeader` bị DS loại trừ mặc định), font Be Vietnam Pro → **Averta Std CY self-hosted** (8 weight copy vào
    `assets/fonts/`, `@font-face` + `--font-family-body` khai báo tại chỗ theo quy định portability của SKILL.md),
    icon **Phosphor → Material Symbols Outlined** (xung đột với `AGENTS.md` § Icons — xem ghi chú dưới).
  - **Template bắt buộc đã áp**: `IasLayout` (shell 11 màn) · `DanhSachChuongTrinh` (màn 02: `ListPanel` +
    `ToolbarSimple ⇄ FilterCard` + `Table` + `pagination-bar` đủ 4 phần kể cả `pg-jump`) · `XemChiTiet` (màn 04, 05–10) ·
    `ChinhSua` (màn 11, lưới nhập 4 cột) · `Modal` (mọi hộp thoại, overlay phủ toàn màn, footer canh giữa) · `Steps` (wizard màn 03).
    Nút "Từ chối" đỏ / "Duyệt" xanh lá trong ảnh gốc được map về `outline`/`primary` theo closed set 6 variant của `Button`.
  - **File**: `assets/pms-tokens.css` (port color/spacing/typography token) · `pms-ias.css` (component layer) · `pms-shell.js`
    (AppSidebar + PageHeader) · `pms-detail.js` (khung 6 màn chi tiết) · `pms-ui.js` (Modal/Notification/Tooltip/RowMenu/Drawer/
    Select panel) · `pms-util.js` · `mock-data.js` (10 dự án, checklist mẫu 26 hạng mục, 6 cấu phần đầy đủ cho PMP/EKYC/CBU) ·
    `gantt.js` + `heatmap.js` (bespoke, chỉ dùng semantic alias token vì DS không có component tương đương).
  - **Verify**: smoke test bằng jsdom (cài ở thư mục tạm ngoài repo, đã xoá sau khi chạy) nạp cả 11 trang + chạy script thật,
    kiểm tra shell, render và các thao tác (lọc, phân trang, Drawer, RowMenu, validate wizard 5 bước, tick checklist, zoom/thu-mở
    Gantt, thêm CR → scope creep tính lại, chấm điểm P×I → ô heatmap): **214 pass / 0 fail**, không có lỗi runtime.
  - **Cần chủ sở hữu quyết định**: (1) xung đột chuẩn icon giữa `AGENTS.md` (Phosphor cho toàn app) và `ias-design`
    (Material Symbols) — mockup hiện theo `ias-design`; (2) thang nhiệt 4 bậc của ma trận rủi ro phải vay
    `--color-warning-400` cho bậc "Cao" vì bộ Semantic Alias chỉ có 3 nền trạng thái đặc — chưa tự thêm token mới;
    (3) màn dashboard (01) không áp `DanhSachChuongTrinh` vì hai bảng ở đó là bảng nhỏ nhúng trong card, không phải
    nội dung chính dạng danh sách.

## 2026-10-11

- **Chuyển đổi biểu đồ section 'Theo PM/SM' từ Donut sang Horizontal Bar Chart (`/ttm-dashboard-2`)**:
  - `src/components/ttm-dashboard-2/PmsmBarChartCards.tsx`: Tạo mới component biểu đồ thanh ngang gồm 3 nhóm song song (`% Tổng số Epic`, `% Pass TTM`, `% Fail TTM`), sắp xếp từ cao xuống thấp theo giá trị số lượng Epic (Phương án A).
  - Tối ưu cho danh sách lên tới 40+ PM/SM: Mặc định áp dụng lazy rendering chỉ hiển thị **Top 7 cao nhất** và **Top 7 thấp nhất** (giữ chiều cao thẻ gọn gàng), ở giữa là dải phân cách kèm nút `[ ··· +{N-14} PM/SM ▼ ]`.
  - Đồng bộ hoá trải nghiệm: Thao tác bấm nút mở rộng/thu gọn ở bất kỳ nhóm nào trong 3 nhóm đều kích hoạt bung toàn bộ (kèm thanh cuộn nội bộ `max-h-[460px]`) đồng thời cho cả 3 nhóm.
  - `src/components/ttm-dashboard-2/DashboardInsights.tsx`: Tích hợp `PmsmBarChartCards` thay thế cho `DonutChartCard` riêng tại section `dimension === 'pmsm'`; các section khác giữ nguyên.

- **Scoring Service: sửa rule R5 "Thiếu Requirement Level" (`scoring-15` → `scoring-16`, branch `feature/r5-requirement-level`)** — theo quy định chủ sở hữu:
  Requirement Level trống/"none" VÀ ( (status > DESIGN và khác Pending) HOẶC (status = Pending và (`previous_status` rỗng HOẶC ∉ {To Do, In PO})) ).
  (Bản đầu trong ngày đặt ngược nhánh Pending — đã sửa: Epic Pending trước đó là To Do / In PO được **miễn** R5.)
  - `scoring/rules/data-quality.ts`: hàm mới `requirementLevelRequired()`; so sánh `previous_status` không phân biệt hoa/thường, đã trim, chuẩn hoá workflow.
  - Dữ liệu: `EpicFacts.previousStatus` (`scoring/types.ts`), nạp `issues.previous_status` ở `scoring-facts-service.ts`.
  - `catalog.ts` (meaning/formula), `registry.ts` (version), `parity.ts` (R5 không gắn ở DESIGN hoặc Pending → `D10_DATA_QUALITY_RULES`; engine legacy không đổi).
  - Test: `scoring.test.ts` "R5 (2026-10-11)", `parity.test.ts`, `projection.test.ts`. Tài liệu: spec §25, `brd/03`, `brd/16`, product-guide §9.1, HelpPanels.
  - Tác động dự kiến (Supabase 11/10): 27 Epic Pending thiếu Requirement Level — 3 Epic có previous = To Do được miễn R5; 24 Epic còn lại (23 previous trống + 1 In Progress) vẫn bị R5. Cần "Tạo lại cache" để có hiệu lực.

- **Dọn lint + footer màn hình login + cập nhật tài liệu/schema**:
  - **Lint** (`eslint src` từ 4 lỗi + 29 cảnh báo → sạch): sửa 4 lỗi `react-hooks/set-state-in-effect` —
    `dashboard-new/page.tsx` (chỉnh `dimensionKey` ngay lúc render), `EpicAlertsIframeModal.tsx` (spinner suy ra từ `loadedUrl`),
    `EpicBrowserModal.tsx` (`TtmBlackListTopToggle` đồng bộ prop lúc render), `EpicIssuesTree.tsx` (loading của Epic gốc suy ra từ `autoLoadedRootId`).
    Gỡ import/biến không dùng (`AppShell`, `ImportIssuesTab`, `epic-alerts-15`, `epic-in-po`, `sso-demo`, `sso/authorize`, `topRiskProjects`...);
    thêm `eslint-disable` có lý do cho các effect cố ý không đưa `fetchData`/`apiKey` vào deps.
  - **`SystemStatusFooter.tsx`**: ở `/login` không gọi `/api/visit-counter/footer` (cần session) — chỉ hiện `TTM Tool | Version x` và `(C) minhnd7. db: <target> - <status>`.
  - **`db/schema.sql`**: đồng bộ baseline 14 bảng với schema thật (thêm `issues.requirement_level/requesting_unit/components/epic_stories/story_subtasks`,
    `users.must_change_password/failed_login_attempts`) + header giải thích mô hình baseline + migrations.
  - **`scripts/migrate-db.js`**: khi `--init`, chấp nhận thêm lỗi `42703` (undefined_column) — 3 migration cũ (20260811, 20260812, 20260827) tham chiếu
    cột `projects.lead_name`/`project_key` đã không còn trong baseline nên trước đây làm `--init` DB mới dừng giữa chừng. Đã replay thử trong schema tạm + ROLLBACK:
    51 bảng/cột khớp DB thật.
  - **Tài liệu**: `README.md` (landing mặc định `/ttm-dashboard-2`, 5 màn hình Visit Counter, Aiven đã ngừng, Scoring Service), `brd/16-ttm-indexes.md` §8.1 mới
    (Phạm vi rule Sai lệch dữ liệu), `brd/08-data-model.md`, `brd/03-mvp1-working-days-alert-rules.md` (R3 gộp 1 vi phạm), `public/docs/product-guide.html`
    (§9.2 mới, số bảng 51, R1–R10, Aiven, footer login).

- **Merge `main` vào `feature/ias-design-system-adoption`** (4 file xung đột, giải quyết như sau):
  - `src/components/epic-browser/EpicBrowserModal.tsx`: lấy bản của `main` (khối Epic ngoại lệ đã được thiết kế lại, nhánh feature chỉ đổi 2 dòng màu trong khối cũ).
  - `src/components/ttm-dashboard-2/DashboardInsights.tsx`: giữ subtitle `KpiSubLink` "thiếu lý do Fail" của `main`, màu dùng token `--color-text-error`.
  - `daily_change_log.md`: gộp cả hai lịch sử dưới cùng heading ngày; `version.json`: stamp mới.
  - **Nợ thiết kế của code mới từ `main`** (4 test chốt chặn IAS fail): chạy `scripts/codemod-ias-tokens.mjs`; gỡ toàn bộ class `dark:*` ở
    `EpicBrowserModal`, `EpicIssuesTree`, `DailyCacheWarmer`, `AnomalyScopeConfigPanel`, `StatusAlertRulesSettings` (app không khai báo
    `@custom-variant dark` nên `dark:` chỉ theo OS, không theo toggle `data-theme`; token IAS đã tự đổi theo theme); đổi nốt các class palette thô còn lại
    sang token (`status-*`, `fb-blue`, `fb-accent`); `<Button>` "Lưu & tính toán lại cache" ghi rõ `variant="primary"`.
    **Hoàn tác** thay đổi `#8B4513` → `--color-text-warning` ở `app/login/page.tsx` mà codemod áp lại (đã từng bị hoàn tác có chủ đích vì tương phản
    giảm còn ~4.0:1). Kết quả: `tsc` sạch, `eslint src` sạch, `npm test` 277/277.
  - Việc còn lại trước khi deploy: chạy `npm run db:migrate:local` và `npm run db:migrate:supabase` cho 5 migration PMS (`20261009a`–`e`) của nhánh feature.

## 2026-10-12

- **Chuẩn hoá dữ liệu — chỉnh giao diện** (`src/app/data-normalization/page.tsx`): panel mỗi rule có thể đóng/mở bằng cách bấm tiêu đề, mặc định đóng, tiêu đề luôn hiện số Epic lỗi; cụm điều hướng trang không còn xuống dòng (select `.ttm-select` bị `flex: 1 1 140px` làm phình, nay đặt bề rộng cố định); bảng: cột Epic chỉ còn icon + key, Summary tách thành cột riêng, bỏ loại Epic và PM/SM, hàng thấp hơn (`!py-1`).
- **Màn hình mới "Chuẩn hoá dữ liệu"** (`/data-normalization`, menu "Giám sát" ngay dưới Quản trị Epic):
  - Mỗi rule "Sai lệch dữ liệu" (R1, R3–R6, R8–R10 — lấy từ `scoring/catalog.ts`, theo thứ tự R) là một panel: tiêu đề = tên rule, phụ đề = giải thích rule + "Cách chuẩn hoá" (lấy từ badge Khuyến nghị tương ứng). Bảng Epic dùng `Table` chung, cột Epic bố trí như Quản trị Epic, thêm Created date / Ngày duyệt ý tưởng / Start date / R4G date / Due date / Status; phân trang 25 Epic/trang, menu chọn trang như Quản trị Epic. Một Epic có thể nằm ở nhiều panel.
  - Dữ liệu theo phạm vi của user (`loadDashboardEpicRows` — cùng nguồn TTM Dashboard 2) và cùng bộ lọc (Domain, Dự án, Component, PM/SM, Đơn vị yêu cầu). Epic Cancelled và Epic ngoại lệ / dự án Time to Market = N bị loại như ở dashboard. R8–R10 chỉ có khi engine hiển thị là Scoring (legacy không đánh giá).
  - Code: `src/lib/data-normalization.ts` (thuần), `data-normalization-service.ts`, `api/data-normalization/route.ts`, `modules/ttm/application/get-data-normalization.ts`; quyền `data_normalization` (`feature-access.ts`, migration `20261012_add_data_normalization_permission.sql` — cần chạy `db:migrate:local` + `db:migrate:supabase`).
- **Sửa 2 lỗi review bộ code pull (PM/SM theo component)**: (1) `getPmSmCacheFootprint` (`src/lib/auth-service.ts`) nay gồm cả role và component được gán, nên đổi riêng component/role của PM/SM sẽ kích hoạt rebuild cache; (2) `DonutChartCard.tsx` hiển thị legend/tooltip bằng `formatEpicCount` (không còn số lẻ 2.5 / 0.333… ở donut "Theo PM/SM").
- **Import CSV ở "Quản trị nguồn dữ liệu" không còn báo lỗi chung chung "Có lỗi xảy ra khi gọi API import."** (`src/components/data-source/ImportIssuesTab.tsx`):
  - File được đọc vào bộ nhớ trước khi upload. Trình duyệt huỷ hẳn request (không có phản hồi HTTP) khi file đã chọn bị sửa/lưu lại/đang mở bởi Excel — giờ báo đúng nguyên nhân và yêu cầu chọn lại file; khi đọc được thì việc upload không còn phụ thuộc file trên đĩa.
  - Phản hồi không phải JSON (giới hạn dung lượng/thời gian của hosting, gateway chặn…) được báo kèm mã HTTP và nội dung tóm tắt thay vì vỡ ở `res.json()`; lỗi mất kết nối báo riêng. Với "Import & Lưu dữ liệu", lịch sử import được tải lại để thấy ngay đợt import có được lưu hay không.
  - Đã kiểm tra phía server với file CSV crawl v14 (có `epic_khau_*`): parse/validate và toàn bộ chuỗi ghi DB trên Supabase chạy hết không lỗi (chạy thử có rollback, không lưu gì) — không sửa gì ở API/import-service.
- **Sửa 7 vấn đề từ đợt review bộ code pull ngày 12/10** (`npm test` 278/278):
  - *Phạm vi rule Sai lệch dữ liệu* (`src/lib/scoring/rules/data-quality.ts` — `isEpicInAnomalyScope`): Epic CHƯA có ngày tương ứng thì bỏ qua điều kiện của ngày đó thay vì bị coi là "ngoài phạm vi". Trước đây đặt "Start Date >" cho R1 (Thiếu Start Date) hoặc "R4G Date >" cho R9 làm chính rule đó không bao giờ bắn, Epic thiếu ngày lọt khỏi cả R3–R6. `SCORING_CODE_VERSION` `scoring-16` → `scoring-17` (có hiệu lực sau lần tạo lại cache kế tiếp).
  - *Đối chiếu Scoring* (`src/lib/scoring/parity.ts`, `ScoringParityPanel.tsx`): nhãn mới `D13_ANOMALY_SCOPE` cho khác biệt do Phạm vi rule Sai lệch dữ liệu, không còn rơi vào "Chưa giải thích được".
  - *Popup Duyệt Epic* (`src/lib/epic-browser-service.ts`): kết luận TTM-CNTT đọc từ dòng Epic đang hiển thị (`epic_alert_row_cache.row_data`) qua `matchesAlertFilter` — đúng theo engine hiển thị, không còn tự gọi `scoreEpic`; Epic ngoài phạm vi hiện "Ngoài phạm vi TTM-CNTT", không còn mặc định "Đang thực hiện" khi không tính được.
  - *DailyCacheWarmer* (`src/components/layout/DailyCacheWarmer.tsx`): lỗi 5xx khi kiểm tra không còn làm dừng hẳn việc theo dõi; lúc rảnh chỉ kiểm tra 60 giây/lần và chỉ ở tab đang hiển thị (trước là 15 giây ở mọi tab); khôi phục hộp thoại "Dữ liệu trong ngày đã sẵn sàng" cho lần tạo cache đầu ngày; cache FAILED báo riêng thay vì "Tạo Cache hoàn thành".
  - *Panel Phạm vi rule Sai lệch dữ liệu* (`AnomalyScopeConfigPanel.tsx`): danh sách rule lấy từ `scoring/catalog.ts` (`badgesOf('DATA_QUALITY', 'ALERT')`), bỏ bản chép tay đã lệch mô tả R5.
- **R5 "Thiếu Requirement Level"** (`scoring/catalog.ts`, `data-quality.ts`): công thức ghi lại đúng theo phát biểu của chủ sở hữu — Requirement Level trống hoặc "none" VÀ ((status khác Pending và status > DESIGN) HOẶC (status = Pending và previous_status ∉ {To Do, In PO})). Logic không đổi (bản 11/10 đã tương đương; previous_status rỗng vẫn tính là ∉), chỉ gọn lại code và lời mô tả.
- **TTM Dashboard 2 — dropdown bộ lọc trong suốt ở theme khác IAS** (`src/app/ttm-shared.css`): file này chỉ khai báo `--ttm-*` cho `data-brand="ias"`; ở Wise/Legacy/Pink (sáng) `var(--ttm-card)`, `--ttm-border`… không có giá trị vì dashboard không nạp `epic-alerts-15.css`. Thêm khối `:where(:root)` (specificity 0, không đè lên Quản trị Epic hay IAS) lấy giá trị từ biến theme của `globals.css`.
- **TTM Dashboard 2 — "Theo Domain nghiệp vụ"** (`DonutChartCard.tsx`, `DashboardInsights.tsx`): cả 3 biểu đồ liệt kê đủ mọi Domain, không gom "Khác.."; Domain có giá trị 0 vẫn nằm trong chú giải; mỗi Domain giữ một màu ở cả 3 biểu đồ (màu bổ sung dùng token IAS, không thêm mã hex).
- **TTM Dashboard 2 — bộ lọc Component** (`src/app/ttm-dashboard-2/page.tsx`, `src/lib/ttm-funnel-summary.ts`): thêm multi-select "Component" ngay sau "Dự án", phụ thuộc dự án đang chọn (chưa chọn dự án thì khoá, giống Quản trị Epic). Mọi section tính lại trên phạm vi dashboard + dự án + component đã chọn; số liệu vẫn hiển thị theo dự án, không có chiều component. Người xem bị giới hạn component chỉ thấy các component được gán (`filterOptions.projectComponents`). Bấm số mở Quản trị Epic giữ nguyên bộ lọc component (`buildEpicAlertsDeepLink` thêm `components`).
- **PM/SM của Epic tính theo component được gán — áp dụng toàn ứng dụng** (`src/lib/epic-pm-sm-assignment.ts`, `epic-pm-sm-assignment-service.ts`): PM/SM không gán component → mọi Epic của dự án; PM/SM gán component → chỉ Epic có component đó; Epic không còn ai → "Chưa gán PM/SM". `ownerName` được ghi lại ở cùng chỗ đóng dấu Epic ngoại lệ (`daily-cache-service.ts`, `epic-scoring-display-service.ts`) nên cột/bộ lọc PM/SM ở Quản trị Epic, popup Duyệt Epic và dashboard đều theo; engine legacy không sửa, không đổi schema. Có hiệu lực sau lần tạo lại cache kế tiếp. Trên dữ liệu 12/10: 114 Epic của dự án API đổi PM/SM, 13 Epic không còn PM/SM nào.
- **"Theo PM/SM" và Ma trận phân bổ (chiều PM/SM) chia trung bình** (`summarizeInsights` trong `ttm-funnel-summary.ts`): Epic có n PM/SM tính 1/n cho mỗi người (trước là 1 cho từng người), nên tổng các dòng = Tổng số Epic; hiển thị làm tròn tới 1 Epic (`formatEpicCount`, phần dưới 0,5 hiện "<1"), tỷ lệ % tính trên số chưa làm tròn. Cache dashboard `PAYLOAD_VERSION` 10 → 11.
- **Quản trị Epic — lọc PM/SM có thêm "(Chưa gán PM/SM)"** (`epic-alert-row-cache-query-service.ts`, `src/app/epic-alerts-15/page.tsx`): liệt kê Epic không có PM/SM phụ trách; dòng "Chưa gán PM/SM" của dashboard mở đúng danh sách này.
- **R1 "Thiếu Start Date" — miễn Epic Pending trước đó là To Do / In PO** (`src/lib/scoring/rules/data-quality.ts` — `startDateRequired`, `scoring/catalog.ts`): rule mới = T1 trống VÀ ((status khác Pending và status ≥ DESIGN) HOẶC (status = Pending và previous_status ∉ {To Do, In PO})) — cùng cách miễn với R5; previous_status rỗng vẫn bị R1. `SCORING_CODE_VERSION` `scoring-17` → `scoring-18` (có hiệu lực sau lần tạo lại cache kế tiếp). Trên dữ liệu 12/10: R1 70 → 54 Epic (Pending 18 → 2); 16 Epic hết "Sai lệch dữ liệu", TTM-CNTT của chúng là "không tính được" (không có Target) và 15 Epic trong đó thành Fail TTM-E2E — chủ sở hữu đã chấp nhận. Đối chiếu: khác biệt này mang nhãn D10 (`parity.ts`).

## 2026-10-13

- **Chuẩn hoá dữ liệu — thêm 2 bảng, đổi thứ tự** (`src/lib/data-normalization.ts`): bảng đầu tiên là "Thiếu lý do Fail TTM" (Epic Fail TTM-CNTT trong Phạm vi dữ liệu cho TTM chưa ghi lý do — đúng tập Epic của widget trên TTM Dashboard 2; chỉ có ở Scoring Service); thêm bảng R7 "Sai Status (Release)" giữa R6 và R8. R2 "Pending lâu" vẫn không có bảng, và Epic chỉ vi phạm R2 không còn bị đếm vào "Epic cần chuẩn hoá" khi bật engine legacy. Tiêu đề các bảng dùng chữ thường (không đậm).
- **Chuẩn hoá dữ liệu — mô tả rule theo engine đang bật** (`describeNormalizationPanel`): khi engine hiển thị là legacy, R1 / R5 / R7 hiện đúng điều kiện mà engine legacy chấm (R1 từ In Progress và không xét Pending; R5 ở mọi status không được miễn; R7 là Sai lệch dữ liệu) thay vì lời mô tả của Scoring Service.
- **Chuẩn hoá dữ liệu — nhẹ hơn mỗi request** (`data-normalization-service.ts`, `queryDashboardEpicRows`, `src/app/data-normalization/page.tsx`): chỉ đọc từ cache các Epic có thể nằm trong một bảng (`has_data_anomaly` hoặc mang badge Sai Status Release / Thiếu lý do — 167/1.331 Epic ngày 13/10) thay vì toàn bộ phạm vi; dòng Epic và ngày Jira chỉ trả cho các bảng đang mở (`open=`), bảng đóng chỉ có số đếm; danh sách bộ lọc chỉ gửi ở lần tải đầu (`options=1`); khi không có cache, bộ lọc dựng từ chính các dòng vừa tải nên không còn tính toàn bộ Epic hai lần.
- **Chuẩn hoá dữ liệu — bộ lọc danh sách gửi dạng tham số lặp** (`src/app/api/data-normalization/route.ts`): `projects` / `components` / `pmSms` / `requestingUnits` mỗi giá trị một tham số thay vì nối dấu phẩy, nên tên đơn vị yêu cầu hay component có dấu phẩy không còn bị tách.
- **Donut TTM Dashboard 2** (`DonutChartCard.tsx`): số tổng ở tâm cũng làm tròn bằng `formatEpicCount` (trước chỉ chú giải và tooltip).

## 2026-10-14

- **Từ chối import — bảng mới** (`db/migrations/20261014_create_denied_import_epics.sql`, `20261014b_seed_denied_import_epics.sql`): `denied_import_epics` (Epic không được import + thông tin cơ bản chụp lúc thêm, cờ "Cho phép import", nguồn MANUAL / AUTO_RULE / SEED) và `import_admission_settings` (ngày A = 31/01/2026, B = 01/07/2026). Seed 42 Epic ngoài phạm vi dữ liệu nguồn (Released/MVP Done trước 01/07, owner đã kiểm tra trên Jira). **Đã chạy trên Supabase; CHƯA chạy trên local** (máy này không có Postgres) — trên máy có DB local: `npm run db:migrate:local` rồi vào Quản trị nguồn dữ liệu → Từ chối import → "Xóa dữ liệu còn tồn tại".
- **Epic deletion** (`src/lib/epic-deletion-service.ts`, `GET|POST /api/data-source/epic-deletion`): xóa Epic + Story + Subtask (gắn thẳng Epic hoặc thuộc Story), xác định theo trạng thái mới nhất của từng issue (issue đã chuyển Epic khác được giữ), ở mọi lớp dữ liệu và các bảng theo Epic (alert history/timeline, milestone, anomaly violations, row cache, Epic ngoại lệ); ghi `audit_logs` EPIC_DELETION. Không chạy lại cache.
- **Đã xóa 42 Epic trên Supabase** bằng Epic deletion: 3.860 dòng (862 import_rows, 860 issues, 863 issue_daily_snapshots, 863 epic_ttm_snapshots, 230 alert history, 106 timeline, 25 anomaly, 42 row cache, 9 Epic ngoại lệ); 42 Epic này không có Story/Subtask trong DB. Backup JSON ở `backups/backup_42_epics_supabase_20261014.json` (gitignored). Cache chưa chạy lại — chạy thủ công.
- **Import adapter từ chối Epic** (`src/lib/import-admission-rules.ts`, `src/lib/denied-import-service.ts`, `processImport`): sau parse, loại mọi dòng của Epic trong danh sách hoặc vi phạm rule (issue type cấp 1 ≠ Epic; created < A; Released/MVP Done có ngày chuyển status — tạm dùng Due, trống thì R4G — < B). Epic bị rule bắt được tự thêm vào danh sách (AUTO_RULE) và xóa dữ liệu cũ. Ngoại lệ: Epic mà DB đã ghi nhận ở status khác Released/MVP Done vào/sau B không bị rule B bắt (5 Epic như DL-65580 lẽ ra bị xóa nhầm). Số dòng bị từ chối ghi ở `metadata_json` + cột "Từ chối" của Nhật ký import. Adapter Py Jira API đọc thêm cột tùy chọn `epic_issue_type`, `epic_status_changed_at`.
- **Panel "Từ chối import"** (`src/components/data-source/DeniedImportPanel.tsx`, API `/api/data-source/denied-import` + `/settings` `/scan` `/purge`): cấu hình A/B, Quét lại CSDL, thêm Epic (popup xem trước rồi xóa), xóa / xóa theo lô, sửa "Cho phép import", xóa dữ liệu còn tồn tại; mỗi lần xóa hiện toast nhắc chạy lại cache.
- **Từ chối import tách thành tab riêng** (`src/components/data-source/DeniedImportTab.tsx`, tab thứ 3 của `src/app/page.tsx`, bỏ khỏi tab Import Issues): khối "Rule tự động" gồm 2 ô ngày + 2 nút trên 1 dòng, đổi nhãn thành "Ngày Created >=" / "Ngày Due Date >=" (rule đã xét R4G Date khi trống Due Date); ô Epic key + Lý do + nút Thêm trên 1 dòng; bảng `table-fixed` + class mới `ui-table-compact` (`globals.css`) để vừa chiều rộng, không cuộn ngang; lý do chuyển thành tooltip của badge Nguồn; nút xóa chỉ còn icon.
- **Tab Từ chối import — sửa bố cục** (`DeniedImportTab.tsx`): ô nhập bọc trong khung có độ rộng cố định (`.ui-field` mặc định rộng 100% làm các ô xếp dọc) để mỗi panel nằm trên 1 dòng; tách 3 panel: "Rule tự động", "Thêm Epic vào danh sách từ chối import" (hướng dẫn nhập key đưa lên subtitle), "Danh sách Epic từ chối import" (tìm kiếm + thao tác lô + bảng); bảng đổi sang tự co theo nội dung, Summary giới hạn 220px, Đơn vị yêu cầu 160px.
- **Tab Từ chối import — bỏ ô tìm kiếm bị lặp** (`DeniedImportTab.tsx`): panel danh sách chỉ còn 1 ô tìm kiếm, nằm cùng hàng với "Đã chọn N" và các nút thao tác lô.
- Rule đặt ngoài `src/lib/scoring/` theo quyết định owner (ghi ngoại lệ vào `AGENTS.md`).
- **TTM Dashboard 2 — pie chart 10 item** (`DonutChartCard.tsx` prop `maxItems`, `DashboardInsights.tsx`): section "Theo Đơn vị yêu cầu" và "Theo Dự án" hiện riêng 10 giá trị lớn nhất, còn lại gộp "Khác.." (các section khác giữ 4).
- **Dashboard Lead view cho tất cả user** (`db/migrations/20261014c_create_dashboard_view_settings.sql`, `src/lib/dashboard-view-settings-service.ts`, `/api/admin/dashboard-view-settings`, tab "Dashboard" trong Quản trị hệ thống — `DashboardViewPanel.tsx`): khi bật (mặc định bật), Admin/PM-SM mở TTM Dashboard 2 mặc định thấy màn hình Lead với số liệu toàn công ty (đọc cache `ALL` qua role SUPERVISOR — `modules/ttm/application/get-ttm-dashboard-2.ts`, tham số `view=lead|own` của `/api/ttm-dashboard-2` và `/rows`), nút "Toàn công ty / Của tôi" để về view cũ. Popup Quản trị Epic vẫn theo quyền của user (iframe dùng session của họ) — có dòng ghi chú trên màn hình. Migration đã chạy Supabase; **chưa chạy local**.
- **Scoring Service (`scoring-19`)**: R5 "Thiếu Requirement Level" miễn thêm Epic Pending có previous_status = Design (`data-quality.ts`, chỉ R5, R1 giữ nguyên). "Thiếu lý do": `REC_MISSING_FAIL_REASON` (khâu fail) chỉ còn xét Fail có R4G Date muộn hơn Target; thêm badge `REC_MISSING_RESPONSIBLE_DEPARTMENT` "Thiếu phòng chịu TN chính" cùng điều kiện + trường "Phòng chịu trách nhiệm chính" trống (fact `responsibleDepartment` — chưa import, owner bổ sung sau). Widget THIẾU LÝ DO = Khâu fail + Chịu TN chính, dòng phụ 2 số bấm được (filter mới `MISSING_FAIL_STAGE`, `MISSING_RESPONSIBLE_DEPARTMENT`; `MISSING_FAIL_REASON` = một trong hai). Cache payload TTM Dashboard 2 lên version 12. Cần chạy lại cache để số liệu theo rule mới.
- **Phòng chịu trách nhiệm chính — `main_fail_dept`** (`db/migrations/20261014d_add_main_fail_dept_to_issues.sql`, `csv-parser.ts`, `py-jira-api-adapter.ts`, `import-service.ts`, `scoring-facts-service.ts`): cột CSV mới của crawl tool → `issues.main_fail_dept` → fact `responsibleDepartment` của Scoring Service (`scoring-20`); rule "Thiếu phòng chịu TN chính" coi trống hoặc "None" (không phân biệt hoa thường) là thiếu. Duyệt Epic → Giải trình Fail TTM thêm dòng "Phòng chịu TN chính" ("None" hiện "-") và badge "Thiếu phòng chịu TN chính" (`EpicBrowserModal.tsx`, `epic-browser-service.ts`). Migration đã chạy Supabase; **chưa chạy local**. Owner chạy lại cache sau khi import dữ liệu có cột này. Tài liệu: `public/docs/product-guide.html` (mục 3.2, 3.4 mới, 5.2, 12.1, 19.1), `brd/07` §2.2, `brd/08` §23.

## 2026-10-16

- **Quản trị Epic — cột "Nhận xét" rút gọn thành chip icon** (`src/components/epic-alerts/EpicCommentCell.tsx`, `src/lib/epic-comment-groups.ts`, thay `ScoringBadges.tsx` và `DataAnomalyBadge`):
  - Giữ badge kết luận TTM-CNTT (Fail / Đạt / Ngoài phạm vi) rồi một hàng tối đa 4 chip icon Phosphor: Kết quả (Certificate), Sai lệch dữ liệu (TreeStructure), Cảnh báo (WarningDiamond), Xử lý (Cpu) — nhóm rỗng ẩn, icon tô màu mức nặng nhất trong nhóm (Kết quả chỉ có Đạt = xanh).
  - Bấm chip mở danh sách ngay dưới hàng chip, không tự đóng khi rê chuột/bấm chỗ khác; mở chip khác của cùng Epic thì đóng chip cũ (hàng khác giữ nguyên); không nhớ trạng thái. Tên nhóm hiện bằng `Tooltip` của app; nội dung tooltip cũ của từng badge chuyển thành dòng chi tiết trong danh sách.
  - Cột Nhận xét rộng tối thiểu 180px. Logic gom nhóm thuần, có test (`src/lib/__tests__/epic-comment-groups.test.ts`).
  - Chip phẳng (không viền): icon 19px + số 14px; hover nền xám nhạt, đang mở nền bo 6px tô nhạt theo màu icon (`bg-*-soft`), vùng bấm cao tối thiểu 28px.
  - Badge kết luận đổi sang nền xám nhạt (chữ vẫn theo màu badge); cột Nhận xét co theo nội dung (`w-[1%]`, tối thiểu 172px, bỏ padding `ttm-col-roomy`) để hết khoảng trắng bên phải.
  - Badge kết luận: nền = màu nền ô trộn nhạt với màu của badge (đậm hơn nền phía dưới một chút), không viền, chữ trộn từ màu badge và màu chữ chính — tự theo sáng/tối (`.ttm-comment-badge`). Bảng Quản trị Epic căn các ô theo đỉnh (`.ttm-align-top`) để mở danh sách chip không làm các cột khác nhảy hàng chữ.
- **Sửa theo review bộ code pull 16/10**:
  - *Chuẩn hoá dữ liệu* (`src/lib/data-normalization.ts`): panel "Thiếu lý do Fail TTM" gồm cả Epic thiếu "Phòng chịu TN chính" (`REC_MISSING_RESPONSIBLE_DEPARTMENT`), khớp widget "THIẾU LÝ DO" của TTM Dashboard 2; bộ lọc SQL `NORMALIZATION_BADGE_CODES` thêm badge này.
  - *Import* (`src/components/data-source/ImportIssuesTab.tsx`): trước khi "Import & Lưu" thật, nếu file có Epic vi phạm rule A/B thì hiện hộp xác nhận liệt kê Epic + lý do (dùng kết quả "Kiểm tra" của file, hoặc tự chạy kiểm tra trước); hủy thì không lưu gì.
  - *Từ chối import* (`src/lib/denied-import-service.ts`): `removeDeniedImportEpics` ghi `audit_logs` (`DENIED_IMPORT_REMOVE`, mỗi Epic một dòng) cùng transaction.
- **Quản trị Epic — bảng 1x4 cột Nhận xét và cột PASS độc lập** (`src/components/epic-alerts/EpicCommentCell.tsx`, `src/lib/epic-comment-groups.ts`, `src/app/epic-alerts-15/page.tsx`, `src/app/epic-alerts-15/epic-alerts-15.css`):
  - Thay thế chip icon và gỡ badge kết luận TTM-CNTT khỏi cột Nhận xét; bố trí dải bảng 1x4 liền mạch (border=0) gồm 4 ô màu pastel tương ứng 4 nhóm theo ngữ nghĩa: Xử lý (`#dae8fc`, xanh dương), Kết quả (`#d5e8d4`, xanh lá), Cảnh báo (`#e1d5e7`, tím), Sai lệch dữ liệu (`#fbeaea`, hồng nhạt).
  - Mỗi ô hiển thị số lượng mục tương ứng (nếu 0 mục hiển thị ký tự `-` và không click được). Hover vào ô vẫn hiển thị Tooltip tên nhóm + số lượng.
  - Bấm vào ô có giá trị mở bung panel nội dung chi tiết ngay bên dưới bảng 1x4, panel mang cùng màu nền với ô được bấm. Bấm lại chính ô đó để đóng (toggle), bấm ô khác để chuyển nhóm.
  - Bổ sung cột **PASS** bên phải cột Nhận xét (trước cột TTM-CNTT): chỉ dùng icon không dùng text — icon `CheckCircle` xanh lá nếu pass TTM-CNTT, icon `XCircle` màu nâu (`#8B4513`, class `ttm-icon-fail-brown`) nếu fail TTM-CNTT, bỏ trống ô nếu chưa có kết luận đánh giá (đang triển khai / ngoài phạm vi / chưa tính được).
- **Cập nhật hiển thị cột Nhận xét & PASS** (`src/components/epic-alerts/EpicCommentCell.tsx`, `src/app/epic-alerts-15/epic-alerts-15.css`, `src/app/epic-alerts-15/page.tsx`):
  - Text trong panel chi tiết của cột Nhận xét: bổ sung `box-sizing: border-box`, `white-space: normal`, `break-words` trên ô TD và panel để tự động xuống dòng, không bị tràn ra ngoài phạm vi cột / sang cột PASS kế bên.
  - Icon Fail TTM-CNTT ở cột PASS: chuyển sang màu cam (`#f97316`, dark mode `#fb923c`, class `ttm-icon-fail-orange`).
- **Tối ưu giảm khoảng trắng thừa và chuẩn hóa tiêu đề bảng Quản trị Epic** (`src/app/epic-alerts-15/page.tsx`, `src/app/epic-alerts-15/epic-alerts-15.css`, `src/components/epic-alerts/EpicCommentCell.tsx`):
  - Đổi tên cột: `Release` thành `'DUE DATE'`, `START-CNTT` thành `'START-DATE'`.
  - Đồng bộ font style tiêu đề cột thành chữ hoa: `Epic` → `EPIC`, `Nhận xét` → `NHẬN XÉT`, `Status` → `STATUS`.
  - Giảm khoảng trắng thừa ở các cột: gỡ bỏ `min-w-[1694px]` trên Table để bảng co giãn linh hoạt vừa khít chiều rộng màn hình, không bị ép thanh trượt ngang khi xem trên laptop/desktop tiêu chuẩn; đặt `w-[1%]` cho các cột số liệu, ngày tháng, trạng thái, nhận xét, pass và dồn độ rộng co giãn còn lại cho cột `EPIC` (chứa tên/tóm tắt Epic cần hiển thị dài); tinh gọn độ rộng dải tiến độ TTM (`BASE_WIDTH = 36px`, `MAX_ACTUAL_WIDTH = 72px`), căn giữa ô và giảm padding `ttm-col-roomy` từ 24px xuống 8px; thu gọn dải nút 1x4 nhận xét xuống 136px–152px.
- **Căn lề trái và phía trên cho cột TTM-CNTT (QLDA) & TTM-E2E** (`src/app/epic-alerts-15/page.tsx`, `src/app/epic-alerts-15/epic-alerts-15.css`):
  - Chuyển căn lề tiêu đề TH và ô TD sang bên trái (`text-left`) và phía trên (`align-top`, `vertical-align: top`).
  - Đổi `.ttm-strip-wrap` sang `align-items: flex-start; text-align: left;` để 2 dải stripe (baseline và actual) luôn căn đều sát mép trái, ngày bắt đầu của cả 2 dải (`27/03/2026`) thẳng hàng hoàn toàn theo chiều dọc không còn bị lệch nhau khi vạch tiến độ có độ dài khác nhau; cố định độ rộng ngày bắt đầu `min-width: 52px` với `tabular-nums` để điểm bắt đầu vẽ track khớp pixel.
- **Cập nhật cột Nhận xét (màu sắc, thứ tự, hover/click) và sửa lỗi phân trang** (`src/components/epic-alerts/EpicCommentCell.tsx`, `src/lib/epic-comment-groups.ts`, `src/lib/__tests__/epic-comment-groups.test.ts`, `src/app/epic-alerts-15/page.tsx`, `src/app/epic-alerts-15/epic-alerts-15.css`):
  - Đổi thứ tự ô Kết quả lên vị trí đầu tiên trong dải 1x4 (`GROUP_ORDER`: Kết quả → Xử lý → Cảnh báo → Sai lệch dữ liệu).
  - Ô Kết quả: nếu có kết quả fail (Fail TTM-CNTT hoặc Fail TTM-E2E) thì ô chuyển sang nền màu orange (`#f97316`) và chữ trắng (`#ffffff`), panel chi tiết mang nền cam nhạt tương ứng (`#ffedd5`, chữ đậm `#7c2d12`); nếu không fail thì giữ màu xanh lá pastel chuẩn.
  - Ô Sai lệch dữ liệu: nếu có giá trị (count > 0) thì ô chuyển sang nền màu orange (`#f97316`) và chữ trắng (`#ffffff`), panel chi tiết mang nền cam nhạt tương ứng.
  - Bổ sung chế độ hover: rê chuột qua ô có dữ liệu sẽ tự động mở xem nhanh panel chi tiết (hover vào panel để tiếp tục đọc không bị tắt, rời chuột tắt sau 200ms); bấm vào ô để ghim cố định panel (bấm lại để tắt); ô không có dữ liệu (-) hiển thị tooltip giải thích.
  - Sửa lỗi lệch số trang ở thanh phân trang: gắn `whitespace-nowrap flex-nowrap` và dùng non-breaking space `/&nbsp;{totalPages}` để số trang không bao giờ bị ngắt dòng xuống dưới dấu gạch chéo `/`.
- **Căn chỉnh bảng Quản trị Epic và tối ưu trải nghiệm hover popover Nhận xét** (`src/app/epic-alerts-15/page.tsx`, `src/app/epic-alerts-15/epic-alerts-15.css`, `src/components/epic-alerts/EpicCommentCell.tsx`):
  - Căn lề tất cả các cột của bảng Quản trị Epic sang bên trái và phía trên (`text-left`, `align-top`, `vertical-align: top`), ngoại trừ duy nhất cột `PASS` được căn giữa và phía trên (`text-center`, `align-top`, `justify-center`). Cập nhật cả các ô giai đoạn (DESIGN, DEV, TEST, PENTEST, R4GOLIVE, DUE DATE, START-E2E, START-DATE, `.ttm-phase-cell`, `.ttm-phase-baseline`, `.ttm-phase-actual`).
  - Điều chỉnh chế độ hover cột Nhận xét: khi di chuột vào ô có dữ liệu thì mở bung panel thông tin chi tiết; khi di chuột ra khỏi ô thì popover **không bị mất đi** để user có thể thoải mái đọc thông tin. User có thể đóng popover bằng nút `×` ở tiêu đề panel, bấm vào ô để toggle đóng, hoặc di chuột/bấm sang ô có dữ liệu khác để chuyển nhóm.
