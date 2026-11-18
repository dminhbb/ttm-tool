# Float message — Quản trị hệ thống → "Float message" & Hàng đợi thông báo nổi (mọi màn hình)

Cập nhật lần cuối: 2026-11-18 (REQ-20261118-04: URL, viền nổi bật, danh sách & thứ tự ưu tiên). Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

## Mục đích

Hộp thông báo nổi bo tròn (icon message + nội dung chữ, độ trong suốt 70% `bg-fb-surface/70`, trượt từ lề phải màn hình với tốc độ 0.7x)
hiển thị thống nhất cho các thông báo nổi trên toàn ứng dụng thông qua cơ chế **Hàng đợi ưu tiên (Priority Queue)**:
1. **Ưu tiên #1 (`CACHE = 1`)**: Thông báo Tạo cache (`DailyCacheWarmer`, `CacheStatusPanel`, `installCacheStaleWatcher`, `StatusAlertRulesSettings`) — luôn có timeout = 10s và nút đóng `'x'`.
2. **Ưu tiên #2 (`ASSIGNED_TASKS = 2`)**: Thông báo My assigned tasks (`AssignedEpicsNotice`: *"TASK: Bạn có {n} epic được giao task!"*, viền màu accent của theme) — luôn có timeout = 10s và nút đóng `'x'`.
3. **Ưu tiên cuối (`SYSTEM_CONFIG = 3`)**: Nội dung Float message do SUPERADMIN cấu hình tại Quản trị hệ thống (bật/tắt, khoảng ngày, số giây tự tắt / luôn hiển thị, nút `'x'`, vị trí, URL + "Mở trong tab mới", "Viền nổi bật", Xem trước).

