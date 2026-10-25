# Design Specification: Rule object & Rule Group trong Epic Scoring Service

- **Date:** 2026-10-25
- **Status:** v1 — các quyết định ở §2 đã chốt với chủ sở hữu (2026-10-25). **Chưa triển khai.**
- **Nền tảng:** `docs/superpowers/specs/2026-09-29-scoring-service-design.md` (Scoring Service, mô hình Axis → Finding Group → Badge)
- **Liên quan:** `docs/ttm-dashboard-2-spec.md` (phễu L01…L05), `src/lib/scoring/*`, `src/lib/epic-row-verdicts.ts`, `src/lib/ttm-funnel-summary.ts`, `src/lib/ttm-cntt-qa.ts`

---

## 1. Bối cảnh & mục tiêu

Rule đánh giá Epic thực tế có hiệu lực theo **thời kỳ**, không áp chung cho mọi Epic của ứng dụng. Ví dụ: Epic có Start Date sau
01/09/2026 cần cách đánh giá Đạt/Fail TTM-CNTT khác với Epic bắt đầu trước đó. Hiện tại chỉ có hai công cụ rời rạc:

- bật/tắt từng badge toàn cục (`scoring_rule_settings`, chưa có giao diện);
- "Phạm vi rule Sai lệch dữ liệu" (`scoring_parameters['anomaly.scopeConfig']`, panel trong Cấu hình cảnh báo), chỉ cho các rule Chất lượng dữ liệu,
  chỉ có mốc "sau ngày".

Mục tiêu:

1. Mỗi rule là một **Rule object** độc lập trong Scoring Service (logic hard-code, không có rule editor trên giao diện), có tên, tóm tắt và mô tả chi tiết.
2. **Rule Group** = một phạm vi Epic theo các mốc ngày + một bộ Rule object được chọn. Các group có thứ tự ưu tiên; Epic thuộc group ưu tiên cao nhất
   mà nó khớp; Epic không khớp group nào thuộc group **Default**.
3. Nhiều **biến thể** của cùng một loại đánh giá (ví dụ TTM-CNTT 2026 và TTM-CNTT 2027) cùng tồn tại; mỗi group chọn biến thể của mình.
4. Màn hình **Rule Management** (SUPERADMIN) để quản lý group.
5. Dashboard, chỉ số, bộ lọc, MCP **không phải biết** biến thể nào đã chấm — chúng tiếp tục đọc badge.

---

## 2. Quyết định đã chốt (2026-10-25)

| # | Quyết định |
|---|---|
| D1 | Tách **Rule object** (cách chấm, có phiên bản) khỏi **Badge** (kết luận, từ vựng chung). Các biến thể cùng loại phát ra **cùng badge** (ví dụ `CNTT_PASS` / `CNTT_FAIL`). |
| D2 | Epic khớp nhiều group: **group ưu tiên cao nhất nhận Epic**, mỗi Epic thuộc đúng 1 group. Không khớp group nào → Default. |
| D3 | Điều kiện ngày của một group nối bằng **AND**; From/To **tính cả hai đầu** (≥ From, ≤ To); ô bỏ trống = không giới hạn phía đó. |
| D4 | Epic **thiếu** ngày mà group có điều kiện trên ngày đó → **không khớp** group (rơi xuống group sau / Default). |
| D5 | Mỗi group chọn **tối đa 1 rule cho mỗi slot kết luận** (TTM-CNTT, TTM-E2E). Được phép không chọn; màn hình cảnh báo hậu quả. |
| D6 | Epic thuộc group **không có rule TTM-CNTT** → mang ghi nhận "Không áp dụng rule TTM-CNTT", **bị loại ở L02** của phễu (cạnh Cancelled và Epic ngoại lệ), không vào TTM-CNTT (QLDA) lẫn (QA). Không có rule TTM-E2E → không vào mẫu số TTM-E2E. |
| D7 | "Cảnh báo muộn" TTM-CNTT là **rule object riêng**; "Sai Status" đi kèm rule Đạt/Fail tương ứng. |
| D8 | Cấu hình áp dụng cho **mọi ngày dữ liệu**, kể cả lớp dữ liệu quá khứ (như mọi cấu hình hiện nay). Mỗi lần lưu được **ghi lịch sử** (ai, khi nào, cấu hình trước/sau). |
| D9 | Màn hình là **trang riêng** `/admin/rule-management` trong nhóm menu "SuperAdmin: Quản trị hệ thống", có **mục riêng trong Ma trận phân quyền**. Mỗi group hiện **số Epic đang khớp**. |
| D10 | Màn hình Epic hiện **"Nhóm rule"** của từng Epic (tooltip + bộ lọc). Popup "Logic cảnh báo" hiển thị theo Rule / Rule Group. |
| D11 | Id rule theo quy ước `<nhóm>-<tên>-<tháng-năm hiệu lực>` (ví dụ `ttm-cntt-sep-2026`). Id không bao giờ đổi; tên hiển thị sửa được trong code. |
| D12 | TTM Dashboard 2: thêm chiều **"Nhóm rule"** (ma trận phân bổ + biểu đồ tròn) và bộ lọc "Nhóm rule". |
| D13 | **TTM-CNTT (QA) đi theo rule TTM-CNTT** của group (không có slot QA riêng). |
| D14 | Group **Default**: bắt buộc tồn tại, không xoá, không đổi tên, không tắt, không có điều kiện ngày, luôn ưu tiên thấp nhất; SUPERADMIN sửa được danh sách rule. |
| D15 | "Phạm vi dữ liệu cho TTM" (R4G A/B → `SCOPE_CNTT_OUT` / `SCOPE_QA_OUT`) **giữ nguyên, tách biệt** với Rule Group: nó quyết định Epic có được *đếm* vào chỉ số không, còn Rule Group quyết định Epic được *chấm* bằng rule nào. |
| D16 | Từ chối import (`src/lib/import-admission-rules.ts`) **không** thuộc Rule Group (quyết định 2026-10-14 giữ nguyên). |

---

