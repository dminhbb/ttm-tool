import { daysBefore, weekMonday } from '@/lib/data-layer-retention';
import { ttmFunnelBucket } from '@/lib/epic-row-verdicts';
import { hasTtmVerdict } from '@/lib/ttm-cntt-qa';
import { ttmFunnelCnttIndex, type TtmFunnelSummary } from '@/lib/ttm-funnel-summary';

/**
 * TTM Dashboard 2 — "So với <ngày>" ticker (owner 2026-11-03). Pure: the six widget numbers of a funnel summary and the
 * sentences comparing two of them. The numbers are exactly the widgets' own (KpiStrip): Fail TTM-CNTT (Phạm vi của
 * QLDA), Thiếu lý do (Khâu fail + Chịu TN chính), TTM-CNTT (QLDA) %, TTM-E2E %, Sai lệch dữ liệu, Chờ golive (total).
 */

export interface TtmTrendValues {
  failCntt: number;
  missingReason: number;
  /** null while no Epic has a verdict (the widget shows "—"). */
  ttmCnttPct: number | null;
  e2ePct: number | null;
  anomaly: number;
  waitingGolive: number;
}

/** One chart point / comparison day: the numbers of a data layer date, as frozen in ttm_dashboard_metric_history. */
export interface TtmTrendPoint {
  /** "YYYY-MM-DD". */
  date: string;
  values: TtmTrendValues;
}

/** What the dashboard API sends for the viewer's scope. */
export interface TtmDashboardTrend {
  /** Company view only (the API leaves it out elsewhere): the chart points, oldest first — every 5th data layer back from the newest, 7 at most. */
  series?: TtmTrendPoint[];
  /** Company view only: the last data day of the previous week / month (null when the history has none that old). */
  weekRef?: TtmTrendPoint | null;
  monthRef?: TtmTrendPoint | null;
  /** "YYYY-MM-DD" — the past layer compared with the newest. */
  comparedLayerDate: string;
  latestLayerDate: string;
  computedAt: string;
  current: TtmTrendValues;
  previous: TtmTrendValues;
  /** How many Epics are Fail TTM-CNTT now but were not on the compared layer (the brown sentence's list). */
  newFailCount: number;
}

/** A row counted in widget Fail TTM-CNTT (Phạm vi của QLDA): funnel leaves L05ab + L05ba — the very two
 * `ttmFunnelCnttIndex(...).fail` adds up. */
export function isFunnelCnttFail(row: Parameters<typeof ttmFunnelBucket>[0]): boolean {
  const bucket = ttmFunnelBucket(row);
  return bucket === 'R4G_LATE' || bucket === 'NO_R4G_OVERDUE';
}

/** Scope keys of the dashboard caches — the only values the Quản trị Epic drill-down accepts. */
export const TREND_SCOPE_KEY = /^(ALL|ADMIN:\d+|USER:\d+)$/;

export function trendValuesOf(summary: TtmFunnelSummary): TtmTrendValues {
  const qlda = ttmFunnelCnttIndex(summary);
  const { insights } = summary;
  return {
    anomaly: insights.anomalyCount,
    e2ePct: hasTtmVerdict(insights.e2e) ? insights.e2e.pctPrecise : null,
    failCntt: qlda.fail,
    missingReason: (insights.missingFailReason ?? 0) + (insights.missingResponsibleDepartment ?? 0),
    ttmCnttPct: hasTtmVerdict(qlda) ? qlda.pctPrecise : null,
    waitingGolive: insights.waitingGolive.total,
  };
}

const COUNT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "Số lượng … tăng 3 epic." / "… giảm 2 epic." / "… vẫn là 15 epic." (unchanged → the current value). */
function countSentence(subject: string, current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return `${subject} vẫn là ${COUNT.format(current)} epic.`;
  return `${subject} ${delta > 0 ? 'tăng' : 'giảm'} ${COUNT.format(Math.abs(delta))} epic.`;
}

/** Percentage-point change rounded to 2 decimals ("giảm 1,65%"); left out when either day has no verdict. */
function percentSentence(subject: string, current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) return null;
  const delta = Math.round((current - previous) * 100) / 100;
  if (delta === 0) return `${subject} vẫn là ${PERCENT.format(Math.round(current * 100) / 100)}%.`;
  return `${subject} ${delta > 0 ? 'tăng' : 'giảm'} ${PERCENT.format(Math.abs(delta))}%.`;
}

