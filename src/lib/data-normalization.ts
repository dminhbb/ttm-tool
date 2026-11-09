import { BADGE_BY_ID, badgesOf, type BadgeId } from '@/lib/scoring/catalog';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import { CHANGE_ID_AMT_FROM } from '@/lib/scoring/rules/change-id';

/**
 * "Chuẩn hoá dữ liệu" — the data an Epic's owner has to put right on Jira, one panel per rule, each
 * listing the Epics that currently break it:
 *
 *   1. "Thiếu lý do Fail TTM" — first, since it is the one a PM/SM is chased for (owner 2026-10-13);
 *   2. the "Sai lệch dữ liệu" rules (the ALERT badges of the DATA_QUALITY axis of the scoring catalog:
 *      R1, R3–R6, R8–R10) and R7 "Sai Status (Release)", in R-number order. R2 "Pending lâu" has no
 *      panel: it asks for a decision on the Epic, not for a data fix;
 *   3. "Thiếu Change ID" (owner 2026-11-09) — a recommendation, not a data anomaly: listed last, on a light green
 *      panel (`tone: 'recommendation'`), so its Epics can be followed without leaving any TTM number.
 *
 * An Epic breaking several rules appears in several panels (owner decision 2026-10-12).
 *
 * Pure — the Epic rows and their dates come from data-normalization-service.ts.
 */

/** Epics per page of every panel (same menu/paging as "Quản trị Epic", 25 per page). */
export const NORMALIZATION_PAGE_SIZE = 25;

/** Rule badge → the recommendation badge that says how to fix it (single source: the catalog). */
const GUIDE_BADGE_OF_RULE: Partial<Record<number, BadgeId>> = {
  1: 'REC_FILL_START_DATE',
  3: 'REC_FIX_DATE_ORDER',
  4: 'REC_FILL_REQUEST_TYPE',
  5: 'REC_FILL_REQUIREMENT_LEVEL',
  6: 'REC_REVIEW_SP_LEVEL',
  8: 'REC_FIX_R4G_STATUS',
  9: 'REC_FILL_R4G_DATE',
  10: 'REC_CLEAR_FUTURE_R4G_DATE',
  11: 'REC_FIX_EXCEPT_PLAN',
};

const FAIL_REASON_BADGE = 'REC_MISSING_FAIL_REASON' satisfies BadgeId;
/** The second half of "Thiếu lý do" on TTM Dashboard 2 (widget = Khâu fail + Chịu TN chính). */
const RESPONSIBLE_DEPARTMENT_BADGE = 'REC_MISSING_RESPONSIBLE_DEPARTMENT' satisfies BadgeId;
const RELEASE_MISMATCH_BADGE = 'RELEASE_STATUS_MISMATCH' satisfies BadgeId;
const MISSING_CHANGE_ID_BADGE = 'REC_MISSING_CHANGE_ID' satisfies BadgeId;

/** Key of the "Thiếu lý do Fail TTM" panel in the API (page map, open panels). */
export const FAIL_REASON_PANEL_CODE = 'FAIL_REASON';

export interface NormalizationPanelDefinition {
  /** Key of the panel in the API (page map, open panels): 'R1', 'R3'… or FAIL_REASON_PANEL_CODE. */
  code: string;
  /** Short tag shown before the title ('R1'…, 'Fail TTM'). */
  tag: string;
  /** Rule title. */
  label: string;
  /** What the rule checks. */
  meaning: string;
  /** The rule's formula, as the "Logic cảnh báo" popup shows it. */
  formula: string;
  /** How to normalize the data — '' when there is nothing to say. */
  guide: string;
  /** Rule number (1, 3, 4…) of a "Sai lệch dữ liệu" / R7 panel; 0 for "Thiếu lý do Fail TTM". */
  index: number;
  /** Message of an Epic in this panel when its row carries none for the rule (a badge, not a violation). */
  defaultMessage: string;
  /** 'recommendation' = a Khuyến nghị panel (light green), not a rule to fix; absent = a rule panel. */
  tone?: 'recommendation';
}

function ruleNumberOf(badgeId: string): number {
  return Number(/^ANOMALY_R(\d+)_/.exec(badgeId)?.[1] ?? 0);
}

const failReasonBadge = BADGE_BY_ID.get(FAIL_REASON_BADGE)!;
const responsibleDepartmentBadge = BADGE_BY_ID.get(RESPONSIBLE_DEPARTMENT_BADGE)!;
const releaseMismatchBadge = BADGE_BY_ID.get(RELEASE_MISMATCH_BADGE)!;
const missingChangeIdBadge = BADGE_BY_ID.get(MISSING_CHANGE_ID_BADGE)!;