## 3. Khái niệm

| Khái niệm | Định nghĩa | Nơi khai báo |
|---|---|---|
| **Badge** | Một kết luận cụ thể (Đạt TTM-CNTT, Thiếu Start Date…), thuộc 1 Axis và 1 Finding Group (ALERT / PASS / FAIL / RECOMMENDATION / NOTE). Là "từ vựng" mà màn hình, SQL, chỉ số, MCP đọc. | `scoring/catalog.ts` (giữ nguyên vai trò) |
| **Rule object** | Một đơn vị logic chọn được, phát ra một tập badge. Có id, tên, tóm tắt, mô tả chi tiết, slot (nếu là rule kết luận), phụ thuộc. | `scoring/rules/*` + `scoring/rule-registry.ts` (mới) |
| **Slot** | Vị trí kết luận chỉ được có 1 rule trong mỗi group: `TTM_CNTT_VERDICT`, `TTM_E2E_VERDICT`. | `scoring/rule-types.ts` |
| **Rule lõi** | Logic luôn chạy, không chọn được (tắt đi sẽ để lọt kết luận không đáng tin, hoặc là dữ kiện chứ không phải đánh giá). | `scoring/rule-registry.ts` (`CORE_RULES`) |
| **Rule Group** | Phạm vi Epic theo mốc ngày + danh sách rule id được chọn + thứ tự ưu tiên + công tắc bật/tắt. | DB (`scoring_rule_groups`, §9) |
| **Default** | Group bắt buộc, ưu tiên thấp nhất, không điều kiện ngày, nhận mọi Epic không khớp group nào. | DB, cờ `is_default` |

Phân tầng mới của popup "Logic cảnh báo": **Axis → Rule object → Badge** (Finding Group vẫn là thuộc tính của badge).

---

## 4. Mô hình Rule object

### 4.1. Interface

```ts
// src/lib/scoring/rules/rule-types.ts
export type RuleSlot = 'TTM_CNTT_VERDICT' | 'TTM_E2E_VERDICT';
export type RuleCategory = 'DATA_QUALITY' | 'TTM_CNTT' | 'TTM_E2E' | 'RELEASE' | 'PHASE' | 'FAIL_REASON';

export interface ScoringRule {
  /** Khoá lưu DB — không bao giờ đổi (D11). */
  readonly id: string;
  readonly name: string;          // hiện trong danh sách chọn, ví dụ "TTM-CNTT (QLDA) — chuẩn 09/2026"
  readonly summary: string;       // 1 câu, hiện cạnh tên
  readonly detail: {              // nội dung popup (?)
    logic: string;                // công thức / cách tính
    conditions: string;           // điều kiện áp dụng, miễn trừ theo status
    parameters?: string[];        // tham số dùng, ví dụ 'release.graceWorkingDays'
    history?: string[];           // lịch sử thay đổi logic, ví dụ '14/10/2026: chỉ xét Epic đã có R4G Date'
  };
  readonly category: RuleCategory;
  readonly slot?: RuleSlot;
  /** Mọi badge rule này có thể phát ra — dùng cho popup, kiểm tra trùng và test hợp đồng. */
  readonly emits: readonly BadgeId[];
  /** Slot cần có trong cùng group để rule có tác dụng (chỉ cảnh báo trên màn hình, không chặn lưu). */
  readonly requires?: readonly RuleSlot[];
  /** Có trong Default khi seed lần đầu (= defaultEnabled của badge hôm nay). */
  readonly defaultSelected: boolean;
  /** 'deprecated': vẫn chạy ở group đã chọn, nhưng không chọn mới được. */
  readonly lifecycle: 'active' | 'deprecated';
  /** Pha 1 (DATA_QUALITY) hoặc pha 2 (các category khác): đọc facts / derived. */
  evaluate?(input: RuleInput): Finding[];
  /** Pha 3: đọc các finding chính đã resolve (khuyến nghị đi kèm). */
  recommend?(input: RuleInput, active: ReadonlySet<BadgeId>, findings: readonly Finding[]): Finding[];
}
```

Một Rule object có thể có cả `evaluate` và `recommend`: ví dụ R1 phát `ANOMALY_R1_MISSING_START_DATE` ở pha 1 và `REC_FILL_START_DATE` ở pha 3.
Hàm `recommendationsRule` hiện tại được chia nhỏ vào từng Rule object sở hữu khuyến nghị đó.

### 4.2. Registry

```ts
// src/lib/scoring/rule-registry.ts
export const CORE_RULES: readonly CoreRule[];         // luôn chạy (§5.2)
export const SCORING_RULES: readonly ScoringRule[];   // chọn được (§5.1)
export const RULE_BY_ID: ReadonlyMap<string, ScoringRule>;
```

Ràng buộc kiểm bằng test:
- id duy nhất, đúng quy ước D11;
- mỗi badge **không phải lõi** có ít nhất 1 Rule object phát ra; badge lõi không thuộc Rule object nào;
- hai rule **khác slot** không phát cùng một badge; các rule **cùng slot** phải phát cùng bộ badge kết luận của slot đó (§4.3).

`SCORING_CODE_VERSION` tăng mỗi khi thêm / sửa / bỏ Rule object (giữ quy tắc hiện có).

### 4.3. Hợp đồng của slot kết luận (bắt buộc với mọi biến thể)

Phễu và chỉ số đọc badge, nên mọi biến thể trong một slot phải giữ đúng nghĩa:

| Slot | Badge | Nghĩa bắt buộc |
|---|---|---|
| `TTM_CNTT_VERDICT` | `CNTT_PASS` | Kết luận cuối: Đạt. Chỉ khi R4G Date đã có và đã tới (≤ asOf). |
| | `CNTT_FAIL` | Kết luận cuối: Fail, **gồm cả** "chưa có R4G Date mà đã quá Target" (phễu tách L05ab / L05ba theo việc có R4G Date hay không). |
| | `CNTT_STATUS_MISMATCH` | Khuyến nghị đi kèm Đạt. |
| `TTM_E2E_VERDICT` | `E2E_PASS` / `E2E_FAIL` | Như trên, cho TTM-E2E. |
| | `E2E_STATUS_MISMATCH` | Khuyến nghị đi kèm Đạt. |

