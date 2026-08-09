# TTM Monitor Design System Specification

> Cập nhật 2026-08-09 — `gecko-inspired-ui-skill` thay thế visual language Facebook/frosted-glass trước đây. Khi có mâu thuẫn, quy tắc dưới đây và token Gecko-inspired được ưu tiên.

## Gecko-inspired foundation

- Theme mặc định là light, data-first; dark mode dùng các surface Gecko `surface-app #17182b`, `surface-sidebar #1d1e35`, `surface-panel #252740`, `surface-elevated #2c2f4b`. Cả hai mode dùng accent cyan semantic.
- Không dùng gradient, glow hoặc glass trang trí. Bề mặt phân tách bằng border subtle; shadow chỉ dành cho dialog.
- Radius: control 6px, card 8px, container lớn 12px, badge/status pill.
- Nội dung ứng dụng 14px; heading workflow giữ compact, không dùng kiểu typography marketing.
- Bảng dùng header sticky, muted/semibold/uppercase; text, ngày và status căn trái; số/action căn phải. Status ưu tiên `● label`; badge fill chỉ khi cần nhấn mạnh.
- Form dùng field/label/input/select/textarea semantic, control 38px và focus ring cyan. Modal chỉ cho action/form ngắn, drawer/full page cho workflow dài.
- User avatar ở footer left panel mở popover contextual. Menu có Personal information và Settings; Settings lưu `light`/`dark` ở local storage `ttm-monitor.appearance-theme` và gán `data-theme` lên `html`. Mặc định/giá trị fallback là `light`.

Source of truth cho giao diện TTM Monitor từ ngày 2026-08-09. Hệ thống dùng Tailwind CSS v4, phong cách social-product lấy cảm hứng từ Facebook và frosted glass kiểu macOS ở các dock có chủ đích.

## 1. Nguyên tắc cốt lõi

- Functional first: dữ liệu, form và trạng thái thao tác phải dễ đọc trước khi thêm hiệu ứng.
- One accent: toàn hệ thống chỉ dùng Facebook blue làm accent tương tác.
- Glass with purpose: glass chỉ dành cho app shell, top dock và dialog; không áp dụng lên mọi card.
- Reusable by default: page điều phối dữ liệu, primitive xử lý presentation và accessibility.
- Responsive from the shell: desktop sidebar chuyển thành mobile drawer, content grid collapse rõ ràng.

Design dials: `DESIGN_VARIANCE 5`, `MOTION_INTENSITY 4`, `VISUAL_DENSITY 8`.

## 2. Nền tảng kỹ thuật

- Framework: Next.js 16 App Router.
- Styling: Tailwind CSS v4 qua `@tailwindcss/postcss`.
- Font: Geist và Geist Mono qua `next/font` với subset `vietnamese`.
- Icons: `@phosphor-icons/react`, một họ icon duy nhất.
- Theme hiện tại: light theme khóa ở cấp page. Dark mode chỉ triển khai khi có yêu cầu nghiệp vụ riêng và phải dùng cùng semantic token strategy.

## 3. Semantic color tokens

| Token | Giá trị | Vai trò |
|---|---|---|
| `fb-blue` | `#0866ff` | Primary action, active nav, focus |
| `fb-blue-soft` | `#e7f3ff` | Selected/active background |
| `fb-bg` | `#e6ebf1` | App canvas có tương phản rõ với surface |
| `fb-surface` | `#ffffff` | Card, input, table |
| `fb-surface-muted` | `#f1f4f7` | Secondary surface, table header |
| `fb-control` | `#e4e6eb` | Neutral control |
| `fb-border` | `#cbd3dc` | Default border |
| `fb-border-strong` | `#aeb9c6` | Card/table boundary |
| `table-header` | `#e8edf3` | Header xám xanh nhạt dùng chung của table |
| `sidebar-start` | `#102a56` | Sidebar navy phía trên |
| `sidebar-end` | `#0b1f43` | Sidebar navy phía dưới |
| `sidebar-active` | `#1769e8` | Active menu trên sidebar |
| `fb-text-primary` | `#1c1e21` | Primary text |
| `fb-text-secondary` | `#5f6670` | Supporting text |
| `status-success` | `#176b43` | Success text/icon |
| `status-warning` | `#8a5b08` | Warning text/icon |
| `status-danger` | `#c42b42` | Error/destructive text/icon |

Không hard-code hex trong JSX. Màu mới phải được định nghĩa thành semantic token nếu có vai trò dùng lại.

## 4. Typography

| Role | Size | Weight | Use |
|---|---:|---:|---|
| Page title | 11.5px | 700 | Top dock title |
| Section title | 11.5px | 700 | Card title |
| Text-only body | 11.5px | 400-600 | Hướng dẫn, summary, table |
| Form control | 11.5px | 400-500 | Text bên trong input và select |
| Form label | 11.5px | 500-600 | Label phía trên control |
| Form helper | 11.5px | 400-500 | Helper và error dưới control |
| Button, popup và menu | 11.5px | 500-700 | Action, tooltip, modal và điều hướng |

Heading dùng tracking nhẹ `-0.01em` đến `-0.02em`. Table header không dùng uppercase bắt buộc vì tiếng Việt cần giữ khả năng quét nhanh.

