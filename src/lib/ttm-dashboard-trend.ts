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

/** What the dashboard API sends for the viewer's scope. */
export interface TtmDashboardTrend {
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

/** "So với 02/11/2026: " */
export function trendHead(comparedLayerDate: string): string {
  const [year, month, day] = comparedLayerDate.slice(0, 10).split('-');
  return `So với ${day}/${month}/${year}: `;
}