Biến thể chỉ được thay **cách tính** (ngân sách, mốc bắt đầu, điều kiện đạt…), không đổi nghĩa badge. Muốn đổi nghĩa thì phải sửa định nghĩa
phễu (`ttm-funnel-summary.ts`, `docs/ttm-dashboard-2-spec.md`) trong cùng thay đổi.

**Cổng Sai lệch dữ liệu do engine áp dụng.** Hôm nay `ttm-cntt.ts` / `ttm-e2e.ts` tự dừng khi `hasDataAnomaly`. Trong mô hình mới, engine
**bỏ mọi finding của rule slot** (pha 2 và pha 3) khi Epic có Sai lệch dữ liệu, nên biến thể mới không thể quên quy tắc này.
Các rule slot vẫn nhận `hasDataAnomaly` trong `RuleInput` nhưng không phải tự kiểm tra.

---

## 5. Danh mục Rule object ban đầu

Id dưới đây là đề xuất theo D11; tháng-năm = lần cuối logic của rule đổi (theo `catalog.ts`). Mọi rule `defaultSelected = true` trừ
`release-on-time-sep-2026` (badge hôm nay mặc định tắt). Khi seed Default bằng các rule `defaultSelected`, kết quả chấm **trùng khớp hoàn toàn** hôm nay.

### 5.1. Rule chọn được

| Id | Tên hiển thị | Category / slot | Badge phát ra | Phụ thuộc |
|---|---|---|---|---|
| `ttm-cntt-sep-2026` | TTM-CNTT (QLDA) — chuẩn 09/2026 | TTM_CNTT / `TTM_CNTT_VERDICT` | `CNTT_PASS`, `CNTT_FAIL`, `CNTT_STATUS_MISMATCH` | — |
| `ttm-cntt-late-sep-2026` | Cảnh báo muộn TTM-CNTT | TTM_CNTT | `CNTT_LATE` | `TTM_CNTT_VERDICT` |
| `ttm-e2e-july-2026` | TTM-E2E — chuẩn 07/2026 | TTM_E2E / `TTM_E2E_VERDICT` | `E2E_PASS`, `E2E_FAIL`, `E2E_STATUS_MISMATCH` | — |
| `e2e-fill-t0-sep-2026` | Bổ sung T0 (Idea Approved Date) | TTM_E2E | `REC_FILL_IDEA_APPROVED_DATE` | — |
| `dq-r1-oct-2026` | R1 — Thiếu Start Date | DATA_QUALITY | `ANOMALY_R1_MISSING_START_DATE`, `REC_FILL_START_DATE` | — |
| `dq-r2-sep-2026` | R2 — Pending lâu | DATA_QUALITY | `ANOMALY_R2_PENDING_TOO_LONG` | — |
| `dq-r3-sep-2026` | R3 — Sai thứ tự ngày | DATA_QUALITY | `ANOMALY_R3_DATE_OUT_OF_SEQUENCE`, `REC_FIX_DATE_ORDER` | — |
| `dq-r4-sep-2026` | R4 — Thiếu Phân loại yêu cầu | DATA_QUALITY | `ANOMALY_R4_MISSING_REQUEST_TYPE`, `REC_FILL_REQUEST_TYPE` | — |
| `dq-r5-oct-2026` | R5 — Thiếu Requirement Level | DATA_QUALITY | `ANOMALY_R5_MISSING_REQUIREMENT_LEVEL`, `REC_FILL_REQUIREMENT_LEVEL` | — |
| `dq-r6-sep-2026` | R6 — SP nhưng Level thấp | DATA_QUALITY | `ANOMALY_R6_SP_LEVEL_MISMATCH`, `REC_REVIEW_SP_LEVEL` | — |
| `dq-r8-oct-2026` | R8 — Có R4G Date nhưng chưa R4GOLIVE | DATA_QUALITY | `ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE`, `REC_FIX_R4G_STATUS` | — |
| `dq-r9-oct-2026` | R9 — Thiếu R4G Date | DATA_QUALITY | `ANOMALY_R9_MISSING_R4G_DATE`, `REC_FILL_R4G_DATE` | — |
| `dq-r10-oct-2026` | R10 — R4G Date ở tương lai | DATA_QUALITY | `ANOMALY_R10_R4G_DATE_IN_FUTURE`, `REC_CLEAR_FUTURE_R4G_DATE` | — |
| `fail-reason-stage-oct-2026` | Thiếu lý do Fail TTM (khâu fail) | FAIL_REASON | `REC_MISSING_FAIL_REASON` | `TTM_CNTT_VERDICT` |
| `fail-reason-dept-oct-2026` | Thiếu phòng chịu TN chính | FAIL_REASON | `REC_MISSING_RESPONSIBLE_DEPARTMENT` | `TTM_CNTT_VERDICT` |
| `release-justify-golive-sep-2026` | Giải trình Golive | RELEASE | `RELEASE_JUSTIFY_GOLIVE`, `REC_PREPARE_GOLIVE_JUSTIFICATION` | — |
| `release-waiting-golive-oct-2026` | Chờ golive | RELEASE | `RELEASE_WAITING_GOLIVE` | — |
| `release-status-mismatch-sep-2026` | Sai Status (Release) | RELEASE | `RELEASE_STATUS_MISMATCH` | — |
| `release-on-time-sep-2026` | Release đúng hạn | RELEASE | `RELEASE_ON_TIME` | — |
| `phase-late-sep-2026` | Trễ pha | PHASE | `PHASE_LATE`, `REC_ACCELERATE_PHASE` | — |

Ghi chú:
- `REC_FILL_START_DATE` hôm nay cũng phát khi TTM-CNTT "Không tính được" vì thiếu T1; nhánh đó thuộc `dq-r1-oct-2026`. Tương tự,
  `REC_FIX_DATE_ORDER` khi "Không tính được" vì R4G phi logic thuộc `dq-r3-sep-2026`. Group không chọn R1 / R3 thì không có các khuyến nghị này.
