# Design Specification: Epic Scoring Service

- **Date:** 2026-09-29
- **Status:** v4 — mọi quyết định đã chốt (2026-09-29). **M1–M4 đã triển khai** (2026-09-30): thư viện + test, migration, shadow + đối chiếu, và công tắc chế độ hiển thị `legacy`/`scoring` cho mọi màn hình (mặc định `legacy` cho tới khi SUPERADMIN bật). **01/10/2026**: đổi rule "Chờ golive" sau go-live, xem §14.
- **Danh mục badge (nguồn duy nhất):** `src/lib/scoring/catalog.ts` — popup "Logic cảnh báo" (`HelpPanels.tsx`) render trực tiếp từ file này
- **Feature:** Gom toàn bộ rule đánh giá Epic về 1 Scoring Service duy nhất

---

## 1. Mục tiêu & nguyên tắc đã chốt

| # | Quyết định (đã thống nhất 2026-09-29) |
|---|---|
| 1 | 5 nhóm finding: **ALERT** (cảnh báo), **PASS** (đánh giá đạt), **FAIL** (đánh giá không đạt), **RECOMMENDATION** (khuyến nghị), **NOTE** (ghi nhận — thông tin trung tính, không phải cảnh báo hay đánh giá). |
| 2 | **Phương án lai**: logic rule viết trong code; **tham số** (offset, grace days, khoảng ngày, tỉ lệ…) và **bật/tắt từng rule** lấy từ DB. |
| 3 | **`asOf` (mốc "now") là tham số tương đối**: chấm điểm hôm nay → `asOf = hôm nay`; chấm điểm cho quá khứ → `asOf = mốc quá khứ`. Service **không bao giờ** tự đọc đồng hồ hệ thống. |
| 4 | Service trả về **mảng findings**; ứng dụng (màn hình, báo cáo, index, MCP) tự chọn dùng 1 hoặc nhiều finding. |
| 5 | Phạm vi: **TTM-CNTT, TTM-E2E, Release, Anomaly, Scope, cảnh báo theo pha (DESIGN/DEV/TEST/PENTEST/R4GOLIVE)**. |
| 6 | **Chạy song song** với code đánh giá cũ — không xoá rule/code cũ cho tới khi test đối chiếu ổn định và được anh duyệt loại bỏ. |

Mục tiêu cuối: thêm / sửa / bỏ một rule = chỉ đụng vào `src/lib/scoring/` (và/hoặc 1 dòng cấu hình DB).
Không màn hình, không câu SQL lọc, không hàm tổng hợp index nào được tự suy luận lại phán quyết.

---

## 2. Hiện trạng (lý do phải làm)

Rule đang phân tán ở ≥ 8 module lõi và bị suy luận lại ở tầng UI/SQL:

| Nơi | Rule đang nắm giữ |
|---|---|
| `ttm-rules.ts` | `computeTtmAlert` (EARLY/LATE/FAIL TTM-CNTT), `RELEASE_DUE_GRACE_WORKING_DAYS = 5` |
| `epic-alert-service.ts` | `resolveTtmE2eRelease`, `resolveTtmCnttStatusMismatch` (Sai Status), `resolveReleaseAxis`, ép `alertLevel = NONE` khi `breaksTtmCnttCalculation` |
| `epic-data-anomaly.ts` | R1–R7, `breaksTtmCnttCalculation`, `breaksTtmE2eCalculation`, hằng `PENDING_STALE_RATIO = 0.2` |
| `ttm-phase-rules.ts` | `TTM_PHASE_PERCENTAGE`, baseline pha, `computePhaseAlertLevel` (EARLY = 1 ngày trước baseline) |
| `epic-alert-phase-service.ts` | ghép phase cells, current stage |
| `ttm-scope-rules.ts` | gate Ngoài phạm vi TTM-CNTT / QA |
| `ttm-cntt-qa.ts`, `dashboard-service.ts` | định nghĩa pass/fail/eligible cho TTM-Index/QA-Index |
| `epic-compliance-engine.ts` | engine compliance thứ 2 (import/report) |
| `epic-alerts-15`, `epic-in-po`, `epic-alerts` page.tsx | tự tính lại `isTtmCnttAchieved` / `isTtmE2eAchieved` và thứ tự ưu tiên badge "Nhận xét" (3 bản copy) |
| `epic-alert-row-cache-query-service.ts` | viết lại cùng các phán quyết bằng SQL/JSONB (`buildAlertFilterClause`) |

### 2.1. Sai lệch đang tồn tại & quyết định (thảo luận 2026-09-29)

Service mới áp dụng **ngay** các quyết định dưới đây; code legacy giữ nguyên hành vi cũ. Vì vậy bước
đối chiếu song song (§8.2) có danh sách **"lệch có chủ đích"** — các Epic lệch đúng theo D1/D3/D4 được
tính là khớp.

- **D1 — "Đạt" của Index ≠ "Đạt" của badge.** Legacy: `summarizeTtmCntt` tính pass =
  `alertLevel = NONE && có R4G Date && không anomaly`, nên Epic "Sai Status" hoặc có R4G Date **trong
  tương lai** vẫn được đếm là Đạt trong TTM-Index, trong khi badge "Đạt TTM-CNTT" thì không.
  **Quyết định:** Epic có R4G Date nhưng sai status **không** được xếp vào "Đạt TTM-CNTT" (giữ như
  badge hiện nay), mà nhận badge **"Sai Status"** thuộc nhóm **RECOMMENDATION**. Index dùng chung
  đúng định nghĩa này: `indexMembership.ttm.pass` ≡ có badge `CNTT_PASS` (xem §6.8) — Index và badge không thể lệch nhau nữa.
- **D2 — Múi giờ của "hôm nay".** `toDateKey`/`toIsoDate` dùng giờ local của server; nếu Vercel chạy
  UTC thì từ 00:00–07:00 giờ VN "hôm nay" bị lùi 1 ngày. **Quyết định:** kiểm chứng trên production
  sau. Service mới vẫn nhận `asOf` là ngày VN dạng chuỗi (không phụ thuộc giờ server), nên nếu lỗi có
  thật thì service mới không mắc phải.
- **D3 — Hoàn thành pha không theo mốc `asOf`.** Chi tiết nguyên nhân và cách sửa ở §5.1.
  **Quyết định:** service mới lấy dữ liệu story/subtask **theo cùng mốc `asOf`** với Epic.
- **D5 — Hai mốc Target_CNTT lệch nhau 1 ngày làm việc.** **Quyết định:** thống nhất `Target_CNTT = T1 +wd (N_CNTT − 1)` (Start Date là ngày 1) cho mọi badge.
  `computeTtmAlert` (Fail / Cảnh báo muộn) và "Sai Status" dùng `evaluation.ttm.cntt.targetDate = T1 +wd N`
  (`epic-compliance-engine.ts` → `ttmBaseline`). Còn baseline pha R4GOLIVE, dải TTM-CNTT và "số ngày còn
  lại" trên Quản trị Epic dùng `computeTtmPhaseBaselines` → `T1 +wd (N − 1)` (Start Date tính là ngày 1).
  Hệ quả (legacy): có 1 ngày làm việc mà dải TTM-CNTT đã quá baseline nhưng badge chưa Fail.
- **D6 — Lỗi của logic cũ phát hiện khi đối chiếu** (service không lặp lại, xếp là lệch có chủ đích):
  - TTM-E2E: ngày kết thúc (R4G) **trùng đúng** Target_E2E bị tính Fail trên server chạy giờ VN (R4G Date
    parse thành 07:00, Target là 00:00), nhưng không Fail trên server UTC. Service so sánh ngày thuần.
  - Epic **Cancelled** vẫn hiện "Đạt TTM-CNTT". Service trả "Không áp dụng".
- **D4 — "Cảnh báo sớm".** **Quyết định:** loại bỏ hoàn toàn badge "Cảnh báo sớm" khỏi service
  (không còn `CNTT_EARLY`, `RELEASE_EARLY_WARNING`, `PHASE_EARLY`). Legacy vẫn hiển thị như cũ cho tới
  khi từng màn hình chuyển sang service.

---

## 3. Kiến trúc

