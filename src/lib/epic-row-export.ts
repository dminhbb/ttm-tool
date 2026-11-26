import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { EPIC_COMPLEXITY_LABELS } from '@/lib/status-alert-rule-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { matchesPmSmFilter } from '@/lib/epic-pm-sm-assignment';
import { isTtmCnttAchieved, isTtmE2eAchieved, matchesAlertFilter, matchesMarkFilter, type MarkFilterValue } from '@/lib/epic-row-verdicts';
import type { AlertFilterValue } from '@/lib/epic-row-verdicts';

/** An Epic row that the export API enriches with the "Actual Start date" (issues.epic_real_start_date). */
export type EpicAlertRowExport = EpicAlertRowPhased & { epicRealStartDate: string | null };

/** One exported row — every cell a plain string (dates pre-formatted, link built for Epic key). */
export interface ExportRowCells {
  duAn: string;
  epicKey: string;
  epicKeyLink: string;
  epicSummary: string;
  loaiEpic: string;
  pmSm: string;
  scoring: string;
  passTtm: string;
  status: string;
  currentPhase: string;
  startE2e: string;
  startDate: string;
  actualStartDate: string;
  design: string;
  dev: string;
  testPentent: string;
  r4golive: string;
  dueDate: string;
  jiraR4golive: string;
  jiraDueDate: string;
}

/** Ordered column headers (title row) of the exported file — matches `exportRowCells`. */
export const EXPORT_HEADERS: readonly { key: keyof ExportRowCells; label: string }[] = [
  { key: 'duAn', label: 'Dự án' },
  { key: 'epicKey', label: 'Epic key' },
  { key: 'epicSummary', label: 'Epic summary' },
  { key: 'loaiEpic', label: 'Loại Epic' },
  { key: 'pmSm', label: 'PM/SM' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'passTtm', label: 'Pass TTM' },
  { key: 'status', label: 'Status' },
  { key: 'currentPhase', label: 'Current phase' },
  { key: 'startE2e', label: 'Start-E2E' },
  { key: 'startDate', label: 'Start-Date' },
  { key: 'actualStartDate', label: 'Actual Start date' },
  { key: 'design', label: 'Design' },
  { key: 'dev', label: 'Dev' },
  { key: 'testPentent', label: 'Test Pentent' },
  { key: 'r4golive', label: 'R4Golive' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'jiraR4golive', label: 'Jira R4Golive' },
  { key: 'jiraDueDate', label: 'Jira Due date' },
];

/** Phase key → display name for the "Current phase" column. */
const STAGE_LABELS: Record<keyof EpicAlertRowPhased['stages'], string> = {
  design: 'Design',
  dev: 'Dev',
  test: 'Test',
  pentest: 'Pentest',
  r4golive: 'R4Golive',
  release: 'Release',
};

/** dd/mm/yyyy from "YYYY-MM-DD" (or an ISO date). Empty string when the value is absent/invalid. */
export function formatExportDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Pass/Fail text of the "Pass TTM" column — no icons, per requirement. */
export function passTtmText(row: EpicAlertRowExport): string {
  const parts: string[] = [];
  // TTM-CNTT
  if (row.ttmCnttInScope && !row.ttmBlackListed && !row.ttmExclusion) {
    if (row.alertLevel === 'FAIL') parts.push('Fail TTM-CNTT');
    else if (isTtmCnttAchieved(row)) parts.push('Pass TTM-CNTT');
  }
  // TTM-E2E
  if (row.ttmE2eAlertLevel === 'FAIL') parts.push('Fail TTM-E2E');
  else if (isTtmE2eAchieved(row)) parts.push('Pass TTM-E2E');
  return parts.join(', ');
}

/** Concise Scoring text — the main verdicts plus any remaining badge codes (the "Nhận xét" cell's
 * Kết quả / Xử lý / Cảnh báo / Sai lệch dữ liệu, flattened to one line). */
export function scoringText(row: EpicAlertRowExport): string {
  const parts: string[] = [];
  const cntt = row.ttmCnttInScope && !row.ttmBlackListed && !row.ttmExclusion
    ? (row.alertLevel === 'FAIL' ? 'Fail TTM-CNTT' : isTtmCnttAchieved(row) ? 'Đạt TTM-CNTT' : '')
    : '';
  const e2e = row.ttmE2eAlertLevel === 'FAIL' ? 'Fail TTM-E2E' : isTtmE2eAchieved(row) ? 'Đạt TTM-E2E' : '';
  if (cntt) parts.push(cntt);
  if (e2e) parts.push(e2e);
  if (row.hasDataAnomaly) parts.push('Sai lệch dữ liệu');
  if (row.scoringBadges?.length) {
    const known = new Set(['CNTT_PASS', 'E2E_PASS', 'CNTT_NO_RULE']);
    const extra = row.scoringBadges.filter((badge) => !known.has(badge));
    if (extra.length) parts.push(extra.join(', '));
  }
  return parts.join('; ');
}

