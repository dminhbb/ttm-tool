import { diffWorkingDays, toIsoDate } from '../dates';
import { isCancelledStatus, isPendingStatus, isReopenedStatus, normalizeWorkflowStatus, STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { DerivedRule, PrimaryRule, RuleDetail, RuleSlot, ScoringRule } from './rule-types';
import type { BadgeId } from '../catalog';
import type { EpicFacts, ScoringContext } from '../types';

/** Cancelled + the configurable list (default To Do / In PO / Backlog) skip the data-quality rules —
 * except R8 / R10, which only Cancelled skips. */
export function isExemptFromDataQuality(status: string, ctx: ScoringContext): boolean {
  if (isCancelledStatus(status)) return true;
  const normalized = normalizeWorkflowStatus(status);
  return ctx.parameters['anomaly.exemptStatuses'].some((exempt) => normalizeWorkflowStatus(exempt) === normalized);
}

function isBlank(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLocaleLowerCase('en-US');
  return normalized === '' || normalized === 'none';
}

/** Previous statuses (compared workflow-normalized, case-insensitive) of a Pending Epic that never got
 * past planning: neither the Start Date (R1) nor the Requirement Level (R5) is expected yet. */
const PENDING_EXEMPT_PREVIOUS_STATUSES = new Set(['TO DO', 'IN PO']);

/** R5 only (owner rule 2026-10-14): the Requirement Level is still being settled during Design, so a
 * Pending Epic that was in Design before is exempt from R5 too — R1 keeps the To Do / In PO set. */
const PENDING_EXEMPT_PREVIOUS_STATUSES_R5 = new Set([...PENDING_EXEMPT_PREVIOUS_STATUSES, 'DESIGN']);

/** A Pending Epic that was put on hold straight from planning (To Do / In PO — plus Design for R5). An
 * empty previous status is not in that set, so such an Epic is not exempt. */
function isPendingFromPlanning(status: string, previousStatus: string | null | undefined, exempt: ReadonlySet<string> = PENDING_EXEMPT_PREVIOUS_STATUSES): boolean {
  return isPendingStatus(status) && exempt.has(normalizeWorkflowStatus(previousStatus ?? ''));
}

/**
 * When R1 expects the Start Date (T1) to be filled in (owner rule 2026-10-12):
 *   (status not Pending and status ≥ DESIGN)
 *   OR (status = Pending and previous status ∉ {To Do, In PO}).
 * Until then every Pending Epic was included (2026-10-05); one that went Pending from To Do / In PO
 * never started, so a missing Start Date there is not a data error.
 */
export function startDateRequired(status: string, previousStatus: string | null | undefined, statusIndex: number): boolean {
  if (isPendingStatus(status)) return !isPendingFromPlanning(status, previousStatus);
  return statusIndex >= STATUS_INDEX.DESIGN;
}

/**
 * When R5 expects the Requirement Level to be filled in (owner rule 2026-10-11, restated 2026-10-12,
 * Design added 2026-10-14):
 *   (status not Pending and status > DESIGN)
 *   OR (status = Pending and previous status ∉ {To Do, In PO, Design}).
 * A Pending Epic is therefore only exempt when it was To Do / In PO / Design before going Pending — an
 * empty previous status is not in that set, so it is not exempt either.
 */
export function requirementLevelRequired(status: string, previousStatus: string | null | undefined, statusIndex: number): boolean {
  if (isPendingStatus(status)) return !isPendingFromPlanning(status, previousStatus, PENDING_EXEMPT_PREVIOUS_STATUSES_R5);
  return statusIndex > STATUS_INDEX.DESIGN;
}

/**
 * Axis DATA_QUALITY — former anomaly rules R1–R6 (same stable numbering; R7 moved to the RELEASE
 * axis) plus R8/R9 (R4G Date vs status, added 2026-10-04) and R10 (2026-10-09). R1/R3–R6/R8/R9/R10 are ALERT
 * ("Sai lệch dữ liệu"); R2 "Pending lâu" is a RECOMMENDATION since 2026-09-29 and no longer counts as a data
 * anomaly. One Rule object per R-rule since 2026-10-25 (spec "Rule Group"), each with the recommendation that
 * follows it; their logic changes are kept in each rule's `detail.history`.
 */

/** One slot per R-rule (a future variant of an R-rule shares its slot). */
const DQ_SLOT_BY_RULE_ID: Record<string, RuleSlot> = {
  'dq-r1': 'DQ_R1', 'dq-r2': 'DQ_R2', 'dq-r3': 'DQ_R3', 'dq-r4': 'DQ_R4', 'dq-r5': 'DQ_R5',
  'dq-r6': 'DQ_R6', 'dq-r8': 'DQ_R8', 'dq-r9': 'DQ_R9', 'dq-r10': 'DQ_R10',
};

interface DataQualitySpec {
  id: string;
  name: string;
  summary: string;
  detail: RuleDetail;
  emits: readonly BadgeId[];
  /** false = R8 / R10: only Cancelled is exempt, not the configurable exempt statuses (To Do / In PO / Backlog). */
  honorsExemptStatuses: boolean;
  evaluate: PrimaryRule;
  recommend?: DerivedRule;
}

/** Wraps an R-rule with the exemptions every data-quality rule shares. Which Epics an R-rule applies to by date is the
 * Rule Group's business now (the former "Phạm vi rule Sai lệch dữ liệu" panel was removed 2026-10-25, spec §9.3). */
function dataQualityRule(spec: DataQualitySpec): ScoringRule {
  return {
    id: spec.id,
    name: spec.name,
    summary: spec.summary,
    detail: spec.detail,
    category: 'DATA_QUALITY',
    stage: 'DATA_QUALITY',
    core: false,
    slot: DQ_SLOT_BY_RULE_ID[spec.id],
    emits: spec.emits,
    defaultSelected: true,
    lifecycle: 'active',
    gatedByDataAnomaly: false,
    evaluate: (input) => {
      if (spec.honorsExemptStatuses && isExemptFromDataQuality(input.facts.status, input.ctx)) return [];
      return spec.evaluate(input);
    },
    recommend: spec.recommend,
  };
}

const EXEMPT_NOTE = 'Miễn trừ: Cancelled và các status được miễn (mặc định To Do / In PO / Backlog).';

/** "Status chưa tới R4GOLIVE" for R8 / R10. Backlog is exempt but not a workflow step — it counts as behind like
 * To Do / In PO. Reopened is left out (owner rule 2026-10-05): it ranks level with In Progress, but an Epic gets
 * reopened after it went live, so a reached R4G Date there is genuine, not "Sai lệch dữ liệu". */
function statusBehindR4g(facts: EpicFacts, statusIndex: number, ctx: ScoringContext): boolean {
  return (statusIndex < STATUS_INDEX.R4GOLIVE || isExemptFromDataQuality(facts.status, ctx)) && !isReopenedStatus(facts.status);
}

export const dqR8Rule = dataQualityRule({
  id: 'dq-r8',
  name: 'R8 — Có R4G Date nhưng chưa R4GOLIVE',
  summary: 'Epic đã ghi R4G Date (kể cả ngày tương lai) nhưng status chưa lên R4GOLIVE.',
  detail: {
    conditions: 'Áp dụng cả với To Do / In PO / Backlog; chỉ miễn Cancelled và Reopened.',
    history: ['04/10/2026: rule mới.', '05/10/2026: áp dụng cả status được miễn; không áp dụng Reopened.', '08/10/2026: R4G Date ở tương lai cũng tính.'],
  },
  emits: ['ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', 'REC_FIX_R4G_STATUS'],
  honorsExemptStatuses: false,
  // R4G Date is the date the Epic actually reached R4GOLIVE — the phase completion, the "Epic hoàn thành" layer of
  // the funnel and the Release axis all read it that way — so it must not be entered before the status gets there,
  // future or not (owner rule 2026-10-08). An Epic already at R4GOLIVE or later with a future R4G Date is R10.
  // Company rule, confirmed 2026-10-09: an R4G Date declared ahead is always "Sai lệch dữ liệu"; like every data
  // anomaly it outranks the TTM verdicts, so an Epic that would be Fail shows as R8 and leaves the denominator.
  evaluate: ({ facts, derived, ctx }) => {
    const r4g = facts.r4gDate;
    if (!r4g || isCancelledStatus(facts.status) || !statusBehindR4g(facts, derived.statusIndex, ctx)) return [];
    const message = r4g > ctx.asOf
      ? `Đã ghi R4G Date (${r4g}, chưa tới ngày) nhưng status Epic (${facts.status}) chưa tới R4GOLIVE`
      : `Đã có R4G Date (${r4g}) nhưng status Epic (${facts.status}) chưa tới R4GOLIVE`;
    return [finding('ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', message, { r4gDate: r4g, status: facts.status })];
  },
  recommend: (_input, active) => (active.has('ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE')
    ? [finding('REC_FIX_R4G_STATUS', 'Chuyển status Epic sang R4GOLIVE, hoặc kiểm tra lại R4G Date trên Jira.', {}, { relatedTo: ['ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE'] })]
    : []),
});

export const dqR10Rule = dataQualityRule({
  id: 'dq-r10',
  name: 'R10 — R4G Date ở tương lai',
  summary: 'R4G Date còn ở tương lai trong khi status đã từ R4GOLIVE trở lên (hoặc Reopened) — R4G Date không được khai báo trước.',
  detail: { conditions: 'Chỉ miễn Cancelled. Cùng R8, mọi Epic có R4G Date ở tương lai đều là Sai lệch dữ liệu.', history: ['09/10/2026: rule mới.'] },
  emits: ['ANOMALY_R10_R4G_DATE_IN_FUTURE', 'REC_CLEAR_FUTURE_R4G_DATE'],
  honorsExemptStatuses: false,
  // The rest of "R4G Date must not be declared ahead": a future R4G Date where R8 doesn't reach (status at R4GOLIVE
  // or later, or Reopened — its R8 exemption is for a REACHED date).
  evaluate: ({ facts, derived, ctx }) => {
    const r4g = facts.r4gDate;
    if (!r4g || r4g <= ctx.asOf || isCancelledStatus(facts.status) || statusBehindR4g(facts, derived.statusIndex, ctx)) return [];
    return [finding('ANOMALY_R10_R4G_DATE_IN_FUTURE', `R4G Date (${r4g}) còn ở tương lai — R4G Date là ngày thực tế đạt R4GOLIVE, không được khai báo trước (status Epic: ${facts.status})`, { r4gDate: r4g, status: facts.status })];
  },
  recommend: (_input, active) => (active.has('ANOMALY_R10_R4G_DATE_IN_FUTURE')
    ? [finding('REC_CLEAR_FUTURE_R4G_DATE', 'Xoá R4G Date khai báo trước trên Jira (ghi ngày dự kiến ở trường thông tin khác); chỉ ghi R4G Date khi Epic thực tế đạt R4GOLIVE.', {}, { relatedTo: ['ANOMALY_R10_R4G_DATE_IN_FUTURE'] })]
    : []),
});

export const dqR2Rule = dataQualityRule({
  id: 'dq-r2',
  name: 'R2 — Pending lâu',
  summary: 'Epic Pending quá tỉ lệ cho phép của chu trình TTM-CNTT (QLDA) — nên quyết định tiếp tục hay huỷ. Là khuyến nghị, không phải Sai lệch dữ liệu.',
  detail: { conditions: `Mốc tính: Start Date, thiếu thì ngày tạo Jira. ${EXEMPT_NOTE}`, parameters: ['anomaly.pendingStaleRatio (mặc định 20% ngân sách TTM-CNTT)'] },
  emits: ['ANOMALY_R2_PENDING_TOO_LONG'],
  honorsExemptStatuses: true,
  evaluate: ({ facts, derived, ctx }) => {
    if (!isPendingStatus(facts.status)) return [];
    // Anchored on T1, falling back to the Jira creation date when T1 is missing.
    const t1 = facts.startDate;
    const anchor = t1 ?? toIsoDate(facts.jiraCreatedAt);
    const budget = derived.cnttBudgetWorkingDays;
    if (!anchor || !budget) return [];
    const elapsed = diffWorkingDays(anchor, ctx.asOf, ctx.holidays);
    const threshold = ctx.parameters['anomaly.pendingStaleRatio'] * budget;
    if (elapsed < threshold) return [];
    return [finding('ANOMALY_R2_PENDING_TOO_LONG', `Epic Pending đã ${elapsed} ngày làm việc (ngưỡng ${Math.round(threshold)} ngày = ${Math.round(ctx.parameters['anomaly.pendingStaleRatio'] * 100)}% chu trình TTM-CNTT (QLDA)) kể từ ${t1 ? 'Start Date (T1)' : 'ngày tạo Jira'} — cân nhắc tiếp tục hoặc huỷ Epic.`, { anchorDate: anchor, elapsedWorkingDays: elapsed, thresholdWorkingDays: threshold })];
  },
});

export const dqR1Rule = dataQualityRule({
  id: 'dq-r1',
  name: 'R1 — Thiếu Start Date',
  summary: 'Epic chưa có Start Date khi đã tới lúc cần (từ Design trở đi, hoặc Pending không phải từ To Do / In PO).',
  detail: {
    conditions: `${EXEMPT_NOTE} Khuyến nghị "Bổ sung Start Date" phát cả khi TTM-CNTT "Không tính được" vì thiếu Start Date.`,
    history: ['04/10/2026: tính từ Design (trước là DEV).', '05/10/2026: tính cả Pending.', '12/10/2026: Pending có status trước là To Do / In PO được miễn.'],
  },
  emits: ['ANOMALY_R1_MISSING_START_DATE', 'REC_FILL_START_DATE'],
  honorsExemptStatuses: true,
  // Owner rule 2026-10-12 — Start Date blank AND EITHER the status is not Pending and from Design on (Reopened ranks
  // level with In Progress, so it is included), OR the status is Pending and its previous status is not To Do / In PO
  // (an empty one included). A Pending Epic that was To Do / In PO before never started, so it is not flagged — it then
  // has no Target either: TTM-CNTT reports "không tính được" and, the data-quality gate being open, TTM-E2E is judged.
  evaluate: ({ facts, derived }) => {
    if (facts.startDate || !startDateRequired(facts.status, facts.previousStatus, derived.statusIndex)) return [];
    const pending = isPendingStatus(facts.status);
    return [finding('ANOMALY_R1_MISSING_START_DATE', pending ? `Thiếu Start Date (T1) — Epic đang Pending (status trước đó: ${(facts.previousStatus ?? '').trim() || 'không có'})` : 'Thiếu Start Date (T1) — Epic đã từ giai đoạn Design trở đi.', pending ? { previousStatus: facts.previousStatus ?? null } : undefined)];
  },
  recommend: ({ facts, derived }, active) => {
    const brokenForMissingT1 = active.has('CNTT_CALC_BROKEN') && !facts.startDate && !derived.isCancelled && derived.statusIndex >= STATUS_INDEX.DESIGN && derived.statusIndex <= STATUS_INDEX.RELEASED;
    if (!active.has('ANOMALY_R1_MISSING_START_DATE') && !brokenForMissingT1) return [];
    return [finding('REC_FILL_START_DATE', 'Bổ sung Start Date (T1) trên Jira.', {}, { relatedTo: active.has('ANOMALY_R1_MISSING_START_DATE') ? ['ANOMALY_R1_MISSING_START_DATE'] : ['CNTT_CALC_BROKEN'] })];
  },
});

export const dqR3Rule = dataQualityRule({
  id: 'dq-r3',
  name: 'R3 — Sai thứ tự ngày',
  summary: 'Các mốc ngày không theo thứ tự T0 ≤ Start Date < R4G Date ≤ Due Date (chỉ xét mốc đã có giá trị).',
  detail: { conditions: `${EXEMPT_NOTE} Khuyến nghị "Sửa thứ tự ngày" phát cả khi TTM-CNTT / TTM-E2E "Không tính được" vì R4G Date phi logic.` },
  emits: ['ANOMALY_R3_DATE_OUT_OF_SEQUENCE', 'REC_FIX_DATE_ORDER'],
  honorsExemptStatuses: true,
  evaluate: ({ facts }) => {
    const t0 = facts.ideaApprovedDate;
    const t1 = facts.startDate;
    const r4g = facts.r4gDate;
    const due = facts.dueDate;
    const breaks: string[] = [];
    if (t0 && t1 && t0 > t1) breaks.push('Ngày duyệt ý tưởng (T0) muộn hơn Start Date (T1)');
    if (t1 && r4g && t1 >= r4g) breaks.push('Start Date (T1) không sớm hơn R4G Date');
    if (r4g && due && r4g > due) breaks.push('R4G Date muộn hơn Due Date');
    return breaks.length ? [finding('ANOMALY_R3_DATE_OUT_OF_SEQUENCE', `Sai thứ tự ngày: ${breaks.join('; ')}`, { ideaApprovedDate: t0, startDate: t1, r4gDate: r4g, dueDate: due })] : [];
  },
  recommend: ({ facts }, active) => {
    const brokenForOrder = (active.has('CNTT_CALC_BROKEN') && Boolean(facts.startDate)) || active.has('E2E_CALC_BROKEN');
    return active.has('ANOMALY_R3_DATE_OUT_OF_SEQUENCE') || brokenForOrder
      ? [finding('REC_FIX_DATE_ORDER', 'Kiểm tra lại thứ tự các mốc ngày (T0, Start Date, R4G Date, Due Date) trên Jira.', {}, { relatedTo: ['ANOMALY_R3_DATE_OUT_OF_SEQUENCE'] })]
      : [];
  },
});

export const dqR4Rule = dataQualityRule({
  id: 'dq-r4',
  name: 'R4 — Thiếu Phân loại yêu cầu',
  summary: 'Epic chưa có Phân loại yêu cầu (trống hoặc "none").',
  detail: { conditions: EXEMPT_NOTE },
  emits: ['ANOMALY_R4_MISSING_REQUEST_TYPE', 'REC_FILL_REQUEST_TYPE'],
  honorsExemptStatuses: true,
  evaluate: ({ facts }) => (isBlank(facts.requestType) ? [finding('ANOMALY_R4_MISSING_REQUEST_TYPE', 'Thiếu Phân loại yêu cầu')] : []),
  recommend: (_input, active) => (active.has('ANOMALY_R4_MISSING_REQUEST_TYPE')
    ? [finding('REC_FILL_REQUEST_TYPE', 'Bổ sung Phân loại yêu cầu trên Jira.', {}, { relatedTo: ['ANOMALY_R4_MISSING_REQUEST_TYPE'] })]
    : []),
});

export const dqR5Rule = dataQualityRule({
  id: 'dq-r5',
  name: 'R5 — Thiếu Requirement Level',
  summary: 'Epic chưa có Requirement Level khi đã qua Design (hoặc Pending không phải từ To Do / In PO / Design).',
  detail: {
    conditions: EXEMPT_NOTE,
    history: ['04/10/2026: chỉ tính khi đã qua Design.', '11/10/2026: Pending có status trước là To Do / In PO được miễn.', '14/10/2026: miễn thêm Pending có status trước là Design.'],
  },
  emits: ['ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', 'REC_FILL_REQUIREMENT_LEVEL'],
  honorsExemptStatuses: true,
  // Owner rule 2026-10-11 — Requirement Level blank or "none" AND EITHER the status is not Pending and past DESIGN
  // (the level is still being settled during Design), OR the status is Pending and its previous status is not
  // To Do / In PO / Design (an empty one included).
  evaluate: ({ facts, derived }) => {
    if (!isBlank(facts.requirementLevel) || !requirementLevelRequired(facts.status, facts.previousStatus, derived.statusIndex)) return [];
    const pending = isPendingStatus(facts.status);
    return [finding('ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', pending ? `Thiếu Requirement Level — Epic đang Pending (status trước đó: ${(facts.previousStatus ?? '').trim() || 'không có'})` : 'Thiếu Requirement Level', pending ? { previousStatus: facts.previousStatus ?? null } : undefined)];
  },
  recommend: (_input, active) => (active.has('ANOMALY_R5_MISSING_REQUIREMENT_LEVEL')
    ? [finding('REC_FILL_REQUIREMENT_LEVEL', 'Bổ sung Requirement Level trên Jira.', {}, { relatedTo: ['ANOMALY_R5_MISSING_REQUIREMENT_LEVEL'] })]
    : []),
});

export const dqR6Rule = dataQualityRule({
  id: 'dq-r6',
  name: 'R6 — SP nhưng Level thấp',
  summary: 'Loại Epic Sản phẩm (SP-Lv12 / SP-Lv34) nhưng Requirement Level thuộc danh sách mâu thuẫn (mặc định 1, 2).',
  detail: { conditions: EXEMPT_NOTE, parameters: ['anomaly.spMismatchLevels'] },
  emits: ['ANOMALY_R6_SP_LEVEL_MISMATCH', 'REC_REVIEW_SP_LEVEL'],
  honorsExemptStatuses: true,
  evaluate: ({ facts, ctx }) => {
    const level = (facts.requirementLevel ?? '').trim();
    if (!(facts.complexity ?? '').startsWith('SP-') || !ctx.parameters['anomaly.spMismatchLevels'].includes(level)) return [];
    return [finding('ANOMALY_R6_SP_LEVEL_MISMATCH', `Epic được đánh giá độ phức tạp Sản phẩm (${facts.complexity}) nhưng Requirement Level = ${level} — không phù hợp với loại yêu cầu Sản phẩm`)];
  },
  recommend: (_input, active) => (active.has('ANOMALY_R6_SP_LEVEL_MISMATCH')
    ? [finding('REC_REVIEW_SP_LEVEL', 'Rà soát lại Phân loại yêu cầu / Requirement Level.', {}, { relatedTo: ['ANOMALY_R6_SP_LEVEL_MISMATCH'] })]
    : []),
});

export const dqR9Rule = dataQualityRule({
  id: 'dq-r9',
  name: 'R9 — Thiếu R4G Date',
  summary: 'Status đã từ R4GOLIVE trở lên (R4GOLIVE / MVP Done / Pilot / Done / Released) nhưng chưa có R4G Date.',
  detail: { conditions: `${EXEMPT_NOTE} Status ngoài workflow (kể cả Pending / Reopened) không xét.`, history: ['04/10/2026: rule mới.'] },
  emits: ['ANOMALY_R9_MISSING_R4G_DATE', 'REC_FILL_R4G_DATE'],
  honorsExemptStatuses: true,
  // The other direction of R8, limited to the workflow's own statuses (R4GOLIVE … RELEASED), so an unrecognized
  // status is never flagged.
  evaluate: ({ facts, derived }) => (!facts.r4gDate && derived.statusIndex >= STATUS_INDEX.R4GOLIVE && derived.statusIndex <= STATUS_INDEX.RELEASED
    ? [finding('ANOMALY_R9_MISSING_R4G_DATE', `Status Epic (${facts.status}) đã từ R4GOLIVE trở lên nhưng chưa có R4G Date`, { status: facts.status })]
    : []),
  recommend: (_input, active) => (active.has('ANOMALY_R9_MISSING_R4G_DATE')
    ? [finding('REC_FILL_R4G_DATE', 'Bổ sung R4G Date trên Jira.', {}, { relatedTo: ['ANOMALY_R9_MISSING_R4G_DATE'] })]
    : []),
});