const DATA_QUALITY_PANELS: NormalizationPanelDefinition[] = badgesOf('DATA_QUALITY', 'ALERT')
  .map((badge) => {
    const index = ruleNumberOf(badge.id);
    const guideBadge = GUIDE_BADGE_OF_RULE[index];
    return {
      code: `R${index}`,
      defaultMessage: badge.label,
      formula: badge.formula,
      guide: guideBadge ? BADGE_BY_ID.get(guideBadge)?.meaning ?? '' : '',
      index,
      label: badge.label,
      meaning: badge.meaning,
      tag: `R${index}`,
    };
  })
  .filter((rule) => rule.index > 0);

/** R7 — "Sai Status" of the Release axis: a recommendation in the Scoring Service; the fix is on Jira
 * (owner 2026-10-13). */
const RELEASE_MISMATCH_PANEL: NormalizationPanelDefinition = {
  code: 'R7',
  defaultMessage: 'Due Date đúng hạn nhưng status Epic chưa chuyển sang Released',
  formula: releaseMismatchBadge.formula,
  guide: 'Chuyển status Epic sang Released trên Jira, hoặc kiểm tra lại Due Date / R4G Date.',
  index: 7,
  label: `${releaseMismatchBadge.label} (Release)`,
  meaning: releaseMismatchBadge.meaning,
  tag: 'R7',
};

const FAIL_REASON_PANEL: NormalizationPanelDefinition = {
  code: FAIL_REASON_PANEL_CODE,
  defaultMessage: failReasonBadge.meaning,
  formula: `${failReasonBadge.formula}  —  hoặc  —  ${responsibleDepartmentBadge.formula}`,
  guide: 'Ghi nhận lý do Fail TTM trên Jira ở ít nhất một khâu (BA, CO, DEV, PM/SM, PO, Pentest, SA, SIT/UAT) hoặc trường "Lý do khác", và điền "Phòng chịu trách nhiệm chính" (main_fail_dept).',
  index: 0,
  label: failReasonBadge.label,
  meaning: `${failReasonBadge.meaning} ${responsibleDepartmentBadge.meaning}`,
  tag: 'Fail TTM',
};

/** "Thiếu Change ID" — a recommendation of the Release axis (rules/change-id.ts); its finding message says which field. */
const MISSING_CHANGE_ID_PANEL: NormalizationPanelDefinition = {
  code: 'CHANGE_ID',
  defaultMessage: missingChangeIdBadge.label,
  formula: missingChangeIdBadge.formula,
  guide: 'Bổ sung Change ID trên Jira: Epic có R4G Date từ 01/07/2026 điền Change ID AMT (Change_ID_AMT); trước đó điền Change ID hoặc Change ID AMT.',
  index: 0,
  label: missingChangeIdBadge.label,
  meaning: missingChangeIdBadge.meaning,
  tag: 'Khuyến nghị',
  tone: 'recommendation',
};

/** "Thiếu lý do Fail TTM" first, then the rules in R-number order, then the recommendation "Thiếu Change ID". */
export const NORMALIZATION_PANELS: readonly NormalizationPanelDefinition[] = [
  FAIL_REASON_PANEL,
  ...[...DATA_QUALITY_PANELS, RELEASE_MISMATCH_PANEL].sort((a, b) => a.index - b.index),
  MISSING_CHANGE_ID_PANEL,
];

const PANEL_CODE_BY_RULE_INDEX: ReadonlyMap<number, string> = new Map(NORMALIZATION_PANELS.filter((panel) => panel.index > 0).map((panel) => [panel.index, panel.code]));

type NormalizationSourceRow = Pick<DashboardEpicRow, 'dataAnomalyViolations' | 'r4gDate' | 'scoringBadges' | 'ttmCnttInScope'>;

/**
 * The panels an Epic row belongs to, each with the messages to show for it (panel code → messages).
 *   - a violation the row carries (the "Sai lệch dữ liệu" ALERT rules) goes to its rule's panel —
 *     R2 has none, so an Epic whose only violation is R2 is in no panel;
 *   - a row is also read by its badges for what the Scoring Service doesn't report as a
 *     violation: "Sai Status" of the Release axis (R7) and "Thiếu lý do Fail TTM" — the latter inside
 *     "Phạm vi dữ liệu cho TTM" only, the same Epics TTM Dashboard 2 counts.
 */