`--text-app` là source of truth duy nhất cho cỡ chữ toàn ứng dụng và có giá trị 11.5px. App shell áp dụng token này cho body, form, component, popup và menu; tooltip render qua portal phải dùng trực tiếp utility `text-app`. Phân cấp nội dung dựa trên font weight, màu và khoảng cách, không dựa trên cỡ chữ cục bộ.

## 5. Shape, spacing và elevation

- Card, input, select, button, nav item: radius 12px.
- Dialog: radius 16px.
- Badge và `TableAction`: pill, chiều cao cố định 32px, không wrap; chiều rộng theo nội dung. `TableAction` chỉ dùng trong table với variants `neutral`, `info`, `warning`, `danger`; icon đặt trước label, gap 8px. Avatar: circle.
- Control height: 40px mặc định, action lớn 44px.
- Card padding: 20px; card gap: 16px; page gap: 24px.
- `shadow-card` dùng cho surface dữ liệu; `shadow-glass` dùng cho dock; `shadow-dialog` chỉ dùng modal/drawer.
- Card và table dùng `fb-border-strong` để không hòa lẫn vào app canvas.

## 5.1. Sidebar states

- Desktop mặc định collapse: rộng 72px, chỉ hiển thị icon, tooltip tùy chỉnh tức thì và accessible name.
- Desktop expand: rộng 256px, hiển thị icon, title, group label và trạng thái sắp có.
- Toggle nằm ở footer sidebar, chỉ hiển thị icon collapse/expand, có `aria-expanded` và accessible label thay đổi theo trạng thái.
- Mobile luôn mở drawer ở trạng thái expand để giữ khả năng đọc và touch target.
- Sidebar dùng navy gradient, không dùng surface trắng hoặc glass sáng.

## 6. Component contracts

- `FormField`: owner duy nhất của label, required mark, helper/error và ARIA description.
- `Input`/`Select`: nhận label/helper/error qua props, không yêu cầu page dựng wrapper thủ công.
- `Button`: variants `primary`, `secondary`, `outline`, `danger`, `ghost`, `glass`; label không wrap.
- `TableAction`: action chuẩn trong table, không dùng `Button` thường. Giữ pill cao 32px giống Badge, padding ngang 12px, text semibold, icon 16px; màu dùng semantic `neutral`, `info`, `warning`, `danger`.
- `Alert`: variants `success`, `warning`, `error`, `info`; error dùng live semantics phù hợp.
- `EmptyState` và `Skeleton`: bắt buộc cho màn hình có fetch/list.
- `Modal`: có dialog semantics, Escape close, focus ban đầu và khóa body scroll.
- `Modal` không chạy lại logic focus chỉ vì callback `onClose` được render lại; người dùng phải có thể nhập liên tiếp trong mọi Input/Select/textarea của form popup.
- `Table`: giữ semantic table HTML; header nền `table-header`, căn giữa, font normal và tối đa một dòng; body dùng zebra rows, hover nhẹ và cell không wrap. Bảng nhiều cột đặt `min-width` theo nội dung rồi scroll ngang ở `TableContainer`.
- `DataReviewTable`: dùng chung Table primitive cho tree `Epic → Story → Subtask`; nút mở/đóng là `TableAction` variant `info`, không tạo kiểu action riêng. Chỉ phân trang hàng cấp Epic (10 item/trang); filter đặt phía trên bảng và Component/s disabled cho tới khi có Project.
- `DataReviewTable` có bốn filter dùng `Select`: Project, Status, Issue type và Component/s. Component/s lấy từ catalog tích lũy `project_components`, chỉ hiển thị item active theo Project; Issue type lọc các Epic có nhánh phù hợp để không làm mất ngữ cảnh cây.
- `Tooltip`: dùng portal, hiển thị tức thì khi hover/focus và không bị cắt bởi overflow container; hỗ trợ side `left` hoặc `right` theo vị trí panel.
- `RightPanel`: layout phụ trợ dùng nền light grey, desktop mặc định collapse 56px và cao tối thiểu 360px; toggle icon ở đầu panel, icon box căn giữa cân đối và tooltip side `left`; expand 360px để hiện các box. Mobile dùng panel ngang trong luồng nội dung.
- Component nghiệp vụ đặt dưới `src/components/<module>/`, không đặt trong page function.

## 7. Frosted glass web approximation

Class `glass-surface` dùng `backdrop-filter`, border sáng và inner highlight. Đây là web approximation, không phải Apple Liquid Glass chính thức.

- Phải có fallback đặc trong `@supports not`.
- Phải tắt blur trong `prefers-reduced-transparency: reduce` khi trình duyệt hỗ trợ.
- Nội dung trên glass vẫn phải đạt WCAG AA khi blur không hoạt động.

## 8. Motion và accessibility

- Motion chỉ dùng cho feedback và state transition; ưu tiên transform/opacity.
- Tôn trọng `prefers-reduced-motion` toàn cục.
- Focus visible dùng ring xanh 3px có alpha.
- Form label luôn liên kết control; error dùng `aria-invalid` và `aria-describedby`.
- Không dùng icon SVG tự vẽ, placeholder-as-label hoặc chỉ dùng màu để truyền đạt trạng thái.

## 9. Verification trước release

- `npm.cmd run lint`
- `npm.cmd run build`
- Kiểm tra desktop và mobile shell.
- Kiểm tra loading, empty, success, warning, error và disabled states.
- Kiểm tra fallback khi tắt backdrop filter và reduced motion/transparency.