```
                ┌──────────────────────── src/lib/scoring/ (thuần — KHÔNG import pool/db) ────────────────────────┐
EpicFacts ────▶ │ 1. derive      → DerivedMetrics (baseline CNTT/E2E, baseline 5 pha, actual range, grace deadline,│
ScoringContext ▶│                   số ngày còn lại…) — "máy tính", dùng chung cho mọi rule                         │
                │ 2. primary rules (registry)  → Finding[] (TTM_CNTT, TTM_E2E, RELEASE, DATA_QUALITY, SCOPE, PHASE)│
                │ 3. resolver    → đánh dấu suppressedBy theo bảng SUPPRESSIONS (không xoá finding)                │
                │ 4. derived rules → RECOMMENDATION + INDEX (đọc kết quả bước 3)                                    │
                │ 5. → EpicScorecard { findings[], derived, asOf, rulesetVersion }                                  │
                └────────────────────────────────────────────────────────────────────────────────────────────────────┘
       ▲ server-only: scoring-context-service.ts nạp holidays, TTM policies, status alert offsets,
       │ ttm_scope_config, scoring_parameters, scoring_rule_settings từ DB → ScoringContext
```

### 3.1. Cấu trúc thư mục

```
src/lib/scoring/
  types.ts                 EpicFacts, ScoringContext, Finding, EpicScorecard, BadgeId…
  catalog.ts               Danh mục BADGE: mỗi badge ↔ 1 axis + 1 group, nhãn VN, precedence, style, icon
  parameters.ts            Khai báo tham số + giá trị mặc định + zod schema
  derive.ts                DerivedMetrics (tái dùng các hàm hiện có: computeTtmPhaseBaselines, addWorkingDays…)
  rules/
    ttm-cntt.ts            CNTT_*
    ttm-e2e.ts             E2E_*
    release.ts             RELEASE_*
    data-quality.ts        ANOMALY_R1…R7
    scope.ts               SCOPE_*
    phase.ts               PHASE_*
    recommendations.ts     REC_*   (derived rule)
    index-membership.ts    INDEX_* (derived rule)
  registry.ts              Danh sách rule đang dùng — THÊM/BỎ rule tại đây
  resolver.ts              Bảng SUPPRESSIONS
  score-epic.ts            scoreEpic(facts, ctx) — entry duy nhất
  select.ts                Helper cho app: activeFindings, primaryFinding(axis), hasFinding(code), FILTER_PRESETS
  parity.ts                So sánh scorecard ↔ output legacy (chỉ dùng giai đoạn song song)
  __tests__/               Test từng rule + test biên + parity
src/lib/scoring-context-service.ts   (server-only) nạp ScoringContext từ DB cho một asOf
src/lib/scoring-settings-service.ts  (server-only) CRUD scoring_parameters / scoring_rule_settings
```

Toàn bộ `src/lib/scoring/` là **thuần** (giống `ttm-scope-rules.ts` hiện nay): dùng được cả server lẫn
client, test được không cần DB. Thêm lint rule `no-restricted-syntax` cấm `new Date()` không tham số
và `Date.now()` trong thư mục này để bảo đảm nguyên tắc `asOf`.

---

## 4. Hợp đồng dữ liệu

### 4.1. Đầu vào

```ts
/** Dữ liệu thô của 1 Epic, ĐÚNG như được biết tại thời điểm asOf (lớp dữ liệu tương ứng). */
interface EpicFacts {
  epicKey: string;
  projectKey: string;
  status: string;                     // status Jira gốc
  complexity: EpicComplexity | null;  // CT-Lv12/CT-Lv34/SP-Lv12/SP-Lv34
  ideaApprovedDate: IsoDate | null;   // T0
  jiraCreatedAt: IsoDate | null;
  startDate: IsoDate | null;          // T1
  r4gDate: IsoDate | null;
  dueDate: IsoDate | null;
  requestType: string | null;
  requirementLevel: string | null;
  // Tính từ status story/subtask TẠI asOf (latestIssuesAsOf, §5.1); null = không còn dữ liệu cho asOf đó.
  phaseCompletion: { designDone: boolean; devDone: boolean; testDone: boolean; r4goliveDone: boolean; releasedDone: boolean } | null;
}

interface ScoringContext {
  asOf: IsoDate;                      // "YYYY-MM-DD" theo giờ VN — mốc "now" tương đối (xem §5)
  holidays: HolidaySet;
  ttmPolicies: TtmPolicy[];           // bảng ttm_policies (đã có UI "Tiêu chí Time to Market")
  statusAlertRules: StatusAlertRule[];// offset cảnh báo (đã có UI "Cấu hình cảnh báo")
  scope: TtmScopeConfig;              // ttm_scope_config, đã gộp override deep-link nếu có
  parameters: ScoringParameters;      // scoring_parameters (mới) — mặc định lấy từ code
  ruleSettings: Record<RuleId, { enabled: boolean }>; // scoring_rule_settings (mới)
}
```

### 4.2. Mô hình Axis → Group → Badge (đã chốt 2026-09-29)

```
Axis (TTM_CNTT, TTM_E2E, RELEASE, PHASE, DATA_QUALITY, SCOPE)
 └─ FindingGroup (ALERT | PASS | FAIL | RECOMMENDATION | NOTE)
     └─ Badge (nhiều badge trong 1 group; mỗi badge thuộc ĐÚNG 1 group và ĐÚNG 1 axis)
```

- **Badge** là đơn vị anh định nghĩa và quản lý: mã, nhãn tiếng Việt, group, axis, màu/icon, thứ tự ưu tiên.
  Toàn bộ badge được khai báo tập trung trong `catalog.ts` (danh mục §6).
- **Rule** chỉ phát ra finding trỏ tới một badge; rule **không** được tự đặt group/axis. Group và axis
  luôn suy ra từ badge, nên một badge không thể "lạc" sang group hay axis khác.
- Kiểm tra lúc build (unit test của catalog): mỗi badge có đúng 1 group và 1 axis hợp lệ, mã badge không trùng.

```ts
type FindingGroup = 'ALERT' | 'PASS' | 'FAIL' | 'RECOMMENDATION' | 'NOTE';
type ScoringAxis = 'TTM_CNTT' | 'TTM_E2E' | 'RELEASE' | 'PHASE' | 'DATA_QUALITY' | 'SCOPE';

interface BadgeDefinition {
  id: BadgeId;                        // 'CNTT_FAIL', 'CNTT_STATUS_MISMATCH', 'PHASE_LATE'…
  axis: ScoringAxis;                  // đúng 1 axis
  group: FindingGroup;                // đúng 1 group
  label: string;                      // nhãn hiển thị: 'Fail TTM-CNTT', 'Sai Status'…
  precedence: number;                 // thứ tự trong axis (nhỏ = ưu tiên hiển thị hơn)
  style: BadgeStyle;                  // màu/biến thể CSS
  icon?: PhosphorIconName;            // theo chuẩn icon Phosphor của dự án
  tooltip?: string;                   // mẫu câu, điền số liệu từ evidence
}

interface Finding {
  badge: BadgeId;                     // group & axis tra từ BadgeDefinition
  subject?: TtmPhaseKey;              // chỉ axis PHASE: 'DESIGN' | 'DEV' | 'TEST' | 'PENTEST' | 'R4GOLIVE'
  ruleId: string;
  message: string;                    // câu "Nhận xét" tiếng Việt, đã điền số liệu
  evidence: Record<string, string | number | boolean | null>; // baseline, số ngày trễ, grace deadline…
  suppressedBy?: BadgeId[];           // có giá trị → finding "bị che" (vẫn trả về, app mặc định bỏ qua)
  relatedTo?: BadgeId[];              // badge RECOMMENDATION trỏ về badge gây ra nó
}

interface EpicScorecard {
  epicKey: string;
  asOf: IsoDate;
  rulesetVersion: string;             // xem §7.3
  findings: Finding[];                // TẤT CẢ finding (kể cả bị che), sắp theo precedence của badge
  indexMembership: IndexMembership;   // thành viên TTM-Index/QA-Index — KHÔNG phải badge (§6.8)
  derived: DerivedMetrics;            // số liệu để vẽ stripe/cột pha — app không tự tính lại
}
```