/** Maps one enriched row to the ordered cells of the export file. */
export function exportRowFields(row: EpicAlertRowExport, viewIssueBaseUrl: string): ExportRowCells {
  const stageOf = (key: keyof EpicAlertRowPhased['stages']): string => formatExportDate(row.stages[key].baselineDate);
  let currentPhase = '';
  for (const key of Object.keys(STAGE_LABELS) as (keyof EpicAlertRowPhased['stages'])[]) {
    if (row.stages[key].isCurrentStage) { currentPhase = STAGE_LABELS[key]; break; }
  }
  return {
    duAn: row.projectName || row.projectKey,
    epicKey: row.epicKey,
    epicKeyLink: viewIssueBaseUrl ? `${viewIssueBaseUrl}${row.epicKey}` : '',
    epicSummary: row.epicName,
    loaiEpic: row.epicType ? (EPIC_COMPLEXITY_LABELS[row.epicType] ?? row.epicType) : '',
    pmSm: row.ownerName,
    scoring: scoringText(row),
    passTtm: passTtmText(row),
    status: row.currentStatus,
    currentPhase,
    startE2e: formatExportDate(row.stages.release.baselineSourceDate),
    startDate: formatExportDate(row.t1StartDate),
    actualStartDate: formatExportDate(row.epicRealStartDate),
    design: stageOf('design'),
    dev: stageOf('dev'),
    testPentent: stageOf('test'),
    r4golive: stageOf('r4golive'),
    dueDate: stageOf('release'),
    jiraR4golive: formatExportDate(row.r4gDate),
    jiraDueDate: formatExportDate(row.dueDate),
  };
}

/** Splits an Epic key into (project prefix, numeric part, rest) for sorting. */
function epicKeySortParts(epicKey: string): { prefix: string; num: number | null; rest: string } {
  const dashIndex = epicKey.indexOf('-');
  const prefix = dashIndex >= 0 ? epicKey.slice(0, dashIndex).toUpperCase() : epicKey.toUpperCase();
  const afterDash = dashIndex >= 0 ? epicKey.slice(dashIndex + 1) : '';
  const numMatch = afterDash.match(/^(\d+)/);
  return { prefix, num: numMatch ? Number(numMatch[1]) : null, rest: epicKey.toUpperCase() };
}

/** Export sort order (distinct from the screen's): Dự án A→Z (projectName), then Epic key prefix
 * A→Z, then the numeric part descending (largest number first, numeric-less keys last). */
export function sortExportRows(rows: readonly EpicAlertRowExport[]): EpicAlertRowExport[] {
  return [...rows].sort((a, b) => {
    const projectOrder = a.projectName.localeCompare(b.projectName, 'vi', { sensitivity: 'base' });
    if (projectOrder !== 0) return projectOrder;
    const ka = epicKeySortParts(a.epicKey);
    const kb = epicKeySortParts(b.epicKey);
    const prefixOrder = ka.prefix.localeCompare(kb.prefix, 'en');
    if (prefixOrder !== 0) return prefixOrder;
    // Numeric part descending — a key without a number sorts after every key with one.
    const aHasNum = ka.num !== null;
    const bHasNum = kb.num !== null;
    if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
    if (aHasNum && bHasNum && ka.num !== kb.num) return (kb.num as number) - (ka.num as number);
    return ka.rest.localeCompare(kb.rest, 'en');
  });
}

/** Options replicating the screen's full-mode client-side filters (page.tsx `indexRows`). */
export interface FullModeFilterOptions {
  projectFilters: readonly string[];
  pmSmFilters: readonly string[];
  componentFilters: readonly string[];
  alertFilters: readonly AlertFilterValue[];
  typeFilters: readonly string[];
  statusFilters: readonly string[];
  dataIssueFilter: boolean;
  requestingUnitFilters: readonly string[];
  ruleGroupFilters: readonly string[];
  search: string;
  markFilter: MarkFilterValue | null;
  markedPmSmFilters: readonly string[];
  viewerOwnerName: string;
  /** True → keep hidden Epics (matches the screen's indexRows call with ignoreHidden=true). */
  ignoreHidden?: boolean;
}

/** Full-mode filter applied server-side by the export API — a pure twin of the screen's `indexRows`
 * filter (page.tsx), so an export under an advanced filter matches exactly what the table shows. */
export function filterFullModeRows(rows: readonly EpicAlertRowPhased[], options: FullModeFilterOptions): EpicAlertRowPhased[] {
  const normalizedSearch = options.search.trim().toLocaleLowerCase('vi-VN');
  return rows.filter((row) =>
    (options.projectFilters.length === 0 || options.projectFilters.includes(row.projectKey))
    && matchesPmSmFilter(row.ownerName, options.pmSmFilters)
    && (options.componentFilters.length === 0 || row.components.some((component) => options.componentFilters.includes(component)))
    && (options.alertFilters.length === 0 || options.alertFilters.some((alertFilter) => matchesAlertFilter(row, alertFilter)))
    && (options.typeFilters.length === 0 || (row.epicType !== null && options.typeFilters.includes(row.epicType)))
    && (options.statusFilters.length === 0 ? !isCancelledStatus(row.currentStatus) : options.statusFilters.includes(row.currentStatus))
    && (!options.dataIssueFilter || row.hasDataAnomaly)
    && (options.requestingUnitFilters.length === 0 || (row.requestingUnit !== null && options.requestingUnitFilters.includes(row.requestingUnit)))
    && (options.ruleGroupFilters.length === 0 || (Boolean(row.ruleGroupName) && options.ruleGroupFilters.includes(row.ruleGroupName!)))
    && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch))
    && matchesMarkFilter(row, options.markFilter, options.markedPmSmFilters, options.viewerOwnerName, options.ignoreHidden ?? false),
  );
}
