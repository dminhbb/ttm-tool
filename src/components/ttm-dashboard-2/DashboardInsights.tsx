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

/** Quản trị Epic filter for one value of a dimension. A "chưa gán" placeholder has no value of its
 * own: "Chưa gán Domain" / "Chưa gán PM/SM" filter by the projects they hold (linkProjects); the
 * others ("Chưa xác định" đơn vị yêu cầu, the merged "Khác.." slice) carry no dimension filter. */
function dimensionScope(dimension: TtmBreakdownDimension, item: TtmBreakdownItem | undefined): Partial<InsightListParams> {
  const linkValue = item?.linkValue;
  if (!linkValue) return item?.linkProjects && item.linkProjects.length > 0 ? { projects: item.linkProjects } : {};
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

/**
 * Every widget is Title → Center number → Subtitle, and each of the three uses ONE type style across
 * all nine widgets (2026-10-06) — never a per-widget size. Sizes are fluid (cqw = % of the row's own
 * width, see the @container row in KpiStrip): full size from a ~1440px row up, shrinking with the row
 * on smaller screens so a number is never cut off. The two groups differ by tone only: navy pastel
 * (overview / indexes) vs neutral grey (follow-up work).
 *
 * The three index widgets (TTM-CNTT QLDA / QA, TTM-E2E) are the one variation: their headline figure
 * is the "%" inside a larger ring (KPI_RING_CLASS), so the "351 / 409" beside it is set smaller
 * (KPI_FRACTION_CLASS) as supporting detail.
 */
const KPI_TITLE_CLASS = 'text-[length:clamp(7px,0.66cqw,9.5px)] font-bold uppercase tracking-wide leading-[1.35]';
const KPI_VALUE_CLASS = 'text-[length:clamp(12px,1.18cqw,17px)] font-extrabold leading-tight tabular-nums text-[var(--color-text-primary)]';
const KPI_FRACTION_CLASS = 'text-[length:clamp(9.5px,0.9cqw,13px)] font-bold leading-tight tabular-nums text-[var(--color-text-primary)]';
const KPI_SUBTITLE_CLASS = 'text-[length:clamp(6.5px,0.625cqw,9px)] font-medium leading-[1.35] text-[var(--color-neutral-700)]';
const KPI_TRUNCATE_CLASS = 'overflow-hidden text-ellipsis whitespace-nowrap';
const KPI_ICON_CLASS = 'size-[clamp(26px,2.36cqw,34px)]';
/** The progress ring fills the card's content height; its "%" is the index widgets' headline figure. */
const KPI_RING_CLASS = 'size-[clamp(34px,3.2cqw,46px)]';
const KPI_RING_TEXT_CLASS = 'text-[length:clamp(7.5px,0.72cqw,10.5px)] font-extrabold tracking-tighter';
/** viewBox units of the ring — it is drawn at 46 and scaled to KPI_RING_CLASS. */
const KPI_RING_BOX = 46;

const KPI_TONES = {
  navy: { card: 'border-[var(--color-primary-200)] bg-[var(--color-primary-100)]', hover: 'hover:border-[var(--color-primary-300)]', title: 'text-[var(--color-primary-700)]' },
  slate: { card: 'border-[var(--color-border-default)] bg-[var(--color-bg-page)]', hover: 'hover:border-[var(--color-text-muted)]', title: 'text-[var(--color-neutral-700)]' },
} as const;

type KpiTone = keyof typeof KPI_TONES;

interface KpiCardProps {
  icon?: React.ReactNode;
  onClick?: () => void;
  subtitle: React.ReactNode;
  title: string;
  tone: KpiTone;
  tooltip?: string;
  value: string;
  /** Index widgets: the value is the fraction beside the ring, set smaller (KPI_FRACTION_CLASS). */
  valueAsDetail?: boolean;
}

/**
 * The card's own action is a stretched <button> behind the content (not role="button" on the card),
 * so the links inside a subtitle stay real, separately focusable buttons instead of interactive
 * elements nested in a button.
 */
function KpiCard({ icon, onClick, subtitle, title, tone, tooltip, value, valueAsDetail = false }: KpiCardProps) {
  const palette = KPI_TONES[tone];
  return (
    <div
      title={tooltip}
      className={cn(
        'relative flex h-full min-w-0 select-none items-center gap-1.5 rounded-[14px] border px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 xl:rounded-[16px]',
        palette.card,
        onClick && `hover:shadow-xs ${palette.hover}`,
      )}
    >
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${title}: ${value}`}
          className="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-text-brand)]"
        />
      )}
      {icon && <div className="pointer-events-none relative shrink-0">{icon}</div>}
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col justify-center">
        <span className={cn(KPI_TITLE_CLASS, KPI_TRUNCATE_CLASS, palette.title)}>{title}</span>
        <span className={cn(valueAsDetail ? KPI_FRACTION_CLASS : KPI_VALUE_CLASS, KPI_TRUNCATE_CLASS)}>{value}</span>
        <span className={cn(KPI_SUBTITLE_CLASS, KPI_TRUNCATE_CLASS)}>{subtitle}</span>
      </div>
    </div>
  );
}

/** A number inside a subtitle that opens its own list — sits above the card's stretched button. */
function KpiSubLink({ children, emphasized = false, onClick, title }: { children: React.ReactNode; emphasized?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn('pointer-events-auto cursor-pointer underline-offset-2 hover:underline focus-visible:underline', emphasized && 'text-[var(--color-text-error)] underline')}
    >
      {children}
    </button>
  );
}

function KpiIconBadge({ icon: IconComponent, iconColor }: { icon: Icon; iconColor: string }) {
  return (
    <div className={cn('flex items-center justify-center rounded-full bg-white shadow-2xs', KPI_ICON_CLASS)}>
      <IconComponent className={cn('size-[47%]', iconColor)} weight="fill" />
    </div>
  );
}

/** `pct` null = no Epic has a verdict yet: empty track + "—", never a full ring. */
function KpiProgressRing({ color, pct, text }: { color: string; pct: number | null; text: string }) {
  const size = KPI_RING_BOX;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = pct === null || Number.isNaN(pct) ? 0 : Math.max(0, Math.min(100, pct));
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <div className={cn('relative flex items-center justify-center rounded-full bg-white shadow-2xs', KPI_RING_CLASS)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
        {clampedPct > 0 && (
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
        )}
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center', KPI_RING_TEXT_CLASS)} style={{ color }}>
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
  // One rule for the ring, its "%" and the fraction next to it: all three show "—" until at least
  // one Epic has a verdict (denominator 0 keeps pctPrecise at 100 — see TtmCnttSummary.pct).
  const index = (summary: TtmCnttSummary) => {
    const judged = hasTtmVerdict(summary);
    const [pass, denominator] = [fmt(summary.pass), fmt(summary.denominator)];
    return {
      // Four-digit counts ("1.335/1.364") drop the spaces round the slash to stay inside the card.
      fraction: judged ? `${pass}${pass.length + denominator.length > 6 ? '/' : ' / '}${denominator}` : '—',
      pct: judged ? summary.pctPrecise : null,
      // The ring has room for five characters: a full 100 is shown as "100%", not "100,0%".
      pctText: !judged ? '—' : summary.pctPrecise >= 99.95 ? '100%' : `${formatTtmPct1(summary.pctPrecise)}%`,
    };
  };
  const qldaIndex = index(qlda);
  const qaIndex = index(qa);
  const e2eIndex = index(e2e);

  // The Scoring Service has no "Cảnh báo sớm": the number is the late ones only. On the legacy engine
  // the number is late + early, so the card opens both — the list always matches the number.
  const openWarnings = insights.scoringEngine
    ? () => onOpen({ alert: 'LATE', title: 'Danh sách Epic - Chậm tiến độ' })
    : () => onOpen({ alert: ['LATE', 'EARLY'], title: 'Danh sách Epic - Cảnh báo (Muộn + Sớm)' });

  const warningSubtitle = insights.scoringEngine ? (
    `${fmt(insights.lateWarning)} muộn`
  ) : (
    <>
      <KpiSubLink onClick={() => onOpen({ alert: 'LATE', title: 'Danh sách Epic - Chậm tiến độ' })} title="Xem danh sách Epic Chậm tiến độ">
        {fmt(insights.lateWarning)} muộn
      </KpiSubLink>
      {' · '}
      <KpiSubLink onClick={() => onOpen({ alert: 'EARLY', title: 'Danh sách Epic - Cảnh báo sớm' })} title="Xem danh sách Epic Cảnh báo sớm">
        {fmt(insights.earlyWarning)} sớm
      </KpiSubLink>
    </>
  );

  const waitingSubtitle = (
    <>
      <KpiSubLink onClick={() => onOpen({ alert: 'WAITING_GOLIVE_MISSING_R4G', title: 'Danh sách Epic - Chờ golive: Thiếu R4G Date' })} title="Epic Chờ golive nhưng thiếu R4G Date">
        {fmt(waiting.missingR4g)} thiếu
      </KpiSubLink>
      {' · '}
      <KpiSubLink onClick={() => onOpen({ alert: 'WAITING_GOLIVE_WITHIN_GRACE', title: 'Danh sách Epic - Chờ golive: Trong hạn' })} title="Epic Chờ golive còn trong hạn R4G Date + 5 ngày làm việc">
        {fmt(waiting.withinGrace)} hạn
      </KpiSubLink>
      {' · '}
      <KpiSubLink emphasized={waiting.overdue > 0} onClick={() => onOpen({ alert: 'WAITING_GOLIVE_OVERDUE', title: 'Danh sách Epic - Chờ golive: Quá hạn' })} title="Epic Chờ golive đã quá hạn R4G Date + 5 ngày làm việc">
        {fmt(waiting.overdue)} quá
      </KpiSubLink>
    </>
  );

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-white/95 p-2 shadow-[0_2px_12px_rgba(0,0,0,0.03)] sm:p-2.5">
      <div className="overflow-x-auto pb-1 xl:overflow-x-visible xl:pb-0">
        <div className="@container flex min-w-[1160px] flex-row items-stretch gap-2 xl:min-w-0">
          {/* Left group — overview & indexes (navy pastel). Column widths follow each card's content. */}
          <div className="grid min-w-0 flex-[52] grid-cols-[0.62fr_1.15fr_1.14fr_1.14fr_1.1fr] items-stretch gap-2">
            <KpiCard
              tone="navy"
              title="TỔNG EPIC"
              value={fmt(l2)}
              subtitle="Phạm vi tính"
              onClick={() => onOpen({ alert: 'TTM_COUNTED_IN_SCOPE', title: 'Danh sách Epic - Tổng số Epic (trong phạm vi tính TTM)' })}
              tooltip="Epic trong phạm vi tính TTM (L02): đã loại Cancelled và Epic ngoại lệ (Black listed + dự án Time to Market = N) — xem danh sách ở Quản trị Epic"
            />
            <KpiCard
              tone="navy"
              title="FAIL TTM-CNTT"
              value={fmt(qlda.fail)}
              subtitle="Cần xử lý"
              icon={<KpiIconBadge icon={WarningCircle} iconColor="text-[var(--color-text-error)]" />}
              onClick={() => onOpen({ alert: FAIL_ALERTS, title: 'Danh sách Epic - Fail TTM-CNTT' })}
              tooltip="Epic không đạt TTM-CNTT: nhóm 1 (R4G Date muộn hơn Target) + nhóm 2 (chưa có R4G Date, đã quá Target)"
            />
            <KpiCard
              tone="navy"
              title="TTM-CNTT"
              value={qldaIndex.fraction}
              valueAsDetail
              subtitle="Toàn phòng QLDA"
              icon={<KpiProgressRing pct={qldaIndex.pct} color="#059669" text={qldaIndex.pctText} />}
              tooltip={`TTM-CNTT (QLDA) — Tỷ lệ % Pass: ${qldaIndex.pctText} (${fmt(qlda.pass)}/${fmt(qlda.denominator)} Epic đạt)`}
            />
            <KpiCard
              tone="navy"
              title="TTM-CNTT"
              value={qaIndex.fraction}
              valueAsDetail
              subtitle="Phạm vi của QA"
              icon={<KpiProgressRing pct={qaIndex.pct} color="#059669" text={qaIndex.pctText} />}
              tooltip={`TTM-CNTT (QA) — Tỷ lệ % Pass: ${qaIndex.pctText} (${fmt(qa.pass)}/${fmt(qa.denominator)} Epic MVP Done / Released)`}
            />
            <KpiCard
              tone="navy"
              title="TTM-E2E"
              value={e2eIndex.fraction}
              valueAsDetail
              subtitle="Đạt / Đánh giá"
              icon={<KpiProgressRing pct={e2eIndex.pct} color="#2563eb" text={e2eIndex.pctText} />}
              onClick={() => onOpen({ alert: 'FAIL_E2E', title: 'Danh sách Epic - Fail TTM-E2E' })}
              tooltip={`TTM-E2E — Tỷ lệ % Pass: ${e2eIndex.pctText} (${fmt(e2e.pass)}/${fmt(e2e.denominator)} Epic đạt) — bấm để xem danh sách Fail`}
            />
          </div>

          <div className="my-1 w-px shrink-0 self-stretch bg-fb-control-hover" aria-hidden="true" />

          {/* Right group — follow-up work & anomalies (neutral grey). */}
          <div className="grid min-w-0 flex-[44] grid-cols-[1.1fr_0.95fr_1.3fr_1.05fr] items-stretch gap-2">
            <KpiCard
              tone="slate"
              title="CẢNH BÁO"
              value={fmt(insights.lateWarning + insights.earlyWarning)}
              subtitle={warningSubtitle}
              icon={<KpiIconBadge icon={Bell} iconColor="text-[var(--color-warning-400)]" />}
              onClick={openWarnings}
              tooltip={`Cảnh báo tiến độ: ${fmt(insights.lateWarning)} muộn · ${fmt(insights.earlyWarning)} sớm (không tính Epic ngoại lệ) — xem ở Quản trị Epic`}
            />
            <KpiCard
              tone="slate"
              title="SAI LỆCH"
              value={fmt(insights.anomalyCount)}
              subtitle="Cần điều chỉnh"
              icon={<KpiIconBadge icon={Warning} iconColor="text-[var(--color-text-error)]" />}
              onClick={() => onOpen({ dataIssue: true, title: 'Danh sách Epic - Sai lệch Dữ liệu' })}
              tooltip="Epic sai lệch dữ liệu (không tính Epic Cancelled và Epic ngoại lệ) — xem danh sách ở Quản trị Epic"
            />
            <KpiCard
              tone="slate"
              title="CHỜ GOLIVE"
              value={fmt(insights.waitingGolive.total)}
              subtitle={waitingSubtitle}
              icon={<KpiIconBadge icon={CheckCircle} iconColor="text-[var(--color-success-300)]" />}
              onClick={() => onOpen({ alert: 'WAITING_GOLIVE', title: 'Danh sách Epic - Chờ golive' })}
              tooltip={`Epic Chờ golive (không tính Epic ngoại lệ): ${fmt(waiting.missingR4g)} thiếu R4G · ${fmt(waiting.withinGrace)} trong hạn · ${fmt(waiting.overdue)} quá hạn`}
            />
            <KpiCard
              tone="slate"
              title="GIẢI TRÌNH"
              value={fmt(insights.justifyGolive)}
              subtitle="Quá hạn R4G +5d"
              icon={<KpiIconBadge icon={Clock} iconColor="text-[var(--color-text-brand)]" />}
              onClick={() => onOpen({ alert: 'JUSTIFY_GOLIVE', title: 'Danh sách Epic - Cần Giải trình Golive' })}
              tooltip="Epic cần Giải trình Golive (quá hạn R4G Date + 5 ngày làm việc; không tính Epic ngoại lệ) — xem danh sách ở Quản trị Epic"
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
  const open = (item: TtmBreakdownItem, params: Omit<InsightListParams, 'title'>, label: string) => onOpen({ ...dimensionScope(dimension, item), ...params, title: `${label} - ${item.name}` });
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
                <TH className="text-center" sortDirection={directionFor('total')} onClick={() => toggleSort('total')} title="Epic trong phạm vi tính TTM (L02): đã loại Cancelled và Epic ngoại lệ (Black listed + dự án Time to Market = N)">Tổng số Epic</TH>
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
                      <button type="button" onClick={() => open(item, { alert: 'TTM_COUNTED_IN_SCOPE' }, 'Danh sách Epic (Tổng số Epic)')} className={`${numberButton} text-fb-blue hover:bg-fb-blue-soft`} title={`Xem tất cả Epic của ${item.name}`}>
                        {fmt(item.total)}
                      </button>
                    </TD>
                    <TD className="text-center font-semibold text-status-success">
                      <button type="button" onClick={() => open(item, { alert: 'TTM_PASS_IN_SCOPE' }, 'Danh sách Epic Pass TTM')} className={`${numberButton} text-status-success hover:bg-status-success-soft`} title={`Xem các Epic đạt TTM-CNTT của ${item.name}`}>
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
                      <button type="button" onClick={() => open(item, { alert: JUDGED_ALERTS }, 'Danh sách Epic đánh giá')} className={`${numberButton} text-fb-blue hover:bg-fb-blue-soft`} title={`Xem các Epic đã có kết luận (Pass + Fail) của ${item.name}`}>
                        {fmt(qlda.denominator)}
                      </button>
                    </TD>
                    <TD className="text-center font-semibold text-status-danger">
                      <button type="button" onClick={() => open(item, { alert: FAIL_ALERTS }, 'Danh sách Epic Fail TTM')} className={`${numberButton} text-status-danger hover:bg-status-danger-soft`} title={`Xem các Epic không đạt TTM-CNTT của ${item.name}`}>
                        {fmt(item.fail)}
                      </button>
                      {item.fail > 0 && (
                        <p className="whitespace-nowrap text-[11px] font-medium text-fb-text-secondary">
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
                                  <div style={{ width: `${qa.pct}%` }} className="h-full bg-fb-accent" />
                                  <div style={{ width: `${100 - qa.pct}%` }} className="h-full bg-status-danger" />
                                </>
                              )}
                            </div>
                            <span className="w-9 text-right text-xs font-bold text-fb-accent group-hover:underline">{hasTtmVerdict(qa) ? `${qa.pct}%` : '—'}</span>
                          </div>
                          <p className="text-[11px] text-fb-text-secondary group-hover:underline">{fmt(item.qaPass)}/{fmt(qa.denominator)} Epic MVP Done/Released</p>
                        </button>
                      ) : (
                        <span className="text-xs text-fb-text-placeholder">— Chưa có Epic MVP Done/Released</span>
                      )}
                    </TD>
                    <TD className="text-center font-semibold text-fb-accent">
                      <button type="button" onClick={() => open(item, { alert: 'DATA_ANOMALY_IN_SCOPE' }, 'Danh sách Epic Sai lệch dữ liệu')} className={`${numberButton} text-fb-accent hover:bg-fb-accent-soft`} title={`Xem các Epic Sai lệch dữ liệu của ${item.name}`}>
                        {fmt(item.anomaly)}
                      </button>
                    </TD>
                    {/* No list behind this one: no "Nhận xét" filter matches exactly this set. */}
                    <TD className="text-center font-semibold text-fb-text-primary" title={`Epic của ${item.name} chưa có R4G Date, không Sai lệch dữ liệu và chưa bị cảnh báo`}>
                      {fmt(item.ok)}
                    </TD>
                    <TD className="text-center font-semibold text-status-warning">
                      <button type="button" onClick={() => open(item, { alert: LATE_ALERTS }, 'Danh sách Epic chậm tiến độ')} className={`${numberButton} text-status-warning hover:bg-status-warning-soft`} title={`Epic chưa có R4G Date của ${item.name} đang Cảnh báo muộn hoặc đã quá Target`}>
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
        const scopeOf = (name: string) => dimensionScope(dimension, items.find((item) => item.name === name));
        const open = (name: string, alert: InsightListParams['alert'], label: string) => onOpen({ ...scopeOf(name), alert, title: `${label} - ${DIMENSION_NOUN[dimension]}: ${name}` });
        return (
          <div key={dimension} className="mb-4 border-t border-fb-border pt-3">
            <button
              type="button"
              onClick={() => setOpenSections((prev) => ({ ...prev, [dimension]: !prev[dimension] }))}
              aria-expanded={isOpen}
              className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-bold text-black transition-colors hover:text-[var(--color-text-brand)]"
            >
              {isOpen ? <CaretDown className="size-4 text-[var(--color-text-brand)]" weight="bold" /> : <CaretRight className="size-4 text-[var(--color-text-brand)]" weight="bold" />}
              <span>{SECTION_TITLES[dimension]}</span>
            </button>
            {isOpen && (
              <div className="mt-3 border-l-2 border-[var(--color-text-brand)] pl-3 pt-1">
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
