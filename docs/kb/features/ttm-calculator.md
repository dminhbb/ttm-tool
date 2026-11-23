# TTM Calculator — `/ttm-calculator`

Cập nhật lần cuối: 2026-11-23. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

## Mục đích

Tính các mốc (pha DESIGN/DEV/TEST/PENTEST, R4G mục tiêu, hạn golive, TTM-E2E) của một Epic giả định, bằng đúng
Scoring Service và cấu hình đang chạy (Rule Group, Bộ ngân sách, ngày nghỉ / ngày làm bù). Không lưu dữ liệu.
Yêu cầu: `REQ-20261118-03` (xem `docs/traceability/TRACEABILITY.md`).

## Điểm vào

| Loại | Đường dẫn |
|---|---|
| Màn hình | `src/app/ttm-calculator/page.tsx` → `src/components/ttm-calculator/TtmCalculatorScreen.tsx` |
| API | `POST /api/ttm-calculator` → `src/app/api/ttm-calculator/route.ts` |
| Menu / quyền | `AppShell.tsx` (menu), `feature-access.ts` (`ttm_calculator`), migration `20261130_add_ttm_calculator_permission` |
| Visit counter | `visit-counter-types.ts` (`ScreenKey 'ttm_calculator'`) |

## Luồng dữ liệu

```text
form / text (ttm-calculator-text.ts) → POST API → ttm-calculator-service.ts (loadScoringContext)
→ ttm-calculator.ts (matchingRuleGroups → policySetsOf → deriveMetrics) → widgets + timeline SVG + bảng pha
```

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|
| Regex nhận dạng text (ngày / level / loại yêu cầu) | `src/lib/ttm-calculator-text.ts` |
| Cách ra mốc pha, PENTEST kéo đến trước R4G, Golive = R4G + `release.graceWorkingDays` | `src/lib/ttm-calculator.ts` |
| `%` của từng pha (tỉ lệ workingDays thực tế so với tổng budget, PENTEST lấy phần dư) | `src/lib/ttm-calculator.ts` |
| Phân loại Epic: 7 loại yêu cầu × Lv12/Lv34 = 9 tổ hợp hợp lệ (gồm TNM-Lv12) + 5 "Phân loại sai Epic" (dùng chung với import) | `src/lib/epic-complexity.ts` |
| Timeline SVG các pha (màu pha, vạch ngày, ngày nghỉ xám + `-`, badge + mũi tên) | `src/components/ttm-calculator/TtmPhaseTimeline.tsx` |
| Logic thuần ngày nghỉ / ngày làm bù / sinh lưới ngày của timeline | `src/lib/ttm-timeline.ts` |

### Nhận dạng Loại yêu cầu khi nhập text (từ 23/11/2026)

Regex `REQUEST_TYPE_PATTERN` trong `ttm-calculator-text.ts` nhận dạng Loại yêu cầu **không phân biệt hoa/thường, không cần dấu tiếng Việt, có/không dấu cách** giữa các từ. Các từ đồng nghĩa và viết tắt gán về 1 trong 7 loại chuẩn (quyết định chủ sản phẩm 23/11/2026 — bỏ cụm "Sản phẩm/dịch vụ/quy trình mới" cũ, tách đủ 7 loại):

| Loại yêu cầu | Từ khoá | Viết tắt |
|---|---|---|
| Tính năng mới | `tinh nang moi` | `tnm`, `tnt`, `tn` |
| Cải tiến | `cai tien` | `ct` |
| Sản phẩm | `san pham` (+ cụm legacy `san pham/dich vu/quy trinh moi`, `san pham moi`, `phat trien moi`) | `sp` |
| Hệ thống mới | `he thong moi` | `htm` |
| Quy trình | `quy trinh` | `qt` |
| Dịch vụ | `dich vu` | `dv` |
| Giải pháp nền tảng | `giai phap nen tang` | `gpnt` |

Lưu ý: các cụm cũ "Sản phẩm/dịch vụ/quy trình mới", "Sản phẩm mới", "Phát triển mới" giờ được nhận là từ đồng nghĩa → "Sản phẩm" (không còn là loại yêu cầu riêng). `computeEpicComplexity` (`src/lib/epic-complexity.ts`) cũng map 3 cụm này → SP cho dữ liệu import/DB (khớp text parser). Các viết tắt dùng `\b` (ranh giới từ) để không khớp lẫn vào từ viết đầy đủ. Loại yêu cầu + level tạo ra Phân loại Epic qua `computeEpicComplexity`; tổ hợp thuộc nhóm "Phân loại sai Epic" (vd "Hệ thống mới" + Level 1) bị chặn ở màn hình — xem mục "Phân loại sai Epic" bên dưới.

### Phân loại sai Epic (chặn, từ 23/11/2026)

