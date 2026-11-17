# Float message — Quản trị hệ thống → "Float message" (mọi màn hình)

Cập nhật lần cuối: 2026-11-17. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

## Mục đích

Hộp thông báo nổi bo tròn (icon message + một dòng chữ) hiện cho mọi user đã đăng nhập ở góc phải trên hoặc dưới; SUPERADMIN
cấu hình nội dung, bật/tắt, khoảng ngày, số giây tự tắt / luôn hiển thị, nút X, vị trí, có Xem trước. BRD: không có (REQ-20261117-03).
Spec: `docs/superpowers/specs/2026-11-17-float-message-design.md`. Tài liệu sản phẩm mục 15.1.

## Điểm vào

| Loại | Đường dẫn |
|---|---|
| Màn hình cấu hình | Tab "Float message" trong `src/components/settings/SystemAdminModal.tsx` → `src/components/settings/FloatMessagePanel.tsx` |
| Hiển thị | `src/components/layout/FloatMessage.tsx` (`FloatMessageDisplay`, gắn trong `AppShell.tsx`; `FloatMessagePreview` cho nút Xem trước) |
| API | `GET/PUT /api/admin/float-message` (SUPERADMIN) → `src/app/api/admin/float-message/route.ts`; `GET /api/float-message` (user đã đăng nhập) → `src/app/api/float-message/route.ts` |

## Luồng dữ liệu

```text
FloatMessagePanel → PUT /api/admin/float-message → float-message-service.ts → float_message_settings (+ audit_logs)
float_message_settings → getPublicFloatMessage (hôm nay giờ VN) → GET /api/float-message → FloatMessageDisplay
```

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|
| Quy tắc hiển thị / kiểm tra dữ liệu (ngày, số giây, độ dài, vị trí) | `src/lib/float-message.ts` (thuần, có test) |
| Đọc / lưu, cache 10 giây | `src/lib/float-message-service.ts` |
| Giao diện hộp, vị trí, lớp z-index, nhớ "đã đóng" | `src/components/layout/FloatMessage.tsx` |
| Chờ popup góc phải dưới | `src/lib/bottom-right-slot.ts` + `src/components/layout/AssignedEpicsNotice.tsx` |

## Bảng DB

- Đọc/ghi: `float_message_settings` (singleton `id = 1`, migration `20261129_create_float_message_settings`).
- Ghi: `audit_logs` (`FLOAT_MESSAGE_UPDATE`).

## Contract

- `PublicFloatMessage { text, autoHideSeconds, dismissible, position, version }` — `version` = `updated_at`, đổi mỗi lần lưu.
- `position`: `TOP_RIGHT` | `BOTTOM_RIGHT`; `auto_hide_seconds` NULL = luôn hiển thị (CHECK 1–3600).
- Đóng (X) / tự tắt chỉ ẩn ở màn hình đang xem (`FloatMessageDisplay` nhớ `pathname`); không lưu gì trong trình duyệt.

## Test

`src/lib/__tests__/float-message.test.ts` (kiểm tra dữ liệu, khoảng ngày, dữ liệu công khai, chỗ góc phải dưới).
`src/lib/__tests__/db-backup-tables.test.ts` bảo vệ việc bảng nằm trong danh sách export. Giao diện chưa có test tự động.

## Phụ thuộc chéo

- Sao lưu / Smart export: `float_message_settings` nằm trong `EXPORTABLE_TABLES` và `SMART_CONFIG_TABLES` (`src/lib/db-backup-tables.ts`).
- Popup "epic được giao task" (`AssignedEpicsNotice`) giữ chỗ góc phải dưới — popup mới đặt ở góc đó cũng nên giữ chỗ.

## Bẫy đã biết

- Chủ sản phẩm 2026-11-17: ở góc phải dưới, message phải hiện **sau** popup thông báo (không chồng lên); thông tin quan trọng nên
  đóng rồi vẫn hiện lại khi tải lại trang / chuyển màn hình; nội dung là textbox 1 dòng ≤ 256 ký tự, hộp ≤ ~50 ký tự mỗi dòng.
- Dòng mặc định do migration tạo có `updated_at` riêng: panel chỉ coi là "đã cấu hình" khi có người lưu (`updated_by_user_id`).
- Văn bản thuần, không HTML: React tự escape — đừng đổi sang `dangerouslySetInnerHTML` mà không qua `rich-html-sanitizer`.