- "Pending lâu" (R2) là khuyến nghị, không phải Sai lệch dữ liệu (giữ như hôm nay), nhưng vẫn xếp ở category DATA_QUALITY như trên popup.
- Rule thuộc "Nhóm Chất lượng dữ liệu" vẫn được miễn theo status như hôm nay (`anomaly.exemptStatuses`, Cancelled) — miễn trừ là một phần logic của rule.

### 5.2. Rule lõi (luôn chạy, không xuất hiện trong danh sách chọn)

| Logic | Badge | Lý do là lõi |
|---|---|---|
| Không tính được / Không áp dụng TTM-CNTT | `CNTT_CALC_BROKEN`, `CNTT_NOT_APPLICABLE` | Cổng: tắt sẽ để lọt kết luận không đáng tin (đã là `core` hôm nay) |
| Không tính được TTM-E2E, Baseline từ ngày tạo Jira | `E2E_CALC_BROKEN`, `E2E_BASELINE_FROM_JIRA_CREATED` | Cổng / dữ kiện tính toán |
| Phạm vi, Epic ngoại lệ | `SCOPE_TTM_BLACK_LISTED`, `SCOPE_PROJECT_NON_TTM`, `SCOPE_CNTT_OUT`, `SCOPE_QA_OUT` | Quyết định Epic có được đếm (D15) |
| Pha: không tính được, thiếu dữ liệu, pha hiện tại, hoàn thành pha | `PHASE_NOT_COMPUTABLE`, `PHASE_COMPLETION_UNAVAILABLE`, `PHASE_CURRENT`, `PHASE_DONE` | Dữ kiện, không phải đánh giá |
| **Mới:** Không áp dụng rule TTM-CNTT | `CNTT_NO_RULE` (axis TTM_CNTT, NOTE, core) | Group không chọn rule `TTM_CNTT_VERDICT` (D6) |
| **Mới:** Không áp dụng rule TTM-E2E | `E2E_NO_RULE` (axis TTM_E2E, NOTE, core) | Group không chọn rule `TTM_E2E_VERDICT` (D6) |

`CNTT_NO_RULE` / `E2E_NO_RULE` không phát cho Cancelled (đã có "Không áp dụng") và Epic ngoại lệ (không được xét).
Thêm vào `SUPPRESSIONS`: `CNTT_NO_RULE` che `CNTT_LATE`, `REC_MISSING_FAIL_REASON`, `REC_MISSING_RESPONSIBLE_DEPARTMENT` (phòng hờ — các rule
này vốn không tự phát khi không có verdict).

### 5.3. Vòng đời rule

- **Thêm rule mới** (ví dụ `ttm-cntt-jan-2027`): viết Rule object + test, đăng ký vào registry, tăng `SCORING_CODE_VERSION`. Rule mới **không**
  tự vào group nào; SUPERADMIN chọn trên màn hình.
- **Ngừng dùng:** đặt `lifecycle: 'deprecated'` — vẫn chạy ở group đã chọn, không chọn mới được, màn hình gắn nhãn "Ngừng dùng".
- **Gỡ hẳn:** chỉ khi không group nào còn chọn (kiểm tra trên cả local và Supabase). Rule id trong DB mà code không còn → bị bỏ qua khi chấm,
  màn hình Rule Management hiện cảnh báo "Rule không còn tồn tại" và gỡ khỏi group khi lưu lần sau.

---

## 6. Rule Group

### 6.1. Thuộc tính

| Thuộc tính | Ghi chú |
|---|---|
| Tên | Duy nhất (không phân biệt hoa thường). "Default" là tên dành riêng. |
| Thứ tự ưu tiên | 1 = cao nhất. Default luôn đứng cuối, không đổi được. |
| Bật / tắt (master toggle) | Group tắt bị bỏ qua khi xác định group của Epic. Default không tắt được. |
| Điều kiện ngày | 5 cặp From/To: **Ngày tạo** (`jiraCreatedAt`), **Ngày phê duyệt ý tưởng** (`ideaApprovedDate`), **Start Date**, **R4G Date**, **Due Date**. Mỗi ô là ô chọn lịch, được bỏ trống. Default không có điều kiện ngày. |
| Rule được chọn | Multi-select từ `SCORING_RULES` (§5.1). |

### 6.2. Quy tắc khớp

```
groupOf(epic, asOf):
  for group in enabledGroups (không gồm Default) sorted by priority:
    if every condition(group) holds for epic.facts at asOf: return group
  return Default

condition(field, from, to):
  from và to cùng trống → luôn đúng
  ngày của Epic trống → SAI                       (D4)
  (from trống hoặc ngày ≥ from) VÀ (to trống hoặc ngày ≤ to)   (D3)
```

- Ngày của Epic lấy từ `EpicFacts` **tại asOf** (cùng lớp dữ liệu đang xem). Sửa ngày trên Jira có thể chuyển Epic sang group khác ở lần import sau — đây là hành vi đúng.
- Epic ngoại lệ (`ttmExclusion`) vẫn không được xét, không xác định group (`ruleGroup = null`).
- Cancelled vẫn được xác định group như thường (các rule tự miễn Cancelled như hôm nay).

### 6.3. Kiểm tra khi lưu

| Trường hợp | Xử lý |
|---|---|
| Hai rule cùng slot trong một group | **Chặn lưu** |
| From > To ở một cặp ngày | **Chặn lưu** |
| Tên trùng / tên "Default" cho group khác | **Chặn lưu** |
| Chọn rule `deprecated` mới | **Chặn** (rule đã chọn từ trước được giữ) |
| Group không chọn rule `TTM_CNTT_VERDICT` | Cảnh báo: "Epic của nhóm sẽ bị loại ở L02, không tính TTM-CNTT (QLDA) và (QA)" |
| Group không chọn rule `TTM_E2E_VERDICT` | Cảnh báo: "Epic của nhóm không tính vào TTM-E2E" |
| Rule có `requires` chưa thỏa | Cảnh báo: "Rule X cần một rule TTM-CNTT trong cùng nhóm để có tác dụng" |
| Group (không phải Default) không có điều kiện ngày nào | Cảnh báo: "Nhóm này nhận mọi Epic — các nhóm ưu tiên thấp hơn và Default sẽ không còn Epic nào" |
| Group đang bật nhưng hiện khớp 0 Epic | Thông tin (không chặn) |

