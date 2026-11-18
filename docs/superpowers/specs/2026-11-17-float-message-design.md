# Float message — thiết kế (2026-11-17, cập nhật hàng đợi 2026-11-18)

Yêu cầu của chủ sản phẩm (`REQ-20261117-03`, `REQ-20261118-02`): một hộp thông báo nổi giống hộp "PopupKit" (bo tròn mạnh, có icon
message, chữ tuỳ chỉnh), cấu hình ở Quản trị hệ thống → **Float message** (SUPERADMIN), đồng thời dùng chung làm thành phần hiển thị
thống nhất cho các thông báo nổi trong ứng dụng theo cơ chế hàng đợi ưu tiên (Priority Queue).

## Phạm vi

- Hiện cho **mọi user đã đăng nhập**, trên mọi màn hình trong `AppShell`. Không hiện ở màn đăng nhập, `/suspended`, và khi
  user chỉ được xem Bản tin do hệ thống tạm dừng.
- Nội dung cấu hình của SUPERADMIN lưu tại bảng singleton `float_message_settings` (`id = 1`), là **một dòng văn bản thuần**
  (textbox, tối đa 256 ký tự; xuống dòng dán vào thành dấu cách) — render bằng React (tự escape), không HTML. Hộp hiện tối đa khoảng
  50 ký tự mỗi dòng, dài hơn thì tự xuống dòng.

## Giao diện & Animation (`src/components/layout/FloatMessage.tsx`)

- **Độ trong suốt 70%**: nền hộp `bg-fb-surface/70` kết hợp `backdrop-blur-md`, chữ `12px` đậm.
- **Animation hiển thị**: trượt ra từ phía lề phải của màn hình (`translate-x-[calc(100%+1.5rem)] opacity-0` → `translate-x-0 opacity-100`)
  với tốc độ **0.7x** (`duration-[430ms] ease-out`, tương ứng `300ms / 0.7`).
- **Nút đóng message**: chữ `'x'` ở góc trên bên phải hộp.
- Lớp hiển thị `z-[50]`: trên header (`z-30`) và sidebar (`z-40`), dưới modal (`z-[60]`).

## Cơ chế Hàng đợi ưu tiên (`src/lib/bottom-right-slot.ts`, thuần — có test)

Mọi thông báo sử dụng Float message đi qua hàng đợi `FloatMessageQueue` theo thứ tự ưu tiên:

| Thứ tự ưu tiên | Loại nội dung | Timeout | Nút đóng `'x'` |
|---|---|---|---|
| **#1 (`CACHE = 1`)** | Thông báo Tạo cache (`DailyCacheWarmer`, `CacheStatusPanel`, cảnh báo `x-cache-stale`, lưu tiêu chí/rule cảnh báo) | Luôn = **10 giây** | Luôn có (`true`) |
| **#2 (`ASSIGNED_TASKS = 2`)** | Thông báo My assigned tasks (`AssignedEpicsNotice`: *"TASK: Bạn có {n} epic được giao task!"*, có viền màu brown `border-2 border-[var(--header-widget-e2e-color)]`) | Luôn = **10 giây** | Luôn có (`true`) |
| **Cuối cùng (`SYSTEM_CONFIG = 3`)** | Nội dung Float message cấu hình tại Quản trị hệ thống của SUPERADMIN | Theo cấu hình (`1–3600` giây hoặc `NULL` = luôn hiển thị) | Theo cấu hình (`dismissible`) |

Quy tắc điều phối hàng đợi:
- Các nội dung không thuộc cấu hình Quản trị hệ thống của SUPERADMIN (`#1`, `#2`) luôn tự động áp dụng `timeout = 10 giây` và `dismissible = true` (nút đóng chữ `'x'`).
- Nội dung cấu hình của SUPERADMIN (`#3`) luôn xếp hàng cuối cùng (nếu `#3` đang hiển thị mà có thông báo `#1` hoặc `#2` mới phát sinh, `#3` tự nhường chỗ và quay lại cuối hàng đợi).
- **Thời gian chờ 2 giây (`FLOAT_MESSAGE_GAP_MS = 2000`)**: các float message lần lượt hiển thị cách nhau 2 giây. Message có mức ưu tiên sau chỉ được hiển thị sau khi message trước đã kết thúc timeout + 2 giây chờ, hoặc sau khi message trước bị tắt bằng nút `'x'` + 2 giây chờ.
- Với nội dung `#3` của SUPERADMIN: đóng (`x`) hoặc tự tắt chỉ ẩn ở màn hình đang xem — tải lại trang hoặc chuyển sang màn hình khác (`pathname` đổi) sẽ đưa `#3` vào cuối hàng đợi để hiển thị lại.

## Contract

- `GET /api/float-message` (user đã đăng nhập) → `{ message: { text, autoHideSeconds, dismissible, position, version } | null }`
  — `null` khi tắt / ngoài khoảng ngày / nội dung trống. Không lộ người sửa, ngày cấu hình.
- `GET /api/admin/float-message` (SUPERADMIN) → toàn bộ cấu hình + `updatedAt`, `updatedByName`.
- `PUT /api/admin/float-message` (SUPERADMIN) body `{ messageText, isActive, startDate, endDate, autoHideSeconds, dismissible,
  position }` → cấu hình đã lưu. Sai dữ liệu → 400 kèm lý do. Mỗi lần lưu ghi 1 dòng `audit_logs` (`FLOAT_MESSAGE_UPDATE`).
  Chế độ View as bị proxy chặn ghi như mọi API khác.

## Sao lưu / export

`float_message_settings` nằm trong danh sách export và Smart export (như `info_banners`): môi trường test nhận cùng message
với production.
