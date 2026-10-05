'use client';

import { useMemo, useState } from 'react';
import { CaretDown, CaretRight, SlidersHorizontal } from '@phosphor-icons/react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { DonutChartCard } from '@/components/dashboard-new/DonutChartCard';
import type { EpicAlertsDeepLinkAlert } from '@/lib/epic-alerts-deep-link';
import { vnTodayIso } from '@/lib/epic-row-verdicts';
import { formatTtmPct1, type TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import {
  breakdownIndexes,
  splitWaitingGolive,
  ttmFunnelCnttIndex,
  ttmFunnelLayers,
  type TtmBreakdownDimension,
  type TtmBreakdownItem,
  type TtmFunnelSummary,
} from '@/lib/ttm-funnel-summary';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';

/**
 * TTM Dashboard 2 — the blocks carried over from TTM Dashboard (dashboard-new) and re-based on the
 * funnel criteria (docs/ttm-dashboard-2-spec.md §7): the widget row, "Ma trận Phân bổ Tiến độ Epic Đa
 * chiều" and the pie chart sections. Every number comes from TtmFunnelSummary (cache or recomputed
 * from the filtered rows), so it always agrees with the funnel above it.
 */

/** What a number opens in Quản trị Epic; the page adds its own toolbar filters / viewed user. */
export interface InsightListParams {
  alert?: EpicAlertsDeepLinkAlert | EpicAlertsDeepLinkAlert[];
  dataIssue?: boolean;
  domain?: string;
  pmSm?: string[];
  projects?: string[];
  requestingUnit?: string;
  status?: string[];
  title: string;
  type?: string;
}

type OpenList = (params: InsightListParams) => void;

/** L05ab + L05ba, and L05aa + L05ab + L05ba ("Epic đánh giá"). */
const FAIL_ALERTS: EpicAlertsDeepLinkAlert[] = ['TTM_LATE_IN_SCOPE', 'OVERDUE_MISSING_R4G_IN_SCOPE'];
const JUDGED_ALERTS: EpicAlertsDeepLinkAlert[] = ['TTM_PASS_IN_SCOPE', ...FAIL_ALERTS];
/** "Chậm tiến độ": no R4G Date yet and either warned late or already past Target. */
const LATE_ALERTS: EpicAlertsDeepLinkAlert[] = ['LATE', 'OVERDUE_MISSING_R4G_IN_SCOPE'];

const DIMENSION_LABELS: Record<TtmBreakdownDimension, string> = {
  domain: 'Theo Domain',
  epicType: 'Theo Phân loại Epic',
  pmsm: 'Theo PM/SM',
  project: 'Theo Dự án',
  requestingUnit: 'Theo Đơn vị yêu cầu',
};

const DIMENSION_NOUN: Record<TtmBreakdownDimension, string> = {
  domain: 'Domain',
  epicType: 'Phân loại',
  pmsm: 'PM/SM',
  project: 'Dự án',
  requestingUnit: 'Đơn vị',
};

function fmt(value: number): string {
  return value.toLocaleString('vi-VN');
}

/** Quản trị Epic filter for one value of a dimension (nothing for a "chưa gán" placeholder). */
function dimensionScope(dimension: TtmBreakdownDimension, linkValue: string | null): Partial<InsightListParams> {
  if (!linkValue) return {};
  switch (dimension) {
    case 'domain': return { domain: linkValue };
    case 'epicType': return { type: linkValue };
    case 'pmsm': return { pmSm: linkValue.split(',').map((name) => name.trim()).filter(Boolean) };
    case 'project': return { projects: [linkValue] };
    case 'requestingUnit': return { requestingUnit: linkValue };
    default: return {};
  }
}

// ---------------------------------------------------------------------------------------------
// Widget row
// ---------------------------------------------------------------------------------------------

function IndexRing({ color, label, onClick, subtitle, summary, title, value }: {
  color: string; label: string; onClick?: () => void; subtitle: string; summary: TtmCnttSummary; title: string; value: string | null;
}) {
  const body = (
    <>
      <div
        className="relative flex size-14 shrink-0 items-center justify-center rounded-full"
        style={{ background: value !== null ? `conic-gradient(${color} 0% ${summary.pctPrecise}%, #e4e6eb ${summary.pctPrecise}% 100%)` : '#e4e6eb' }}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-fb-surface text-xs font-extrabold" style={{ color }}>
          {value ?? '—'}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-fb-text-primary">{label}</p>
        <p className="text-[10px] text-fb-text-secondary">{subtitle}</p>
      </div>
    </>
  );
  const className = 'col-span-2 sm:col-span-2 lg:col-span-1 flex items-center justify-start gap-3 rounded-xl border border-fb-border bg-fb-surface p-3 text-left shadow-xs';
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${className} w-full cursor-pointer transition-all hover:border-emerald-400 hover:shadow-sm`}>
      {body}
    </button>
  ) : (
    <div className={className} title={title}>{body}</div>
  );
}

export function KpiStrip({ funnel, onOpen }: { funnel: TtmFunnelSummary; onOpen: OpenList }) {
  const { l2 } = ttmFunnelLayers(funnel);
  const { insights } = funnel;
  const cancelled = funnel.buckets.CANCELLED;
  // `?? 0`: a summary cached before L02 dropped these two groups has no such buckets.
  const blackListed = funnel.buckets.BLACK_LISTED ?? 0;
  const nonTtmProject = funnel.buckets.PROJECT_NON_TTM ?? 0;
  const qlda = ttmFunnelCnttIndex(funnel);
  const { e2e, qa } = insights;
  const waiting = splitWaitingGolive(insights.waitingGolive, vnTodayIso());
  const pctOf = (summary: TtmCnttSummary) => `${formatTtmPct1(summary.pctPrecise)}%`;
  const subLink = 'underline-offset-2 hover:underline cursor-pointer font-bold';

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-fb-text-secondary">
            <button type="button" onClick={() => onOpen({ alert: 'TTM_COUNTED_IN_SCOPE', title: 'Danh sách Epic - Tổng số Epic (trong phạm vi tính TTM)' })} className="hover:underline cursor-pointer uppercase" title="Epic trong phạm vi tính TTM (L02): đã loại Cancelled, Epic ngoại lệ và dự án Time to Market = N — xem danh sách ở Quản trị Epic">
              Tổng số Epic
            </button>
          </p>
          <p className="mt-1 text-xl font-extrabold text-fb-text-primary">{fmt(l2)}</p>
          <p className="text-[10px] text-fb-text-secondary">
            <button
              type="button"
              disabled={cancelled === 0}
              onClick={() => onOpen({ alert: 'IN_SCOPE_CNTT', status: funnel.cancelledStatuses, title: 'Danh sách Epic Cancelled (đã loại khỏi Tổng số Epic)' })}
              className={`${subLink} disabled:cursor-default disabled:no-underline`}
              title="Số Epic có status Cancelled đã loại khỏi Tổng số Epic"
            >
              Trừ Cancelled= {fmt(cancelled)}
            </button>
          </p>
          <p className="text-[10px] text-fb-text-secondary">
            <button
              type="button"
              disabled={blackListed === 0}
              onClick={() => onOpen({ alert: 'TTM_BLACK_LISTED', title: 'Danh sách Epic ngoại lệ (đã loại khỏi Tổng số Epic)' })}
              className={`${subLink} disabled:cursor-default disabled:no-underline`}
              title="Số Epic ngoại lệ (TTM Black listed = true) đã loại khỏi Tổng số Epic"
            >
              Trừ Epic ngoại lệ= {fmt(blackListed)}
            </button>
          </p>
          <p className="text-[10px] text-fb-text-secondary">
            <button
              type="button"
              disabled={nonTtmProject === 0}
              onClick={() => onOpen({ alert: 'TTM_PROJECT_NON_TTM', title: 'Danh sách Epic thuộc dự án Time to Market = N (đã loại khỏi Tổng số Epic)' })}
              className={`${subLink} disabled:cursor-default disabled:no-underline`}
              title="Số Epic thuộc dự án có Time to Market = N đã loại khỏi Tổng số Epic"
            >
              Trừ dự án TTM=N= {fmt(nonTtmProject)}
            </button>
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-status-danger">
            <button type="button" onClick={() => onOpen({ alert: FAIL_ALERTS, title: 'Danh sách Epic - Fail TTM-CNTT (QLDA)' })} className="hover:underline cursor-pointer uppercase" title="Epic không đạt TTM-CNTT: nhóm 1 (R4G Date muộn hơn Target) + nhóm 2 (chưa có R4G Date, đã quá Target)">
              Fail TTM-CNTT (QLDA)
            </button>
          </p>
          <p className="mt-1 text-xl font-extrabold text-status-danger">{fmt(qlda.fail)}</p>
          <p className="text-[10px] font-medium text-red-600">
            <button type="button" onClick={() => onOpen({ alert: JUDGED_ALERTS, title: 'Danh sách Epic đánh giá (Đạt + Fail TTM-CNTT)' })} className={subLink} title="Số Epic đã có kết luận = Đạt + Fail TTM-CNTT">
              /Số Epic= {fmt(qlda.denominator)}
            </button>
          </p>
        </div>

        <IndexRing
          color="#0866ff"
          label="TTM-CNTT (QLDA)"
          summary={qlda}
          value={qlda.denominator > 0 ? pctOf(qlda) : null}
          subtitle={`${fmt(qlda.pass)}/${fmt(qlda.denominator)}`}
          title="Tỷ lệ % Pass TTM-CNTT = Epic đạt / (Epic đạt + Epic không đạt)"
        />
        <IndexRing
          color="#7c3aed"
          label="TTM-CNTT (QA)"
          summary={qa}
          value={qa.total > 0 ? pctOf(qa) : null}
          subtitle={qa.total > 0 ? `${fmt(qa.pass)}/${fmt(qa.denominator)}` : 'Chưa có Epic MVP Done/Released'}
          title="Cùng công thức TTM-CNTT (QLDA), chỉ lấy Epic MVP Done / Released"
        />
        <IndexRing
          color="#059669"
          label="Hoàn thành TTM-E2E"
          summary={e2e}
          value={e2e.total > 0 ? pctOf(e2e) : null}
          subtitle={e2e.total > 0 ? `${fmt(e2e.pass)}/${fmt(e2e.denominator)}` : 'Chưa có Epic'}
          title="Tỷ lệ % Pass TTM-E2E = Epic đạt / (Epic đạt + Epic Fail TTM-E2E) — bấm để xem danh sách Epic Fail TTM-E2E"
          onClick={() => onOpen({ alert: 'FAIL_E2E', title: 'Danh sách Epic - Fail TTM-E2E' })}
        />
      </div>

      <div className="hidden w-px shrink-0 bg-fb-border lg:block" aria-hidden="true" />

      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-status-warning">{insights.scoringEngine ? 'Chậm tiến độ' : 'Cảnh báo (Sớm/Muộn)'}</p>
          <p className="mt-1 text-xl font-extrabold text-status-warning">{fmt(insights.lateWarning + insights.earlyWarning)}</p>
          <p className="text-[10px] font-medium text-amber-700">
            <button type="button" onClick={() => onOpen({ alert: 'LATE', title: 'Danh sách Epic - Chậm tiến độ' })} className={subLink} title="Xem danh sách Epic Chậm tiến độ ở Quản trị Epic">
              {fmt(insights.lateWarning)} muộn
            </button>
            {!insights.scoringEngine && ' · '}
            {!insights.scoringEngine && (
              <button type="button" onClick={() => onOpen({ alert: 'EARLY', title: 'Danh sách Epic - Cảnh báo sớm' })} className={subLink} title="Xem danh sách Epic Cảnh báo sớm ở Quản trị Epic">
                {fmt(insights.earlyWarning)} sớm
              </button>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpen({ dataIssue: true, title: 'Danh sách Epic - Sai lệch Dữ liệu' })}
          className="block w-full cursor-pointer rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-left shadow-xs transition-all hover:border-purple-400 hover:shadow-sm"
          title="Xem danh sách Epic sai lệch dữ liệu ở Quản trị Epic"
        >
          <p className="text-[10px] font-bold uppercase text-purple-700">Sai lệch Dữ liệu</p>
          <p className="mt-1 text-xl font-extrabold text-purple-700">{fmt(insights.anomalyCount)}</p>
          <p className="text-[10px] font-medium text-purple-600">Vi phạm rule chất lượng dữ liệu</p>
        </button>

        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-sky-700">
            <button type="button" onClick={() => onOpen({ alert: 'WAITING_GOLIVE', title: 'Danh sách Epic - Chờ golive' })} className="hover:underline cursor-pointer uppercase" title="Xem danh sách Epic Chờ golive ở Quản trị Epic">
              Chờ golive
            </button>
          </p>
          <p className="mt-1 text-xl font-extrabold text-sky-700">{fmt(insights.waitingGolive.total)}</p>
          <p className="flex flex-wrap gap-x-1.5 text-[10px] font-medium text-sky-700">
            <button type="button" onClick={() => onOpen({ alert: 'WAITING_GOLIVE_MISSING_R4G', title: 'Danh sách Epic - Chờ golive: Thiếu R4G Date' })} className={subLink} title="Epic Chờ golive nhưng thiếu R4G Date">
              {fmt(waiting.missingR4g)} thiếu R4G
            </button>
            ·
            <button type="button" onClick={() => onOpen({ alert: 'WAITING_GOLIVE_WITHIN_GRACE', title: 'Danh sách Epic - Chờ golive: Trong hạn' })} className={subLink} title="Epic Chờ golive còn trong hạn R4G Date + 5 ngày làm việc">
              {fmt(waiting.withinGrace)} trong hạn
            </button>
            ·
            <button type="button" onClick={() => onOpen({ alert: 'WAITING_GOLIVE_OVERDUE', title: 'Danh sách Epic - Chờ golive: Quá hạn' })} className={subLink} title="Epic Chờ golive đã quá hạn R4G Date + 5 ngày làm việc">
              {fmt(waiting.overdue)} quá hạn
            </button>
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpen({ alert: 'JUSTIFY_GOLIVE', title: 'Danh sách Epic - Cần Giải trình Golive' })}
          className="block w-full cursor-pointer rounded-xl border border-red-200 bg-red-50/50 p-3 text-left shadow-xs transition-all hover:border-red-400 hover:shadow-sm"
          title="Xem danh sách Epic cần Giải trình Golive ở Quản trị Epic"
        >
          <p className="text-[10px] font-bold uppercase text-status-danger">Giải trình Golive</p>
          <p className="mt-1 text-xl font-extrabold text-status-danger">{fmt(insights.justifyGolive)}</p>
          <p className="text-[10px] font-medium text-red-600">Quá hạn R4G Date + 5 ngày</p>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Ma trận Phân bổ Tiến độ Epic Đa chiều
// ---------------------------------------------------------------------------------------------

type MatrixDimension = Exclude<TtmBreakdownDimension, 'requestingUnit'>;
type MatrixSortKey = 'anomaly' | 'fail' | 'judged' | 'late' | 'name' | 'ok' | 'pass' | 'qaPct' | 'qldaPct' | 'total';

function matrixSortValue(item: TtmBreakdownItem, key: MatrixSortKey): number | string | null {
  const { qa, qlda } = breakdownIndexes(item);
  switch (key) {
    case 'name': return item.name;
    case 'total': return item.total;
    case 'pass': return item.pass;
    case 'qldaPct': return qlda.pctPrecise;
    case 'judged': return qlda.denominator;
    case 'fail': return item.fail;
    case 'qaPct': return item.qaTotal > 0 ? qa.pctPrecise : null;
    case 'anomaly': return item.anomaly;
    case 'ok': return item.ok;
    case 'late': return item.late;
    default: return null;
  }
}

export function BreakdownMatrixCard({ dimensions, funnel, onOpen }: { dimensions: readonly MatrixDimension[]; funnel: TtmFunnelSummary; onOpen: OpenList }) {
  const [selected, setSelected] = useState<MatrixDimension>(dimensions[0]);
  // PM/SM view offers fewer tabs — fall back to its first one when the selected tab is not offered.
  const dimension = dimensions.includes(selected) ? selected : dimensions[0];
  const { sortKey, sortDirection, toggleSort, directionFor } = useSortableList<MatrixSortKey>('qldaPct', 'desc');
  const items = useMemo(
    () => [...funnel.insights.breakdowns[dimension]]
      .filter((item) => item.total > 0)
      .sort((a, b) => compareValues(matrixSortValue(a, sortKey), matrixSortValue(b, sortKey), sortDirection)),
    [funnel, dimension, sortKey, sortDirection],
  );
  const open = (item: TtmBreakdownItem, params: Omit<InsightListParams, 'title'>, label: string) => onOpen({ ...dimensionScope(dimension, item.linkValue), ...params, title: `${label} - ${item.name}` });
  const numberButton = 'cursor-pointer font-bold inline-block px-1.5 py-0.5 rounded-sm hover:underline transition-colors';

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-fb-border pb-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-fb-blue" weight="bold" />
            Ma trận Phân bổ Tiến độ Epic Đa chiều
          </CardTitle>
          <p className="mt-0.5 text-xs text-fb-text-secondary">Bảng phân tích tỷ lệ Pass/Fail &amp; Tiến độ Epic theo từng chiều dữ liệu — cùng tiêu chí với phễu</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-fb-border bg-fb-surface-muted p-1">
          {dimensions.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${dimension === key ? 'bg-fb-blue text-white shadow-xs' : 'text-fb-text-secondary hover:text-fb-text-primary'}`}
            >
              {DIMENSION_LABELS[key]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH sortDirection={directionFor('name')} onClick={() => toggleSort('name')}>{DIMENSION_LABELS[dimension]}</TH>
                <TH className="text-center" sortDirection={directionFor('total')} onClick={() => toggleSort('total')} title="Epic trong phạm vi tính TTM (L02): đã loại Cancelled, Epic ngoại lệ và dự án Time to Market = N">Tổng số Epic</TH>
                <TH className="text-center" sortDirection={directionFor('pass')} onClick={() => toggleSort('pass')} title="Epic đạt TTM-CNTT (L05aa)">Pass TTM</TH>
                <TH className="w-56" sortDirection={directionFor('qldaPct')} onClick={() => toggleSort('qldaPct')} title="Tỷ lệ % Pass TTM-CNTT = Pass TTM / Epic đánh giá">TTM-CNTT (QLDA)</TH>
                <TH className="text-center" sortDirection={directionFor('judged')} onClick={() => toggleSort('judged')} title="Epic đã có kết luận = L05aa + L05ab + L05ba (Pass TTM + Fail TTM)">Epic đánh giá</TH>
                <TH className="text-center" sortDirection={directionFor('fail')} onClick={() => toggleSort('fail')} title="Epic không đạt TTM-CNTT = L05ab + L05ba">Fail TTM</TH>
                <TH className="w-40" sortDirection={directionFor('qaPct')} onClick={() => toggleSort('qaPct')}>TTM-CNTT (QA)</TH>
                <TH className="text-center" sortDirection={directionFor('anomaly')} onClick={() => toggleSort('anomaly')} title="Epic Sai lệch dữ liệu (L02 − L03) — chưa được chấm TTM-CNTT, không tính vào Đúng / Chậm tiến độ">Sai lệch dữ liệu</TH>
                <TH className="text-center" sortDirection={directionFor('ok')} onClick={() => toggleSort('ok')} title="Epic chưa có R4G Date, không Sai lệch dữ liệu và chưa bị cảnh báo">Đúng tiến độ</TH>
                <TH className="text-center" sortDirection={directionFor('late')} onClick={() => toggleSort('late')}>Chậm tiến độ</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => {
                const { qa, qlda } = breakdownIndexes(item);
                const hasVerdict = qlda.denominator > 0;
                return (
                  <TR key={`${item.linkValue ?? ''}|${item.name}`}>
                    <TD className="font-bold text-fb-text-primary">
                      <button type="button" onClick={() => open(item, { alert: 'IN_SCOPE_CNTT' }, 'Danh sách Epic')} className="cursor-pointer text-left font-bold text-fb-text-primary hover:text-fb-blue hover:underline" title={`Xem tất cả Epic của ${item.name}`}>
                        {item.name}
                      </button>
                    </TD>
                    <TD className="text-center font-semibold">
                      <button type="button" onClick={() => open(item, { alert: 'TTM_COUNTED_IN_SCOPE' }, 'Danh sách Epic (Tổng số Epic)')} className={`${numberButton} text-fb-blue hover:bg-blue-50`} title={`Xem tất cả Epic của ${item.name}`}>
                        {fmt(item.total)}
                      </button>
                    </TD>
                    <TD className="text-center font-semibold text-status-success">
                      <button type="button" onClick={() => open(item, { alert: 'TTM_PASS_IN_SCOPE' }, 'Danh sách Epic Pass TTM')} className={`${numberButton} text-status-success hover:bg-emerald-50`} title={`Xem các Epic đạt TTM-CNTT của ${item.name}`}>
                        {fmt(item.pass)}
                      </button>
                    </TD>
                    <TD>
                      {hasVerdict ? (
                        <button type="button" onClick={() => open(item, { alert: JUDGED_ALERTS }, 'Danh sách Epic đánh giá')} className="group flex w-full cursor-pointer items-center gap-2 transition-opacity hover:opacity-80" title={`Tỷ lệ % Pass TTM-CNTT của ${item.name}: ${fmt(item.pass)}/${fmt(qlda.denominator)}`}>
                          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-fb-control">
                            <div style={{ width: `${qlda.pct}%` }} className="h-full bg-status-success" />
                            <div style={{ width: `${100 - qlda.pct}%` }} className="h-full bg-status-danger" />
                          </div>
                          <span className="w-9 text-right text-xs font-bold text-fb-text-primary group-hover:underline">{qlda.pct}%</span>
                        </button>
                      ) : (
                        <span className="text-xs text-fb-text-placeholder">— Chưa có Epic đánh giá</span>
                      )}
                    </TD>
                    <TD className="text-center font-semibold">
                      <button type="button" onClick={() => open(item, { alert: JUDGED_ALERTS }, 'Danh sách Epic đánh giá')} className={`${numberButton} text-fb-blue hover:bg-blue-50`} title={`Xem các Epic đã có kết luận (Pass + Fail) của ${item.name}`}>
                        {fmt(qlda.denominator)}
                      </button>
                    </TD>
                    <TD className="text-center font-semibold text-status-danger">
                      <button type="button" onClick={() => open(item, { alert: FAIL_ALERTS }, 'Danh sách Epic Fail TTM')} className={`${numberButton} text-status-danger hover:bg-red-50`} title={`Xem các Epic không đạt TTM-CNTT của ${item.name}`}>
                        {fmt(item.fail)}
                      </button>
                      {item.fail > 0 && (
                        <p className="whitespace-nowrap text-[10px] font-medium text-fb-text-secondary">
                          <button type="button" onClick={() => open(item, { alert: 'TTM_LATE_IN_SCOPE' }, 'Danh sách Epic Fail TTM: Trễ R4G')} className="cursor-pointer underline-offset-2 hover:underline" title="Nhóm 1 — có R4G Date nhưng muộn hơn Target">
                            {fmt(item.failLateR4g)} Trễ R4G
                          </button>
                          {' · '}
                          <button type="button" onClick={() => open(item, { alert: 'OVERDUE_MISSING_R4G_IN_SCOPE' }, 'Danh sách Epic Fail TTM: Thiếu R4G')} className="cursor-pointer underline-offset-2 hover:underline" title="Nhóm 2 — chưa có R4G Date và đã quá Target">
                            {fmt(item.fail - item.failLateR4g)} Thiếu R4G
                          </button>
                        </p>
                      )}
                    </TD>
                    <TD>
                      {item.qaTotal > 0 ? (
                        <button type="button" onClick={() => open(item, { status: ['MVP Done', 'Released'] }, 'Danh sách Epic QA (MVP Done / Released)')} className="group flex w-full cursor-pointer flex-col gap-0.5 text-left transition-opacity hover:opacity-80" title={`Xem các Epic MVP Done / Released của ${item.name}`}>
                          <div className="flex items-center gap-2">
                            <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-fb-control">
                              <div style={{ width: `${qa.pct}%` }} className="h-full bg-purple-600" />
                              <div style={{ width: `${100 - qa.pct}%` }} className="h-full bg-status-danger" />
                            </div>
                            <span className="w-9 text-right text-xs font-bold text-purple-700 group-hover:underline">{qa.pct}%</span>
                          </div>
                          <p className="text-[10px] text-fb-text-secondary group-hover:underline">{fmt(item.qaPass)}/{fmt(qa.denominator)} Epic MVP Done/Released</p>
                        </button>
                      ) : (
                        <span className="text-xs text-fb-text-placeholder">— Chưa có Epic MVP Done/Released</span>
                      )}
                    </TD>
                    <TD className="text-center font-semibold text-purple-700">
                      <button type="button" onClick={() => open(item, { alert: 'DATA_ANOMALY_IN_SCOPE' }, 'Danh sách Epic Sai lệch dữ liệu')} className={`${numberButton} text-purple-700 hover:bg-purple-50`} title={`Xem các Epic Sai lệch dữ liệu của ${item.name}`}>
                        {fmt(item.anomaly)}
                      </button>
                    </TD>
                    {/* No list behind this one: no "Nhận xét" filter matches exactly this set. */}
                    <TD className="text-center font-semibold text-fb-text-primary" title={`Epic của ${item.name} chưa có R4G Date, không Sai lệch dữ liệu và chưa bị cảnh báo`}>
                      {fmt(item.ok)}
                    </TD>
                    <TD className="text-center font-semibold text-status-warning">
                      <button type="button" onClick={() => open(item, { alert: LATE_ALERTS }, 'Danh sách Epic chậm tiến độ')} className={`${numberButton} text-status-warning hover:bg-amber-50`} title={`Epic chưa có R4G Date của ${item.name} đang Cảnh báo muộn hoặc đã quá Target`}>
                        {fmt(item.late)}
                      </button>
                    </TD>
                  </TR>
                );
              })}
              {items.length === 0 && (
                <TR>
                  <TD colSpan={10} className="py-6 text-center text-xs text-fb-text-secondary">Không có Epic trong phạm vi đang xem.</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </TableContainer>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Pie chart sections
// ---------------------------------------------------------------------------------------------

const SECTION_TITLES: Record<TtmBreakdownDimension, string> = {
  domain: 'Theo Domain nghiệp vụ',
  epicType: 'Theo Phân loại Epic',
  pmsm: 'Theo PM/SM',
  project: 'Theo Dự án',
  requestingUnit: 'Theo Đơn vị yêu cầu',
};

export function BreakdownDonutSections({ dimensions, funnel, onOpen }: { dimensions: readonly TtmBreakdownDimension[]; funnel: TtmFunnelSummary; onOpen: OpenList }) {
  // "Theo Phân loại Epic" starts expanded, the others collapsed — same as TTM Dashboard.
  const [openSections, setOpenSections] = useState<Partial<Record<TtmBreakdownDimension, boolean>>>({ epicType: true });

  return (
    <>
      {dimensions.map((dimension) => {
        const items = funnel.insights.breakdowns[dimension];
        const isOpen = Boolean(openSections[dimension]);
        // A slice is named after its item; "Khác.." (the merged tail) carries no dimension filter.
        const scopeOf = (name: string) => dimensionScope(dimension, items.find((item) => item.name === name)?.linkValue ?? null);
        const open = (name: string, alert: InsightListParams['alert'], label: string) => onOpen({ ...scopeOf(name), alert, title: `${label} - ${DIMENSION_NOUN[dimension]}: ${name}` });
        return (
          <div key={dimension} className="mb-4 border-t border-slate-300 pt-3">
            <button
              type="button"
              onClick={() => setOpenSections((prev) => ({ ...prev, [dimension]: !prev[dimension] }))}
              aria-expanded={isOpen}
              className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-bold text-black transition-colors hover:text-[#1463f7]"
            >
              {isOpen ? <CaretDown className="size-4 text-[#1463f7]" weight="bold" /> : <CaretRight className="size-4 text-[#1463f7]" weight="bold" />}
              <span>{SECTION_TITLES[dimension]}</span>
            </button>
            {isOpen && (
              <div className="mt-3 border-l-2 border-[#1463f7] pl-3 pt-1">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <DonutChartCard
                    title="% Tổng số Epic"
                    data={items.map((item) => ({ name: item.name, value: item.total }))}
                    onItemClick={(item) => open(item.name, 'TTM_COUNTED_IN_SCOPE', 'Danh sách Epic')}
                  />
                  <DonutChartCard
                    title="% Pass TTM"
                    data={items.map((item) => ({ name: item.name, value: item.pass }))}
                    emptyMessage="Không có Epic đạt TTM"
                    onItemClick={(item) => open(item.name, 'TTM_PASS_IN_SCOPE', 'Danh sách Epic Pass TTM')}
                  />
                  <DonutChartCard
                    title="% Fail TTM"
                    data={items.map((item) => ({ name: item.name, value: item.fail }))}
                    emptyMessage="Không có Epic Fail TTM"
                    onItemClick={(item) => open(item.name, FAIL_ALERTS, 'Danh sách Epic Fail TTM')}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
