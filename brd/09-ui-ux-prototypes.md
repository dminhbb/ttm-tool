# 09 — UI/UX Prototypes

## 1. Nguyên tắc UI/UX

Giao diện nên theo phong cách SaaS dashboard hiện đại:

- Sidebar bên trái.
- Header có filter From date / To date.
- Card KPI rõ ràng.
- Table nhiều cột có filter, sort, pagination.
- Badge màu cho trạng thái, risk và cảnh báo.
- Form quản trị đặt ở drawer hoặc modal bên phải.
- Các popup chọn nhiều dữ liệu phải có tìm kiếm gần đúng.

## 2. Prototype đã có

Các file hình ảnh prototype nằm trong thư mục `prototypes/`.

| File | Mô tả |
|---|---|
| `ttm_monitor_dashboard_overview.png` | Homepage dashboard ban đầu |
| `ttm_monitor_analytics_dashboard.png` | Homepage cập nhật: menu quản trị gom nhóm, From date/To date, 3 panel cột đồng nhất |
| `ttm_monitor_login_and_password_reset_ui.png` | Login và form reset ban đầu |
| `ttm_monitor_password_reset_modal.png` | Login cập nhật: popup Request change password chỉ có CAPTCHA, ghi nhớ đăng nhập 24h/2h |
| `epic_detail_dashboard_overview.png` | Epic Detail dashboard |
| `vietnamese_user_management_dashboard.png` | User Management CRUD |
| `project_permissions_dashboard_modal.png` | Popup phân quyền dự án có search gần đúng và sort A-Z |
| `ttm_monitor_domain_management_dashboard.png` | Domain Management |
| `ttm_monitor_holiday_management_dashboard.png` | Holiday Management ban đầu |
| `vietnamese_holiday_management_dashboard.png` | Holiday Management cập nhật: ngày bắt đầu/kết thúc, toggle nhiều ngày |
| `ttm_monitor_csv_import_dashboard.png` | Data Source / CSV Import |
| `status_alert_rules_prototype.png` | Prototype Status Alert Rules cho MVP1 |

## 3. Homepage cập nhật

Homepage cần thể hiện:

- Menu `Quản trị hệ thống` gom các chức năng admin.
- Filter `From date` và `To date`.
- Panel 1, Panel 2, Panel 3 có thứ tự cột tương đương.
- Cột đặc thù từng panel nằm cuối.
- Cột `Cảnh báo` trên danh sách Epic.

## 4. Login cập nhật

Login cần có:

- Label Username có ghi chú `(không cần @mbbank.com.vn)`.
- Checkbox `Ghi nhớ đăng nhập`.
- Ghi chú rõ: checked lưu 24 tiếng, unchecked lưu 2 tiếng.
- Link `Request change password`.
- Không hiển thị dòng subtitle cuối về Authentication provider.

Popup Request change password:

- Chỉ có CAPTCHA.
- Nút `Gửi`.
- Nút `Hủy`.
- Không yêu cầu nhập form cấp lại mật khẩu.

## 5. User Management cập nhật

Popup phân quyền dự án phải có:

- Search gần đúng.
- Sort A-Z.
- Multi-select.
- Tag các dự án đã chọn.
- Không phụ thuộc vào cuộn chuột để tìm dự án.

## 6. Holiday cập nhật

Form Holiday cần có:

- Toggle `Nhiều ngày` mặc định tắt.
- Ngày bắt đầu.
- Ngày kết thúc disabled khi toggle tắt.
- Khi toggle bật, nhập được khoảng ngày.
- Bỏ toggle áp dụng toàn hệ thống.
- Bỏ nút import danh sách.

## 7. Status Alert Rules cập nhật

Màn hình quản lý trạng thái Epic MVP1 chỉ cần quản lý:

- Design.
- In Progress.

Theo 2 loại Epic:

- Epic đơn giản.
- Epic phức tạp.

Các cột chính:

- Loại Epic.
- Trạng thái Epic.
- Cảnh báo sớm.
- Cảnh báo muộn.
- Fail TTM-CNTT.
- Active.
- Actions.