---

## 7. Luồng chấm điểm mới

```ts
export function scoreEpic(facts: EpicFacts, ctx: ScoringContext): EpicScorecard {
  const derived = deriveMetrics(facts, ctx);
  if (facts.ttmExclusion) { /* như hôm nay: chỉ rule lõi SCOPE, ruleGroup = null */ }

  const group = resolveRuleGroup(facts, ctx.ruleGroups);            // §6.2
  const rules = group.ruleIds.map((id) => RULE_BY_ID.get(id)).filter(Boolean);

  // Pha 1 — rule lõi pha 1 + rule DATA_QUALITY được chọn → hasDataAnomaly
  // Pha 2 — rule lõi + rule category khác; bỏ finding của rule slot nếu hasDataAnomaly (§4.3);
  //         phát CNTT_NO_RULE / E2E_NO_RULE nếu group thiếu slot
  // resolveSuppressions (giữ nguyên)
  // Pha 3 — recommend() của các rule được chọn (cùng cổng hasDataAnomaly cho rule slot)
  return { ..., ruleGroup: { id: group.id, name: group.name, isDefault: group.isDefault }, findings, indexMembership, derived };
}
```

- `ctx.ruleEnabled` (bật/tắt từng badge) bị **bỏ** — việc chọn rule trong group thay thế nó.
- `isEpicInAnomalyScope` / `anomaly.scopeConfig` bị **bỏ** — điều kiện ngày của group thay thế nó.
- `EpicScorecard` thêm `ruleGroup: { id: number; name: string; isDefault: boolean } | null`.
- `ScoringContext` thêm `ruleGroups: readonly ResolvedRuleGroup[]` (đã sắp theo ưu tiên, Default ở cuối). Khi không có cấu hình trong DB
  (môi trường mới chưa migrate), context dùng **Default dựng trong code** = mọi rule `defaultSelected` để app không hỏng.
- Lõi vẫn thuần (không `@/lib/db`, không đồng hồ hệ thống) — group được nạp sẵn vào context.

### 7.1. `indexMembership`

```
hasCnttRule = group có rule TTM_CNTT_VERDICT
ttm.counted = !outsideL02 && !SCOPE_CNTT_OUT && hasCnttRule          (thêm hasCnttRule — D6)
qa.counted  = !outsideL02 && qaStatus && !SCOPE_QA_OUT && hasCnttRule (D13)
```

`eligible` / `pass` / `fail` giữ công thức hiện tại. TTM-E2E không có cờ riêng (vẫn đếm từ badge `E2E_PASS` / `E2E_FAIL`), nên Epic không có
rule TTM-E2E tự nằm ngoài mẫu số.

### 7.2. `rulesetVersion`

Dấu vân tay trong `loadScoringContext` thêm cấu hình group (id, tên, ưu tiên, bật/tắt, điều kiện ngày, rule id đã sắp xếp). Mọi lần lưu
cấu hình đổi `rulesetVersion`, nên cache cũ được nhận ra là lỗi thời.

---

## 8. Chỉ số & TTM Dashboard 2

### 8.1. Công thức (không đổi)

| Chỉ số | Công thức | Nguồn kết luận |
|---|---|---|
| TTM-CNTT (QLDA) | L05aa / (L05aa + L05ab + L05ba) trong "Phạm vi dữ liệu cho TTM" | `CNTT_PASS` / `CNTT_FAIL` do rule `TTM_CNTT_VERDICT` của group phát |
| TTM-CNTT (QA) | Như trên, chỉ Epic MVP Done / Released và trong phạm vi QA | Cùng rule TTM-CNTT của group (D13) |
| TTM-E2E | Đạt TTM-E2E / (Đạt + Fail TTM-E2E) | `E2E_PASS` / `E2E_FAIL` do rule `TTM_E2E_VERDICT` của group phát |

Hệ quả cần ghi rõ trong Tài liệu sản phẩm:
- Chỉ số toàn công ty là **con số pha trộn** của nhiều bộ rule.
- "Sai lệch dữ liệu" (L03) phụ thuộc rule Chất lượng dữ liệu mà group chọn.
- Số liệu có thể đổi khi Epic chuyển group (sửa ngày trên Jira) hoặc khi cấu hình đổi (áp dụng lại cho cả quá khứ — D8).

### 8.2. Phễu — tầng mới ở L02

```
OUT_OF_SCOPE → CANCELLED → BLACK_LISTED → PROJECT_NON_TTM → NO_CNTT_RULE (mới) → DATA_ANOMALY → L04a / L04b …
```

- `TtmFunnelBucket` thêm `NO_CNTT_RULE`; `ttmFunnelBucket()` xếp Epic có badge `CNTT_NO_RULE` vào đây, sau Epic ngoại lệ, trước DATA_ANOMALY.
- L02 = L01 − Cancelled − Epic ngoại lệ − dự án Time to Market = N − **Epic không áp dụng rule TTM-CNTT**. Cập nhật `TTM_FUNNEL_CRITERIA.L02`,
  popup L02 (thêm dòng mới với link danh sách), `docs/ttm-dashboard-2-spec.md`.
- Bộ lọc "Nhận xét" mới `TTM_NO_CNTT_RULE` ("Không áp dụng rule TTM-CNTT (loại khỏi L02)") + bản SQL tương ứng trong
  `epic-alert-row-cache-query-service.ts`, để con số phễu và danh sách mở ra luôn khớp.