Mỗi nguồn có **mã tự sinh** (`FM-001` Tạo cache, `FM-002` My assigned tasks, `FM-003` nội dung SUPERADMIN) và **thứ tự ưu tiên 1 chữ số** (1 = ưu tiên nhất): FM-001/FM-002 sửa được (1–8, bảng `float_message_priorities`, mặc định 1 và 2), FM-003 luôn cuối (9). Hàng đợi xếp theo (thứ tự ưu tiên, mã A-Z, thứ tự vào hàng). Danh sách này hiện ở dưới form trong tab Float message. (Hằng #1/#2/#3 ở trên là "loại" trong code; thứ tự hiển thị thật theo cấu hình.)

Các message hiển thị tuần tự cách nhau **2 giây chờ** (`FLOAT_MESSAGE_GAP_MS = 2000`) sau khi message trước hết timeout hoặc bị tắt.
Spec: `docs/superpowers/specs/2026-11-17-float-message-design.md`. Tài liệu sản phẩm mục 15.1.

## Điểm vào

| Loại | Đường dẫn |
|---|---|
| Màn hình cấu hình | Tab "Float message" trong `src/components/settings/SystemAdminModal.tsx` → `src/components/settings/FloatMessagePanel.tsx` |
| Hiển thị & Hàng đợi | `src/components/layout/FloatMessage.tsx` (`FloatMessageDisplay`, gắn trong `AppShell.tsx`; `FloatMessagePreview` cho nút Xem trước); hàng đợi `src/lib/bottom-right-slot.ts` |
| Các nguồn đẩy vào hàng đợi | `src/components/layout/DailyCacheWarmer.tsx`, `src/components/data-source/CacheStatusPanel.tsx`, `src/components/status-alert-rules/StatusAlertRulesSettings.tsx`, `src/components/layout/AppShell.tsx` (`installCacheStaleWatcher`), `src/components/layout/AssignedEpicsNotice.tsx` |
| API | `GET/PUT/PATCH /api/admin/float-message` (SUPERADMIN; PATCH = thứ tự ưu tiên) → `src/app/api/admin/float-message/route.ts`; `GET /api/float-message` (user đã đăng nhập) → `src/app/api/float-message/route.ts` |

## Luồng dữ liệu

```text
Nguồn #1 (Tạo cache)      → enqueueCacheFloatMessage(...)         ─┐
Nguồn #2 (Assigned tasks) → enqueueAssignedTasksFloatMessage(...) ─┼→ FloatMessageQueue (bottom-right-slot.ts) → FloatMessageDisplay
Nguồn #3 (SUPERADMIN DB)  → GET /api/float-message                ─┘
```

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|
| Quy tắc hiển thị / kiểm tra dữ liệu cấu hình SUPERADMIN (ngày, số giây, độ dài, vị trí, URL, thứ tự ưu tiên, mã FM-xxx, danh sách) | `src/lib/float-message.ts` (thuần, có test) |
| Hàng đợi ưu tiên (#1, #2, #3), timeout 10s mặc định, thời gian chờ 2s | `src/lib/bottom-right-slot.ts` (`FloatMessageQueue`, thuần, có test) |
| Đọc / lưu cấu hình DB, cache 10 giây | `src/lib/float-message-service.ts` |
| Giao diện hộp (độ trong suốt 70%, nút `'x'`), animation trượt từ lề phải tốc độ 0.7x (`430ms`) | `src/components/layout/FloatMessage.tsx` |
| Đẩy thông báo Tạo cache (#1) & My assigned tasks (#2) | `src/components/layout/DailyCacheWarmer.tsx`, `src/components/layout/AssignedEpicsNotice.tsx`, `src/components/layout/AppShell.tsx` |

## Bảng DB

- Đọc/ghi: `float_message_settings` (singleton `id = 1`, migration `20261129_create_float_message_settings`; thêm `url`, `open_in_new_tab`, `highlight_border` ở migration `20261130_float_message_url_priority`).
- Đọc/ghi: `float_message_priorities` (`code` FM-001 / FM-002, `priority` 1–8; cùng migration 20261130).
- Ghi: `audit_logs` (`FLOAT_MESSAGE_UPDATE`, `FLOAT_MESSAGE_PRIORITY_UPDATE`).

## Contract

- `PublicFloatMessage { text, autoHideSeconds, dismissible, position, url, openInNewTab, highlightBorder, version }` — `version` = `updated_at`, đổi mỗi lần lưu. `GET /api/float-message` trả `{ message, priorities: { "FM-001", "FM-002" } }`.
- `url`: `http(s)://...` hoặc đường dẫn nội bộ `/...` (`normalizeFloatMessageUrl`, kiểm tra ở form và PUT → 400); `openInNewTab` mặc định FALSE (tab hiện tại); `highlightBorder` mặc định FALSE (viền màu accent của theme).
- `PATCH /api/admin/float-message` `{ priorities: { "FM-001": n, "FM-002": n } }`, n = 1..8.
- `position`: `TOP_RIGHT` | `BOTTOM_RIGHT`; `auto_hide_seconds` NULL = luôn hiển thị (CHECK 1–3600).
- Mọi nội dung không thuộc cấu hình Quản trị hệ thống của SUPERADMIN luôn có `autoHideSeconds = 10` và `dismissible = true` (nút `'x'`).
- Thời gian chờ giữa 2 message liên tiếp: `FLOAT_MESSAGE_GAP_MS = 2000` (2 giây).

## Test

`src/lib/__tests__/float-message.test.ts` (kiểm tra dữ liệu, URL / tab mới / viền nổi bật, thứ tự ưu tiên & danh sách, hàng đợi theo thứ tự cấu hình, khoảng ngày, dữ liệu công khai, thứ tự ưu tiên hàng đợi `#1 → #2 → #3`, timeout 10s, khoảng chờ 2s sau timeout và sau khi bấm `'x'`).
`src/lib/__tests__/db-backup-tables.test.ts` bảo vệ việc bảng nằm trong danh sách export.

## Phụ thuộc chéo

- Sao lưu / Smart export: `float_message_settings` và `float_message_priorities` nằm trong `EXPORTABLE_TABLES` và `SMART_CONFIG_TABLES` (`src/lib/db-backup-tables.ts`).

## Bẫy đã biết

- Chủ sản phẩm 2026-11-18: mọi thông báo dùng Float message phải đi qua hàng đợi ưu tiên (`#1 Tạo cache` → `#2 My assigned tasks` → `#3 SUPERADMIN config`), cách nhau 2 giây sau khi message trước hết timeout hoặc bị tắt; các message ngoài `#3` luôn có timeout 10s và nút `'x'`.
- Dòng mặc định do migration tạo có `updated_at` riêng: panel chỉ coi là "đã cấu hình" khi có người lưu (`updated_by_user_id`).
- Văn bản thuần, không HTML: React tự escape — đừng đổi sang `dangerouslySetInnerHTML` mà không qua `rich-html-sanitizer`.
- Chủ sản phẩm 2026-11-18 (REQ-20261118-04): "danh sách float message" được hiểu là 3 nguồn của hàng đợi (không phải nhiều message cấu hình); FM-003 luôn cuối nên không sửa thứ tự. Nếu cần nhiều message cấu hình thì phải đổi bảng singleton `float_message_settings`.
- REQ-20261118-04: float message bấm được (có URL, hoặc My assigned tasks) hiện chữ `CLICK HERE!` nhấp nháy dưới góc phải hộp (class `float-message-blink`); viền nổi bật dùng `border-fb-blue` (accent của theme), không hard-code màu.