Tất cả offset tính bằng ngày làm việc sau T1.

Màn hình triển khai tại `/admin/status-alert-rules`: hiển thị card table các rule hiện có, offset diễn giải theo định dạng `T1 + N ngày làm việc`, badge Active/Inactive và `TableAction` Chỉnh sửa. Nút primary `Thêm rule` mở modal ngắn dùng Select Loại Epic, Input Trạng thái Epic, các Input number và checkbox active; cặp Loại Epic/Trạng thái trùng bị báo lỗi. Modal chỉnh sửa giữ loại/trạng thái ở chế độ chỉ đọc.

## 8. Hệ thống giao diện dùng chung

> Bản cập nhật 2026-08-09: `gecko-inspired-ui-skill` là source of truth cho visual language. Các mô tả Facebook/glass cũ bên dưới chỉ còn giá trị lịch sử khi mâu thuẫn với nội dung này.

- Ứng dụng dùng dark dashboard compact, data-first: surface app/sidebar/panel/elevated, border subtle và accent cyan semantic; không dùng gradient, glow hoặc glass trang trí.
- Card radius 8px, control 38px, primary button cyan; semantic color chỉ biểu đạt trạng thái.
- Table header sticky, chữ/dates/status căn trái, số căn phải và action căn phải. Row hover dùng `surface-hover`.
- Mỗi bảng danh sách dữ liệu dùng toolbar chuẩn có ô tìm kiếm gần đúng và nút reset dạng icon; reset trả bảng về trạng thái tìm kiếm/bộ lọc ban đầu. Không tự thêm bộ lọc trường dữ liệu nếu BRD hoặc yêu cầu nghiệp vụ chưa chỉ định.
- Form mặc định một cột, chỉ dùng hai cột cho trường ngắn liên quan. Modal chỉ dùng cho form tạo ngắn; primitive Modal chỉ focus khi mở, không được giành focus trong lúc gõ.
- Avatar ở footer left panel mở popover menu gồm `Thông tin cá nhân` (placeholder cho giai đoạn sau) và `Cài đặt`. Cài đặt hiện có trường Chế độ hiển thị Light/Dark, mặc định Light; preference lưu local storage key `ttm-monitor.appearance-theme` và load lại mỗi lần sử dụng ứng dụng.
- Light mode dùng canvas xanh-xám đậm hơn panel trắng, border xanh-xám rõ và bề mặt elevated light-blue để card, table, control và right panel không hòa lẫn với background. Primary button dùng blue rõ, secondary/outline dùng nền light-blue.

### 8.1. Visual language

- Accent chính: Facebook blue `#0866ff`; không thêm accent trang trí thứ hai.
- Nền ứng dụng dùng neutral xám xanh, surface chính màu trắng, trạng thái success/warning/danger dùng semantic token riêng.
- Sidebar, top dock và modal được phép dùng hiệu ứng frosted glass kiểu macOS trên web. Card dữ liệu và form thông thường dùng surface đặc để bảo đảm độ đọc.
- Corner radius mặc định là 12px cho card, input và button; dialog 16px; badge và avatar dùng pill/circle.
- Typography dùng Geist qua `next/font`, hỗ trợ tiếng Việt và không tải font từ CDN ở runtime.
- Toàn bộ body, input/select, label, helper/error, component, popup, tooltip và menu item dùng chung semantic token `--text-app` bằng 11.5px, tương đương đoạn nội dung chính trong box "Thông tin chung & Hướng dẫn". Phân cấp nội dung dùng font weight, màu và khoảng cách thay vì thay đổi cỡ chữ.
- Left panel dùng navy `#102a56` chuyển xuống `#0b1f43`, text/icon sáng và active item dùng blue `#1769e8`. Right panel dùng light grey, mặc định collapse 56px ở desktop và cao tối thiểu 360px; toggle đặt đầu panel, icon box căn giữa cân đối, tooltip hiện về bên trái icon. Expand hiển thị các box phụ trợ.
- Badge và table action có chiều cao cố định 32px, dạng pill, không wrap và chỉ thay đổi chiều rộng theo nội dung. Table action dùng primitive `TableAction` với màu semantic neutral/info/warning/danger, thay vì button bo góc thông thường. Table dùng header xám xanh nhạt, font normal, căn giữa và tối đa một dòng. Body dùng zebra rows; mỗi record hiển thị trên một dòng không wrap. Bảng nhiều cột scroll ngang trong container thay vì nén nội dung.

