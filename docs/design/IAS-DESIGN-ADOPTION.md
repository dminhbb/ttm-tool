# IAS Design System — chuẩn thiết kế của ttm-tool

> **Đây là nguồn tham chiếu duy nhất về thiết kế của ứng dụng.**
> `design-system-spec.md` và `DESIGN.md` ở gốc repo đã **không còn hiệu lực** — xem mục
> [Tài liệu đã bị thay thế](#tài-liệu-đã-bị-thay-thế).
>
> Nguồn chuẩn gốc: `e:\workspace\ias-design` (MB Bank / IAS Design System).
> Bắt đầu áp dụng: 2026-10-10.

---

## 1. Kiến trúc token — ba tầng, một chiều

```
ias-tokens.css          [1] raw scale IAS        --color-primary-500: #141ED2
  (src/app/)                                     --color-neutral-300: #D9DBE9
      │
      ▼                 [2] semantic alias       --color-text-brand: var(--color-primary-500)
                            36 token                --color-border-default: var(--color-neutral-300)
      │                     TỪ VỰNG DUY NHẤT
      ▼
globals.css             [3] compat layer         --accent: var(--color-text-brand)
  :root[data-brand=ias]                          --surface-app: var(--color-bg-page)
      │                                          --text-primary: var(--color-text-primary)
      ▼
globals.css @theme          Tailwind             --color-fb-blue: var(--accent)
      │                                          --color-table-header: var(--surface-elevated)
      ▼
JSX                         class có sẵn         text-fb-blue · bg-fb-surface · border-fb-border
```

Tầng [3] là lý do toàn bộ 22 route đổi sang màu IAS **mà không phải sửa một dòng JSX nào**:
mọi tên biến cũ của app giờ chỉ là alias trỏ về semantic alias của IAS. Rollback = revert
một file.

`src/app/ttm-shared.css` làm đúng việc đó cho họ token song song `--ttm-*` của các màn
hình Epic, nhưng đặt ở `:root[data-brand="ias"]` (specificity 0-2-0) để **thắng** khối
`:root` (0-1-0) trong ba file CSS theo route **bất kể thứ tự nạp chunk** — chính việc
dựa vào thứ tự nạp là nguồn gốc lỗi "màu lúc đúng lúc sai" trước đây.

### Quy tắc dùng token

- **Chỉ dùng semantic alias** cho mọi màu tự tay đặt. Không hex gõ tay, không rgba ước lượng.
- **Khớp đúng nhóm thuộc tính**: màu chữ → `--color-text-*`, viền → `--color-border-*`,
  nền → `--color-bg-*`, icon → `--color-icon-*`. Không bao giờ dùng chéo nhóm.
- **Raw scale chỉ để DỰNG alias**, không áp trực tiếp lên element.
- **Không tự thêm alias mới.** Thêm token là quyết định của design system.

---

## 2. Bảng màu — 36 semantic alias

### Background
| Token | Hex |
|---|---|
| `--color-bg-page` | `#F4F6FA` |
| `--color-bg-surface` | `#FFFFFF` |
| `--color-bg-overlay` | `rgba(20,20,42,0.5)` |
| `--color-bg-hover` | `#F4F5FF` |
| `--color-bg-error` | `#FFF3F8` |
| `--color-bg-success` | `#F2FFFB` |
| `--color-bg-warning` | `#FFF9EF` |
| `--color-bg-brand` | `#141ED2` |
| `--color-bg-success-solid` | `#00BA88` |
| `--color-bg-warning-solid` | `#F4B740` |
| `--color-bg-error-solid` | `#EB2D4B` |

Ba tint nhạt (`bg-error`/`bg-success`/`bg-warning`) dùng cho **mặt** banner/card.
Ba `-solid` dùng cho **swatch nhỏ rực** (dot trạng thái, segment chart). Không lẫn hai nhóm.

### Text
| Token | Hex |
|---|---|
| `--color-text-primary` | `#14142A` |
| `--color-text-body` | `#4E4B66` |
| `--color-text-secondary` | `#6E7191` |
| `--color-text-muted` | `#A0A3BD` |
| `--color-text-inverse` | `#FFFFFF` |
| `--color-text-brand` | `#141ED2` |
| `--color-text-link` | `#141ED2` |
| `--color-text-accent` | `#7B61FF` |
| `--color-text-error` | `#C30052` |
| `--color-text-success` | `#00966D` |
| `--color-text-warning` | `#946200` |

### Border
`--color-border-default` `#D9DBE9` · `--color-border-strong` `#C4C4D4` ·
`--color-border-focus` `#141ED2` · `--color-border-error` `#EB2D4B` ·
`--color-border-success` `#00BA88` · `--color-border-warning` `#F4B740`

### Icon
`--color-icon-default` `#6E7191` · `--color-icon-brand` `#141ED2` ·
`--color-icon-accent` `#7B61FF` · `--color-icon-muted` `#A0A3BD` ·
`--color-icon-error` `#EB2D4B` · `--color-icon-success` `#00BA88` ·
`--color-icon-warning` `#F4B740` · `--color-icon-inverse` `#FFFFFF`

### Sidebar (mặt navy — không dùng được alias mặt sáng ở trên)
`--ias-sidebar-bg` `#0D0D2B` · `--ias-sidebar-item-text` `#CBD0E8` ·
`--ias-sidebar-leaf-text` `#8B8FBD` · `--ias-sidebar-border` `rgba(255,255,255,.08)` ·
`--ias-sidebar-hover-bg` `rgba(255,255,255,.07)` · `--ias-sidebar-search-bg` `#1C1C42`

---

## 3. Typography

Font brand: **Averta Std CY**, self-hosted WOFF2 đã subset Latin+Vietnamese
(`src/app/fonts/averta-std-cy-{400,600,700}.woff2`, ~30KB/weight).

| Scale | Size | Weight | Line-height | Class |
|---|---|---|---|---|
| H1 | 88px | 300 | 100px | `.ias-h1` |
| H2 | 44px | 500 | 52px | `.ias-h2` |
| H3 | 32px | 500 | 36px | `.ias-h3` |
| H4 | 22px | 500 | 24px | `.ias-h4` |
| H5 | 18px | 500 | 20px | `.ias-h5` |
| Subtitle 1 | 16px | 600 | 20px | `.ias-subtitle1` |
| Subtitle 2 | 14px | 600 | 20px | `.ias-subtitle2` |
| Body 1 | 16px | 500 | 20px | `.ias-body1` |
| Body 2 | 14px | 400 | 20px | `.ias-body2` |
| Caption | 12px | 500 | 16px | `.ias-caption` |

Hai cỡ lệch có chủ đích, lấy từ template đã ship của IAS (không mở đường cho việc tự
chọn cỡ mới ở chỗ khác):
- `.ias-page-title` — 20px/700 (scale gần nhất là H4 22px/500)
- header bảng — 11px/700, **dưới sàn 12px**, nhưng là spec rõ ràng của component Table
- `.ias-metric` — 24px/700, theo anatomy `DataCard`

### Hai cái sàn: 12px cho chữ tự đặt, 11px là sàn cứng

Đây là hai con số khác nhau một cách có chủ đích, và trộn lẫn chúng là cách dễ gây hại nhất:

| | Giá trị | Áp dụng cho |
|---|---|---|
| **Sàn type scale** | **12px** (Caption) | Chữ TỰ ĐẶT: nhãn, meta, body, caption |
| **Sàn cứng** | **11px** | Chỉ ba chỗ mà spec component của IAS quy định: header bảng (11px/700), `Badge` size medium, status pill |

Dưới 11px thì **không có gì** trong IAS. Overline 10px **bị loại khỏi việc khớp** vì chính
IAS không phát hành utility class cho nó, và cũng không được lách bằng cách dùng trực tiếp
`var(--type-overline-*)`.

**Vì sao lint chặn ở 11px chứ không phải 12px:** `text-[11px]` chiếm **127 trong 201** chỗ
đo được ngày 2026-10-10, và phần lớn nằm trong ô bảng. Ép tất cả lên 12px sẽ nới mỗi ô ra
một chút, làm bảng rộng thêm và **tái sinh đúng lỗi tràn mà cả đợt này đang đi sửa**. Việc
nâng các NHÃN (ngoài bảng) lên Caption 12px là việc theo từng màn hình, không làm bằng regex.

Hệ quả về layout của sàn 12px ở nơi đã áp: **9 KPI tile của `/dashboard-new` không thể nằm
một hàng ở 1366px** — strip wrap 2 hàng (`repeat(auto-fit, minmax(190px, 1fr))`). Giữ nguyên
cả 9 KPI, cả 9 nhãn, mọi click-through. Đây là đánh đổi đã được chủ sở hữu duyệt trước khi làm.

### Không có weight 500

Bộ Averta Std CY **không phát hành Medium**. Các file có sẵn là 100/200/300/400/600/700/800/900.
Type scale dùng 500 cho H4/H5/Body1/Caption, nên theo thuật toán khớp font của CSS (đích 500
→ duyệt các weight ≤ 500 theo chiều giảm dần) weight 500 render bằng **Regular 400** —
không phải faux-bold do browser tổng hợp. Đây là giới hạn của chính bộ font brand.

### Không dùng class `font-sans`

`@theme --font-sans` **không thể** trỏ về font brand: `next/font` sinh biến lúc runtime,
còn Tailwind resolve `@theme` lúc build và âm thầm bỏ mọi khai báo `--font-*` dựng từ một
`var()` nó không resolve được. Nên class `font-sans` sẽ **đè font brand bằng font hệ thống**
trên đúng nhánh DOM đó.

Trước 2026-10-10 nó nằm trên `<body>` (specificity 0-1-0, đè `body {}` 0-0-1) và khiến
**toàn bộ app render bằng Segoe UI** thay vì Inter đã preload. Metric chữ Việt của Segoe UI
rộng hơn, nên mọi con số px cứng (`w-9`, `max-w-[100px]`, `min-w-[1160px]`,
`grid-cols-[0.62fr…]`) đều lệch so với lúc thiết kế — đây là một **tác nhân hệ thống của
lỗi tràn chữ**, không phải lỗi của từng chỗ riêng lẻ. Cùng lỗi này làm
`[data-brand="legacy"] body` và `[data-brand="pink"] body` chưa từng có hiệu lực, tức
chức năng "khôi phục typeface giao diện cũ" chưa từng chạy.

Test `ias-typography.test.ts` canh để `font-sans` không quay lại.

---

## 4. Hình khối và bề mặt

| Thành phần | Radius |
|---|---|
| Card / panel | **12px** |
| Input / button / nav item | **8px** |
| Menu item / nút phân trang | 6px |
| Badge | 4px |
| Avatar / Tag | pill |

**Card: viền 1px `--color-border-default`, KHÔNG shadow.** IAS bỏ shadow từ 2026-07-31 và
thay bằng viền — không xếp lớp cả hai. Shadow chỉ còn dùng cho popover/dropdown/drawer/modal.

Thang 24px của brand `wise` đã bị bỏ: `--radius-lg`/`--radius-xl`/`--radius-2xl` đều về 12px,
nên mọi utility `rounded-*` đang dùng khắp app tự nhận giá trị mới.

---

## 5. Button

`.ias-btn` (primitive mới) và `[data-brand="ias"] .ui-button` (class cũ của app) dùng
**chung một khối khai báo**, nên `<Button>` ở mọi call site đổi diện mạo mà không phải sửa JSX.

| Variant | Nền | Chữ | Viền |
|---|---|---|---|
| `primary` | `#141ED2` (hover `#0E15A8`) | `#FFFFFF` | — |
| `outline` (secondary/glass) | trong suốt | `#14142A` | 1px `#C4C6F7`, hover `#141ED2` |
| `ghost` | trong suốt (hover `#F4F5FF`) | `#14142A` | — |
| `danger` | `#C30052` | `#FFFFFF` | — |
| `icon` | trong suốt, 40×40 | `#14142A` | 1px `#C4C6F7` |

Kích thước: **40px** (mặc định) · **32px** (`-sm`, dùng cho toolbar NẰM TRONG card/modal,
để khớp mật độ của card thay vì mật độ 40px của trang) · 48px (`-lg`).
Chữ 14px/600, radius 8, `white-space: nowrap`, `flex-shrink: 0`.
Focus: viền `--color-border-focus` + glow `0 0 0 3px rgba(20,30,210,.08)`.

Dùng `min-height` thay cho `height` cố định 40px như template IAS: một nút đang có trong
app có thể chứa icon + nhãn dài xuống hai dòng, và `height` cố định sẽ **cắt mất nhãn** —
mất thông tin là lỗi chức năng, không phải lỗi thẩm mỹ.

### Thứ tự và số lượng
- **Secondary bên trái → primary bên phải.** Không đảo lại cho một màn hình riêng.
- **Một primary (tô đặc) duy nhất mỗi toolbar/footer.**
- Hành động phá huỷ được **tách riêng**: trong dropdown, item `danger` luôn ở cuối, cách
  các item thường bằng một divider.
- **Sentence case**, không uppercase.

> **Lưu ý đang mở:** `variant` của `Button.tsx` **mặc định là `primary`**, nên mọi
> `<Button>` không ghi variant đều là một CTA tô đặc — đo được **83/131** chỗ như vậy
> (nặng nhất: `admin/users` 20, `StatusAlertRulesSettings` 13, `ChangePasswordModal` 6).
> Không chữa được bằng regex vì quyết định nút nào là nút trội trong một hàng là việc của
> từng màn hình. Test `ias-button.test.ts` khoá con số lại để không tăng thêm.

---

## 6. Trạng thái, Badge và Tag

**Trạng thái LUÔN là dot + pill + nhãn, không bao giờ chỉ là chữ đổi màu.** Đây vừa là
yêu cầu nhận diện của DS, vừa là yêu cầu tiếp cận — không truyền đạt thông tin chỉ bằng màu.

`.ias-status` — 11px/600, padding `3px 10px`, radius 4, dot 6px:

| Class | Nền | Chữ | Dot |
|---|---|---|---|
| `.ias-status-blue` | `#F4F5FF` | `#141ED2` | = màu chữ |
| `.ias-status-success` | `#F2FFFB` | `#00966D` | `#00BA88` |
| `.ias-status-warning` | `#FFF9EF` | `#946200` | `#F4B740` |
| `.ias-status-error` | `#FFF3F8` | `#C30052` | `#EB2D4B` |
| `.ias-status-neutral` | `#F4F6FA` | `#6E7191` | `#A0A3BD` |
| `.ias-status-purple` | `#EEDFFF` | `#5500CC` | `#7B61FF` |

Cỡ theo vị trí: `medium` (mặc định ở trên) cho ô trong bảng và danh sách dày ·
`.ias-status-lg` cho badge đứng cạnh tiêu đề trang/card.

### Badge vs Tag — phân biệt theo Ý ĐỊNH, không theo hình
- **Badge** = trạng thái của bản ghi ("Đạt", "Fail TTM", "Chờ golive", "Trễ R4G")
  → chữ nhật 4px, **có** dot.
- **Tag** (`.ias-tag`) = phân loại/bộ lọc (tên Domain, loại Epic, tên PM-SM)
  → viên thuốc, có viền cùng hệ màu, **không** dot.

Đặt `shape="pill"` cho một Badge **không** biến nó thành Tag, và ngược lại.

`Badge.tsx` có thêm prop `dot` (mặc định `false`) và `shape` (mặc định `rectangle`).
`dot` để mặc định tắt vì nhiều chỗ `Badge` đang được dùng làm chip **đếm** hoặc **mã**
thay vì trạng thái — theo IAS những chỗ đó thuộc về Tag, và dot sẽ là sai. Việc gán
Badge/Tag theo đúng ý định là phần làm theo từng màn hình.

---

## 7. Table

- **Header**: nền `--color-bg-page`, 11px/700, màu `--color-text-secondary`,
  **sentence case — không uppercase, không letter-spacing** (IAS bỏ ngoại lệ uppercase
  của Table từ 2026-08-21). `th` **không có viền**; đường chia header/body đến từ viền
  trên của hàng body đầu tiên. Sticky theo trục dọc.
- **Ô body**: padding `13px 16px`, 13px, `--color-text-body`,
  `border: 0.5px solid --color-border-default` **đủ 4 cạnh**. Hàng cuối **giữ** viền dưới.
- **Wrap**: `border-radius: 0`, **không viền riêng** — mép bảng được định nghĩa bằng
  chính lưới viền của `td`, không phải một khung bao ngoài.
- **Hover hàng**: `--color-bg-hover`.
- **Cột số**: `.ias-td-num` — căn phải + `tabular-nums`.
- **Hàng tổng**: `.ias-total-row` — phải có **đủ ba** dấu hiệu (chữ đậm + nền
  `--color-primary-50` + viền trên `--color-primary-200`). Chỉ lấy nửa phần in đậm thì
  hàng tổng đọc như một hàng dữ liệu bình thường mà tình cờ bị bôi đậm.
- **Cột định danh dính trái**: `.ias-sticky-col`. `thead th` chỉ sticky theo trục **dọc**,
  nên với bảng 13 cột của `/epic-alerts-15` thì cuộn ngang là mất luôn cột Epic — người
  dùng không còn biết mình đang đọc dòng nào. Ô dính phải đổi nền theo hover của hàng.

---

## 8. Contract chống tràn

Một chuẩn duy nhất, thay cho 5 cách xử lý ad-hoc trước đây (truncate cứng theo px, clamp
font xuống 6.5px, `whitespace-nowrap` lồng nhau, `min-w` cố định 1160px, `grid-cols` fr
hardcode).

| Tình huống | Contract |
|---|---|
| Ô bảng dài | `.ias-td-truncate` (max-width + ellipsis + nowrap) + tooltip |
| Nhãn KPI | sàn 12px · `.ias-shrinkable` (`min-width: 0`) · `.ias-clamp-2` · tooltip khi bị cắt |
| Select trong filter bar | `.ias-filter-control` — `flex: 1 1 140px; min-width: 0; max-width: 220px` + ellipsis |
| Grid nhiều tile | `.ias-tile-grid` — `repeat(auto-fit, minmax(190px, 1fr))`, wrap thay vì nén |
| Text trong SVG | truncate ở **tầng dữ liệu (JS)** + `<title>` — CSS không áp được lên `<text>` |

**`nowrap` một mình KHÔNG cắt gì cả** — nó chỉ chặn xuống dòng. Thiếu `max-width` kèm theo
chính là lý do bảng phình bề rộng tối thiểu theo giá trị dài nhất trong dữ liệu.

### Tooltip cho ô bị cắt

`src/components/ui/TruncationTooltip.tsx`, mount **một lần** trong `AppShell`, hoạt động
theo kiểu delegated listener trên `document` — mọi element mang `.ias-td-truncate` tự có
tooltip mà không phải bọc component hay truyền prop ở từng ô.

- **Không dùng attribute `title`**: nó render bằng hộp tooltip của **hệ điều hành**, không
  phải bubble navy `#14142A` của DS, và có độ trễ ~1s không điều khiển được.
- **`position: fixed`, không phải `absolute`**: vùng cuộn của bảng có `overflow-x: auto`, và
  theo spec CSS khi đặt overflow cho một trục thì trục còn lại thôi là `visible` — nên bubble
  `absolute` sẽ bị **cắt** trước khi kịp tràn ra. Toạ độ tính từ `getBoundingClientRect()`
  lúc hover.
- Bỏ qua khi ô **không thực sự** bị cắt (`scrollWidth <= clientWidth`).
- Lật lên trên khi dưới không còn chỗ; ẩn khi cuộn/resize.

Việc này đồng thời **khôi phục dữ liệu đang bị mất**: nhiều ô trong dashboard dùng
`truncate` mà không có `title` nào, nên phần chữ bị cắt không có cách nào đọc được.

---

## 9. Theme

| Brand | Nhãn trong UI | Ghi chú |
|---|---|---|
| `ias` | IAS theme | **Mặc định từ 2026-10-10** |
| `wise` | Lime theme | Bản "Wise-inspired", xem `DESIGN.md` (đã superseded) |
| `legacy` | Navy theme | Giao diện steel-blue nguyên bản, xem `design-backup/` |
| `pink` | Pink theme | Biến thể pastel hồng |

Ba brand sau **giữ nguyên** để không lấy đi lựa chọn nào mà người dùng đang có. Ai đã chủ
động chọn một trong ba thì vẫn giữ được lựa chọn đó; mọi giá trị khác (rỗng, cũ, rác) rơi
về `ias`.

**`data-theme="dark"` là code chết.** Không chỗ nào trong `src/` set attribute đó (đã grep
toàn bộ), nên nhánh `:root[data-theme="dark"]` và mọi rule `[data-theme="light"] …` trong
`globals.css` chưa bao giờ khớp. Dark mode **không** reachable qua UI.

### Kết quả đo contrast (WCAG AA 4.5:1)

`node scripts/audit-token-contrast.mjs` — brand `ias` là brand sạch nhất:

| Brand | Số cặp chữ/nền dưới AA |
|---|---|
| **ias** | **1** |
| wise | 4 |
| legacy | 5 |
| pink | 4 |

Đáng chú ý `legacy|--accent|panel` chỉ **4.10:1** — màu nhấn của brand từng là mặc định
cũng trượt AA, và nút primary của nó (chữ trắng trên `#0284c7`) cũng 4.10:1. `--accent`
của `ias` đạt **9.79:1**.

**Hai khiếm khuyết của chính palette IAS, đã ghi nhận:**

1. `--color-text-success` (`#00966D`) đo được **3.76:1** trên nền trắng, **3.48:1** trên nền
   trang → trượt AA cho chữ thường. Đã chữa bằng cách cho `--success` trỏ về
   `--color-success-300` (`#0B7659`), là token **đã khai báo** trong
   `ias-design/tokens/colors.css` và đạt AA (`color-rules.md` cho phép rơi về raw scale khi
   không alias nào đủ gần). Thang success của IAS đánh số không đều — `-300` đậm hơn `-700`.
   `--color-text-success` vẫn giữ nguyên giá trị gốc và vẫn là màu chữ của pill
   `.ias-status-success` theo đúng spec IAS.
2. `--color-text-secondary` (`#6E7191`) đạt 4.74:1 trên nền card trắng (ok) nhưng chỉ
   **4.38:1** trên nền trang `#F4F6FA` — thiếu 2.7%. Không sửa được mà không hoặc làm sụp
   thang 4 bậc chữ của IAS, hoặc đổi nền trang khỏi `#F4F6FA`. Phơi nhiễm thực tế hẹp:
   `.ui-info-banner` và `.ui-helper` khi nằm ngoài card. **Đã ghi nhận, chưa sửa.**

---

## 10. Lệch có chủ đích khỏi IAS

Mục này tồn tại để lần review sau không có người "sửa cho đúng IAS" rồi làm vỡ ràng buộc
"không đổi function/non-function".

1. **Giữ Phosphor Icons, KHÔNG đổi sang Material Symbols.**
   `ias-design/SKILL.md` yêu cầu "Material Symbols icons only", nhưng `ttm-tool/AGENTS.md`
   quy định "All UI icons must be imported exclusively from Phosphor Icons" kèm spec chi
   tiết từng icon cho màn Epic (`Warning` + `ArrowSquareOut` cột Epic, `CaretRight`
   START-E2E, `CaretLineRight` START-CNTT, `ArrowBendUpRight` trước baseline date **cùng
   dòng**, `Checks` màu `#000000` trước ngày thực tế R4Golive/Released). **Steering của
   workspace cao hơn skill ngoài.** Phosphor cũng cùng triết lý outline-first nên về thị
   giác không lệch.

2. **Sentence case cho button label; KHÔNG dùng `.ias-button` / `uppercase`.**
   IAS tự mâu thuẫn: `tokens/typography.css` đặt `--type-button-transform: uppercase` cho
   `.hcm-button`, còn `references/component-rules.md` (rule cross-cutting, mới hơn) yêu cầu
   "Sentence case, never uppercase trên mọi label tương tác… tiếng Việt không dùng
   letter-casing để nhấn". **Rule mới thắng**, và nó đúng với tiếng Việt.

3. **Giữ header sticky + widget TTM-Index/QA-Index.**
   IAS loại `AppHeader` khỏi mọi màn hình theo mặc định. ttm-tool giữ, vì header đang mang
   widget chỉ số — bỏ đi là đổi UX flow, không phải reskin.

4. **Giữ filter bar luôn hiện.**
   IAS yêu cầu màn hình danh sách mặc định hiện `ToolbarSimple` thu gọn, chỉ bung
   `FilterCard` sau khi bấm "Tìm kiếm nâng cao". ttm-tool giữ trạng thái mặc định đang có.

5. **Giữ variant `danger` của Button.**
   `references/components/forms/button.md` nói rõ "Button has no separate danger variant".
   Nhưng app đang dùng `variant="danger"` cho hành động phá huỷ (xoá lớp dữ liệu, xoá user),
   và bỏ nó là lấy mất một tín hiệu cảnh báo — tức đổi affordance. Giữ lại, tô bằng
   `--color-text-error` (`#C30052`, 6.1:1 với chữ trắng) chứ không phải
   `--color-bg-error-solid` (`#EB2D4B`, chỉ 4.0:1).

6. **Card giữ đường chia header/body.**
   `card.md`/`dcard.md` của IAS không có đường chia — chỉ dùng khoảng trắng. ttm-tool giữ
   nhưng hạ xuống tông nhạt nhất của IAS (`--color-neutral-200` `#EDF2F7`, cùng giá trị
   `Field` dùng cho gạch chân giá trị), vì card ở đây chứa nội dung dày hơn ví dụ của IAS và
   bỏ hẳn đường chia làm mất cấu trúc đọc. Thay đổi về độ đậm, không thêm thành phần mới.

7. **`.ui-card-body` có padding trên khi đứng một mình.**
   `dcard.md` quy định `0 20px 20px` (không padding trên, vì padding dưới của header đã tạo
   khoảng cách). Nhưng rất nhiều card trong app dùng body **không kèm** header, và
   `padding-top: 0` ở đó sẽ dán nội dung vào viền. Nên: mặc định có padding trên, chỉ bỏ khi
   thực sự đứng sau một header (`.ui-card-header + .ui-card-body`).

8. **`wise`/`legacy`/`pink` nằm ngoài phạm vi IAS**, giữ hoạt động nguyên trạng.

---

## 11. Lint chống tái phát

Chạy trong `npm test` (và pre-commit hook). Mọi chỉ số có **baseline đo được**; baseline
**chỉ được co lại**. Test fail khi một file mới xuất hiện ngoài danh sách, một file vượt hạn
mức, hoặc một file đã giảm mà hạn mức chưa hạ theo.

| Chỉ số | Mốc ban đầu | Hiện tại | File |
|---|---|---|---|
| Hex literal | 341 / 23 file | **131** / 17 file | `design-debt.test.ts` |
| Class palette thô (`text-slate-*`…) | 593 / 20 file | **42** / 2 file | `design-debt.test.ts` |
| Chữ dưới sàn 11px | 215 / 26 file | **4** / 1 file | `ias-typography.test.ts` |
| `rgb()`/`rgba()` literal | 8 / 4 file | 8 / 4 file | `design-debt.test.ts` |
| `<Button>` không ghi variant | 83 / 131 | 83 / 131 | `ias-button.test.ts` |
| `!important` trong CSS route | 7 / 6 / 5 | 0 / 2 / 2 | `design-debt.test.ts` |

Công cụ đo: `node scripts/audit-design-debt.mjs` · `node scripts/audit-token-contrast.mjs`
· `node scripts/audit-distinct-colors.mjs` (liệt kê giá trị màu riêng biệt, dùng để dựng
bảng map cho codemod)

### Codemod

`node scripts/codemod-ias-tokens.mjs [--dry]` đổi màu gõ tay sang token theo một **bảng map
tường minh** (đọc review được, chạy lại được). Lần chạy 2026-10-10: 193 hex + 527 class
palette + 62 cỡ chữ trên 25 file.

**Phạm vi có chủ đích — chỉ màu trong NGỮ CẢNH CSS:**
- class Tailwind arbitrary value: `text-[#1463f7]` → `text-[var(--color-text-brand)]`
- class bảng màu mặc định: `text-slate-500` → `text-fb-text-placeholder`

**KHÔNG đổi** hex nằm trong chuỗi JS hay thuộc tính SVG. Lý do: thuộc tính SVG **không phải
CSS**, nên `fill="var(--x)"` không resolve — phải chuyển sang `style={{ fill }}` hoặc class,
tức sửa cấu trúc chứ không phải thay chuỗi. Đó chính là 131 hex còn lại.

Codemod gộp thang 50-950 của Tailwind về 4 bậc chữ / 3 bậc viền của IAS. Việc gộp bậc là
**không thể tránh** — và đó chính là mục đích: app đang dùng 80 hex và 142 class màu riêng
biệt cho một hệ thống chỉ có 4 bậc chữ.

### Ngoại lệ hợp lệ (hạn mức sẽ không về 0)

- `AppearancePanel` — swatch xem trước brand phải là màu **thật** của brand đó; dùng token
  sẽ ra màu brand hiện tại cho cả bốn ô.
- `api/mcp/oauth/*` — HTML trang consent OAuth render phía server dưới dạng chuỗi.
- `captcha-service` — màu vẽ ảnh captcha trên canvas, không phải CSS.
- `TtmBlackListDot` — AGENTS.md quy định icon `Checks` phải là **đen `#000000`**.
- `VisitCounterPanel` — 40 class palette cho chip trên **nền tối** (`bg-emerald-950/40`,
  `bg-blue-900/40`); map sang token mặt sáng sẽ phá tương phản. Bị loại khỏi codemod có chủ
  đích; cần làm lại bố cục cùng lúc chứ không đổi màu riêng lẻ.

Các lint khác: không `font-sans`, không import CSS chéo route, bubble tooltip phải
`position: fixed`, `.ias-td-truncate` phải có `max-width`, mỗi variant button phải khai báo
cho **cả** primitive mới và class cũ.

---

## 12. Font — cửa kiểm chứng bắt buộc

**`"Averta Std CY"` — "CY" là Cyrillic.** Một font Cyrillic không bảo đảm có khối Latin
Extended Additional (U+1EA0–U+1EF9), nơi chứa phần lớn chữ tiếng Việt có dấu. Khi font
thiếu glyph, browser **không báo lỗi** — nó fallback **theo từng glyph**, nên "Hoàn thành"
render một phần bằng font brand còn `ồ`/`à` nhảy sang font hệ thống, lệch chiều cao và nét
đậm ngay trong cùng một từ. Tệ hơn là dùng một font duy nhất không phải brand, và rất dễ
lọt qua review vì phần lớn nhãn kỹ thuật là tiếng Anh không dấu.

Kết quả kiểm chứng (2026-10-10): **ĐỦ 100%** — 134/134 codepoint bắt buộc, cả 3 weight.

```bash
npm run ds:check-font              # verdict + trang HTML xác nhận bằng mắt
npm run ds:check-font -- --verbose # bảng từng codepoint
python scripts/build-brand-font.py # OTF → WOFF2 đã subset
```

Regression test: `src/lib/design-system/__tests__/font-vietnamese.test.ts` — đọc trực tiếp
bảng `cmap` của file WOFF2 trong repo (parser WOFF2/sfnt tự viết, không thêm dependency),
nên chạy được trên mọi máy mà không cần file OTF gốc.

---

## Tài liệu đã bị thay thế

- **`design-system-spec.md`** — ĐÃ LẠC HẬU VÀ TỰ MÂU THUẪN, **không dùng**. Nó ghi mọi role
  đều 11.5px (thực tế `--text-app` là 14px), ghi `fb-blue: #0866ff` (thực tế `--color-fb-blue`
  resolve ra `--accent`, từng là `#1c6e2e` xanh lá rừng), ghi font Geist (thực tế Inter), và
  trộn ba visual language xếp lớp lên nhau ("Gecko-inspired" + "Facebook frosted glass" +
  bảng token). Ai sửa UI theo nó sẽ tạo thêm lệch.
- **`DESIGN.md`** — mô tả hệ "Wise-inspired" (lime `#9FE870`) mà `globals.css` từng
  implement. **Superseded** bởi tài liệu này; giữ lại làm tài liệu của brand `wise`.
- **`tailgrids.config.json`** — 4 dòng metadata của một CLI không có trong `package.json`.
  Không chứa token nào, vô dụng về mặt styling.

---

## Trạng thái áp dụng

**Đã xong — tầng design system (Nhịp A):**

| # | Nội dung | Test |
|---|---|---|
| 1 | Cửa kiểm chứng glyph tiếng Việt + build font WOFF2 | `font-vietnamese.test.ts` |
| 2 | Tầng token IAS + compat layer + sidebar navy | `ias-tokens.test.ts` |
| 3 | Sửa lỗi specificity font + nạp Averta | `ias-typography.test.ts` |
| 4 | Type scale + sàn 12px + contract chống tràn | `ias-typography.test.ts` |
| 5 | Primitive `.ias-btn` | `ias-button.test.ts` |
| 6 | Primitive `.ias-card` + `.ias-status` + Tag | `ias-surface.test.ts` |
| 7 | Primitive `.ias-table` + tooltip cho ô bị cắt | `ias-table.test.ts` |
| 8 | Dọn CSS leak chéo route + hợp nhất `--ttm-*` | `design-debt.test.ts` |
| 9 | Lint chống tái phát | `design-debt.test.ts` |

**Đã xong — áp dụng (Nhịp B, Task 10-13):**

| # | Nội dung |
|---|---|
| 10 | KPI strip `/dashboard-new`: grid auto-fit (hết nén tile), nhãn 12px sentence case, mọi dòng truncate + tooltip, `ringGradient()` gom 3 hex ring + track `#e4e6eb`, sắc thái cảnh báo từ viền màu sang nền tint + màu chữ |
| 10-13 | Codemod toàn bộ 22 route: 193 hex + 527 class palette + 62 cỡ chữ → token |
| 13 | Thêm 3 entry thiếu vào `PAGE_HEADERS` (`/data-review`, `/sso/authorize`, `/sso-demo`) — trước đây header của chúng hiện sai thành "Quản trị nguồn dữ liệu" |
| 14 | Doc này · `design-system-spec.md` + `DESIGN.md` đánh dấu hết hiệu lực · xoá `tailgrids.config.json` |

**Còn lại — cần sửa cấu trúc, không làm được bằng codemod:**

| Phạm vi | Việc |
|---|---|
| `ttm-dashboard-2` + `FunnelLayers` (41 hex) | Màu truyền vào SVG phễu dưới dạng prop `fill`/`lidFill`/`labelColor`. Phải chuyển sang `style={{ fill }}` hoặc class. Cộng nhãn SVG cần truncate ở **tầng dữ liệu** + `<title>` (CSS không áp được lên `<text>`) |
| `DashboardInsights` (4 hex + 4 clamp) | `clamp(6.5px…)`/`clamp(7px…)` co font theo container và `KPI_TRUNCATE_CLASS` cắt cả 3 dòng không tooltip. Phải bỏ cơ chế co font, tức viết lại bố cục card |
| `DonutChartCard` (7 hex) | `PALETTE` 5 màu dạng mảng JS; `h-5` cứng xung đột `line-clamp`; `w-9`/`w-10` cứng cho số 4 chữ số |
| 3 màn Epic (21 hex) | Bảng tra màu trạng thái dạng object JS. Nên đổi sang 6 class `.ias-status-*` |
| Ma trận `/dashboard-new` | `<TH className="w-56">`/`w-40` cứng · `whitespace-nowrap` lồng nhau · progress bar thiếu `min-w-0` · cột định danh chưa dính (`.ias-sticky-col` đã dựng, chưa gắn) |
| Bảng 13 cột `/epic-alerts-15` | Gắn `.ias-sticky-col` cho cột Epic và `.ias-td-truncate` cho các cột free-text |
| `VisitCounterPanel` (40 class palette) | Chip nền tối, cần làm lại bố cục |
| 3 file CSS route | Dedup trọn vẹn (728/971/891 dòng). Task 8 đã gom phần dùng chung + remap token; phần còn lại là trùng lặp thật |
| `<Button>` 83/131 chỗ | Không ghi variant → mặc định là CTA tô đặc. Quyết định nút nào trội trong một hàng là việc của từng màn hình |

Toàn bộ các màn hình **đã nhận** thay đổi của Nhịp A qua tầng token (màu, font, radius,
card, button, badge, table, sidebar) và của codemod (hex/class palette trong ngữ cảnh CSS).
