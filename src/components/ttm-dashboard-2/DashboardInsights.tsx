'use client';

import { useMemo, useState } from 'react';
import {
  Bell,
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  SlidersHorizontal,
  Warning,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { DonutChartCard } from '@/components/dashboard-new/DonutChartCard';
import type { EpicAlertsDeepLinkAlert } from '@/lib/epic-alerts-deep-link';
import { vnTodayIso } from '@/lib/epic-row-verdicts';
import { formatTtmPct1, hasTtmVerdict, type TtmCnttSummary } from '@/lib/ttm-cntt-qa';
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
    case 'pmsm': return { pmSm: [linkValue] };
    case 'project': return { projects: [linkValue] };
    case 'requestingUnit': return { requestingUnit: linkValue };
    default: return {};
  }
}

// ---------------------------------------------------------------------------------------------
// Widget row
// ---------------------------------------------------------------------------------------------

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtitle: React.ReactNode;
  icon?: React.ReactNode;
  bgColor: string;
  borderColor: string;
  hoverBorderColor?: string;
  onClick?: () => void;
  tooltip?: string;
  valueClassName?: string;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  bgColor,
  borderColor,
  hoverBorderColor = 'hover:border-slate-300',
  onClick,
  tooltip,
  valueClassName,
}: KpiCardProps) {
  const isClickable = Boolean(onClick);

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      title={tooltip}
      className={cn(
        'group relative flex items-center gap-1.5 xl:gap-2 rounded-[14px] xl:rounded-[16px] px-2 py-1.5 xl:px-2.5 xl:py-2 text-left transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.02)] h-full min-w-0 select-none',
        bgColor,
        borderColor,
        isClickable ? `cursor-pointer hover:shadow-xs ${hoverBorderColor}` : ''
      )}
    >
      {icon}
      <div className="flex flex-col min-w-0 flex-1 justify-center">
        <span className="text-[7px] xl:text-[7.5px] 2xl:text-[8px] font-bold uppercase tracking-wider text-[#274c77] whitespace-nowrap overflow-hidden text-ellipsis">
          {title}
        </span>
        <span
          className={cn(
            'font-extrabold text-[#1e293b] leading-tight whitespace-nowrap overflow-hidden text-ellipsis',
            valueClassName || 'text-[11px] sm:text-[12px] xl:text-[13px] 2xl:text-[14px]'
          )}
        >
          {value}
        </span>
        <span className="text-[6.5px] xl:text-[7px] 2xl:text-[7.5px] font-medium text-[#718096] whitespace-nowrap overflow-hidden text-ellipsis">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

function KpiIconBadge({
  icon: IconComponent,
  bgColor,
  iconColor,
}: {
  icon: Icon;
  bgColor: string;
  iconColor: string;
}) {
  return (
    <div
      className={cn(
        'flex size-[28px] xl:size-[30px] 2xl:size-[32px] items-center justify-center rounded-full shrink-0 shadow-2xs',
        bgColor
      )}
    >
      <IconComponent className={cn('size-3 xl:size-3.5', iconColor)} weight="fill" />
    </div>
  );
}

function KpiProgressRing({
  pct,
  color,
  bgColor,
  text,
  size = 30,
  strokeWidth = 2.5,
}: {
  pct: number;
  color: string;
  bgColor: string;
  text: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.max(0, Math.min(100, isNaN(pct) ? 0 : pct));
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[6.5px] xl:text-[7px] font-bold tracking-tighter select-none"
        style={{ color }}
      >
        {text}
      </span>
    </div>
  );
}

export function KpiStrip({ funnel, onOpen }: { funnel: TtmFunnelSummary; onOpen: OpenList }) {
  const { l2 } = ttmFunnelLayers(funnel);
  const { insights } = funnel;
  const qlda = ttmFunnelCnttIndex(funnel);
  const { e2e, qa } = insights;
  const waiting = splitWaitingGolive(insights.waitingGolive, vnTodayIso());
  const pctOf = (summary: TtmCnttSummary) => `${formatTtmPct1(summary.pctPrecise)}%`;

  const warningSubtitle = !insights.scoringEngine ? (
    <span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ alert: 'LATE', title: 'Danh sách Epic - Chậm tiến độ' });
        }}
        className="hover:underline cursor-pointer"
        title="Xem danh sách Epic Chậm tiến độ"
      >
        {fmt(insights.lateWarning)} muộn
      </span>
      {' · '}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ alert: 'EARLY', title: 'Danh sách Epic - Cảnh báo sớm' });
        }}
        className="hover:underline cursor-pointer"
        title="Xem danh sách Epic Cảnh báo sớm"
      >
        {fmt(insights.earlyWarning)} sớm
      </span>
    </span>
  ) : (
    `${fmt(insights.lateWarning)} muộn`
  );

  const waitingSubtitle = (
    <span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ alert: 'WAITING_GOLIVE_MISSING_R4G', title: 'Danh sách Epic - Chờ golive: Thiếu R4G Date' });
        }}
        className="hover:underline cursor-pointer"
        title="Epic Chờ golive nhưng thiếu R4G Date"
      >
        {fmt(waiting.missingR4g)} thiếu
      </span>
      {' · '}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ alert: 'WAITING_GOLIVE_WITHIN_GRACE', title: 'Danh sách Epic - Chờ golive: Trong hạn' });
        }}
        className="hover:underline cursor-pointer"
        title="Epic Chờ golive còn trong hạn R4G Date + 5 ngày làm việc"
      >
        {fmt(waiting.withinGrace)} hạn
      </span>
      {' · '}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ alert: 'WAITING_GOLIVE_OVERDUE', title: 'Danh sách Epic - Chờ golive: Quá hạn' });
        }}
        className={`${waiting.overdue > 0 ? 'font-bold underline' : ''} hover:underline cursor-pointer`}
        title="Epic Chờ golive đã quá hạn R4G Date + 5 ngày làm việc"
      >
        {fmt(waiting.overdue)} quá
      </span>
    </span>
  );

  return (
    <div className="rounded-2xl border border-[#d9e3ef] bg-white/95 p-2 sm:p-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0 scrollbar-none">
        <div className="flex flex-row items-stretch gap-1.5 xl:gap-2 min-w-[960px] lg:min-w-0">
          {/* NHÓM BÊN TRÁI: 5 THẺ TỔNG QUAN & HIỆU NĂNG (LIGHT NAVY PASTEL) */}
          <div className="grid grid-cols-5 gap-1.5 xl:gap-2 flex-[5] min-w-0 items-stretch">
            {/* 1. Tổng số Epic — Không icon */}
            <KpiCard
              title="TỔNG EPIC"
              value={fmt(l2)}
              subtitle="Phạm vi tính"
              bgColor="bg-[#eaf1fb]"
              borderColor="border border-[#d0e0f3]"
              hoverBorderColor="hover:border-[#93c5fd]"
              onClick={() => onOpen({ alert: 'TTM_COUNTED_IN_SCOPE', title: 'Danh sách Epic - Tổng số Epic (trong phạm vi tính TTM)' })}
              tooltip="Epic trong phạm vi tính TTM (L02): đã loại Cancelled, Epic ngoại lệ và dự án Time to Market = N — xem danh sách ở Quản trị Epic"
            />

            {/* 2. Fail TTM-CNTT */}
            <KpiCard
              title="FAIL TTM-CNTT"
              value={fmt(qlda.fail)}
              subtitle="Cần xử lý"
              icon={<KpiIconBadge icon={WarningCircle} bgColor="bg-[#fee2e2]" iconColor="text-[#ef4444]" />}
              bgColor="bg-[#eaf1fb]"
              borderColor="border border-[#d0e0f3]"
              hoverBorderColor="hover:border-[#93c5fd]"
              onClick={() => onOpen({ alert: FAIL_ALERTS, title: 'Danh sách Epic - Fail TTM-CNTT' })}
              tooltip="Epic không đạt TTM-CNTT: nhóm 1 (R4G Date muộn hơn Target) + nhóm 2 (chưa có R4G Date, đã quá Target)"
            />

            {/* 3. TTM-CNTT (QLDA) — Cỡ chữ phép tính thu nhỏ 70% */}
            <KpiCard
              title="TTM-CNTT"
              value={hasTtmVerdict(qlda) ? `${fmt(qlda.pass)} / ${fmt(qlda.denominator)}` : '—'}
              valueClassName="text-[8px] sm:text-[8.5px] xl:text-[9px] 2xl:text-[10px] tracking-tight"
              subtitle="QLDA"
              icon={
                <KpiProgressRing
                  pct={qlda.pctPrecise}
                  color="#10b981"
                  bgColor="#dcfce7"
                  text={hasTtmVerdict(qlda) ? pctOf(qlda) : '—'}
                />
              }
              bgColor="bg-[#eaf1fb]"
              borderColor="border border-[#d0e0f3]"
              hoverBorderColor="hover:border-[#93c5fd]"
              tooltip={`TTM-CNTT (QLDA) — Tỷ lệ % Pass: ${hasTtmVerdict(qlda) ? pctOf(qlda) : '—'} (${fmt(qlda.pass)}/${fmt(qlda.denominator)} Epic đạt)`}
            />

            {/* 4. TTM-CNTT (QA) — Cỡ chữ phép tính thu nhỏ 70% */}
            <KpiCard
              title="TTM-CNTT"
              value={qa.total > 0 ? `${fmt(qa.pass)} / ${fmt(qa.denominator)}` : '—'}
              valueClassName="text-[8px] sm:text-[8.5px] xl:text-[9px] 2xl:text-[10px] tracking-tight"
              subtitle="QA"
              icon={
                <KpiProgressRing
                  pct={qa.pctPrecise}
                  color="#10b981"
                  bgColor="#dcfce7"
                  text={hasTtmVerdict(qa) ? pctOf(qa) : '—'}
                />
              }
              bgColor="bg-[#eaf1fb]"
              borderColor="border border-[#d0e0f3]"
              hoverBorderColor="hover:border-[#93c5fd]"
              tooltip={`TTM-CNTT (QA) — Tỷ lệ % Pass: ${hasTtmVerdict(qa) ? pctOf(qa) : '—'} (${fmt(qa.pass)}/${fmt(qa.denominator)} Epic MVP Done / Released)`}
            />

            {/* 5. TTM-E2E — Cỡ chữ phép tính thu nhỏ 70% */}
            <KpiCard
              title="TTM-E2E"
              value={e2e.total > 0 ? `${fmt(e2e.pass)} / ${fmt(e2e.denominator)}` : '—'}
              valueClassName="text-[8px] sm:text-[8.5px] xl:text-[9px] 2xl:text-[10px] tracking-tight"
              subtitle="Đạt / Đánh giá"
              icon={
                <KpiProgressRing
                  pct={e2e.pctPrecise}
                  color="#3b82f6"
                  bgColor="#dbeafe"
                  text={hasTtmVerdict(e2e) ? pctOf(e2e) : '—'}
                />
              }
              bgColor="bg-[#eaf1fb]"
              borderColor="border border-[#d0e0f3]"
              hoverBorderColor="hover:border-[#93c5fd]"
              onClick={() => onOpen({ alert: 'FAIL_E2E', title: 'Danh sách Epic - Fail TTM-E2E' })}
              tooltip={`TTM-E2E — Tỷ lệ % Pass: ${hasTtmVerdict(e2e) ? pctOf(e2e) : '—'} (${fmt(e2e.pass)}/${fmt(e2e.denominator)} Epic đạt) — bấm để xem danh sách Fail`}
            />
          </div>

          {/* VÁCH NGĂN DỌC TINH TẾ GIỮA 2 NHÓM KPI */}
          <div className="hidden lg:block w-[1px] bg-slate-200/90 self-stretch my-1.5 shrink-0" aria-hidden="true" />

          {/* NHÓM BÊN PHẢI: 4 THẺ TÁC NGHIỆP & BẤT THƯỜNG (LIGHT GREY) */}
          <div className="grid grid-cols-4 gap-1.5 xl:gap-2 flex-[4] min-w-0 items-stretch">
            {/* 6. Cảnh báo */}
            <KpiCard
              title="CẢNH BÁO"
              value={fmt(insights.lateWarning + insights.earlyWarning)}
              subtitle={warningSubtitle}
              icon={<KpiIconBadge icon={Bell} bgColor="bg-[#fef3c7]" iconColor="text-[#f59e0b]" />}
              bgColor="bg-[#f1f5f9]"
              borderColor="border border-[#e2e8f0]"
              hoverBorderColor="hover:border-slate-300"
              onClick={() => onOpen({ alert: 'LATE', title: 'Danh sách Epic - Chậm tiến độ' })}
              tooltip={`Cảnh báo tiến độ: ${fmt(insights.lateWarning)} muộn · ${fmt(insights.earlyWarning)} sớm — xem ở Quản trị Epic`}
            />

            {/* 7. Sai lệch */}
            <KpiCard
              title="SAI LỆCH"
              value={fmt(insights.anomalyCount)}
              subtitle="Cần điều chỉnh"
              icon={<KpiIconBadge icon={Warning} bgColor="bg-[#fee2e2]" iconColor="text-[#ef4444]" />}
              bgColor="bg-[#f1f5f9]"
              borderColor="border border-[#e2e8f0]"
              hoverBorderColor="hover:border-slate-300"
              onClick={() => onOpen({ dataIssue: true, title: 'Danh sách Epic - Sai lệch Dữ liệu' })}
              tooltip="Xem danh sách Epic sai lệch dữ liệu ở Quản trị Epic"
            />

            {/* 8. Chờ golive */}
            <KpiCard
              title="CHỜ GOLIVE"
              value={fmt(insights.waitingGolive.total)}
              subtitle={waitingSubtitle}
              icon={<KpiIconBadge icon={CheckCircle} bgColor="bg-[#dcfce7]" iconColor="text-[#10b981]" />}
              bgColor="bg-[#f1f5f9]"
              borderColor="border border-[#e2e8f0]"
              hoverBorderColor="hover:border-slate-300"
              onClick={() => onOpen({ alert: 'WAITING_GOLIVE', title: 'Danh sách Epic - Chờ golive' })}
              tooltip={`Epic Chờ golive: ${fmt(waiting.missingR4g)} thiếu R4G · ${fmt(waiting.withinGrace)} trong hạn · ${fmt(waiting.overdue)} quá hạn`}
            />

            {/* 9. Giải trình */}
            <KpiCard
              title="GIẢI TRÌNH"
              value={fmt(insights.justifyGolive)}
              subtitle="Quá hạn R4G +5d"
              icon={<KpiIconBadge icon={Clock} bgColor="bg-[#dbeafe]" iconColor="text-[#3b82f6]" />}
              bgColor="bg-[#f1f5f9]"
              borderColor="border border-[#e2e8f0]"
              hoverBorderColor="hover:border-slate-300"
              onClick={() => onOpen({ alert: 'JUSTIFY_GOLIVE', title: 'Danh sách Epic - Cần Giải trình Golive' })}
              tooltip="Xem danh sách Epic cần Giải trình Golive ở Quản trị Epic (quá hạn R4G Date + 5 ngày làm việc)"
            />
          </div>
        </div>
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
    case 'qldaPct': return hasTtmVerdict(qlda) ? qlda.pctPrecise : null;
    case 'judged': return qlda.denominator;
    case 'fail': return item.fail;
    case 'qaPct': return hasTtmVerdict(qa) ? qa.pctPrecise : null;
    case 'anomaly': return item.anomaly;
    case 'ok': return item.ok;
    case 'late': return item.late;
    default: return null;
  }
}

const PMSM_SHARED_NOTE = 'Epic có nhiều PM/SM được tính cho từng PM/SM — tổng các dòng có thể lớn hơn Tổng số Epic.';

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
          {dimension === 'pmsm' && <p className="mt-0.5 text-[11px] italic text-fb-text-secondary">{PMSM_SHARED_NOTE}</p>}
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
                const hasVerdict = hasTtmVerdict(qlda);
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
                            {/* No QA verdict yet (denominator 0): grey bar + "—", never a 100% bar. */}
                            <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-fb-control">
                              {hasTtmVerdict(qa) && (
                                <>
                                  <div style={{ width: `${qa.pct}%` }} className="h-full bg-purple-600" />
                                  <div style={{ width: `${100 - qa.pct}%` }} className="h-full bg-status-danger" />
                                </>
                              )}
                            </div>
                            <span className="w-9 text-right text-xs font-bold text-purple-700 group-hover:underline">{hasTtmVerdict(qa) ? `${qa.pct}%` : '—'}</span>
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
                {dimension === 'pmsm' && <p className="mb-2 text-[11px] italic text-fb-text-secondary">{PMSM_SHARED_NOTE}</p>}
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