### 8.2. Kiến trúc component

```text
src/components/
  layout/
    AppShell.tsx
    RightPanel.tsx
  ui/
    Alert.tsx
    Badge.tsx
    Button.tsx
    Card.tsx
    EmptyState.tsx
    FormField.tsx
    Input.tsx
    Modal.tsx
    Select.tsx
    Skeleton.tsx
    Table.tsx
    DataTableToolbar.tsx
    TableAction.tsx
    Tooltip.tsx
  <module>/
    <component theo nghiệp vụ>.tsx
```

Màn hình Duyệt dữ liệu dùng component nghiệp vụ `src/components/data-review/DataReviewTable.tsx`; route `/data-review/[batchId]` chỉ xử lý tham số route. Component dùng primitives `Select`, `Table`, `TableAction`, `Skeleton`, `EmptyState` và `Alert`, không định nghĩa control cục bộ trong page.

`Modal` là primitive dùng chung. Focus chỉ được đặt khi hộp thoại mở; việc render lại form do nhập liệu không được chuyển focus về nút đóng.

- `layout/` chứa cấu trúc dùng cho nhiều route.
- `ui/` chỉ chứa primitive tổng quát, không chứa logic nghiệp vụ.
- Thư mục module chứa component có ngôn ngữ nghiệp vụ, ví dụ `data-source/FileDropzone.tsx`.
- Page chịu trách nhiệm điều phối state và gọi API; không định nghĩa lại primitive hoặc component dùng lại ngay bên trong form.
- `DataTableToolbar` là primitive chung cho tìm kiếm gần đúng và reset; page truyền các trường tìm kiếm phù hợp qua state/logic nghiệp vụ, không đưa filter mặc định vào toolbar.
- `MultiSelect` là primitive dropdown chọn nhiều, có ô tìm kiếm gần đúng option ở đầu popover, danh sách cuộn và tóm tắt số lựa chọn trên trigger; dùng cho Domain, Dự án và các danh mục chọn nhiều sau này.

### 8.3. Form và trạng thái tương tác

- Label luôn nằm trên control, liên kết bằng `htmlFor` và `id`.
- Helper/error dùng `aria-describedby`; control lỗi dùng `aria-invalid`; lỗi dùng role phù hợp.
- Focus ring, disabled, hover và active state phải thống nhất qua primitive.
- Loading dùng skeleton gần với hình dạng nội dung thật; empty state có tiêu đề và hướng dẫn; error hiển thị theo ngữ cảnh.
- Modal phải có `role="dialog"`, `aria-modal`, tiêu đề được liên kết và hỗ trợ đóng bằng Escape.
- Icon dùng một họ Phosphor, không tự vẽ SVG icon trong component.
- Tooltip sidebar dùng portal để không bị cắt bởi container scroll; mở tức thì khi hover/focus và không phụ thuộc vào độ trễ của tooltip native.

### 8.4. Responsive và accessibility

- App shell desktop dùng sidebar cố định với hai trạng thái: collapse 72px và expand 256px. Mặc định là collapse, chỉ hiện icon; hover/focus hiện tooltip tên menu. Expand hiển thị icon và title. Toggle footer chỉ dùng icon, không có text. Dưới breakpoint `lg`, sidebar chuyển thành drawer expand có overlay và nút đóng.
- Nội dung nhiều cột phải collapse về một cột trên màn hình nhỏ; table được phép cuộn ngang trong container riêng.
- Tôn trọng `prefers-reduced-motion` và `prefers-reduced-transparency`.
- Text, form control và button phải đạt WCAG AA; touch target chính tối thiểu 40px, action quan trọng ưu tiên 44px.
