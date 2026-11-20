import { computeEpicComplexity } from '@/lib/epic-complexity';
import { addWorkingDays, diffWorkingDays } from '@/lib/scoring/dates';
import { deriveMetrics, PHASE_KEYS } from '@/lib/scoring/derive';
import { matchingRuleGroups, policySetsOf, resolveRuleSelection, slotRuleOf } from '@/lib/scoring/rule-groups';
import type { EpicComplexity, EpicFacts, IsoDate, ScoringContext, TtmPhaseKey } from '@/lib/scoring/types';

/**
 * "TTM Calculator" — milestones of an imaginary Epic, computed by the SAME Scoring Service functions the real Epics go
 * through (Rule Group → Bộ ngân sách → deriveMetrics → phase baselines), with the app's holidays / makeup workdays.
 * Pure: the caller loads the ScoringContext (ttm-calculator-service.ts).
 */

export interface TtmCalculatorInput {
  /** Created date on Jira (optional) — picks the Rule Group and is the TTM-E2E T0 when there is no idea-approved date. */
  createdDate?: string | null;
  /** T0 (optional). */
  ideaApprovedDate?: string | null;
  requestType: string;
  /** '1'..'4'. */
  requirementLevel: string;
  /** T1. */
  startDate: string;
}

export type CalculatorRowKey = TtmPhaseKey | 'GOLIVE';

export interface CalculatorPhaseRow {
  /** Calendar span of the row; null when the row has no working day (budget too small). */
  fromDate: IsoDate | null;
  key: CalculatorRowKey;
  label: string;
  /** Share of the TTM-CNTT budget (DESIGN … PENTEST), null for R4G and Golive. */
  percent: number | null;
  toDate: IsoDate | null;
  workingDays: number;
}

export interface TtmCalculatorResult {
  complexity: EpicComplexity;
  /** Hạn golive = R4G + `graceWorkingDays` working days. */
  goliveDate: IsoDate | null;
  graceWorkingDays: number;
  e2e: {
    budgetWorkingDays: number | null;
    /** Where T0 comes from; null = no idea-approved / created date given, so TTM-E2E can't be computed. */
    sourceDate: IsoDate | null;
    sourceLabel: string | null;
    targetDate: IsoDate | null;
  } | null;
  phasePercentages: Record<TtmPhaseKey, number>;
  rows: CalculatorPhaseRow[];
  /** R4G mục tiêu = Target_CNTT. */
  r4gDate: IsoDate | null;
  /** Start date đã nhập (T1). */
  startDate: IsoDate;
  /** Start date rơi vào Thứ 7 / Chủ nhật / ngày nghỉ: vẫn là ngày thứ nhất (như Epic thật) nhưng không có ngày làm việc thật. */
  startIsNonWorkingDay: boolean;
  ruleGroup: { id: number; isDefault: boolean; name: string; priority: number };
  /** Rule objects that fill the TTM-CNTT / TTM-E2E verdict slots of the Rule Group, and their Bộ ngân sách. */
  rules: { cnttName: string | null; cnttPolicySet: string; e2eName: string | null; e2ePolicySet: string };
  /** Tổng thời gian TTM-CNTT (ngày làm việc). */
  totalCnttWorkingDays: number | null;
}

const LABELS: Record<CalculatorRowKey, string> = { DESIGN: 'DESIGN', DEV: 'DEV', TEST: 'TEST', PENTEST: 'PENTEST', R4GOLIVE: 'R4G', GOLIVE: 'Golive' };

/**
 * Tên pha hiển thị trên màn hình TTM Calculator (Bảng Pha + timeline badge). Riêng PENTEST đổi thành
 * 'Pentest & Change' theo yêu cầu chủ sản phẩm (19/11/2026); chỉ ở màn hình này — dữ liệu `label` gốc giữ nguyên.
 */
export const PHASE_DISPLAY_LABELS: Record<CalculatorRowKey, string> = { ...LABELS, PENTEST: 'Pentest & Change' };

/** Tên pha để hiển thị trên màn hình TTM Calculator (Bảng Pha + timeline badge). */
export function phaseDisplayLabel(key: CalculatorRowKey): string {
  return PHASE_DISPLAY_LABELS[key];
}

/** Working days from `from` to `to`, both inclusive; 0 when `to` is before `from`. */
function spanDays(from: IsoDate, to: IsoDate, ctx: ScoringContext): number {
  return to < from ? 0 : diffWorkingDays(from, to, ctx.holidays) + 1;
}