- `filter TTM_COUNTED_IN_SCOPE` (L02) và `isOutsideTtmCalculation` thêm điều kiện không có `CNTT_NO_RULE`.
- `TtmBreakdownItem.total` (= L02) tự loại nhóm này.

### 8.3. Chiều "Nhóm rule" (D12)

- `TTM_BREAKDOWN_DIMENSIONS` thêm `ruleGroup`: ma trận phân bổ và biểu đồ tròn có thêm lựa chọn "Nhóm rule" — mỗi dòng là một group với
  L02, Đạt, Fail, % TTM-CNTT (QLDA), (QA), TTM-E2E.
- `TtmDashboard2Filters` thêm `ruleGroups: string[]`; thanh công cụ có bộ lọc "Nhóm rule"; danh sách lựa chọn lấy từ các group có Epic trong phạm vi người xem.
- `TTM_FUNNEL_ROW_KEYS` thêm `ruleGroupName`; cache `ttm_dashboard_2_cache` lưu thêm danh sách lựa chọn.
- Tooltip ở 3 vòng %: "Tính theo n nhóm rule: Sep-2026 (300 Epic), Default (900 Epic)".

---

## 9. Dữ liệu (DB)

### 9.1. Bảng mới

```sql
CREATE TABLE scoring_rule_groups (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  priority           INTEGER NOT NULL,            -- 1 = cao nhất; Default luôn được sắp cuối khi nạp
  is_default         BOOLEAN NOT NULL DEFAULT FALSE,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_from DATE, created_to DATE,
  idea_approved_from DATE, idea_approved_to DATE,
  start_from DATE, start_to DATE,
  r4g_from DATE, r4g_to DATE,
  due_from DATE, due_to DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (created_from IS NULL OR created_to IS NULL OR created_from <= created_to),
  -- … cùng CHECK cho 4 cặp còn lại
  CHECK (NOT is_default OR (enabled AND created_from IS NULL AND created_to IS NULL AND idea_approved_from IS NULL
         AND idea_approved_to IS NULL AND start_from IS NULL AND start_to IS NULL AND r4g_from IS NULL AND r4g_to IS NULL
         AND due_from IS NULL AND due_to IS NULL))
);
CREATE UNIQUE INDEX scoring_rule_groups_name_uq ON scoring_rule_groups (lower(name));
CREATE UNIQUE INDEX scoring_rule_groups_single_default ON scoring_rule_groups (is_default) WHERE is_default;

CREATE TABLE scoring_rule_group_rules (
  group_id INTEGER NOT NULL REFERENCES scoring_rule_groups(id) ON DELETE CASCADE,
  rule_id  TEXT NOT NULL,                          -- id Rule object trong code (không FK)
  PRIMARY KEY (group_id, rule_id)
);

CREATE TABLE scoring_rule_group_history (
  id                SERIAL PRIMARY KEY,
  saved_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  config_before     JSONB NOT NULL,                -- toàn bộ cấu hình trước khi lưu
  config_after      JSONB NOT NULL,
  rule_code_version TEXT NOT NULL                  -- SCORING_CODE_VERSION lúc lưu
);
```

Migration seed: 1 dòng Default (`is_default = true`, `priority = 0` — chỉ để thỏa NOT NULL, khi nạp luôn xếp cuối) + mọi rule `defaultSelected`.
Thêm 3 bảng vào `scripts/db-schema-catalog.json` (nhóm Scoring Service) và vào danh sách sao lưu của `db-backup-service.ts`.

### 9.2. Cache

`epic_alert_row_cache` thêm `rule_group_id INTEGER NULL`, `rule_group_name TEXT NULL` (+ index `rule_group_id`) để lọc/phân trang bằng SQL.
`EpicAlertRowPhased` thêm `ruleGroupId`, `ruleGroupName` (projection ghi từ scorecard).

### 9.3. Gỡ cấu hình cũ (theo quy trình gỡ bảng: code trước, DỪNG trước DROP, chủ sở hữu deploy, rồi mới migrate)

| Gỡ | Hiện trạng (Supabase, 25/10/2026) |
|---|---|
| Bảng `scoring_rule_settings`, `ScoringContext.ruleEnabled`, `BadgeDefinition.defaultEnabled` (thay bằng `ScoringRule.defaultSelected`) | Bảng trống — không cần chuyển dữ liệu |
| `scoring_parameters['anomaly.scopeConfig']`, `AnomalyScopeConfigPanel.tsx`, `/api/anomaly-scope-config`, `anomaly-scope-config-service.ts`, `isEpicInAnomalyScope` | Không có dòng nào — không cần chuyển dữ liệu |

Trước khi migrate từng DB, kiểm tra lại hai chỗ trên còn trống. Nếu không trống, dừng và báo chủ sở hữu (cần dựng group tương ứng bằng tay).

---

## 10. Màn hình Rule Management

### 10.1. Truy cập

- Route `/admin/rule-management`; menu "SuperAdmin: Quản trị hệ thống" → "Rule Management" (icon Phosphor `ListChecks`), `roles: SUPERADMIN_ONLY`.
- featureKey mới `rule_management` trong `PAGE_FEATURES` / `API_FEATURES` (`src/lib/feature-access.ts`) và trong danh mục của Ma trận phân quyền.
- API: `GET/PUT /api/rule-groups` (SUPERADMIN), `POST /api/rule-groups/preview` (SUPERADMIN), `GET /api/rule-groups/summary` (mọi người dùng đã đăng nhập, chỉ đọc — cho popup "Logic cảnh báo").

### 10.2. Bố cục