/** The ticker's sentences, in widget order. */
export function buildTrendSentences(current: TtmTrendValues, previous: TtmTrendValues): string[] {
  return [
    countSentence('Số lượng Epic Fail TTM-CNTT', current.failCntt, previous.failCntt),
    countSentence('Số lượng Epic fail TTM thiếu lý do', current.missingReason, previous.missingReason),
    percentSentence('Chỉ số TTM-CNTT', current.ttmCnttPct, previous.ttmCnttPct),
    percentSentence('Chỉ số TTM-E2E', current.e2ePct, previous.e2ePct),
    countSentence('Số lượng Epic sai lệch dữ liệu', current.anomaly, previous.anomaly),
    countSentence('Số lượng Epic chờ golive', current.waitingGolive, previous.waitingGolive),
  ].filter((sentence): sentence is string => sentence !== null);
}

/** Layers between two chart points, and how many points the chart has. */
export const TREND_SERIES_STEP = 5;
export const TREND_SERIES_POINTS = 7;

/** Days of history kept (ttm_dashboard_metric_history rows older than this are deleted by the cache refresh). */
export const TREND_HISTORY_RETENTION_DAYS = 400;

/** The chart's data layer dates, oldest first: positions 0, 5, 10 … 30 of the newest-first `layers` (those that exist). */
export function pickSeriesDates(layers: readonly string[]): string[] {
  const dates: string[] = [];
  for (let position = 0; position < TREND_SERIES_POINTS; position += 1) {
    const date = layers[position * TREND_SERIES_STEP];
    if (date === undefined) break;
    dates.push(date);
  }
  return dates.reverse();
}

/** Last day of the month before the one `iso` falls in. */
function previousMonthEnd(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

/**
 * The comparison days of the two extra messages (owner 2026-11-03): the last data date of the previous week (Monday–Sunday)
 * and of the previous month. A week or month with no data date simply gives way to the one before it — the latest data
 * date that is not after the end of that week / month, so the search walks back by itself. `dates` = every data date there
 * is (any order); null when none is that old.
 */
export function referenceDates(latest: string, dates: readonly string[]): { month: string | null; week: string | null } {
  const lastOnOrBefore = (limit: string): string | null => dates.reduce<string | null>((best, date) => (date <= limit && (best === null || date > best) ? date : best), null);
  return {
    month: lastOnOrBefore(previousMonthEnd(latest)),
    week: lastOnOrBefore(daysBefore(weekMonday(latest), 1)),
  };
}

const viDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function countPhrase(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return `vẫn là ${COUNT.format(current)} epic`;
  return `${delta > 0 ? 'tăng' : 'giảm'} ${COUNT.format(Math.abs(delta))} epic`;
}

function percentPhrase(current: number, previous: number): string {
  const delta = Math.round((current - previous) * 100) / 100;
  if (delta === 0) return `vẫn là ${PERCENT.format(Math.round(current * 100) / 100)}%`;
  return `${delta > 0 ? 'tăng' : 'giảm'} ${PERCENT.format(Math.abs(delta))}%`;
}

/**
 * "So với tuần trước (29/10/2026): Số lượng Epic Fail TTM-CNTT tăng 2 epic; Chỉ số TTM-CNTT giảm 1,2%." The percentage
 * clause is left out when either day has no verdict.
 */
export function buildReferenceSentence(label: 'tháng trước' | 'tuần trước', reference: TtmTrendPoint, current: TtmTrendValues): string {
  const parts = [`Số lượng Epic Fail TTM-CNTT ${countPhrase(current.failCntt, reference.values.failCntt)}`];
  if (current.ttmCnttPct !== null && reference.values.ttmCnttPct !== null) parts.push(`Chỉ số TTM-CNTT ${percentPhrase(current.ttmCnttPct, reference.values.ttmCnttPct)}`);
  return `So với ${label} (${viDate(reference.date)}): ${parts.join('; ')}.`;
}

/** "So với 02/11/2026: " */
export function trendHead(comparedLayerDate: string): string {
  const [year, month, day] = comparedLayerDate.slice(0, 10).split('-');
  return `So với ${day}/${month}/${year}: `;
}