export function calculateTtm(input: TtmCalculatorInput, ctx: ScoringContext): TtmCalculatorResult {
  const complexity = computeEpicComplexity(input.requestType, input.requirementLevel);
  const facts: EpicFacts = {
    epicKey: 'CALCULATOR',
    status: 'TO DO',
    complexity,
    ideaApprovedDate: input.ideaApprovedDate || null,
    jiraCreatedAt: input.createdDate || null,
    startDate: input.startDate,
    r4gDate: null,
    dueDate: null,
    requestType: input.requestType,
    requirementLevel: input.requirementLevel,
    phaseCompletion: null,
  };

  const matching = matchingRuleGroups(facts, ctx.ruleGroups);
  const group = matching[0];
  const { rules: selected } = resolveRuleSelection(matching);
  const policySets = policySetsOf(selected);
  const derived = deriveMetrics(facts, ctx, policySets);

  const r4gDate = derived.cnttTargetDate;
  const grace = ctx.parameters['release.graceWorkingDays'];
  const percentages = ctx.parameters['phase.percentages'];
  const rows: CalculatorPhaseRow[] = [];

  if (derived.phases && r4gDate) {
    // Each phase starts on the working day after the previous one ends. PENTEST is stretched to the working day before
    // R4G (owner decision 2026-11-18), so no working day is left between PENTEST and R4G.
    let previousEnd: IsoDate | null = null;
    for (const key of PHASE_KEYS) {
      if (key === 'R4GOLIVE') continue;
      const baseline = derived.phases[key].baselineDate;
      const fromDate: IsoDate = previousEnd ? addWorkingDays(previousEnd, 1, ctx.holidays) : input.startDate;
      const toDate: IsoDate = key === 'PENTEST' ? addWorkingDays(r4gDate, -1, ctx.holidays) : baseline;
      const days = spanDays(fromDate, toDate, ctx);
      // `percent` = % ngày làm việc thực tế của pha so với tổng budget TTM-CNTT (không phải tỉ lệ cấu hình): vì các pha
      // làm tròn lên/xuống và PENTEST bị kéo dài đến trước R4G, tỉ lệ cấu hình không còn khớp số ngày hiển thị.
      rows.push({ key, label: LABELS[key], percent: 0, workingDays: days, fromDate: days ? fromDate : null, toDate: days ? toDate : null });
      if (days) previousEnd = toDate;
    }
    // Phần trăm mỗi pha = workingDays / tổng workingDays của các pha DESIGN…PENTEST (làm tròn; PENTEST lấy phần dư
    // để tổng luôn là 100). R4G và Golive không phải pha dùng ngân sách nên `percent` để null.
    const totalDays = rows.reduce((sum, row) => sum + row.workingDays, 0);
    for (const row of rows) {
      row.percent = totalDays > 0 ? Math.round((row.workingDays / totalDays) * 100) : null;
    }
    if (rows.length > 0) rows[rows.length - 1].percent = 100 - rows.slice(0, -1).reduce((sum, row) => sum + (row.percent ?? 0), 0);
    rows.push({ key: 'R4GOLIVE', label: LABELS.R4GOLIVE, percent: null, workingDays: 1, fromDate: r4gDate, toDate: r4gDate });
    // Không có dòng GOLIVE riêng khi `grace` = 0 (golive ngay tại R4G) — tránh dòng rỗng workingDays 0 / ngày trống.
    if (grace > 0) {
      rows.push({ key: 'GOLIVE', label: LABELS.GOLIVE, percent: null, workingDays: grace, fromDate: addWorkingDays(r4gDate, 1, ctx.holidays), toDate: addWorkingDays(r4gDate, grace, ctx.holidays) });
    }
  }

  const e2eSource = input.ideaApprovedDate || input.createdDate || null;
  const cnttRule = slotRuleOf(selected, 'TTM_CNTT_VERDICT');
  const e2eRule = slotRuleOf(selected, 'TTM_E2E_VERDICT');

  return {
    complexity,
    e2e: e2eSource
      ? {
          budgetWorkingDays: derived.e2eBudgetWorkingDays,
          sourceDate: e2eSource,
          sourceLabel: input.ideaApprovedDate ? 'Ngày duyệt ý tưởng (T0)' : 'Ngày tạo trên Jira',
          targetDate: derived.e2eTargetDate,
        }
      : null,
    goliveDate: r4gDate ? addWorkingDays(r4gDate, grace, ctx.holidays) : null,
    graceWorkingDays: grace,
    phasePercentages: percentages,
    r4gDate,
    rows,
    startDate: input.startDate,
    startIsNonWorkingDay: addWorkingDays(addWorkingDays(input.startDate, 1, ctx.holidays), -1, ctx.holidays) !== input.startDate,
    ruleGroup: { id: group.id, isDefault: group.isDefault, name: group.name, priority: group.priority },
    rules: { cnttName: cnttRule?.name ?? null, cnttPolicySet: policySets.cntt, e2eName: e2eRule?.name ?? null, e2ePolicySet: policySets.e2e },
    totalCnttWorkingDays: derived.cnttBudgetWorkingDays,
  };
}