export function normalizationPanelsOf(row: NormalizationSourceRow): Map<string, string[]> {
  const panels = new Map<string, string[]>();
  const add = (code: string, message: string) => panels.set(code, [...(panels.get(code) ?? []), message]);
  for (const violation of row.dataAnomalyViolations ?? []) {
    const code = PANEL_CODE_BY_RULE_INDEX.get(violation.ruleIndex);
    if (code) add(code, violation.message);
  }
  if (row.scoringBadges?.includes(RELEASE_MISMATCH_BADGE) && !panels.has(RELEASE_MISMATCH_PANEL.code)) {
    add(RELEASE_MISMATCH_PANEL.code, RELEASE_MISMATCH_PANEL.defaultMessage);
  }
  // Both halves of "Thiếu lý do" (as the dashboard widget counts them), inside "Phạm vi dữ liệu cho TTM".
  if (row.ttmCnttInScope && row.scoringBadges?.includes(FAIL_REASON_BADGE)) add(FAIL_REASON_PANEL.code, FAIL_REASON_PANEL.defaultMessage);
  if (row.ttmCnttInScope && row.scoringBadges?.includes(RESPONSIBLE_DEPARTMENT_BADGE)) add(FAIL_REASON_PANEL.code, responsibleDepartmentBadge.meaning);
  // "Thiếu Change ID": every Epic carrying it (no scope condition — it is about the golive record, not a TTM number).
  if (row.scoringBadges?.includes(MISSING_CHANGE_ID_BADGE)) {
    // Same split as rules/change-id.ts (the slim dashboard row has no finding messages).
    const r4g = row.r4gDate;
    add(MISSING_CHANGE_ID_PANEL.code, !r4g ? MISSING_CHANGE_ID_PANEL.defaultMessage : r4g >= CHANGE_ID_AMT_FROM
      ? `R4G Date ${r4g} (từ 01/07/2026): thiếu Change ID AMT (Change_ID_AMT)`
      : `R4G Date ${r4g}: thiếu Change ID (Change_ID hoặc Change_ID_AMT)`);
  }
  return panels;
}

/** Badge codes that put a scoring row in a panel without being a violation — for the SQL pre-filter
 * of epic_alert_row_cache.badge_codes (see queryDashboardEpicRows). */
export const NORMALIZATION_BADGE_CODES: readonly string[] = [RELEASE_MISMATCH_BADGE, FAIL_REASON_BADGE, RESPONSIBLE_DEPARTMENT_BADGE, MISSING_CHANGE_ID_BADGE];

const PANEL_CODES: ReadonlySet<string> = new Set(NORMALIZATION_PANELS.map((panel) => panel.code));

/** Parses "R1:2,FAIL_REASON:3" (panel code : 1-based page) — unknown codes and bad pages are dropped. */
export function parseNormalizationPages(raw: string | null | undefined): Record<string, number> {
  const pages: Record<string, number> = {};
  for (const part of (raw ?? '').split(',')) {
    const [code, value] = part.split(':').map((item) => item.trim());
    const page = Number(value);
    if (PANEL_CODES.has(code ?? '') && Number.isInteger(page) && page >= 1) pages[code] = page;
  }
  return pages;
}

/** Parses "R1,FAIL_REASON" — the panels whose Epic rows the caller wants; unknown codes are dropped. */
export function parseNormalizationPanelCodes(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((code) => code.trim()).filter((code) => PANEL_CODES.has(code)))];
}

const EPIC_KEY_COLLATOR = new Intl.Collator('en', { numeric: true });

/** Orders Epic keys the way people read them: by project, then by number (API-2 before API-10). */
export function compareEpicKeys(a: string, b: string): number {
  return EPIC_KEY_COLLATOR.compare(a, b);
}

export interface NormalizationEpicRow {
  createdDate: string | null;
  dueDate: string | null;
  epicKey: string;
  epicName: string;
  ideaApprovedDate: string | null;
  r4gDate: string | null;
  startDate: string | null;
  status: string;
  /** The messages of the violations of THIS panel's rule. */
  violations: string[];
}

export interface NormalizationPanel {
  code: string;
  formula: string;
  guide: string;
  label: string;
  meaning: string;
  /** 1-based, clamped to the last page. */
  page: number;
  pageSize: number;
  /** The Epics of `page` — only filled for the panels the caller asked rows for (`rowsLoaded`). */
  rows: NormalizationEpicRow[];
  /** false = the caller didn't ask for this panel's rows (it is collapsed); `totalCount` still holds. */
  rowsLoaded: boolean;
  tag: string;
  /** See NormalizationPanelDefinition.tone. */
  tone?: 'recommendation';
  totalCount: number;
  totalPages: number;
}

/** Slices one rule's (already sorted) Epics into its requested page. */
export function paginate<T>(items: readonly T[], requestedPage: number, pageSize = NORMALIZATION_PAGE_SIZE): { page: number; rows: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  return { page, rows: items.slice((page - 1) * pageSize, page * pageSize), totalPages };
}