```
┌ Rule Management ─────────────────────────────── [Lịch sử thay đổi] [Hoàn tác] [Lưu] ┐
│ + Thêm nhóm                                                                         │
│ ┌ #1  Sep-2026            [●Bật]  khớp 312 Epic        [↑][↓] [Xoá]  ▾ ┐            │
│ │ Tên: [Sep-2026          ]                                           │            │
│ │ Điều kiện ngày (AND, tính cả hai đầu):                               │            │
│ │   Ngày tạo            Từ [        📅] Đến [        📅]               │            │
│ │   Ngày phê duyệt ý tưởng  Từ [ … ]  Đến [ … ]                        │            │
│ │   Start Date          Từ [01/09/2026] Đến [        ]                 │            │
│ │   R4G Date / Due Date …                                             │            │
│ │ Rule áp dụng (đã chọn 14/20):                                        │            │
│ │   ▸ TTM-CNTT (QLDA)  ◉ ttm-cntt-sep-2026  ○ (không áp dụng)  (?)     │            │
│ │   ▸ TTM-E2E          ◉ ttm-e2e-july-2026  ○ (không áp dụng)  (?)     │            │
│ │   ▸ Chất lượng dữ liệu  ☑ R1 Thiếu Start Date — tóm tắt…  (?)        │            │
│ │   ▸ Release / Pha / Lý do Fail …                                     │            │
│ │ ⚠ cảnh báo (§6.3)                                                    │            │
│ └─────────────────────────────────────────────────────────────────────┘            │
│ ┌ Default (ưu tiên thấp nhất · luôn bật)   khớp 1.138 Epic            ▾ ┐            │
│ │ Nhận mọi Epic không khớp nhóm nào ở trên. Chỉ chỉnh được danh sách rule. │            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- Rule có slot hiện dạng **chọn một** (radio, kèm lựa chọn "Không áp dụng"); rule khác hiện dạng checkbox, gom theo category.
- Mỗi rule: tên, tóm tắt 1 dòng, id (chữ nhỏ), nút **(?)** mở popup gồm `detail.logic`, `detail.conditions`, badge phát ra (kèm Finding Group:
  Cảnh báo / Khuyến nghị / Đạt / Fail / Ghi nhận), phụ thuộc, tham số, lịch sử thay đổi logic. Rule `deprecated` gắn nhãn "Ngừng dùng".
- **Sắp xếp ưu tiên** bằng nút lên/xuống (không cần kéo thả).
- Cấu hình được sửa trên bản nháp phía client; **Lưu** gửi toàn bộ cấu hình trong 1 giao dịch kèm `updated_at` đã đọc (khóa lạc quan:
  có người lưu trước thì báo và tải lại, không ghi đè).
- **Xem trước tác động** (trước khi Lưu, nút trong thanh trên): server chấm toàn bộ Epic tại hôm nay với cấu hình nháp và cấu hình hiện tại, trả về
  số Epic mỗi nhóm và chênh lệch Đạt / Fail của TTM-CNTT (QLDA), (QA), TTM-E2E (≈ 2 lượt chấm, dưới 1 giây với 1.450 Epic — §12).
  Số "khớp n Epic" cạnh mỗi nhóm cũng lấy từ đây (gọi lại khi điều kiện ngày đổi, có debounce).
- Lưu thành công → ghi `scoring_rule_group_history` → `scheduleDerivedCacheRefresh('rule-groups')` (như Cấu hình cảnh báo hôm nay) → thông báo
  "Đang dựng lại cache…".
- **Lịch sử thay đổi**: danh sách các lần lưu (thời gian, người lưu), xem khác biệt trước/sau theo từng nhóm.

---

## 11. Hiển thị trên các màn hình khác

| Nơi | Thay đổi |
|---|---|
| Quản trị Epic (`/epic-alerts-15`), Chuẩn hoá dữ liệu, Báo cáo | Tooltip ô "Nhận xét" / chi tiết Epic: "Chấm theo nhóm rule: Sep-2026". Bộ lọc "Nhóm rule". Báo cáo xuất thêm cột "Nhóm rule". |
| Popup "Logic cảnh báo" (`HelpPanels.tsx`) | Thêm tab "Rule" (danh mục Rule object: tên, id, tóm tắt, badge, chi tiết — từ registry) và tab "Nhóm rule" (cấu hình hiện hành từ `/api/rule-groups/summary`). Ma trận Axis × Finding Group giữ nguyên. Bỏ dòng nhắc "Phạm vi rule Sai lệch dữ liệu". |
| TTM Dashboard 2 | §8.2, §8.3 |
| Tài liệu sản phẩm (`public/docs/product-guide.html`) | Mục 9.1 thêm phần Rule object / Rule Group; mô tả L02 mới; mục hướng dẫn màn hình Rule Management. Chương 5 (schema) sinh lại bằng `db:export-schema`. |
| MCP | `get_epic_detail` trả `ruleGroup`; `list_epic_alerts` nhận tham số lọc `ruleGroup`; `get_ttm_dashboard` có breakdown theo nhóm rule. Công cụ dùng featureKey hiện có (không thêm). |

---

## 12. Hiệu năng

Đo ngày 25/10/2026 trên máy phát triển, 1.450 Epic (số Epic hiện có trên Supabase):

| Phần | Thời gian / lượt chấm toàn bộ |
|---|---|
| `scoreEpic` toàn bộ | ≈ 330 ms |
| trong đó `deriveMetrics` (tính ngày làm việc) | ≈ 280 ms (~87%) |
| các rule | ≈ 45 ms |

- Xác định group: tối đa (số group × 5 so sánh chuỗi ngày) mỗi Epic — không đáng kể. Mỗi Epic chỉ chạy rule được chọn → tổng khối lượng rule
  **bằng hoặc ít hơn** hôm nay.
- Server: thêm 1 truy vấn nhỏ (group + rule id) trong `loadScoringContext`, chạy song song với các truy vấn đang có. Chi phí lớn duy nhất là
  dựng lại cache sau mỗi lần lưu — giống mọi thay đổi cấu hình khác.
- Trình duyệt: không chạy rule. Mỗi dòng thêm `ruleGroupId` / `ruleGroupName` (vài byte); registry rule gửi cho popup vài KB.
- Ngoài phạm vi spec này: tối ưu tính ngày làm việc (bảng chỉ số ngày làm việc dựng sẵn) có thể giảm lượt chấm còn vài chục ms. Làm riêng.

---

## 13. Kiểm thử

| Loại | Nội dung |
|---|---|
| Unit — registry | id duy nhất, đúng quy ước; mỗi badge không lõi có chủ; rule cùng slot phát cùng bộ badge kết luận; không có rule nào phát badge lõi. |
| Unit — `resolveRuleGroup` | thứ tự ưu tiên; group tắt bị bỏ qua; AND; biên From/To tính cả hai đầu; Epic thiếu ngày không khớp (D4); không khớp → Default; Epic ngoại lệ → null. |
| Unit — engine | cổng Sai lệch dữ liệu bỏ finding rule slot; `CNTT_NO_RULE` / `E2E_NO_RULE`; `indexMembership` với `hasCnttRule`; rule `requires` không có slot thì không phát. |
| Hợp đồng slot | Bộ ca kiểm thử chung (fixtures) chạy cho **mọi** rule cùng slot: Đạt chỉ khi R4G ≤ asOf; Fail gồm cả trường hợp chưa có R4G mà quá Target. |
| Đối chiếu GĐ1 | Script chấm toàn bộ Epic (local + Supabase) bằng code cũ và code mới với Default = mọi rule `defaultSelected`: `badge_codes` và `index_flags` **khác nhau 0 Epic**. |
| Phễu | `ttmFunnelBucket` với `CNTT_NO_RULE`; bản SQL của bộ lọc `TTM_NO_CNTT_RULE` trả cùng số với bản JS. |
| API | Kiểm tra quyền (chỉ SUPERADMIN ghi), các ràng buộc §6.3, khóa lạc quan, ghi lịch sử. |

---

## 14. Lộ trình

Mỗi giai đoạn là một (hoặc vài) commit riêng, app luôn chạy được; cuối mỗi giai đoạn: `npm test`, cập nhật `version.json` và `daily_change_log.md`.

| GĐ | Nội dung | Xong khi |
|---|---|---|
| **GĐ1 — Tái cấu trúc bên trong** (không đổi kết quả) | `ScoringRule` + `rule-registry.ts`; tách các rule hiện có thành Rule object (§5.1) và rule lõi (§5.2); chia `recommendationsRule` vào từng rule; engine theo §7 với Default dựng trong code; cổng Sai lệch dữ liệu do engine áp dụng; badge `CNTT_NO_RULE` / `E2E_NO_RULE` (chưa bao giờ phát vì Default đủ slot); tăng `SCORING_CODE_VERSION`. | Test §13 xanh; đối chiếu 0 khác biệt trên local và Supabase. |
| **GĐ2 — Rule Group & màn hình** | Migration §9.1 (+ seed Default) áp cho **local và Supabase**; `loadScoringContext` nạp group + vân tay; cột cache §9.2; API + màn hình §10 + featureKey + lịch sử + xem trước; `db:export-schema -- --target=supabase`; gỡ **code** của `scoring_rule_settings` / `anomaly.scopeConfig` (§9.3) — **dừng trước DROP**. | SUPERADMIN tạo được group, Epic chuyển đúng nhóm, cache dựng lại sau khi lưu. |
| **GĐ2b — DROP** (sau khi chủ sở hữu deploy) | Migration DROP `scoring_rule_settings` + xoá khóa `anomaly.scopeConfig`, cả hai DB; export schema; cập nhật tài liệu. | Không còn tham chiếu trong code và schema. |
| **GĐ3 — Hiển thị & chỉ số** | Phễu `NO_CNTT_RULE` (JS + SQL) + popup L02; chiều và bộ lọc "Nhóm rule" trên TTM Dashboard 2; tooltip vòng %; bộ lọc/tooltip trên màn Epic và Báo cáo; popup "Logic cảnh báo"; Tài liệu sản phẩm; `docs/ttm-dashboard-2-spec.md`; MCP. | Con số phễu và danh sách mở ra khớp nhau theo từng nhóm rule. |

---

## 15. Rủi ro & hạn chế đã biết

| Rủi ro | Giảm thiểu |
|---|---|
| Chỉ số toàn công ty pha trộn nhiều chuẩn chấm, khó so sánh giữa các kỳ. | Chiều "Nhóm rule" + tooltip vòng % (§8.3); ghi rõ trong Tài liệu sản phẩm. |
| Sửa cấu hình làm thay đổi cả số liệu quá khứ (D8). | Xem trước tác động trước khi lưu; lịch sử thay đổi để giải thích. |
| Sửa ngày trên Jira chuyển Epic sang nhóm khác, số liệu "nhảy". | Tooltip "Chấm theo nhóm rule" trên từng Epic; bộ lọc "Nhóm rule". |
| Một nhóm không có điều kiện ngày "nuốt" mọi Epic của các nhóm sau. | Cảnh báo §6.3 + số Epic khớp mỗi nhóm. |
| Biến thể mới vô tình đổi nghĩa Đạt / Fail. | Hợp đồng slot (§4.3) + bộ test hợp đồng chạy cho mọi biến thể. |
| Rule bị gỡ khỏi code nhưng còn trong DB. | Bỏ qua khi chấm + cảnh báo trên màn hình (§5.3). |

---

## 16. Câu hỏi còn mở (nhỏ, không chặn GĐ1)

1. Các Rule object **ngoài danh sách anh nêu** (`ttm-cntt-late-sep-2026`, `e2e-fill-t0-sep-2026`, `release-status-mismatch-sep-2026`,
   `release-on-time-sep-2026`, `phase-late-sep-2026`) đã được đưa vào để mọi badge không lõi đều có chủ. Nếu anh muốn một số trong đó là lõi
   (luôn chạy), chỉ cần chuyển sang §5.2.
2. Danh sách id ở §5.1 (đặc biệt phần tháng-năm) — anh xác nhận hoặc đổi trước GĐ1, vì sau khi seed vào DB id không đổi được.
3. Tham số riêng theo rule (ví dụ grace 5 hay 3 ngày cho từng biến thể) — **chưa làm** trong v1; tham số vẫn toàn cục (`scoring_parameters`,
   Tiêu chí Time to Market). Khi cần, một biến thể mới đọc tham số riêng của nó.
