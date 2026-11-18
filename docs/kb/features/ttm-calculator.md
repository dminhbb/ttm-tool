# TTM Calculator — `/ttm-calculator`

Cập nhật lần cuối: 2026-11-18. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

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
→ ttm-calculator.ts (matchingRuleGroups → policySetsOf → deriveMetrics) → widgets + bảng pha
```

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|
| Regex nhận dạng text (ngày / level / loại yêu cầu) | `src/lib/ttm-calculator-text.ts` |
| Cách ra mốc pha, PENTEST kéo đến trước R4G, Golive = R4G + `release.graceWorkingDays` | `src/lib/ttm-calculator.ts` |
| Phân loại CT/SP × Lv12/Lv34 (dùng chung với import) | `src/lib/epic-complexity.ts` |

## Bảng DB

- Đọc: các bảng cấu hình qua `loadScoringContext` (Rule Group, Bộ ngân sách, ngày nghỉ). Ghi: không.
- Seed `permission_features` / `role_feature_permissions` (feature `ttm_calculator`, View cho mọi role).

## Contract

`POST /api/ttm-calculator` nhận `{requestType, requirementLevel, startDate, createdDate?, ideaApprovedDate?}` (ngày `YYYY-MM-DD`),
trả `{result: TtmCalculatorResult}` (`ttm-calculator.ts`). Bẫy: bảng pha khác baseline thật của Epic ở PENTEST (kéo dài đến
ngày làm việc trước R4G — quyết định 2026-11-18); không có bộ ngân sách cho loại Epic → `rows` rỗng.

## Test

`src/lib/__tests__/ttm-calculator.test.ts`, `ttm-calculator-text.test.ts`. Chưa có test UI.