Service trả **toàn bộ** findings (theo quyết định #4). Resolver **không xoá** mà chỉ đánh dấu
`suppressedBy` — ví dụ Epic ngoài phạm vi vẫn nhận được finding `CNTT_FAIL` (bị che bởi
`SCOPE_CNTT_OUT`), để màn hình nào muốn xem "phán quyết gốc" vẫn có. Helper trong `select.ts` giúp
app không phải viết lại thứ tự ưu tiên:

```ts
activeFindings(card)                       // bỏ các finding có suppressedBy
primaryFinding(card, 'TTM_CNTT')           // finding active có precedence cao nhất của axis
findingsByGroup(card, 'RECOMMENDATION')    // mọi badge của 1 group, trên mọi axis
hasBadge(card, 'PHASE_LATE', 'DEV')
FILTER_PRESETS.ACHIEVED_CNTT               // → ['CNTT_PASS'] (thay matchesAlertFilter/buildAlertFilterClause)
```

---

## 5. Mốc thời gian `asOf`

- `asOf` là **ngày** (không giờ) theo **giờ Việt Nam**, bắt buộc truyền vào; mọi phép so sánh
  "hôm nay", "đã qua baseline", "số ngày còn lại", "Pending bao lâu" đều dùng `asOf`.
- Người gọi quyết định `asOf`:
  - Màn hình / cache hằng ngày: `asOf = vnToday()` (hàm tiện ích mới, dùng `Asia/Ho_Chi_Minh`).
  - Xem lớp dữ liệu quá khứ ("Chọn lớp dữ liệu"): `asOf = ngày của lớp` — thay cho `filters.asOfDate` hiện nay.
  - Chấm lại lịch sử / báo cáo theo kỳ: `asOf = ngày chốt kỳ`.
- `EpicFacts` phải là dữ liệu **tại** `asOf` (lớp `issues` tương ứng) — trách nhiệm của người gọi,
  tái dùng cơ chế `layerDates` sẵn có.
- **Cấu hình khi chấm quá khứ**: giai đoạn này dùng **cấu hình hiện tại** (các bảng cấu hình chưa lưu
  lịch sử phiên bản). Nếu sau này cần "chấm theo đúng rule tại thời điểm đó", bổ sung `effective_from`
  cho `scoring_parameters` — thiết kế đã chừa chỗ (xem §11 câu hỏi Q3).
### 5.1. D3 — Hoàn thành pha phải lấy theo cùng mốc `asOf`

**Vì sao hiện tại chỉ đúng gần đúng.** Cảnh báo một pha gồm 2 bước:

1. **Pha đã xong chưa?** Hàm `computeEpicPhaseCompletionByEpicKey` (`epic-phase-completion-service.ts`) trả
   về cờ đúng/sai (`designDone`, `devDone`, `testDone`…). Cờ này suy ra từ **status của story/subtask**,
   ví dụ DEV xong khi mọi story ≥ `READY FOR TEST`, TEST xong khi mọi story ≥ `UAT DONE`.
2. **So với `now`:** chỉ khi pha **chưa xong** mới so `now` với baseline của pha: `now` > baseline → Cảnh báo muộn.

Bước 2 đã dùng đúng `now` (hôm nay, hoặc ngày của lớp dữ liệu cũ). Chỗ sai nằm ở **bước 1**:

- Hàm đọc story/subtask qua `LATEST_ISSUES_CTE`, tức luôn lấy **dòng mới nhất** của mỗi story, và
  **không** nhận bộ lọc lớp dữ liệu (`layerDates`) như phần đọc Epic.
- Cờ "đã xong" chỉ là đúng/sai, **không có ngày hoàn thành** (bảng `epic_milestone_history` từng ghi
  ngày hoàn thành nhưng đã tắt), nên không thể hỏi "tại ngày X pha đã xong chưa".

Ví dụ: xem lớp dữ liệu ngày 01/09, DEV baseline 25/08. Ngày 01/09 các story còn In Progress, nhưng tới
hôm nay (29/09) story đã lên `READY FOR TEST`. Hàm đọc status hôm nay → `devDone = true` → cột DEV lớp
01/09 **không** báo Cảnh báo muộn. Đúng ra ngày 01/09 phải báo muộn, vì lúc đó DEV chưa xong và đã quá baseline.

Tóm lại: Epic được đọc theo mốc quá khứ, `now` là mốc quá khứ, nhưng story/subtask lại được đọc theo hôm nay.

**Cách sửa trong service mới.** Story/subtask được đọc theo **cùng mốc `asOf`** với Epic:

- Dùng biến thể `latestIssuesAsOf(asOf)`: `DISTINCT ON (issue_key) … WHERE aggregated_at::date <= asOf
  ORDER BY aggregated_at DESC`. Nghĩa là lấy trạng thái cuối cùng của mỗi story **tính tới ngày `asOf`**.
- `phaseCompletion` trong `EpicFacts` được tính từ tập dữ liệu đó.
- Khi `asOf` = hôm nay, kết quả trùng với hiện tại. Tức là không đổi hành vi trên màn hình mặc định.
- **Giới hạn còn lại:** `issues` bị xoá theo lô import khi hết hạn lưu trữ (`ON DELETE CASCADE` theo
  `import_batches`, cấu hình "Retention"). `asOf` cũ hơn thời hạn lưu trữ thì không còn dữ liệu story
  để tính. Khi đó service phát badge NOTE `PHASE_COMPLETION_UNAVAILABLE` thay vì im lặng dùng dữ liệu hiện tại.

---

## 6. Danh mục badge (theo Axis → Group)

Mỗi dòng là một **badge**: thuộc đúng 1 axis (tiêu đề mục) và đúng 1 group (cột Group). Cột **Nguồn
legacy** là hàm cũ cho kết quả tương đương, dùng để đối chiếu song song. Cột **Prec.** là thứ tự ưu tiên
hiển thị trong axis (số nhỏ = ưu tiên hơn). Toàn bộ group đã được chốt (§11); nguồn chính thức là `src/lib/scoring/catalog.ts`.
Badge "Cảnh báo sớm" đã bị loại bỏ trên mọi axis (quyết định D4).

### 6.1. Axis TTM_CNTT

| Badge | Nhãn | Group | Prec. | Điều kiện (tóm tắt) | Nguồn legacy |
|---|---|---|---|---|---|
| `CNTT_CALC_BROKEN` | Không tính được | NOTE | 10 | Thiếu Start Date hoặc R4G Date < Start Date | `breaksTtmCnttCalculation` |
| `CNTT_STATUS_MISMATCH` | Sai Status | **RECOMMENDATION** | 20 | R4G Date đã tới (≤ asOf), đúng hạn baseline, nhưng status < R4GOLIVE. Nội dung: "Chuyển status Epic sang R4GOLIVE" | `resolveTtmCnttStatusMismatch` |
| `CNTT_FAIL` | Fail TTM-CNTT | FAIL | 30 | Quá baseline (chưa có R4G mà asOf > target, hoặc R4G > target) | `alertLevel = FAIL` |
| `CNTT_LATE` | Cảnh báo muộn | ALERT | 40 | asOf ≥ mốc cảnh báo muộn (T1 + lateOffset) | `alertLevel = LATE` |
| `CNTT_PASS` | Đạt TTM-CNTT | PASS | 60 | Không Fail, có R4G Date đã tới (`actualTo = r4g`), **không** Sai Status | `isTtmCnttAchieved` (3 page) |
| `CNTT_NOT_APPLICABLE` | Không áp dụng | NOTE | 90 | Status Cancelled | `computeTtmAlert` → NONE |

- Epic ở giữa mốc cảnh báo sớm và mốc cảnh báo muộn: legacy hiện "Cảnh báo sớm", service mới **không có badge** trên axis này (D4).
- `evidence`: `targetR4gDate`, `lateAlertDate`, `remainingWorkingDays`, `elapsedWorkingDays`, `budgetWorkingDays`.

### 6.2. Axis TTM_E2E

| Badge | Nhãn | Group | Prec. | Điều kiện | Nguồn legacy |
|---|---|---|---|---|---|
| `E2E_CALC_BROKEN` | Không tính được | NOTE | 10 | R4G Date < T0 | `breaksTtmE2eCalculation` |
| `E2E_FAIL` | Fail TTM-E2E | FAIL | 30 | actualTo (R4G/Due theo policy `to_ttm_field`) vượt baseline T0 + ngân sách E2E | `ttmE2eAlertLevel = FAIL` |
| `E2E_PASS` | Đạt TTM-E2E | PASS | 60 | Không Fail + status RELEASED + R4G Date đã tới | `isTtmE2eAchieved` (3 page) |
| `E2E_BASELINE_FROM_JIRA_CREATED` | Baseline từ ngày tạo Jira | NOTE | 95 | Thiếu T0 → baseline tính từ ngày tạo Jira | `baselineSourceLabel` |

### 6.3. Axis RELEASE

| Badge | Nhãn | Group | Prec. | Điều kiện | Nguồn legacy |
|---|---|---|---|---|---|
| `RELEASE_JUSTIFY_GOLIVE` | Giải trình Golive | FAIL | 20 | Due > R4G + grace, hoặc chưa có Due mà asOf > R4G + grace | `releaseAxisState = JUSTIFY_GOLIVE` |
| `RELEASE_STATUS_MISMATCH` | Sai Status | RECOMMENDATION | 30 | Due ≤ R4G + grace nhưng status chưa RELEASED — "Chuyển status sang Released" (trước đây là rule R7 Sai lệch dữ liệu) | `evaluateEpicDataAnomaly` R7 |
| `RELEASE_WAITING_GOLIVE` | Chờ golive | ALERT | 40 | **Đổi 2026-10-01** (§14): status = R4GOLIVE, HOẶC (status = RELEASED VÀ chưa có Due) — trong Phạm vi TTM-CNTT (QLDA); không còn phụ thuộc R4G Date/grace | `WAITING_GOLIVE` (nay đã lệch khỏi legacy) |
| `RELEASE_ON_TIME` | Release đúng hạn | PASS | 70 | **Mới, mặc định TẮT**: Due ≤ R4G + grace và status RELEASED | — (chưa có) |

`evidence`: `graceDeadline`, `graceWorkingDays`.

### 6.4. Axis DATA_QUALITY (Sai lệch dữ liệu)

Giữ nguyên chỉ số R1–R7 (`EPIC_ANOMALY_RULE_INDEX` — không đánh số lại), mỗi rule là 1 rule riêng
bật/tắt được. Status Cancelled / To Do / In PO / Backlog được miễn (gate trong rule, tham số hoá).

| Badge | Group | Điều kiện |
|---|---|---|
| `ANOMALY_R1_MISSING_START_DATE` (Thiếu Start Date) | ALERT | status ≥ DESIGN (từ 2026-10-04; trước đó ≥ DEV), không Pending, thiếu T1 |
| `ANOMALY_R2_PENDING_TOO_LONG` (**Pending lâu**) | **RECOMMENDATION** | Pending ≥ `pendingStaleRatio` × ngân sách TTM-CNTT (tính tới asOf) |
| `ANOMALY_R3_DATE_OUT_OF_SEQUENCE` (Sai thứ tự ngày) | ALERT | Vi phạm T0 ≤ T1 < R4G ≤ Due (gộp 1 finding) |
| `ANOMALY_R4_MISSING_REQUEST_TYPE` (Thiếu Phân loại yêu cầu) | ALERT | Thiếu Phân loại yêu cầu |
| `ANOMALY_R5_MISSING_REQUIREMENT_LEVEL` (Thiếu Requirement Level) | ALERT | Thiếu Requirement Level VÀ status > DESIGN (từ 2026-10-04) |
| `ANOMALY_R6_SP_LEVEL_MISMATCH` (SP nhưng Level thấp) | ALERT | Độ phức tạp SP nhưng Requirement Level 1–2 |
| `ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE` (Có R4G Date nhưng chưa R4GOLIVE) | ALERT | Có R4G Date VÀ status < R4GOLIVE (mới 2026-10-04, §16) |
| `ANOMALY_R9_MISSING_R4G_DATE` (Thiếu R4G Date) | ALERT | status ≥ R4GOLIVE, không Pending, thiếu R4G Date (mới 2026-10-04, §16) |

R7 đã chuyển sang axis RELEASE thành badge `RELEASE_STATUS_MISMATCH` "Sai Status" (group RECOMMENDATION, Q2).
R2 "Pending lâu" thuộc group RECOMMENDATION (quyết định 2026-09-29) — không còn là "Sai lệch dữ liệu".
Chỉ số R1–R6 giữ nguyên; số 7 không được dùng lại.

"Sai lệch dữ liệu" (legacy `hasDataAnomaly`) ≡ có ít nhất 1 badge ALERT active trên axis DATA_QUALITY.
**Hệ quả của việc chuyển R2/R7:** Epic chỉ vi phạm R2 và/hoặc R7 không còn bị coi là "Sai lệch dữ liệu" — không bị đẩy
xuống cuối bảng và được tính vào mẫu số TTM-Index. Đây là lệch có chủ đích (§8.2).

### 6.5. Axis SCOPE

| Badge | Nhãn | Group | Điều kiện | Nguồn legacy |
|---|---|---|---|---|
| `SCOPE_CNTT_OUT` | Ngoài phạm vi TTM-CNTT | NOTE | Ngoài khoảng A ≤ R4G Date (hoặc baseline) ≤ B | `!ttmCnttInScope` |
| `SCOPE_QA_OUT` | Ngoài phạm vi QA | NOTE | Ngoài khoảng C ≤ R4G Date ≤ D | `!qaInScope` |

### 6.6. Axis PHASE (DESIGN / DEV / TEST / PENTEST / R4GOLIVE — `subject` = tên pha)

| Badge | Nhãn | Group | Điều kiện | Nguồn legacy |
|---|---|---|---|---|
| `PHASE_LATE` | Trễ pha | ALERT | Pha chưa xong **tại asOf**, asOf > baseline pha | `computePhaseAlertLevel = LATE` |
| `PHASE_DONE` | Hoàn thành pha | NOTE | Pha đã hoàn thành **tại asOf** (§5.1) | `isDone` |
| `PHASE_CURRENT` | Pha hiện tại | NOTE | Pha hiện tại của Epic | `isCurrentStage` |
| `PHASE_NOT_COMPUTABLE` | Không tính được | NOTE | Không có baseline (thiếu T1 hoặc ngân sách) | `naPhaseCell` |
| `PHASE_COMPLETION_UNAVAILABLE` | Thiếu dữ liệu hoàn thành | NOTE | asOf cũ hơn thời hạn lưu trữ dữ liệu story (§5.1) | — (mới) |

- PENTEST chưa có rule hoàn thành, nên không bao giờ sinh `PHASE_DONE` cho PENTEST (giữ nguyên hành vi).
- Legacy tô vàng "Cảnh báo sớm" 1 ngày trước baseline pha; service mới bỏ trạng thái này (D4).

### 6.7. Group RECOMMENDATION trên các axis

Ngoài `CNTT_STATUS_MISMATCH` (Sai Status), `RELEASE_STATUS_MISMATCH` (Sai Status) và `ANOMALY_R2_PENDING_TOO_LONG` (Pending lâu) ở trên, các badge khuyến nghị
sau được sinh bởi derived rule (đọc finding đã resolve). Mỗi badge vẫn thuộc đúng 1 axis:

| Badge | Axis | Sinh ra khi | Nội dung khuyến nghị |
|---|---|---|---|
| `REC_FILL_START_DATE` | DATA_QUALITY | `ANOMALY_R1` hoặc `CNTT_CALC_BROKEN` do thiếu T1 | Bổ sung Start Date (T1) |
| `REC_FILL_IDEA_APPROVED_DATE` | TTM_E2E | `E2E_BASELINE_FROM_JIRA_CREATED` | Bổ sung Idea Approved Date (T0) |
| `REC_FILL_REQUEST_TYPE` | DATA_QUALITY | R4 | Bổ sung Phân loại yêu cầu |
| `REC_FILL_REQUIREMENT_LEVEL` | DATA_QUALITY | R5 | Bổ sung Requirement Level |
| `REC_FIX_DATE_ORDER` | DATA_QUALITY | R3 hoặc `*_CALC_BROKEN` do sai thứ tự | Kiểm tra lại thứ tự ngày |
| `REC_REVIEW_SP_LEVEL` | DATA_QUALITY | R6 | Rà soát loại yêu cầu / Requirement Level |
| `REC_FIX_R4G_STATUS` | DATA_QUALITY | R8 | Chuyển status sang R4GOLIVE hoặc kiểm tra lại R4G Date |
| `REC_FILL_R4G_DATE` | DATA_QUALITY | R9 | Bổ sung R4G Date |
| `REC_PREPARE_GOLIVE_JUSTIFICATION` | RELEASE | `RELEASE_JUSTIFY_GOLIVE` | Chuẩn bị giải trình Golive |
| `REC_ACCELERATE_PHASE` | PHASE | `PHASE_LATE` (pha hiện tại) | Đẩy nhanh pha đang trễ |

Các badge này đều là **mới** (hiện chỉ có dạng text trong tooltip / `missingStandardInfo`), nên không
ảnh hưởng đối chiếu song song. Anh có thể thêm, bớt hoặc gộp tuỳ ý; đây chỉ là danh sách khởi đầu.

### 6.8. Thành viên TTM-Index / QA-Index (`indexMembership` — không phải badge)

Không hiển thị như badge nên tách khỏi `findings`. Hàm tổng hợp index chỉ còn **đếm cờ**, không tự suy luận:

```ts
interface IndexMembership {
  ttm: { counted: boolean; eligible: boolean; pass: boolean; fail: boolean };
  qa:  { counted: boolean; eligible: boolean; pass: boolean; fail: boolean };
}
```

| Cờ | Điều kiện (sau quyết định D1) |
|---|---|
| `ttm.counted` | Không Cancelled và không `SCOPE_CNTT_OUT` |
| `ttm.fail` | counted và có finding `CNTT_FAIL` |
| `ttm.eligible` | counted, có R4G Date (**kể cả ngày tương lai**, Q3), không có badge ALERT của axis DATA_QUALITY |
| `ttm.pass` | eligible **và có badge `CNTT_PASS` active**. Epic Sai Status hoặc R4G Date chưa tới → trong mẫu số nhưng không pass (Q3) |
| `qa.*` | Như trên nhưng status ∈ `qaStatuses` (MVP DONE, RELEASED) và thay `SCOPE_CNTT_OUT` bằng `SCOPE_QA_OUT` |

Công thức % giữ nguyên `summarizeTtmCnttFromCounts`. Từ nay "Đạt" của Index và "Đạt" của badge dùng
chung một định nghĩa (`CNTT_PASS`). So với legacy, TTM-Index/QA-Index có thể **giảm**: Epic Sai Status và
Epic có R4G Date ở tương lai trước đây được đếm Đạt, nay vẫn ở mẫu số nhưng không Đạt (Epic R4G tương lai
sẽ thành Đạt khi tới ngày nếu đúng hạn).

---

## 7. Resolver & cấu hình

### 7.1. Bảng SUPPRESSIONS (thứ tự ưu tiên — khai báo 1 chỗ)

```ts
const SUPPRESSIONS: { when: BadgeId; suppress: BadgeId[] }[] = [
  { when: 'CNTT_NOT_APPLICABLE',  suppress: ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH'] },
  { when: 'CNTT_CALC_BROKEN',     suppress: ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH'] },
  { when: 'SCOPE_CNTT_OUT',       suppress: ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH'] },
  { when: 'CNTT_STATUS_MISMATCH', suppress: ['CNTT_PASS'] },
  { when: 'E2E_CALC_BROKEN',      suppress: ['E2E_FAIL', 'E2E_PASS'] },
];
```

Thứ tự hiển thị badge "Nhận xét" hiện tại (Ngoài phạm vi → Sai Status → Fail → Muộn → Đạt; đã bỏ "Sớm" theo D4) được
tái hiện bằng `precedence` trong catalog + `primaryFinding(card, axis)`; 3 bản copy ở 3 page bị thay
bằng 1 component `<FindingBadges card=… axes=[…] />` render theo catalog (nhãn, màu, icon Phosphor).

Rule **core** (không cho tắt, vì là gate an toàn): `CNTT_CALC_BROKEN`, `E2E_CALC_BROKEN`,
`CNTT_NOT_APPLICABLE`. Tắt 1 rule thường ⇒ finding của nó không sinh ra ⇒ không che finding nào khác.

### 7.2. Bảng DB mới

```sql
-- Tham số rule (mặc định nằm trong code — chỉ lưu giá trị admin đã sửa).
CREATE TABLE IF NOT EXISTS scoring_parameters (
    param_key TEXT PRIMARY KEY,               -- 'release.graceWorkingDays'
    value JSONB NOT NULL,                     -- 5
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- Bật/tắt từng badge (không có dòng = defaultEnabled trong catalog; badge core không tắt được).
CREATE TABLE IF NOT EXISTS scoring_rule_settings (
    badge_id TEXT PRIMARY KEY,                -- 'RELEASE_ON_TIME'
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);
```

Tham số chuyển từ hằng số trong code sang `scoring_parameters` (mặc định = giá trị hiện tại):

| param_key | Mặc định | Đang hardcode tại |
|---|---|---|
| `release.graceWorkingDays` | 5 | `RELEASE_DUE_GRACE_WORKING_DAYS` (dùng chung Release + R7) |
| `anomaly.pendingStaleRatio` | 0.2 | `PENDING_STALE_RATIO` |
| `anomaly.exemptStatuses` | Cancelled, To Do, In PO, Backlog | `evaluateEpicDataAnomaly` |
| `anomaly.spMismatchLevels` | ["1","2"] | `SP_MISMATCH_LEVELS` |
| `phase.percentages` | 20/30/30/10/10 | `TTM_PHASE_PERCENTAGE` |
| `anomaly.spMismatchLevels` / `anomaly.exemptStatuses` | như trên | (Cancelled luôn được miễn) |
| `index.qaStatuses` | MVP DONE, RELEASED | `TTM_CNTT_QA_STATUSES` |

Các cấu hình **đã có bảng + UI riêng** giữ nguyên nơi lưu, chỉ được nạp vào `ScoringContext`:
`epic_status_alert_rules` (offset muộn; offset sớm không còn dùng trong service — D4), `ttm_policies` (ngân sách CNTT/E2E, from/to field),
`ttm_scope_config`, ngày nghỉ/ngày làm bù.

### 7.3. rulesetVersion & làm mới cache

`rulesetVersion = SCORING_CODE_VERSION` (hằng số tăng khi sửa code rule) `+ ":" +` hash của
(`scoring_parameters`, `scoring_rule_settings`, `epic_status_alert_rules`, `ttm_policies`, `ttm_scope_config`).
- Lưu thay đổi ở màn cấu hình ⇒ `refreshDerivedCachesInBackground` (cơ chế đã có).
- `getDailyCacheStatus` coi cache là STALE nếu `rulesetVersion` trong cache ≠ hiện tại ⇒ lần tải trang
  đầu tiên sau khi deploy code rule mới sẽ tự tính lại.

---

## 8. Schema cache & cách app đọc

### 8.1. Mở rộng `epic_alert_row_cache` (chỉ THÊM cột — cột cũ giữ nguyên cho giai đoạn song song)

```sql
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS badge_codes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS index_flags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS findings JSONB NOT NULL DEFAULT '[]';
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS scoring_ruleset_version TEXT;
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS scored_as_of DATE;
CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_badge_codes ON epic_alert_row_cache USING GIN (badge_codes);
```

- `badge_codes` = mã badge của các finding **active**; finding có `subject` được lưu cả 2 dạng
  `PHASE_LATE` và `PHASE_LATE:DEV` để lọc theo axis lẫn theo pha. Lọc theo group (ví dụ mọi badge
  RECOMMENDATION) dùng danh sách mã badge của group đó, lấy từ catalog.
- `index_flags` = cờ `indexMembership` đang bật, ví dụ `{TTM_COUNTED, TTM_ELIGIBLE, TTM_PASS, QA_COUNTED}`.
- `findings` = toàn bộ mảng (kể cả bị che) — cho màn chi tiết / MCP / tooltip.
- Lọc SQL: `WHERE badge_codes && $1::text[]` (thay toàn bộ `buildAlertFilterClause`).
- Index: `count(*) FILTER (WHERE index_flags @> ARRAY['TTM_PASS'])` (thay `queryTtmQaIndexPm`).

### 8.2. Đối chiếu song song (parity)

`parity.ts` ánh xạ ngược finding → field legacy và so từng Epic:

| Field legacy | Tái dựng từ findings |
|---|---|
| `alertLevel` | CNTT_FAIL/LATE (gốc, bỏ qua suppress do SCOPE) → FAIL/LATE, else NONE |
| `ttmE2eAlertLevel` | E2E_FAIL active → FAIL |
| `ttmCnttStatusMismatch` | CNTT_STATUS_MISMATCH (gốc) |
| `releaseAxisState` | RELEASE_* |
| `hasDataAnomaly`, `dataAnomalyViolations` | badge ALERT của axis DATA_QUALITY (R1–R6) + `RELEASE_STATUS_MISMATCH` (R7) |
| `ttmCnttInScope`, `qaInScope` | ¬SCOPE_CNTT_OUT, ¬SCOPE_QA_OUT |
| `stages.*.alertLevel/isDone/isCurrentStage` | PHASE_* theo subject |
| badge "Đạt", bộ lọc `ACHIEVED_*` | CNTT_PASS / E2E_PASS |
| `summarizeTtmCntt` / `summarizeQaIndex` | đếm `indexMembership` |

**Lệch có chủ đích** (được tính là khớp, nhưng vẫn liệt kê riêng trong báo cáo để anh xem số lượng):

| Quyết định | Legacy | Service mới |
|---|---|---|
| D1 | TTM-Index đếm Đạt cả Epic Sai Status / R4G Date tương lai | Không đếm Đạt (`ttm.pass` ≡ `CNTT_PASS`) |
| D3 | Pha "đã xong" theo status story hôm nay | Theo status story tại `asOf` (chỉ lệch khi `asOf` < hôm nay) |
| D4 | `alertLevel = EARLY` | Không có badge TTM_CNTT |
| D4 | `releaseAxisState = EARLY_WARNING` | Không có badge RELEASE |
| D4 | Cột pha `alertLevel = EARLY` | Không có badge PHASE |
| Q2 | R2/R7 → `hasDataAnomaly = true` | Badge RECOMMENDATION, không "Sai lệch dữ liệu" |
| D5 | Target_CNTT = From +wd N | From +wd (N − 1) |
| D6 | E2E Fail khi ngày kết thúc = Target (server giờ VN); Cancelled "Đạt TTM-CNTT" | Không Fail; "Không áp dụng" |

- Chạy trong `refreshDerivedCaches` (ghi kết quả vào `daily_cache_runs`: số Epic lệch + 20 mẫu đầu).
- Endpoint SUPERADMIN `GET /api/admin/scoring/parity?asOf=YYYY-MM-DD` để chạy thử cho bất kỳ `asOf`
  nào; hiển thị trong panel "Theo dõi cache" (Quản trị nguồn dữ liệu).

### 8.3. Hạn chế đã biết

- Rule cần **dữ liệu mới** (field Jira mới) vẫn phải sửa import + schema `issues` — service gom phần
  "phán quyết", không gom phần thu thập dữ liệu.
- `epic_alert_history` (lịch sử cảnh báo, hiện đang tắt ghi) không được tính lại khi đổi rule.
- D3: `asOf` cũ hơn thời hạn lưu trữ dữ liệu story thì không tính được hoàn thành pha → badge NOTE `PHASE_COMPLETION_UNAVAILABLE`.

---

## 9. Lộ trình triển khai (mỗi mốc commit riêng, app luôn chạy được)

| Mốc | Nội dung | Ảnh hưởng người dùng |
|---|---|---|
| **M1** | `src/lib/scoring/` đầy đủ: types, catalog, parameters, derive, 8 file rules, resolver, `scoreEpic`, select, parity + test từng rule & test biên (asOf trước/đúng/sau mốc). Rule **bọc lại chính các hàm legacy** nơi có thể để đảm bảo cùng kết quả. | Không |
| **M2** | Migration 2 bảng mới + 4 cột cache (chạy `db:migrate:local` + `db:migrate:supabase`); `scoring-context-service`; `refreshDerivedCaches` ghi thêm scorecard (shadow) + parity report. | Không |
| **M3** | Chạy đối chiếu trên dữ liệu thật tại nhiều `asOf` (hôm nay, −7, −30 ngày, vài lớp dữ liệu cũ). Mục tiêu **0 Epic lệch**; mọi lệch được sửa ở phía scoring hoặc ghi rõ là lỗi legacy. **Anh duyệt kết quả.** | Không |
| **M4** | Chuyển từng consumer sang findings, sau feature flag `SCORING_ENGINE_MODE` (`legacy` / `scoring`, đổi được không cần deploy): (a) bộ lọc SQL + client, (b) cột "Nhận xét" qua `<FindingBadges>`, (c) TTM-Index/QA-Index, (d) cột pha, (e) Dashboard 2 + `ttm-dashboard-summary-service`, (f) Báo cáo, (g) MCP (`get_epic_detail` trả thêm `findings`). | Có — giống trước, trừ các lệch có chủ đích D1/D3/D4 (§8.2) |
| **M5** | Màn quản trị "Rule chấm điểm" (SUPERADMIN): danh sách rule theo trục/nhóm, bật/tắt, sửa tham số (form sinh từ zod schema), hiển thị `rulesetVersion`; tài liệu sản phẩm + BRD mới `brd/17-scoring-service.md`. | Có |
| **M6** | Kiểm chứng D2 (múi giờ) trên production; nếu lỗi có thật, sửa phía legacy hoặc đẩy nhanh việc chuyển consumer. D1/D3/D4 đã áp dụng sẵn trong service từ M1. | Có |
| **M7** | **Chỉ khi anh duyệt**: gỡ code đánh giá legacy, `epic-compliance-engine.ts`, cột cache cũ, flag. | Không |

---

## 10. Kiểm thử

- Test đơn vị thuần cho từng rule (Node test runner, `node --experimental-strip-types` như các test
  tay trước đây — hoặc thêm `vitest` nếu anh đồng ý thêm devDependency).
- Bộ case biên bắt buộc cho mỗi rule theo thời gian: `asOf` = mốc − 1, = mốc, = mốc + 1; có/thiếu từng ngày;
  ngày nghỉ/ngày làm bù nằm giữa khoảng.
- Test resolver: mọi cặp trong SUPPRESSIONS.
- Test tính "thuần": cùng `(facts, ctx)` ⇒ cùng scorecard (deterministic), không phụ thuộc giờ máy.
- Parity test (M3) trên snapshot dữ liệu thật.

---

## 11. Quyết định đã chốt & câu hỏi còn mở

Đã chốt 2026-09-29:

| # | Quyết định |
|---|---|
| Mô hình | Axis → Finding Group → Badge; mỗi badge thuộc đúng 1 group và 1 axis; danh mục ở `src/lib/scoring/catalog.ts` |
| D1 | Sai Status (TTM-CNTT) = RECOMMENDATION, không Đạt (badge lẫn Index) |
| D2 | Kiểm chứng múi giờ trên production sau |
| D3 | Story/subtask lấy tại `asOf` |
| D4 | Bỏ "Cảnh báo sớm" trên mọi axis |
| Q1 | Giải trình Golive = FAIL · Chờ golive = ALERT · Hoàn thành pha = NOTE |
| Q2 | R7 → RECOMMENDATION badge "Sai Status" (axis RELEASE) · R2 → ALERT badge "Pending lâu" · R1, R3–R6 → ALERT |
| Q3 | Epic có R4G Date ở tương lai: vẫn trong mẫu số · Epic Sai Status: trong mẫu số, không Đạt |
| Q4 | Chấm quá khứ dùng cấu hình hiện tại (chưa lưu lịch sử cấu hình) |
| Q5 | Thêm `RELEASE_ON_TIME` (Release đúng hạn, PASS), mặc định tắt |
| Q6 | Màn `/epic-alerts` (rút gọn) giữ logic legacy, không đưa vào scoring |
| Q7 | Dùng Node test runner có sẵn (`node --test --experimental-strip-types`), không thêm `vitest` |

Chốt thêm (2026-09-29, vòng 2):

| # | Quyết định |
|---|---|
| O1 | Bỏ badge "Cần ghi nhận Due Date" — trường hợp đó không hiện badge trục Release |
| O2 / D5 | Target_CNTT = T1 +wd (N_CNTT − 1) cho mọi badge |
| R2 | "Pending lâu" → group RECOMMENDATION, không còn là "Sai lệch dữ liệu" |

Không còn câu hỏi mở. Bước tiếp theo cần duyệt: **M4** — chuyển màn hình sang Scoring Service (§12).

## 12. Kết quả triển khai M1–M3 (2026-09-29)

**Mã nguồn**

| File | Vai trò |
|---|---|
| `src/lib/scoring/catalog.ts` | Danh mục badge (Axis → Group → Badge), SUPPRESSIONS, công thức Index — nguồn duy nhất, popup "Logic cảnh báo" render từ đây |
| `src/lib/scoring/types.ts`, `parameters.ts`, `dates.ts`, `derive.ts` | Hợp đồng dữ liệu, tham số mặc định, số học ngày làm việc trên chuỗi ISO (không phụ thuộc múi giờ server), số liệu nền |
| `src/lib/scoring/rules/*.ts` | Rule theo axis: `ttm-cntt`, `ttm-e2e`, `release`, `data-quality`, `scope-phase`, `recommendations` |
| `src/lib/scoring/registry.ts`, `score-epic.ts`, `select.ts` | Danh sách rule, entry `scoreEpic`, resolver, helper cho app (`primaryFinding`, `FILTER_PRESETS`, `badgeCodesOf`…) |
| `src/lib/scoring/parity.ts` | So sánh scorecard ↔ dòng legacy, phân loại lệch có chủ đích / chưa giải thích |
| `src/lib/scoring-context-service.ts`, `scoring-facts-service.ts`, `scoring-run-service.ts` | (server) nạp cấu hình + `rulesetVersion`, nạp facts tại `asOf` (kể cả story/subtask — D3), chấm điểm hàng loạt, shadow + đối chiếu |
| `db/migrations/20260929_create_scoring_service.sql` | `scoring_parameters`, `scoring_rule_settings`, `scoring_parity_runs`, 5 cột mới trên `epic_alert_row_cache` |
| `api/admin/scoring/parity`, `ScoringParityPanel.tsx` | SUPERADMIN xem/chạy đối chiếu (Quản trị nguồn dữ liệu, dưới "Theo dõi cache") |

- `refreshDerivedCaches` (import, cache hằng ngày, Recompute, lưu Phạm vi/Domain) giờ chấm điểm shadow, ghi
  `badge_codes` / `index_flags` / `findings` vào cache và lưu 1 lần đối chiếu. Scoring lỗi không làm hỏng cache legacy.
- Luồng import dùng `refreshDerivedCaches` (1 lần tính cho cả 2 cache) thay vì 2 lần tính riêng.
- `computeEpicPhaseCompletionByEpicKey(asOf?)` và `latestIssuesAsOfCte()` — mặc định giữ nguyên hành vi cũ.
- Lint: `src/lib/scoring/**` cấm `new Date()` không tham số, `Date.now()` và import `@/lib/db`.
- Test: `npm test` (Node test runner + `scripts/test-register.mjs`), 26 test gồm biên asOf từng rule, resolver,
  Index, tham số, và đối chiếu số học ngày với `working-days.ts` trên 1 năm dữ liệu.

**Đối chiếu trên dữ liệu thật (Supabase)**

| asOf | Epic | Khớp hoàn toàn | Chỉ lệch có chủ đích | Chưa giải thích |
|---|---|---|---|---|
| 2026-09-29 | 1.120 | 1.040 | 80 | **0** |
| 2026-09-15 | 897 | 812 | 85 | **0** |
| 2026-08-31 | 0 | — | — | — (quá thời hạn lưu trữ dữ liệu) |

Lệch có chủ đích ngày 29/09 theo phân loại: R2/R7 không còn là Sai lệch dữ liệu 66, bỏ Cảnh báo sớm 33,
lỗi múi giờ legacy E2E 16, Target N − 1 14, Index không đếm Sai Status 7, Cancelled 2.
Với asOf quá khứ, mọi chênh lệch cột pha được gắn nhãn D3 (hoàn thành pha theo asOf).

**Chưa làm:** `db:migrate:local` (máy này không có Postgres local — cần chạy ở máy có DB local);
M4–M7 (chuyển màn hình, màn quản trị rule, gỡ legacy) chờ duyệt.

## 13. M4 — Chuyển màn hình sang Scoring Service (2026-09-30)

**Cách chuyển: "chiếu" (projection) thay vì viết lại từng màn hình.** `scoring/projection.ts` ghi đè các trường
phán quyết của dòng `EpicAlertRowPhased` bằng kết quả scorecard (alertLevel, Sai Status, E2E, trục Release,
Sai lệch dữ liệu R1/R3–R6, Phạm vi, Target_CNTT, số ngày còn lại, 5 cột pha) và gắn thêm `scoringBadges`,
`scoringIndexFlags`, `scoringFindings`. Mọi nơi đọc dòng Epic (cache + cột SQL, TTM-Index, Dashboard, MCP,
2 màn Epic) hiển thị kết quả Scoring Service mà không cần đổi khuôn dữ liệu.

**Công tắc chế độ** — bảng `scoring_engine_settings` (migration `20260930_create_scoring_engine_settings`,
mặc định `legacy`), `scoring-mode-service.ts`, API `PUT /api/admin/scoring/mode`, nút trong panel "Đối chiếu
Scoring Service". Đổi chế độ ⇒ tạo lại cache ở nền. Biến môi trường `SCORING_ENGINE_MODE` ghi đè chế độ **chỉ
cho việc hiển thị** trên một máy (xem trước với DB dùng chung); cache chung luôn được tạo theo chế độ lưu trong
DB (`getStoredScoringEngineMode`), khi 2 chế độ khác nhau route đi luồng tính trực tiếp.

| Consumer | Thay đổi |
|---|---|
| Cache (`refreshDerivedCaches`) | Chế độ `scoring`: ghi dòng đã chiếu vào `epic_alert_row_cache` + TTM-Index toàn công ty |
| Luồng tính trực tiếp | `getEpicAlertRowsForDisplay` (`epic-scoring-display-service.ts`) thay cho `getEpicAlertRowsPhased` ở route Quản trị Epic, Dashboard cũ, TTM Dashboard, MCP; chấm điểm cùng lớp dữ liệu / asOf / phạm vi override |
| Bộ lọc SQL "Nhận xét" | Chế độ `scoring`: `badge_codes && FILTER_PRESETS[...]`; "Cảnh báo sớm" không còn khớp gì |
| TTM-Index / QA-Index | `summarizeTtmCntt`/`summarizeQaIndex` và SQL `queryTtmQaIndexPm` đếm theo `index_flags` khi có |
| Quản trị Epic, Epic in PO | Logic "Đạt"/bộ lọc dùng chung `epic-row-verdicts.ts` (bỏ 2 bản copy); badge mới `ScoringExtraBadges`: "Sai Status (Release)", "Pending lâu", "Khuyến nghị (n)"; bộ lọc thêm "Pending lâu", ẩn 2 lựa chọn "Cảnh báo sớm" |
| TTM Dashboard | "Đạt"/mẫu số theo `isTtmIndexPass`/`isTtmIndexEligible`; ẩn "· n sớm" |
| Báo cáo Epic | `reports-service.ts`: Đạt/Fail/Sai lệch dữ liệu theo scorecard ở chế độ `scoring` |
| MCP | `list_epic_alerts` thêm `badges`; `get_epic_detail` thêm `danhGia` (badge, nhóm, trục, nội dung) |
| Quản trị Epic (rút gọn) `/epic-alerts` | Giữ logic cũ (Q6) |

**Kiểm chứng trên dữ liệu thật (29/09, 1.120 Epic, so legacy → scoring):** Fail TTM-CNTT 43 → 46 (D5), Cảnh
báo sớm 4 → 0 và Release "Cảnh báo sớm" 11 → 0 (D4), Sai lệch dữ liệu 228 → 198 (R2/R7), Fail TTM-E2E 330 →
322 (D6), Đạt TTM-CNTT 351 → 325 (D1 + D6), TTM-Index 93,8% → 89,0%, QA-Index 93,8% → 92,9%. Luồng cache
(SQL `badge_codes`/`index_flags`) cho đúng các số này.

**Chưa làm:** M5 (màn quản trị rule/tham số, cập nhật Tài liệu sản phẩm + BRD), M6 (kiểm chứng D2 trên production),
M7 (gỡ code legacy — chỉ khi anh duyệt). `db:migrate:local` cho 2 migration mới cần chạy ở máy có Postgres local.

## 14. Thay đổi rule sau go-live — "Chờ golive" (2026-10-01)

Sau khi M4 lên production (`scoring_engine_settings.mode = 'scoring'`), badge `RELEASE_WAITING_GOLIVE`
("Chờ golive") được định nghĩa lại theo yêu cầu nghiệp vụ mới — **chỉ áp dụng cho Scoring Service**,
logic legacy (`resolveReleaseAxis`, `epic-alert-service.ts`) giữ nguyên không đổi:

```
RELEASE_WAITING_GOLIVE = Trong "Phạm vi dữ liệu cho TTM" (QLDA)
                         VÀ ( status = R4GOLIVE  HOẶC  (status = RELEASED VÀ chưa có Due Date) )
```

So với bản §6.3 gốc:
- **Bỏ hoàn toàn điều kiện R4G Date/hạn grace** — badge này giờ tính được cả khi Epic chưa từng có
  R4G Date (trước đây hàm `releaseRule` return sớm nếu thiếu R4G Date/`releaseGraceDeadline`, nên
  không thể tính WAITING_GOLIVE cho Epic thiếu R4G Date).
- **Thêm gate phạm vi** — trước đây trục Release không bị ảnh hưởng bởi "Phạm vi dữ liệu cho TTM"
  (chỉ CNTT/QA mới có gate này); nay riêng `RELEASE_WAITING_GOLIVE` bị che khi Epic có `SCOPE_CNTT_OUT`
  (thêm vào bảng SUPPRESSIONS trong `catalog.ts`, không sửa gì trong `ttm-scope-rules.ts`).
- **Không còn loại trừ `RELEASE_JUSTIFY_GOLIVE`** — quyết định (owner, 2026-10-01): giữ nguyên logic
  "Giải trình Golive" hiện có, chấp nhận 2 badge cùng active trên 1 Epic (ví dụ: status RELEASED,
  chưa có Due Date, đã quá hạn R4G + grace → vừa "Chờ golive" vừa "Giải trình Golive", vì chúng thuộc
  2 Finding Group khác nhau — ALERT vs FAIL).
- **Parity**: thêm tag `D7_WAITING_GOLIVE_REDEFINED` (`parity.ts`) cho mọi khác biệt trục Release liên
  quan tới `WAITING_GOLIVE` ở 1 trong 2 phía — tránh báo "chưa giải thích được" giả sau thay đổi này.
- `SCORING_CODE_VERSION` bump lên `scoring-3`.

**Hệ quả UI — TTM Dashboard**: widget "Chờ golive" tách thêm 3 sub-link theo thời gian (vì rule badge
không còn mang thông tin thời gian): **Thiếu R4G Date** (chưa có R4G Date), **Trong hạn** (có R4G Date,
hôm nay ≤ R4G Date + `release.graceWorkingDays` ngày làm việc), **Quá hạn** (còn lại) — 3 giá trị filter
mới `WAITING_GOLIVE_MISSING_R4G`/`WAITING_GOLIVE_WITHIN_GRACE`/`WAITING_GOLIVE_OVERDUE`
(`epic-row-verdicts.ts`), tính trực tiếp từ field (`r4gDate`, `releaseGraceDeadline`), dùng chung cho
cả 2 display engine chứ không qua badge/`FILTER_PRESETS`. Đồng thời: widget "Tổng số Epic" (TTM Dashboard)
nay trừ Epic "Ngoài phạm vi TTM-CNTT (QLDA)", có thêm sub-link "Sai lệch dữ liệu" (filter mới
`DATA_ANOMALY_IN_SCOPE`); bổ sung vòng tròn "Hoàn thành TTM-E2E" (mẫu số/tử số cùng công thức TTM-CNTT,
hàm `summarizeE2e` dùng chung giữa ring theo bộ lọc và cache toàn công ty); thêm widget TTM-E2E toàn
công ty (cached, `ttm_index_global_cache` + cột `e2e_*`, migration `20261001_add_e2e_to_ttm_index_global_cache`)
trên banner cả TTM Dashboard và Quản trị Epic.

## 15. Thay đổi rule — Sai lệch dữ liệu xét trước, "Sai Status" vẫn Đạt, TTM-E2E (2026-10-01)

Quyết định của chủ sở hữu (thay cho D1 và phần TTM-E2E ở §6.2; `SCORING_CODE_VERSION` → `scoring-4`):

1. **Sai lệch dữ liệu được xét trước.** `scoreEpic` chạy `dataQualityRule` trước; nếu Epic có badge ALERT
   của axis DATA_QUALITY (R1, R3–R6, đang bật) thì `RuleInput.hasDataAnomaly = true` và các rule TTM-CNTT /
   TTM-E2E **không chấm** (không sinh `*_PASS`, `*_FAIL`, `CNTT_LATE`, `*_STATUS_MISMATCH`) — không phải chấm
   rồi che. Áp dụng cho TTM-CNTT (QLDA), TTM-CNTT (QA) (cùng badge, khác phạm vi) và TTM-E2E. "Pending lâu"
   (R2) và "Sai Status (Release)" (R7) là Khuyến nghị nên không chặn. Các badge ghi nhận (Không tính được,
   Không áp dụng, Baseline từ ngày tạo Jira) vẫn giữ.
2. **"Sai Status" vẫn tính Đạt** (đảo quyết định D1). TTM-CNTT: R4G ≤ asOf và R4G ≤ Target_CNTT ⇒ `CNTT_PASS`;
   nếu status < R4GOLIVE thì thêm `CNTT_STATUS_MISMATCH` (hai badge cùng active, bỏ dòng che trong
   `SUPPRESSIONS`). TTM-Index đếm các Epic này là Đạt. R4G Date ở tương lai: chưa có badge nào.
3. **TTM-E2E** (cùng dạng TTM-CNTT): `Target_E2E = T0 +wd (N_E2E − 1)`; ngày kết thúc = R4G Date, vẫn đổi
   được qua `to_ttm_field` của "Tiêu chí Time to Market".
   - `E2E_FAIL`: ngày kết thúc > Target_E2E (kể cả ngày ở tương lai), hoặc chưa có ngày kết thúc và asOf > Target_E2E.
   - `E2E_PASS`: ngày kết thúc ≤ asOf và ≤ Target_E2E. **Không còn yêu cầu status Released.**
   - `E2E_STATUS_MISMATCH` (mới, RECOMMENDATION, nhãn "Sai Status"): có `E2E_PASS` và status < R4GOLIVE.
     Ở cột Nhận xét chỉ hiện thêm khi chưa có "Sai Status" của TTM-CNTT (cùng nguyên nhân).
   - Chỉ số TTM-E2E (`summarizeE2e`): mẫu số = không Cancelled, có R4G Date, không Sai lệch dữ liệu, phép tính không hỏng.

**Hiển thị:** cột Nhận xét hiện đồng thời "Đạt TTM-CNTT (QLDA)" + "Sai Status"; bộ lọc "Sai Status" gồm
`CNTT_STATUS_MISMATCH`, `E2E_STATUS_MISMATCH`, `RELEASE_STATUS_MISMATCH`. Báo cáo Epic: Đạt TTM-CNTT = có `CNTT_PASS`.

**Đối chiếu (01/10, 1.181 Epic):** 922 khớp, 259 chỉ lệch có chủ đích, 0 chưa giải thích. Nhãn mới:
`D8_ANOMALY_CHECKED_FIRST` (289), `D9_E2E_RULE_REDEFINED` (39). So với logic cũ trên cùng dữ liệu: Fail TTM-CNTT
90 → 55, Cảnh báo muộn 10 → 2, Fail TTM-E2E 334 → 237, TTM-CNTT (QLDA) 92,3% → 90,0%, TTM-CNTT (QA) 92,5% → 91,8%.

## 16. Thay đổi rule — Chất lượng dữ liệu: R8, R9, sửa R1 và R5 (2026-10-04)

Quyết định của chủ sở hữu (`SCORING_CODE_VERSION` → `scoring-5`; chỉ áp dụng cho Scoring Service, logic cũ giữ nguyên):

1. **R8 mới — `ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE`** (ALERT): có R4G Date nhưng status < R4GOLIVE.
2. **R9 mới — `ANOMALY_R9_MISSING_R4G_DATE`** (ALERT): status ≥ R4GOLIVE (R4GOLIVE / MVP Done / Released; Pending
   không tính) nhưng chưa có R4G Date.
3. **R1 sửa:** thiếu Start Date tính từ status DESIGN (Design / In Progress / R4GOLIVE / MVP Done / Released), trước đây từ DEV.
4. **R5 sửa:** thiếu Requirement Level chỉ tính khi status > DESIGN.

Miễn trừ chung của axis (Cancelled / To Do / In PO / Backlog — tham số `anomaly.exemptStatuses`) vẫn áp dụng cho R8/R9.
Mỗi rule mới có khuyến nghị riêng (`REC_FIX_R4G_STATUS`, `REC_FILL_R4G_DATE`) và bật/tắt được trong `scoring_rule_settings`.

**Hệ quả:**

- R8 là Sai lệch dữ liệu nên theo §15.1 Epic "có R4G Date đúng hạn nhưng status < R4GOLIVE" **không còn được chấm
  Đạt kèm "Sai Status"** (§15.2) — chỉ hiện Sai lệch dữ liệu và ra khỏi mẫu số TTM-CNTT cho tới khi sửa status.
  `CNTT_STATUS_MISMATCH` / `E2E_STATUS_MISMATCH` chỉ còn xuất hiện khi R8 bị tắt.
- R9: Epic status ≥ R4GOLIVE thiếu R4G Date trước đây bị chấm "Fail TTM-CNTT (Thiếu R4G)" khi quá Target; nay là Sai
  lệch dữ liệu, không chấm Fail. "Chờ golive" (trục Release) không phụ thuộc Sai lệch dữ liệu nên vẫn hiện.
- R5: Epic đang DESIGN thiếu Requirement Level không còn là Sai lệch dữ liệu → được chấm TTM bình thường.

**Chiếu sang dòng legacy** (`projection.ts`): R8/R9 thành `dataAnomalyViolations` với mã `R4G_DATE_BEFORE_R4GOLIVE` (8) và
`MISSING_R4G_DATE` (9) — hai mã này chỉ bổ sung vào kiểu `EpicAnomalyCode`; `evaluateEpicDataAnomaly` không sinh ra, nên
bảng `epic_data_anomaly_violations` (chỉ ghi kết quả logic cũ) không đổi, không cần migration.

**Đối chiếu:** nhãn mới `D10_DATA_QUALITY_RULES` cho các lệch có chủ đích ở trên (rule R1 tại DESIGN, R5 tại DESIGN, R8, R9
và cờ "Sai lệch dữ liệu" kéo theo); các lệch Đạt/Fail kéo theo vẫn mang nhãn `D8_ANOMALY_CHECKED_FIRST`.
