# Daily Change Log

> Nhật ký thay đổi lũy kế theo ngày, dùng để phát triển liên tục trên nhiều máy/nhiều phiên làm
> việc mà không cần đọc lại toàn bộ `git log`. Mọi AI agent (Claude Code, Codex, Cursor,
> Antigravity, hoặc con người) khi hoàn thành một yêu cầu có thay đổi code/schema/config PHẢI bổ
> sung một bullet vào block của ngày hiện tại — xem hướng dẫn đầy đủ ở `AGENTS.md` § "Daily change
> log". Ngày mới nhất nằm TRÊN CÙNG; không sửa/xoá bullet của các lần chạy trước trong cùng một ngày.

## 2026-09-26

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