Màn hình chặn tổ hợp thuộc nhóm "Phân loại sai Epic" (mọi loại không phải Cải tiến/Tính năng mới chỉ tồn tại ở Lv34; tổ hợp Lv12 của chúng là lỗi dữ liệu): `HTM-Lv12, SP-Lv12, QT-Lv12, DV-Lv12, GPNT-Lv12`. **Tính năng mới Level 1-2 (TNM-Lv12) là hợp lệ** (bổ sung cùng ngày) nên không bị chặn. Khi chọn tổ hợp sai (cả form lẫn nhập text), không gọi tính toán và hiển thị cảnh báo `Bạn đang phân loại sai Epic.\n Epic không được phân loại như sau {x}` (helper thuần `isMisclassifiedEpicComplexity` trong `src/lib/epic-complexity.ts`). `POST /api/ttm-calculator` trả thêm cờ `misclassified` (tương thích ngược).

## Bảng DB

- Đọc: các bảng cấu hình qua `loadScoringContext` (Rule Group, Bộ ngân sách, ngày nghỉ). Ghi: không.
- Seed `permission_features` / `role_feature_permissions` (feature `ttm_calculator`, View cho mọi role).

## Contract

`POST /api/ttm-calculator` nhận `{requestType, requirementLevel, startDate, createdDate?, ideaApprovedDate?}` (ngày `YYYY-MM-DD`),
trả `{result: TtmCalculatorResult, holidays: string[], workdays: string[]}` (`ttm-calculator.ts`). `holidays`/`workdays` là mảng
`YYYY-MM-DD` lấy từ `ScoringContext.holidays` (sắp xếp) — client dùng để vẽ timeline: ngày Lễ/Thứ 7/Chủ nhật tô xám + `-`,
ngày làm bù coi như ngày làm việc (đúng logic `addWorkingDays`). Bẫy: bảng pha khác baseline thật của Epic ở PENTEST (kéo dài đến
ngày làm việc trước R4G — quyết định 2026-11-18); không có bộ ngân sách cho loại Epic → `rows` rỗng. `%` của mỗi pha =
tỉ lệ workingDays thực tế so với tổng budget (không phải tỉ lệ cấu hình, vì các pha làm tròn và PENTEST bị kéo dài);
R4G/Golive không phải pha dùng ngân sách nên `percent` = null. Khi `release.graceWorkingDays` = 0, `goliveDate` = R4G
và không có dòng GOLIVE riêng.

## Timeline SVG các pha

`TtmPhaseTimeline` (dưới widget, trên bảng pha) vẽ từng pha (DESIGN/DEV/TEST/PENTEST/R4G/Golive) một đoạn màu **hệ pastel**
(sky-200/green-200/yellow-200/orange-200/blue-200/violet-200) trên thanh dày **30px, không viền** (border 0), vạch kẻ nhạt
phân tách từng ngày, ngày nghỉ (Thứ 7 / Chủ nhật / ngày Lễ cấu hình, trừ ngày làm bù) tô xám + ký tự `-`, phía trên thanh là
chữ Thứ + ngày của từng cột, dưới thanh là badge từng pha (tên đậm + ngày bắt đầu/kết thúc, cao **26px = +30%**, không viền,
chữ đen `#000000`) với line + mũi tên trỏ lên ngày tương ứng. **Cụm timeline canh giữa** so với panel phải (`mx-auto` trên
svg; `overflow-x-auto` vẫn cuộn khi rộng hơn). **Ngày nghỉ** trên dòng Thứ + ngày có nền light grey `#e2e8f0` + chữ đen; **ngày
hôm nay** tô nền vàng `#fef08a` + chữ đỏ `#dc2626` + **đường kẻ dọc 2px** (`#dc2626`) trên thanh. **Badge R4G** (pha 1 ngày,
`xFrom === xTo`) rộng vừa khớp content (tên + ngày, đo bằng `textWidth`); badge pha thường rộng ít nhất bao đủ content, tối
đa `BADGE_HALF`. **Đổi tên PENTEST → 'Pentest & Change'** trên Bảng Pha + timeline badge (chỉ màn hình này) qua
`PHASE_DISPLAY_LABELS`/`phaseDisplayLabel` trong `ttm-calculator.ts`. **Bảng Pha**: ô pha tô màu nền khớp từng pha trên
timeline (`PHASE_CELL_BG`, inline style). **Thứ tự vẽ quan trọng:** nền trắng `#fff` của thanh vẽ TRƯỚC, rồi các ô ngày nghỉ
xám phủ lên (nếu vẽ nền trắng sau thì phủ mất ô xám), rồi đoạn pha (không bo góc để khít nhau), không có rect viền, rồi đường
kẻ dọc ngày hôm nay (vẽ SAU các đoạn pha để luôn nổi trên thanh). Render có điều kiện: chỉ khi `result.rows.length > 0`,
`goliveDate` có, và mọi pha trong phạm vi đủ `fromDate`/`toDate`; ngược lại giữ bảng pha làm nguồn chính. Màu pha là hex (SVG
attribute không nhận `var()`), nằm trong baseline `design-debt` (`hexLiteral`, hạn mức 12).

## Test

`src/lib/__tests__/ttm-calculator.test.ts`, `ttm-calculator-text.test.ts`, `ttm-timeline.test.ts` (logic thuần ngày nghỉ / ngày làm bù / sinh lưới ngày). Chưa có test UI.
