import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { summarizeTtmCntt, type TtmCnttSummary } from '@/lib/ttm-cntt-qa';

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04) — pure part: the two TTM-CNTT (QLDA) ratios and the list of Epics that
 * fail when judged from their real start date. Rows come from epic_alert_row_cache (newest data layer, viewer's
 * scope); the Scoring Service already judged each "Start sớm" Epic a second time (row.scoringEarlyStart).
 */

export type EarlyStartReportRow = Pick<EpicAlertRowPhased,
  'alertLevel' | 'currentStatus' | 'dataLayerDate' | 'domainName' | 'dueDate' | 'epicKey' | 'epicName' | 'hasDataAnomaly'
  | 'ownerName' | 'projectKey' | 'r4gDate' | 'ruleGroupName' | 'scoringEarlyStart' | 'scoringIndexFlags' | 't0IdeaApprovedDate'
  | 't1StartDate' | 'ttmBlackListed' | 'ttmCnttInScope' | 'ttmExclusion'>;

export interface EarlyStartFailEpic {
  epicKey: string;
  summary: string;
  projectKey: string;
  domainName: string;
  /** PM/SM of the Epic's project (comma-joined). */
  ownerName: string;
  status: string;
  ideaApprovedDate: string | null;
  startDate: string;
  realStartDate: string;
  /** Start Date − Epic_Real_Start_Date, calendar days. */
  daysEarly: number;
  /** Target_CNTT counted from the real start date. */
  earlyTargetDate: string | null;
  r4gDate: string | null;
  releasedDate: string | null;
  ttmBlackListed: boolean;
  ruleGroupName: string | null;
}

export interface EarlyStartReport {
  /** TTM-CNTT (QLDA) as every screen shows it. */
  current: TtmCnttSummary;
  /** Same ratio with the "Start sớm" Epics judged from Epic_Real_Start_Date. */
  earlyStart: TtmCnttSummary;
  /** "Start sớm" Epics counted in TTM-CNTT (QLDA) that fail when judged from their real start date. */
  failedEpics: EarlyStartFailEpic[];
  /** Newest data layer among the rows, and when the cache was built. */
  dataLayerDate: string | null;
  computedAt: string | null;
}

/** The row's TTM-CNTT (QLDA) flags when judged from the real start date; QA flags stay untouched. */
export function earlyStartIndexFlags(row: Pick<EarlyStartReportRow, 'scoringEarlyStart' | 'scoringIndexFlags'>): string[] | undefined {
  const early = row.scoringEarlyStart;
  if (!early || !row.scoringIndexFlags) return row.scoringIndexFlags;
  const flags = row.scoringIndexFlags.filter((flag) => !flag.startsWith('TTM_'));
  if (early.ttm.counted) flags.push('TTM_COUNTED');
  if (early.ttm.eligible) flags.push('TTM_ELIGIBLE');
  if (early.ttm.pass) flags.push('TTM_PASS');
  if (early.ttm.fail) flags.push('TTM_FAIL');
  return flags;
}

function isReleased(status: string): boolean {
  return (status ?? '').trim().toUpperCase() === 'RELEASED';
}

/** Domain A→Z, then project key A→Z, then the biggest gap first (owner 2026-11-04); Epic key keeps the order stable. */
export function compareEarlyStartFailEpics(a: EarlyStartFailEpic, b: EarlyStartFailEpic): number {
  return a.domainName.localeCompare(b.domainName, 'vi')
    || a.projectKey.localeCompare(b.projectKey)
    || b.daysEarly - a.daysEarly
    || a.epicKey.localeCompare(b.epicKey, undefined, { numeric: true });
}

export function buildEarlyStartReport(rows: readonly EarlyStartReportRow[], computedAt: string | null): EarlyStartReport {
  const failedEpics: EarlyStartFailEpic[] = [];
  for (const row of rows) {
    const early = row.scoringEarlyStart;
    if (!early || row.ttmExclusion || !early.ttm.counted || !early.ttm.fail) continue;
    failedEpics.push({
      epicKey: row.epicKey,
      summary: row.epicName,
      projectKey: row.projectKey,
      domainName: row.domainName ?? '',
      ownerName: row.ownerName ?? '',
      status: row.currentStatus,
      ideaApprovedDate: row.t0IdeaApprovedDate,
      startDate: early.startDate,
      realStartDate: early.realStartDate,
      daysEarly: early.daysEarly,
      earlyTargetDate: early.cnttTargetDate,
      r4gDate: row.r4gDate,
      // Same rule as "Báo cáo Epic": a Released Epic's Due Date, else its R4G Date.
      releasedDate: isReleased(row.currentStatus) ? (row.dueDate || row.r4gDate || null) : null,
      ttmBlackListed: Boolean(row.ttmBlackListed),
      ruleGroupName: row.ruleGroupName ?? null,
    });
  }
  failedEpics.sort(compareEarlyStartFailEpics);
  const dataLayerDate = rows.reduce<string | null>((latest, row) => (row.dataLayerDate && (!latest || row.dataLayerDate > latest) ? row.dataLayerDate : latest), null);
  return {
    current: summarizeTtmCntt([...rows]),
    earlyStart: summarizeTtmCntt(rows.map((row) => ({ ...row, scoringIndexFlags: earlyStartIndexFlags(row) }))),
    failedEpics,
    dataLayerDate,
    computedAt,
  };
}
