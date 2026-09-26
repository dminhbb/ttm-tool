# Daily Change Log

> Nhật ký thay đổi lũy kế theo ngày, dùng để phát triển liên tục trên nhiều máy/nhiều phiên làm
> việc mà không cần đọc lại toàn bộ `git log`. Mọi AI agent (Claude Code, Codex, Cursor,
> Antigravity, hoặc con người) khi hoàn thành một yêu cầu có thay đổi code/schema/config PHẢI bổ
> sung một bullet vào block của ngày hiện tại — xem hướng dẫn đầy đủ ở `AGENTS.md` § "Daily change
> log". Ngày mới nhất nằm TRÊN CÙNG; không sửa/xoá bullet của các lần chạy trước trong cùng một ngày.

## 2026-09-26

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
