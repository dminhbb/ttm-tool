# Float message — thiết kế (2026-11-17)

Yêu cầu của chủ sản phẩm (REQ-20261117-03): một hộp thông báo nổi giống hộp "PopupKit" (bo tròn mạnh, có icon
message, chữ tuỳ chỉnh), cấu hình ở Quản trị hệ thống → **Float message** (SUPERADMIN).

## Phạm vi

- **Một message duy nhất** (bảng singleton `float_message_settings`, `id = 1`) — giống "Tạm dừng hệ thống", không phải
  danh sách như "Popup quảng cáo".
- Hiện cho **mọi user đã đăng nhập**, trên mọi màn hình trong `AppShell`. Không hiện ở màn đăng nhập, `/suspended`, và khi
  user chỉ được xem Bản tin do hệ thống tạm dừng.
- Nội dung là **một dòng văn bản thuần** (textbox, tối đa 256 ký tự; xuống dòng dán vào thành dấu cách) — render bằng React
  (tự escape), không HTML. Hộp hiện tối đa khoảng 50 ký tự mỗi dòng, dài hơn thì tự xuống dòng.

Ngoài phạm vi: nhiều message cùng lúc, nhắm theo role/màn hình, đếm lượt xem, link trong message.

## Quy tắc hiển thị (`src/lib/float-message.ts`, thuần — có test)

Giao diện hộp (2026-11-17, lần 2): nền trắng mờ 80% (làm mờ phía sau), kích thước và cỡ chữ nhỏ hơn 20% so với bản đầu (chữ 12px).

| Cấu hình | Ý nghĩa |
|---|---|
| `is_active` | Tắt ⇒ không hiện. |
| `start_date` / `end_date` | Hiện từ / đến ngày (giờ Việt Nam, tính cả hai đầu); trống = không giới hạn phía đó. Ngày bắt đầu phải ≤ ngày kết thúc. |
| `auto_hide_seconds` | Tự biến mất sau N giây (1–3600); `NULL` = **luôn hiển thị**. |
| `dismissible` | Có nút X ở góc để đóng. |
| `position` | `TOP_RIGHT` (dưới header, góc phải) hoặc `BOTTOM_RIGHT`. |

- Nội dung trống thì không hiện dù đang bật.
- Đã đóng (X) hoặc đã tự tắt: **chỉ ẩn ở màn hình đang xem** — tải lại trang, mở lại trang hay chuyển màn hình là message
  hiện lại (chủ sản phẩm 2026-11-17: thông tin quan trọng, phải tiếp tục hiển thị). Không ghi nhớ trong trình duyệt.
- **Góc phải dưới hiện sau popup thông báo**: popup "My assigned epics — Bạn có n epic được giao task!"
  (`AssignedEpicsNotice`, cũng ở góc phải dưới, 15 giây) giữ "chỗ góc phải dưới" (`src/lib/bottom-right-slot.ts`) từ lúc nó
  bắt đầu kiểm tra tới lúc biến mất; Float message ở góc phải dưới chờ chỗ này trống mới hiện. Thời gian tự tắt tính từ
  lúc message thực sự hiện.
- Lớp hiển thị `z-[50]`: trên header (`z-30`) và sidebar (`z-40`), dưới modal (`z-[60]`) và popup thông báo (`z-[110]`).

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
