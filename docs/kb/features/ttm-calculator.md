# TTM Calculator — `/ttm-calculator`

Cập nhật lần cuối: 2026-11-19. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

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
| Phân loại CT/SP × Lv12/Lv34 (dùng chung với import) | `src/lib/epic-complexity.ts` |
| Timeline SVG các pha (màu pha, vạch ngày, ngày nghỉ xám + `-`, badge + mũi tên) | `src/components/ttm-calculator/TtmPhaseTimeline.tsx` |
| Logic thuần ngày nghỉ / ngày làm bù / sinh lưới ngày của timeline | `src/lib/ttm-timeline.ts` |

### Nhận dạng Loại yêu cầu khi nhập text (từ 20/11/2026)

Regex `REQUEST_TYPE_PATTERN` trong `ttm-calculator-text.ts` nhận dạng Loại yêu cầu **không phân biệt hoa/thường, không cần dấu tiếng Việt, có/không dấu cách** giữa các từ. Các từ đồng nghĩa và viết tắt gán về 1 trong 4 loại chuẩn:

| Loại yêu cầu | Từ khoá | Viết tắt |
|---|---|---|
| Tính năng mới | `tinh nang moi` | `tnm`, `tn` |
| Cải tiến | `cai tien` | `ct` |
| Sản phẩm | `san pham` | `sp` |
| Sản phẩm/dịch vụ/quy trình mới (cụm chuẩn) | `san pham / dich vu / quy trinh moi`, `san pham / dich vu`, `san pham moi`, `dich vu`, `dich vu moi`, `quy trinh`, `quy trinh moi` | `spdvqtm`, `spdvqt`, `spm`, `dvm`, `qtm`, `dv`, `qt` |

Lưu ý: `san pham` đứng riêng → "Sản phẩm"; `san pham moi` → cụm tiêu chuẩn. Các viết tắt dùng `\b` (ranh giới từ) để không khớp lẫn vào từ viết đầy đủ.

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
