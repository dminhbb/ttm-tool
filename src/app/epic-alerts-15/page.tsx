'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import './epic-alerts-15.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { StatusColorLegend } from '@/components/ui/StatusColorLegend';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { EpicAlertTimeline } from '@/components/epic-alerts/EpicAlertTimeline';
import { EpicStatWidgets } from '@/components/epic-alerts/EpicStatWidgets';
import { DataAnomalyBadge, DataAnomalyList } from '@/components/epic-alerts/DataAnomalyDetail';
import { hasScoringExtraBadges, ScoringExtraBadges } from '@/components/epic-alerts/ScoringBadges';
import { ALERT_FILTER_VALUES, alertFilterOptionsFor, findingOf, isWaitingGolive, isTtmCnttAchieved, isTtmE2eAchieved, matchesAlertFilter } from '@/lib/epic-row-verdicts';
import type { AlertFilterValue } from '@/lib/epic-row-verdicts';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import type { EpicAlertAccessRole, EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';
import type { EpicMilestoneHistoryEntry } from '@/lib/epic-milestone-history-service';
import type { ProjectComponent } from '@/lib/master-data-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { formatTtmPct1, summarizeQaIndex, summarizeTtmCntt } from '@/lib/ttm-cntt-qa';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import type { TtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { useEpicHeaderWidgets } from '@/lib/epic-header-widgets-context';
import { EPIC_COMPLEXITY_TYPES } from '@/lib/status-alert-rule-types';
import { ArrowBendUpRight, ArrowCounterClockwise, ArrowSquareOut, ArrowsInLineHorizontal, ArrowsOutLineHorizontal, CaretDown, CaretLineRight, CaretRight, Check, Checks, ClockCountdown, FloppyDisk, FolderSimple, HourglassMedium, Lightning, ListChecks, Prohibit, Sparkle, Warning, WarningOctagon, XCircle } from '@phosphor-icons/react';
import { epicWorkflowStatusIndex, normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { listGroupRankOf } from '@/lib/epic-alert-sort-rules';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { trackDataUsage } from '@/lib/usage-tracking';
import { showToast } from '@/components/ui/Toast';

const SAVED_FILTER_STORAGE_KEY = 'ttm_epic_alerts_15_saved_filters';
const EXCLUDED_NOT_IN_PO = new Set(['CANCELLED', 'TO DO', 'IN PO', 'RELEASED']);

interface SavedFilterConfig {
  activeQuickFilter: 'PENDING' | 'IN_PO' | 'NOT_IN_PO' | null;
  /** Pre-multi-select saves stored a single value — still read on restore. */
  alertFilter?: AlertFilterValue;
  alertFilters?: AlertFilterValue[];
  componentFilters: string[];
  createdDateFrom?: string;
  dataIssueFilter: boolean;
  domainFilter?: string;
  dueDateFromFilter?: string;
  pmSmFilter?: string | string[];
  pmSmFilters?: string[];
  projectFilters: string[];
  /** Pre-2026-10 saved filters stored a single unit here. */
  requestingUnitFilter?: string;
  requestingUnitFilters?: string[];
  search: string;
  selectedLayerAnchor?: string;
  startDateFromFilter?: string;
  statusFilters: string[];
  typeFilter?: string;
  typeFilters?: string[];
}

function loadSavedFilters(): SavedFilterConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_FILTER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedFilterConfig;
  } catch {
    return null;
  }
}

const PAGE_SIZE = 20;

const EMPTY_ROWS: EpicAlertRowPhased[] = [];
const EMPTY_LAYER_DATES: string[] = [];
// "Chọn lớp dữ liệu" only shows the newest 5 as quick-pick chips — everything older lives in a
// dropdown right after them, so any recorded layer stays reachable without the button row growing
// unbounded (availableLayerDates now returns up to 365 dates, not just 7).
const RECENT_LAYER_CHIP_COUNT = 5;

/** Cancelled Epics are noise on this screen by default, so Quản trị Epic defaults its Status
 * filter to everything else — applied once, the first time real status options load (see the
 * statusOptions effect below), and never reapplied after that so it doesn't fight a user's own
 * filter choice. TO DO/IN PO/RELEASED stay in the default filter (also shown on the dedicated
 * "Epic in PO" screen) but are sorted to the bottom of the list — see BOTTOM_STATUS_RANK below. */
const DEFAULT_EXCLUDED_STATUSES = new Set(['CANCELLED']);

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${hour}:${minute}`;
}

/**
 * Deep-link filters read once from the URL a caller (e.g. a Dashboard widget) navigated here with —
 * see buildEpicAlertsDeepLink in epic-alerts-deep-link.ts, the single place that builds these query
 * strings so this parsing side never drifts out of sync with it. Comma-separated lists match
 * multi-select filters (projects/status); everything else is a single value.
 */
interface EpicAlertsDeepLinkFilters {
  alerts: AlertFilterValue[];
  dataIssue: boolean;
  domain: string;
  hasAny: boolean;
  pmSm: string[];
  projects: string[];
  requestingUnits: string[];
  search: string;
  status: string[];
  /** "Phạm vi dữ liệu cho TTM" override (Dashboard 2's Advanced Filters) — undefined = key absent
   * from the URL, use this screen's own admin default; null = key present but empty ("no bound",
   * an explicit override). See buildEpicAlertsDeepLink's doc comment. */
  ttmScopeCnttFrom: string | null | undefined;
  ttmScopeCnttTo: string | null | undefined;
  ttmScopeQaFrom: string | null | undefined;
  ttmScopeQaTo: string | null | undefined;
  types: string[];
}

function parseDeepLinkFilters(searchParams: URLSearchParams): EpicAlertsDeepLinkFilters {
  const splitList = (key: string) => (searchParams.get(key) ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const alerts = splitList('alert').filter((value): value is Exclude<AlertFilterValue, ''> => ALERT_FILTER_VALUES.has(value as AlertFilterValue) && value !== '');
  const projects = splitList('projects');
  const status = splitList('status');
  const types = splitList('type').filter((value) => (EPIC_COMPLEXITY_TYPES as readonly string[]).includes(value));
  const pmSm = splitList('pmSm');
  const requestingUnits = searchParams.getAll('requestingUnit').map((value) => value.trim()).filter(Boolean);
  const dataIssue = searchParams.get('dataIssue') === '1';
  const search = searchParams.get('search') ?? '';
  const domain = searchParams.get('domain') ?? '';
  const dateOrNull = (key: string) => (searchParams.has(key) ? (searchParams.get(key) || null) : undefined);
  return {
    alerts,
    dataIssue,
    domain,
    hasAny: Boolean(
      alerts.length || projects.length || status.length || types.length || pmSm.length || requestingUnits.length || dataIssue || search || domain
      || dateOrNull('cnttFrom') !== undefined || dateOrNull('cnttTo') !== undefined
      || dateOrNull('qaFrom') !== undefined || dateOrNull('qaTo') !== undefined,
    ),
    pmSm,
    projects,
    requestingUnits,
    search,
    status,
    ttmScopeCnttFrom: dateOrNull('cnttFrom'),
    ttmScopeCnttTo: dateOrNull('cnttTo'),
    ttmScopeQaFrom: dateOrNull('qaFrom'),
    ttmScopeQaTo: dateOrNull('qaTo'),
    types,
  };
}

const ACCESS_ROLE_LABEL: Record<EpicAlertAccessRole, string> = {
  CBQL_PHONG: 'CBQL Phòng',
  LEAD: 'Lead',
  PM_SM: 'PM-SM',
};


/**
 * light green (pass) — đã hoàn thành (isDone); light red (fail) — chưa hoàn thành và đã tới/quá
 * baseline (Cảnh báo muộn); light yellow (warning) — Cảnh báo sớm; không màu — chưa hoàn thành,
 * chưa tới baseline.
 */
function phaseCellColorClass(cell: PhaseCell): string {
  if (cell.isDone) return 'pass';
  if (cell.alertLevel === 'LATE') return 'fail';
  if (cell.alertLevel === 'EARLY') return 'warning';
  return '';
}

/** Two-line cell: baseline (top, computed from the phase-division rule) vs — only for phases that
 * have a real recorded date (R4GOLIVE's R4G Date, Release's Due Date) — that date (bottom).
 * Completion itself is shown purely via the cell's background color (phaseCellColorClass); other
 * phases no longer have a recorded completion date at all, so their bottom line stays empty. */
function PhaseStageCell({ actualDateText, cell }: { actualDateText?: string | null; cell: PhaseCell }) {
  const colorClass = phaseCellColorClass(cell);
  const baselineTitle = cell.baselineSourceLabel
    ? `Tính từ ${cell.baselineSourceLabel}: ${formatDate(cell.baselineSourceDate)}`
    : 'Baseline chuẩn theo rule phân chia giai đoạn (tính từ Start Date)';
  return (
    <TD className={`ttm-phase-cell${colorClass ? ` ${colorClass}` : ''}`}>
      {cell.isCurrentStage && <span className="ttm-phase-current-dot" title="Giai đoạn hiện tại của Epic" aria-hidden="true" />}
      <span className="ttm-phase-baseline" title={baselineTitle}>
        <ArrowBendUpRight className="size-3 shrink-0" weight="bold" />
        <span>{formatDate(cell.baselineDate)}</span>
      </span>
      {actualDateText ? (
        <span className="ttm-phase-actual">
          <Checks className="size-3 shrink-0" weight="bold" />
          <span>{formatDate(actualDateText)}</span>
        </span>
      ) : null}
    </TD>
  );
}

/** DESIGN/DEV/TEST/PENTEST can be individually collapsed to save horizontal space (the table has
 * grown to 13 columns) — R4GOLIVE/Release stay always-expanded since their bottom line carries a
 * real recorded date (R4G Date / Due Date), not just the baseline. */
type CollapsiblePhase = 'DESIGN' | 'DEV' | 'TEST' | 'PENTEST';

const COLLAPSIBLE_PHASES: CollapsiblePhase[] = ['DESIGN', 'DEV', 'TEST', 'PENTEST'];

const PHASE_COLUMN_META: Record<CollapsiblePhase, { char: string; title: string }> = {
  DESIGN: { char: 'D', title: 'Baseline = Start Date + 20% TTM-CNTT (QLDA) (làm tròn ngày)' },
  DEV: { char: 'V', title: 'Baseline = Start Date + (20%+30%) TTM-CNTT (QLDA) (làm tròn ngày)' },
  TEST: { char: 'T', title: 'Baseline = Start Date + (20%+30%+30%) TTM-CNTT (QLDA) (làm tròn ngày)' },
  PENTEST: { char: 'P', title: 'Baseline = Start Date + (20%+30%+30%+10%) TTM-CNTT (QLDA) (làm tròn ngày)' },
};

/** Expanded: full name, click to collapse. Collapsed: thin stub showing one representative
 * character with an immediate tooltip carrying the full name, click to expand — no sort affordance
 * either way (TH's sortDirection prop is intentionally left unset on this column). */
function CollapsiblePhaseHeader({ isCollapsed, onToggle, phase }: { isCollapsed: boolean; onToggle: (phase: CollapsiblePhase) => void; phase: CollapsiblePhase }) {
  const meta = PHASE_COLUMN_META[phase];
  if (isCollapsed) {
    return (
      <TH className="ttm-col-collapsed">
        <Tooltip content={phase} side="right">
          <button type="button" className="ttm-col-collapsed-toggle" onClick={() => onToggle(phase)} aria-label={`Hiện cột ${phase}`}>
            {meta.char}
          </button>
        </Tooltip>
      </TH>
    );
  }
  return (
    <TH className="min-w-[110px]" title={meta.title}>
      <button type="button" className="ttm-col-header-toggle" onClick={() => onToggle(phase)} aria-label={`Ẩn cột ${phase}`}>{phase}</button>
    </TH>
  );
}

/** Body-side counterpart of CollapsiblePhaseHeader — a collapsed column renders as an empty thin
 * cell (no content, per the collapse rule), matching the header's width/right-border. */
function CollapsiblePhaseCell({ actualDateText, cell, isCollapsed }: { actualDateText?: string | null; cell: PhaseCell; isCollapsed: boolean }) {
  if (isCollapsed) {
    // Collapsed background reuses the same pass/warning/fail class as the expanded cell (see
    // phaseCellColorClass) so the thin stub still shows the column's real status at a glance.
    const colorClass = phaseCellColorClass(cell);
    return <TD className={`ttm-phase-cell ttm-col-collapsed${colorClass ? ` ${colorClass}` : ''}`} />;
  }
  return <PhaseStageCell actualDateText={actualDateText} cell={cell} />;
}

/** Truncates epic summary text for the table's subtitle line — full text stays in the title tooltip. */
function truncateSummary(value: string, maxLength = 50): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="ttm-empty-warning">—</span>;
  return <span className="ttm-status-badge">{status}</span>;
}

/**
 * TTM-CNTT "stripe thực tế" (bottom, actual strip) on-track color rule — core logic shared with
 * "Quản trị Epic (rút gọn)" and Epic in PO's own copy of this same function (kept as small
 * per-page duplicates, matching this codebase's existing convention for tiny client-side render
 * helpers). TTM-E2E's own stripe just trusts `row.ttmE2eAlertLevel === 'FAIL'` directly (see
 * TtmE2eStrips below) instead of re-deriving a raw date compare, so it can never disagree with the
 * Fail TTM-E2E badge on Cancelled/hasDataAnomaly Epics — this function is TTM-CNTT-only.
 * Green ("on track") when the actual stripe's end date (X) doesn't fall after the baseline
 * stripe's own end date (targetR4gDate) — a plain calendar-date compare, deliberately NOT the
 * working-day elapsed/target counts used everywhere else in this app: those stayed flat over a
 * weekend even once the visible calendar baseline date had passed (confirmed on a real Epic —
 * baseline ending Friday 28/8, still green on Saturday 29/8 since neither weekend day advances
 * the working-day count), which read as wrong given the two dates are shown side by side on the
 * stripe itself. AND either the Epic is still ongoing (X is today, not R4G Date — checked by
 * comparing actualToDate to r4gDate rather than adding a separate flag) or it finished on time
 * with the Epic's current status already at/past R4GOLIVE. An Epic whose stripe ends at R4G Date
 * but whose status hasn't caught up to R4GOLIVE yet is treated as NOT on track (data likely
 * stale/inconsistent), same as the end date falling after the baseline.
 */
function isTtmCnttStripeOnTrack(currentStatus: string, r4gDate: string | null, actualToDate: string | null, baselineToDate: string | null): boolean {
  const withinBaseline = Boolean(actualToDate && baselineToDate && actualToDate <= baselineToDate);
  const usesR4gDate = Boolean(r4gDate && actualToDate === r4gDate);
  const statusCaughtUp = epicWorkflowStatusIndex(currentStatus) >= epicWorkflowStatusIndex('R4GOLIVE');
  return withinBaseline && (!usesR4gDate || statusCaughtUp);
}

/** Calendar days between two ISO "YYYY-MM-DD" dates (0 if either is missing/unparseable). */
function calendarDaysBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86400000);
}

/** TTM-CNTT actual-stripe width ratio, in CALENDAR days — matches isTtmCnttStripeOnTrack's own
 * calendar-date basis (see its doc comment) so a stripe rendered red/over is never visually
 * shorter than the baseline it's failing against, which is what a working-day ratio produced here
 * (e.g. 14/15 working days ≈ 93% width, even though the calendar end date had already passed the
 * baseline's calendar end date over a weekend). TTM-E2E keeps its own working-day ratio, computed
 * inline in TtmE2eStrips below — this function is TTM-CNTT-only. */
function ttmCnttWidthRatio(fromDate: string | null, actualToDate: string | null, baselineToDate: string | null): number {
  const baselineDays = calendarDaysBetween(fromDate, baselineToDate);
  const actualDays = calendarDaysBetween(fromDate, actualToDate);
  return baselineDays > 0 ? actualDays / baselineDays : 0;
}

/** Two-stripe metric cell shared by the TTM-CNTT and TTM-E2E columns: top stripe is the baseline
 * (planned) window, bottom stripe is the actual window so far — same start date as the baseline,
 * end date is either a real recorded date (R4G Date / Due Date) or today while still ongoing. The
 * bottom stripe's color (`isOver`) and width ratio (`ratio`) are each caller's own concern — see
 * TtmCnttStrips/TtmE2eStrips. */
function TtmMetricStrips({
  actualFromDate, actualToDate, baselineFromDate, baselineToDate, className, compact, elapsed, isOver, ratio, statusMismatch, target,
}: {
  actualFromDate: string | null;
  actualToDate: string | null;
  baselineFromDate: string | null;
  baselineToDate: string | null;
  className?: string;
  compact: boolean;
  elapsed: number | null;
  isOver: boolean;
  ratio: number;
  /** "Sai Status" (see resolveTtmCnttStatusMismatch in epic-alert-service.ts): the recorded date is
   * on schedule, but the caller still forces `isOver` true since the workflow status hasn't
   * actually caught up — this renders a "*" marker beside the actual end date so the red color
   * doesn't read as a plain, unexplained lateness. Only ever passed for the TTM-CNTT strip now —
   * TTM-E2E's own "status not caught up" case moved to the Release axis (resolveReleaseAxis) and
   * the RELEASE_STATUS_MISMATCH anomaly rule, 2026-09-24. */
  statusMismatch?: boolean;
  target: number;
}) {
  const elapsedDays = elapsed ?? 0;
  // Compact mode (all four collapsible phase columns collapsed) shrinks these tracks so the whole
  // table fits the viewport with no horizontal scroll — see the toolbar's collapse-all toggle.
  const BASE_WIDTH = compact ? 30 : 56;
  // Hard cap in px (not just a ratio multiplier) so an Epic with an unusually long actual
  // duration can never stretch the strip wide enough to break the table's layout.
  const MAX_ACTUAL_WIDTH = compact ? 56 : 112;
  const actualWidth = Math.min(Math.max(6, ratio * BASE_WIDTH), MAX_ACTUAL_WIDTH);
  const mismatchNote = ' — * đã đạt tiến độ theo ngày ghi nhận nhưng status Epic chưa chuyển đúng quy định';

  return (
    <TD className={`ttm-metric${compact ? ' ttm-metric-compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="ttm-strip-wrap" title={`${elapsedDays}/${target} ngày làm việc${statusMismatch ? mismatchNote : ''}`}>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(baselineFromDate)}</span>
          <span className="ttm-strip-track" style={{ width: `${BASE_WIDTH}px` }} />
          <span className="ttm-strip-date">{formatDate(baselineToDate)}</span>
        </div>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(actualFromDate)}</span>
          <span className={`ttm-strip-track actual ${isOver ? 'over' : 'under'}`} style={{ width: `${actualWidth}px` }} />
          <span className="ttm-strip-date">
            {formatDate(actualToDate)}
            {statusMismatch && (
              <span className="ttm-strip-status-mismatch-mark" title="Đã đạt tiến độ theo ngày ghi nhận nhưng status Epic chưa chuyển đúng quy định — vui lòng cập nhật status.">*</span>
            )}
          </span>
        </div>
      </div>
    </TD>
  );
}

function TtmCnttStrips({ compact, row }: { compact: boolean; row: EpicAlertRowPhased }) {
  const target = row.ttmCnttTargetWorkingDays;
  const isOver = row.ttmCnttStatusMismatch || !isTtmCnttStripeOnTrack(row.currentStatus, row.r4gDate, row.ttmActualToDate, row.targetR4gDate);
  const ratio = ttmCnttWidthRatio(row.t1StartDate, row.ttmActualToDate, row.targetR4gDate);
  return (
    <TtmMetricStrips
      actualFromDate={row.ttmActualFromDate}
      actualToDate={row.ttmActualToDate}
      baselineFromDate={row.t1StartDate}
      baselineToDate={row.targetR4gDate}
      compact={compact}
      elapsed={row.ttmActualElapsedWorkingDays}
      isOver={isOver}
      ratio={ratio}
      statusMismatch={row.ttmCnttStatusMismatch}
      target={target}
    />
  );
}

/** T0 (release baseline's own source date) doubles as both stripes' start — same convention as
 * TTM-CNTT's Start Date. */
function TtmE2eStrips({ compact, row }: { compact: boolean; row: EpicAlertRowPhased }) {
  const t0 = row.stages.release.baselineSourceDate;
  return (
    <TtmMetricStrips
      actualFromDate={t0}
      actualToDate={row.ttmE2eActualToDate}
      baselineFromDate={t0}
      baselineToDate={row.stages.release.baselineDate}
      className="ttm-col-border-right"
      compact={compact}
      elapsed={row.ttmE2eElapsedWorkingDays}
      isOver={row.ttmE2eAlertLevel === 'FAIL'}
      ratio={row.ttmE2eTargetWorkingDays > 0 ? (row.ttmE2eElapsedWorkingDays ?? 0) / row.ttmE2eTargetWorkingDays : 0}
      target={row.ttmE2eTargetWorkingDays}
    />
  );
}

const MILESTONE_LABEL: Record<string, string> = {
  DESIGN_DONE: 'Design Done',
  DEV_DONE: 'Dev Done',
  TEST_DONE: 'Test Done',
};

function AlertHistoryButton({ row, onOpen }: { row: EpicAlertRowPhased; onOpen: (row: EpicAlertRowPhased) => void }) {
  return (
    <button
      type="button"
      className={`ttm-alert-history-trigger${row.hasAlertHistory ? ' has-history' : ''}`}
      title={row.hasAlertHistory ? 'Xem lịch sử cảnh báo Epic' : 'Epic chưa có lịch sử cảnh báo'}
      onClick={() => { trackDataUsage(); onOpen(row); }}
    >
      <Warning weight="fill" size={16} />
    </button>
  );
}

function JiraLinkButton({ epicKey, viewIssueBaseUrl }: { epicKey: string; viewIssueBaseUrl: string }) {
  if (!viewIssueBaseUrl) return null;
  return (
    <a
      className="ttm-alert-history-trigger ttm-jira-link-trigger"
      href={`${viewIssueBaseUrl}${epicKey}`}
      onClick={(event) => event.stopPropagation()}
      rel="noopener noreferrer"
      target="_blank"
      title="Mở Epic trên Jira"
    >
      <ArrowSquareOut weight="bold" size={16} />
    </a>
  );
}

function AlertPopupField({ label, value }: { label: string; value: string }) {
  return (
    <div className="ttm-alert-popup-field">
      <span className="ttm-alert-popup-field-label">{label}</span>
      <span className="ttm-alert-popup-field-value">{value}</span>
    </div>
  );
}

function AlertHistoryPanel({ row, onClose }: { row: EpicAlertRowPhased; onClose: () => void }) {
  const [milestones, setMilestones] = useState<EpicMilestoneHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/epic-alerts/${encodeURIComponent(row.epicKey)}/alert-history`)
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) { setError(body.error || 'Lỗi hệ thống khi tải lịch sử Epic.'); return; }
        setMilestones(body.milestones ?? []);
      })
      .catch(() => { if (!cancelled) setError('Không thể kết nối API.'); });
    return () => { cancelled = true; };
  }, [row.epicKey]);

  const isLoading = milestones === null;

  // R4GOLIVE/Released "hoàn thành" — tính trực tiếp từ chính PhaseCell.isDone đã hiển thị ở cột
  // R4GOLIVE/RELEASE của dòng này (evaluated live, epic-phase-completion-service.ts), KHÔNG phải từ
  // epic_milestone_history (chỉ có DESIGN/DEV/TEST_DONE, và việc ghi log đang tạm tắt — xem
  // MILESTONE_RECORDING_ENABLED) — nên 2 mốc này luôn "có" ngay khi Epic đã qua giai đoạn tương ứng.
  const computedMilestones: { date: string; label: string }[] = [];
  if (row.stages.r4golive.isDone && row.r4gDate) computedMilestones.push({ label: 'R4GOLIVE', date: row.r4gDate });
  if (row.stages.release.isDone && row.dueDate) computedMilestones.push({ label: 'Released', date: row.dueDate });

  return (
    <Modal isOpen onClose={onClose} title={`Epic History — ${row.epicKey}`} maxWidth="2xl">
      <div className="ttm-alert-popup">
        <div className="ttm-alert-popup-left">
          <AlertPopupField label="Summary" value={row.epicName || '-'} />
          <AlertPopupField label="Tên dự án" value={row.projectName || '-'} />
          <AlertPopupField label="Ngày duyệt ý tưởng (T0)" value={formatDate(row.t0IdeaApprovedDate)} />
          <AlertPopupField label="Start Date (T1)" value={formatDate(row.t1StartDate)} />
          <AlertPopupField label="Status" value={row.currentStatus || '-'} />
          <AlertPopupField label="PM/SM" value={row.ownerName || '-'} />
          <AlertPopupField label="Domain (của PM/SM)" value={row.domainName || '-'} />
          <AlertPopupField label="Đơn vị yêu cầu" value={row.requestingUnit || '-'} />
          <AlertPopupField label="Lớp dữ liệu đang sử dụng" value={formatDate(row.dataLayerDate)} />
        </div>
        <div className="ttm-alert-popup-right">
          {row.dataAnomalyViolations.length > 0 && (
            <>
              <h4 className="ttm-alert-popup-section-title">Sai lệch dữ liệu ({row.dataAnomalyViolations.length})</h4>
              <DataAnomalyList violations={row.dataAnomalyViolations} />
            </>
          )}
          <h4 className={`ttm-alert-popup-section-title${row.dataAnomalyViolations.length > 0 ? ' ttm-alert-popup-section-title-spaced' : ''}`}>Dòng thời gian cảnh báo</h4>
          <EpicAlertTimeline epicKey={row.epicKey} />

          {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)', marginTop: 16 }}>{error}</div>}
          {!error && isLoading && <p className="ttm-alert-popup-right-empty">Đang tải…</p>}
          {!error && !isLoading && (
            <>
              <h4 className="ttm-alert-popup-section-title ttm-alert-popup-section-title-spaced">Mốc hoàn thành</h4>
              {milestones.length === 0 && computedMilestones.length === 0 ? (
                <p className="ttm-alert-popup-right-empty">Chưa có mốc hoàn thành nào được ghi nhận.</p>
              ) : (
                <ul className="ttm-alert-history-list">
                  {milestones.map((milestone) => (
                    <li key={milestone.milestone} className="ttm-alert-history-item">
                      <span className="ttm-badge-achieved">{MILESTONE_LABEL[milestone.milestone] ?? milestone.milestone}</span>
                      <span className="ttm-alert-history-status">Hoàn thành</span>
                      <span className="ttm-alert-history-date">{formatDate(milestone.milestoneDate)}</span>
                    </li>
                  ))}
                  {computedMilestones.map((milestone) => (
                    <li key={milestone.label} className="ttm-alert-history-item">
                      <span className="ttm-badge-achieved">{milestone.label}</span>
                      <span className="ttm-alert-history-status">Hoàn thành</span>
                      <span className="ttm-alert-history-date">{formatDate(milestone.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}


interface EpicAlertFilterOptions {
  domainProjectKeys: Record<string, string[]>;
  pmSmNames: string[];
  projectKeys: string[];
  requestingUnits: string[];
  statuses: string[];
}

interface EpicAlertStatCounts {
  dataIssue: number;
  failCntt: number;
  failE2e: number;
  late: number;
  pending: number;
  todo: number;
}

/** `/api/epic-alerts-15`'s payload is EpicAlertPhasedResponse plus paging/aggregate extras.
 *
 * `mode: 'paged'` (the common case — see epic-alert-row-cache-query-service.ts) means `rows` is
 * already the current page, server-filtered/sorted by every toolbar filter, with `totalCount`/
 * `statCounts`/`ttmIndexPm`/`qaIndexPm`/`filterOptions` computed server-side to match — the client
 * must not re-filter/re-sort/re-paginate `rows` itself. `mode: 'full'` (an old-layer drill-down or
 * an advanced date filter — see the API route) means `rows` is the full access-scoped set, exactly
 * like before this cache existed: the client still does its own filter/sort/paginate/stat pipeline. */
interface EpicAlerts15Payload extends EpicAlertPhasedResponse {
  mode: 'paged' | 'full';
  totalCount?: number;
  page?: number;
  pageSize?: number;
  statCounts?: EpicAlertStatCounts;
  ttmIndexPm?: TtmCnttSummary;
  qaIndexPm?: TtmCnttSummary;
  filterOptions?: EpicAlertFilterOptions;
  /** Set when the list is shown "dưới quyền" another user (viewAsUserId deep link from a TTM dashboard). */
  viewAsUser?: { email: string; fullName: string } | null;
}

/** TTM-CNTT (QLDA) or TTM-CNTT (QA) value + 2-line tooltip text, formatted for the
 * EpicHeaderWidgetItem AppShell renders in its sticky header — see ttm-cntt-qa.ts for what
 * pass/fail/denominator mean (Tỷ lệ % Pass = Đạt / (Đạt + Fail)). `summary` null (no cache yet) or `total === 0` (nothing to rate, e.g. no
 * MVP Done/Released Epic yet for TTM-CNTT (QA)) both render "—" instead of a misleading 0,0%/100,0%. */
function formatTtmIndexValue(summary: TtmCnttSummary | null): string {
  return summary && summary.total > 0 ? `${formatTtmPct1(summary.pctPrecise)}%` : '—';
}
function formatTtmIndexTooltip(firstLine: string, summary: TtmCnttSummary | null): string {
  const secondLine = summary && summary.total > 0 ? `${summary.pass}/${summary.denominator}` : '—';
  return `${firstLine}\n${secondLine}`;
}

export default function EpicAlerts15Page() {
  return (
    <Suspense fallback={null}>
      <EpicAlerts15Screen />
    </Suspense>
  );
}

function EpicAlerts15Screen() {
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get('embedded') === 'true' || searchParams.get('embedded') === '1';
  // Read once at mount, from whatever URL navigated here (see epic-alerts-deep-link.ts) — later
  // edits to these state values via the toolbar must never get overridden by a stale re-parse.
  const [deepLinkFilters] = useState(() => parseDeepLinkFilters(searchParams));
  // "Xem dưới quyền" carried over from a TTM dashboard drill-down — forwarded as-is to the API, which
  // decides whether this viewer may actually preview that user (view-as-user-service.ts).
  const [viewAsUserId] = useState(() => searchParams.get('viewAsUserId') ?? '');

  const [data, setData] = useState<EpicAlerts15Payload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // A `domain` deep link (e.g. from a TTM dashboard tile) with no explicit `projects` can only be
  // turned into a Project filter once the first response's domain → project map arrives. Until the
  // list actually reflects that domain, keep showing the skeleton instead of first rendering the
  // unfiltered list and then re-rendering the filtered one ("chớp 2 lần"). Cleared by fetchData's
  // success path (paged mode) or the fetch effect's skip path (full mode — filtered client-side),
  // or by the domain effect when the domain turns out not to exist in this viewer's scope.
  const [domainPending, setDomainPending] = useState(Boolean(deepLinkFilters.domain) && deepLinkFilters.projects.length === 0);
  const domainAppliedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [projectFilters, setProjectFilters] = useState<string[]>(deepLinkFilters.projects);
  const [domainFilter, setDomainFilter] = useState(deepLinkFilters.domain);
  const [pmSmFilters, setPmSmFilters] = useState<string[]>(deepLinkFilters.pmSm);
  const [componentFilters, setComponentFilters] = useState<string[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [alertFilters, setAlertFilters] = useState<AlertFilterValue[]>(deepLinkFilters.alerts);
  const [typeFilters, setTypeFilters] = useState<string[]>(deepLinkFilters.types);
  const [statusFilters, setStatusFilters] = useState<string[]>(deepLinkFilters.status);
  const [requestingUnitFilters, setRequestingUnitFilters] = useState<string[]>(deepLinkFilters.requestingUnits);
  const [dataIssueFilter, setDataIssueFilter] = useState(deepLinkFilters.dataIssue);
  const [search, setSearch] = useState(deepLinkFilters.search);
  const [activeQuickFilter, setActiveQuickFilter] = useState<'PENDING' | 'IN_PO' | 'NOT_IN_PO' | null>(null);
  const [page, setPage] = useState(1);
  // "Bộ lọc nâng cao" — collapsed by default (see reports/page.tsx's "Cấu hình nâng cao..." for
  // the shared UI/logic pattern this mirrors). selectedLayerAnchor === availableLayerDates[0] (or
  // unset) means "no restriction" — equivalent to the default always-latest-per-Epic behavior, so
  // that case sends no layerDates param at all rather than the full list.
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [selectedLayerAnchor, setSelectedLayerAnchor] = useState('');
  const [createdDateFrom, setCreatedDateFrom] = useState('');
  const [startDateFromFilter, setStartDateFromFilter] = useState('');
  const [dueDateFromFilter, setDueDateFromFilter] = useState('');
  const [collapsedColumns, setCollapsedColumns] = useState<Set<CollapsiblePhase>>(new Set(['DESIGN', 'DEV', 'TEST', 'PENTEST']));
  const toggleColumn = (phase: CollapsiblePhase) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase); else next.add(phase);
      return next;
    });
  };
  // "Compact mode": only while every collapsible phase column is collapsed does the table shrink
  // its other wide elements (TTM-CNTT/E2E strips, Status/R4GOLIVE/Release widths) to fit the
  // viewport without horizontal scroll. Expanding any one of them drops back to the wider fixed
  // layout — the user then scrolls horizontally instead.
  const allColumnsCollapsed = collapsedColumns.size === COLLAPSIBLE_PHASES.length;
  const toggleAllColumns = () => setCollapsedColumns(allColumnsCollapsed ? new Set() : new Set(COLLAPSIBLE_PHASES));
  const [alertHistoryRow, setAlertHistoryRow] = useState<EpicAlertRowPhased | null>(null);
  const [browsingEpicKey, setBrowsingEpicKey] = useState<string | null>(null);
  const viewIssueBaseUrl = useJiraViewIssueUrl();

  const availableLayerDates = data?.availableLayerDates ?? EMPTY_LAYER_DATES;
  const recentLayerDates = useMemo(() => availableLayerDates.slice(0, RECENT_LAYER_CHIP_COUNT), [availableLayerDates]);
  const olderLayerDates = useMemo(() => availableLayerDates.slice(RECENT_LAYER_CHIP_COUNT), [availableLayerDates]);
  // Default selection = newest layer, without a setState-in-effect: selectedLayerAnchor starts
  // unset, and this just falls back to the newest available layer until the user clicks a chip.
  const effectiveLayerAnchor = selectedLayerAnchor || availableLayerDates[0] || '';
  // Selecting the newest layer (or none yet) needs no restriction at all — the same query this
  // screen has always run. Only an OLDER anchor narrows the window (see EpicAlertFilters.layerDates
  // — "drill xuống các lớp cũ hơn" picks each Epic's latest row within that window).
  const layerWindow = useMemo(() => {
    if (!effectiveLayerAnchor) return null;
    const anchorIndex = availableLayerDates.indexOf(effectiveLayerAnchor);
    return anchorIndex > 0 ? availableLayerDates.slice(anchorIndex) : null;
  }, [availableLayerDates, effectiveLayerAnchor]);
  const layerWindowKey = layerWindow ? layerWindow.join(',') : '';

  // Debounced so typing in "Tìm kiếm" doesn't fire a network request per keystroke — every other
  // toolbar filter is a discrete click/select, so those go straight into the fetch effect below.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Only the newest request may write `data` — a slower, older response (e.g. the pre-filter one
  // still in flight when a filter changes) must never overwrite the list the user is now looking at.
  const fetchAbortRef = useRef<AbortController | null>(null);
  // In 'full' mode the API ignores every toolbar filter and returns the whole access-scoped set
  // (the client filters/sorts/paginates it itself), so only these params change what it returns —
  // re-fetching the (slow, live-computed) full set for a toolbar/page change would just reload the
  // identical data behind a skeleton. See the fetch effect's skip check below.
  const serverQueryKey = [layerWindowKey, createdDateFrom, startDateFromFilter, dueDateFromFilter].join('|');
  const lastFetchRef = useRef<{ mode: 'paged' | 'full'; serverQueryKey: string } | null>(null);
  const fetchData = async () => {
    const requestServerQueryKey = serverQueryKey;
    const isDomainFilteredRequest = domainAppliedRef.current;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (layerWindow) {
        query.set('layerDates', layerWindow.join(','));
        query.set('asOfDate', effectiveLayerAnchor);
      }
      if (createdDateFrom) query.set('createdDateFrom', createdDateFrom);
      if (startDateFromFilter) query.set('startDateFrom', startDateFromFilter);
      if (dueDateFromFilter) query.set('dueDateFrom', dueDateFromFilter);
      // "Phạm vi dữ liệu cho TTM" override, read once from the deep link that navigated here (e.g. a
      // Dashboard 2 KPI tile with its own Advanced Filter active) — never edited on this screen, so
      // it's forwarded as-is rather than backed by its own toolbar control.
      if (deepLinkFilters.ttmScopeCnttFrom !== undefined) query.set('cnttFrom', deepLinkFilters.ttmScopeCnttFrom ?? '');
      if (deepLinkFilters.ttmScopeCnttTo !== undefined) query.set('cnttTo', deepLinkFilters.ttmScopeCnttTo ?? '');
      if (deepLinkFilters.ttmScopeQaFrom !== undefined) query.set('qaFrom', deepLinkFilters.ttmScopeQaFrom ?? '');
      if (deepLinkFilters.ttmScopeQaTo !== undefined) query.set('qaTo', deepLinkFilters.ttmScopeQaTo ?? '');
      // Every other toolbar filter — server-side when the fast (cache-backed) path serves the
      // request (see the API route); ignored by the fallback path, which keeps filtering `rows`
      // client-side exactly like before this cache existed.
      if (projectFilters.length > 0) query.set('projectKeys', projectFilters.join(','));
      if (pmSmFilters.length > 0) query.set('pmSm', pmSmFilters.join(','));
      if (componentFilters.length > 0) query.set('components', componentFilters.join(','));
      if (alertFilters.length > 0) query.set('alertFilter', alertFilters.join(','));
      if (typeFilters.length > 0) query.set('epicType', typeFilters.join(','));
      if (statusQuery) query.set('statuses', statusQuery);
      if (dataIssueFilter) query.set('dataIssueOnly', '1');
      for (const unit of requestingUnitFilters) query.append('requestingUnit', unit);
      if (debouncedSearch) query.set('search', debouncedSearch);
      if (viewAsUserId) query.set('viewAsUserId', viewAsUserId);
      query.set('page', String(page));
      query.set('pageSize', String(PAGE_SIZE));
      const queryString = query.toString();
      const res = await fetch(`/api/epic-alerts-15${queryString ? `?${queryString}` : ''}`, { signal: controller.signal });
      const result = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(result.error || 'Lỗi hệ thống khi tải dữ liệu.');
        setDomainPending(false);
      } else {
        lastFetchRef.current = { mode: result.mode === 'full' ? 'full' : 'paged', serverQueryKey: requestServerQueryKey };
        setData(result);
        if (isDomainFilteredRequest) setDomainPending(false);
      }
    } catch {
      if (controller.signal.aborted) return;
      setError('Không thể kết nối API Quản trị Epic.');
      setDomainPending(false);
    }
    // Not in `finally`: an aborted request's replacement is already loading, so it must not flip
    // isLoading off (that was the "list flashes, then keeps waiting" on first load).
    setIsLoading(false);
  };

  useEffect(() => {
    fetch('/api/project-components').then((res) => (res.ok ? res.json() : [])).then(setProjectComponents).catch(() => undefined);
  }, []);

  // Company-wide TTM-E2E ("Hoàn thành TTM-E2E"), cached (ttm-index-global-cache-service.ts) — same
  // source as the TTM Dashboard banner widget, fetched standalone so this page doesn't need the
  // dashboard's full company-wide row set just to show one more header pill.
  const [ttmIndexGlobal, setTtmIndexGlobal] = useState<TtmIndexGlobalCache | null>(null);
  useEffect(() => {
    fetch('/api/ttm-index-global').then((res) => (res.ok ? res.json() : null)).then((payload: { ttmIndexGlobal: TtmIndexGlobalCache | null } | null) => setTtmIndexGlobal(payload?.ttmIndexGlobal ?? null)).catch(() => undefined);
  }, []);

  const rows = data?.rows ?? EMPTY_ROWS;

  // TTM-CNTT (QLDA) / TTM-CNTT (QA) header badges — computed over exactly the Epic set the table
  // below is showing (access scope + every toolbar/advanced filter), so they move with the table's
  // data scope. Paged mode only ever holds one page of `rows`, so the server aggregates them over
  // the same WHERE as the page query (see queryTtmCnttIndexes); 'full' mode computes them from
  // filteredRows, which there is the whole filtered set. Declared further down, after filteredRows.
  // The company-wide snapshot (ttm-index-global-cache-service.ts) is shown only on TTM dashboard's banner.
  const { setItems: setHeaderWidgetItems } = useEpicHeaderWidgets();
  useEffect(() => () => setHeaderWidgetItems(null), [setHeaderWidgetItems]);

  // Paged mode: `rows` is only the current page, so every filter dropdown's option list instead
  // comes from the server's filterOptions — computed over the viewer's FULL access scope (see
  // queryEpicAlertFilterOptions) — not from whatever happens to be on screen. 'full' mode keeps
  // deriving options from `rows` (the whole access-scoped set in that mode) exactly as before.
  const projectOptions = useMemo(
    () => (data?.mode === 'paged' && data.filterOptions ? data.filterOptions.projectKeys : [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort()),
    [data, rows],
  );
  // PM/SM options: ownerName is comma-joined when a project has several PM/SM users (see
  // getProjectMetaByProjectKeyMap) — split back out so each individual person is its own option,
  // and selecting one shows every Epic whose project lists them (single-choice, next to "Dự án").
  const pmSmOptions = useMemo(
    () => (data?.mode === 'paged' && data.filterOptions
      ? data.filterOptions.pmSmNames
      : [...new Set(rows.flatMap((row) => row.ownerName.split(',').map((name) => name.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'vi'))),
    [data, rows],
  );
  const statusOptions = useMemo(
    () => (data?.mode === 'paged' && data.filterOptions ? data.filterOptions.statuses : [...new Set(rows.map((row) => row.currentStatus).filter(Boolean))].sort()),
    [data, rows],
  );
  const requestingUnitOptions = useMemo(
    () => (data?.mode === 'paged' && data.filterOptions
      ? data.filterOptions.requestingUnits
      : [...new Set(rows.map((row) => row.requestingUnit).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'vi'))),
    [data, rows],
  );
  // Options = the catalog's components for whichever projects are selected — disabled entirely
  // (no options, filter cleared) until at least one project is picked.
  const componentOptions = useMemo(
    () => [...new Set(projectComponents.filter((component) => projectFilters.includes(component.projectKey)).map((component) => component.componentName))].sort(),
    [projectComponents, projectFilters],
  );
  const handleProjectFiltersChange = (values: string[]) => {
    setProjectFilters(values);
    if (values.length === 0) setComponentFilters([]);
    setPage(1);
  };

  // Admin/superadmin-tier viewers (accessRole LEAD/CBQL_PHONG) — see resolveAccessScope in
  // epic-alert-service.ts: SUPERADMIN/SUPERVISOR → CBQL_PHONG, ADMIN → LEAD, USER → PM_SM.
  const isAdminTierAccess = data ? data.accessRole !== 'PM_SM' : false;

  // Domain → Project Keys, derived straight from the rows already scoped to this viewer's own
  // access (no separate API call needed) — Domain filter picks a Domain and auto-selects every
  // Project Key under it into the existing Project filter. Admin/superadmin-tier only: a PM/SM's
  // own project scope is already small, so there's no real need to pick by Domain first.
  const domainProjectKeys = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (data?.mode === 'paged' && data.filterOptions) {
      for (const [domain, projectKeys] of Object.entries(data.filterOptions.domainProjectKeys)) map.set(domain, new Set(projectKeys));
      return map;
    }
    for (const row of rows) {
      if (!row.domainName || !row.projectKey) continue;
      if (!map.has(row.domainName)) map.set(row.domainName, new Set());
      map.get(row.domainName)!.add(row.projectKey);
    }
    return map;
  }, [data, rows]);
  const domainOptions = useMemo(() => [...domainProjectKeys.keys()].sort((a, b) => a.localeCompare(b, 'vi')), [domainProjectKeys]);
  const handleDomainFilterChange = (value: string) => {
    setDomainFilter(value);
    handleProjectFiltersChange(value ? [...(domainProjectKeys.get(value) ?? [])].sort() : []);
  };

  // Load saved filters on client mount to avoid SSR hydration mismatch
  const hasLoadedSavedFilters = useRef(false);
  const [savedFiltersReady, setSavedFiltersReady] = useState(deepLinkFilters.hasAny);
  useEffect(() => {
    if (hasLoadedSavedFilters.current || deepLinkFilters.hasAny) return;
    hasLoadedSavedFilters.current = true;
    const saved = loadSavedFilters();

    // Deferred past the effect's synchronous scope (matching this file's own fetchData-trigger
    // effect below) — restoring several filters at once here would otherwise be flagged as
    // cascading setState-in-effect. setSavedFiltersReady lands in the same batch as the restored
    // filters, so the first fetch sees them all at once.
    void Promise.resolve().then(() => {
      setSavedFiltersReady(true);
      if (!saved) return;
      if (saved.projectFilters && saved.projectFilters.length > 0) setProjectFilters(saved.projectFilters);
      if (saved.domainFilter) setDomainFilter(saved.domainFilter);
      if (saved.pmSmFilters && saved.pmSmFilters.length > 0) {
        setPmSmFilters(saved.pmSmFilters);
      } else if (saved.pmSmFilter) {
        setPmSmFilters(typeof saved.pmSmFilter === 'string' ? saved.pmSmFilter.split(',').map((s) => s.trim()).filter(Boolean) : saved.pmSmFilter);
      }
      if (saved.componentFilters && saved.componentFilters.length > 0) setComponentFilters(saved.componentFilters);
      if (saved.alertFilters && saved.alertFilters.length > 0) setAlertFilters(saved.alertFilters);
      else if (saved.alertFilter) setAlertFilters([saved.alertFilter]);
      if (saved.typeFilters && saved.typeFilters.length > 0) setTypeFilters(saved.typeFilters);
      else if (saved.typeFilter) setTypeFilters([saved.typeFilter]);
      if (saved.statusFilters && saved.statusFilters.length > 0) {
        // Pre-empts the default-status-filter effect below (same ref) so a saved selection is
        // never immediately clobbered by the default exclusion set once statusOptions loads.
        // eslint-disable-next-line react-hooks/immutability -- deliberate cross-effect coordination, see comment above.
        hasAppliedDefaultStatusFilter.current = true;
        setStatusFilters(saved.statusFilters);
      }
      if (saved.requestingUnitFilters && saved.requestingUnitFilters.length > 0) setRequestingUnitFilters(saved.requestingUnitFilters);
      else if (saved.requestingUnitFilter) setRequestingUnitFilters([saved.requestingUnitFilter]);
      if (saved.dataIssueFilter) setDataIssueFilter(saved.dataIssueFilter);
      if (saved.search) setSearch(saved.search);
      if (saved.activeQuickFilter) setActiveQuickFilter(saved.activeQuickFilter);
      if (saved.selectedLayerAnchor) setSelectedLayerAnchor(saved.selectedLayerAnchor);
      if (saved.createdDateFrom) setCreatedDateFrom(saved.createdDateFrom);
      if (saved.startDateFromFilter) setStartDateFromFilter(saved.startDateFromFilter);
      if (saved.dueDateFromFilter) setDueDateFromFilter(saved.dueDateFromFilter);
    });
  }, [deepLinkFilters.hasAny]);

  // A `domain` deep-link or saved domain filter needs domainProjectKeys, which only exists once rows have loaded
  const hasAppliedDomainFilter = useRef(!deepLinkFilters.domain || deepLinkFilters.projects.length > 0);
  useEffect(() => {
    const targetDomain = domainFilter || deepLinkFilters.domain;
    if (hasAppliedDomainFilter.current || !targetDomain || domainProjectKeys.size === 0) return;
    const projectKeysForDomain = domainProjectKeys.get(targetDomain);
    if (!projectKeysForDomain) {
      // Domain not in this viewer's scope — nothing to narrow to, so stop holding the list back.
      hasAppliedDomainFilter.current = true;
      void Promise.resolve().then(() => setDomainPending(false));
      return;
    }
    hasAppliedDomainFilter.current = true;
    domainAppliedRef.current = true;
    void Promise.resolve().then(() => {
      setDomainFilter(targetDomain);
      setProjectFilters([...projectKeysForDomain].sort());
    });
  }, [deepLinkFilters.domain, domainFilter, domainProjectKeys]);

  // Skipped only when deep link explicitly specifies a status filter
  const hasAppliedDefaultStatusFilter = useRef(deepLinkFilters.status.length > 0);
  useEffect(() => {
    if (hasAppliedDefaultStatusFilter.current || statusOptions.length === 0) return;
    // eslint-disable-next-line react-hooks/immutability -- also set by the saved-filters-restore effect above (deliberate cross-effect coordination).
    hasAppliedDefaultStatusFilter.current = true;
    setStatusFilters(statusOptions.filter((status) => !isCancelledStatus(status)));
  }, [statusOptions]);

  // What actually goes into the `statuses` param. "Every non-cancelled status" is exactly what an
  // empty param already means server-side (and in the 'full'-mode client filter), so that set is
  // sent as '' — otherwise the default-status effect above, filling in the list the moment the
  // first response arrives, would re-fire the whole fetch for an identical result.
  const defaultStatuses = statusOptions.filter((status) => !isCancelledStatus(status));
  const isDefaultStatusSet = statusFilters.length === defaultStatuses.length && defaultStatuses.every((status) => statusFilters.includes(status));
  const statusQuery = isDefaultStatusSet ? '' : statusFilters.join(',');

  useEffect(() => {
    // Held back until saved filters (if any) have been restored, so a returning user's first
    // request already carries their filters instead of fetching the defaults first.
    if (!savedFiltersReady) return;
    // 'full' mode: the last response already holds the whole set for these server params — every
    // toolbar filter/page change is applied client-side (filteredRows), so no refetch.
    const last = lastFetchRef.current;
    if (last?.mode === 'full' && last.serverQueryKey === serverQueryKey) {
      if (domainAppliedRef.current) void Promise.resolve().then(() => setDomainPending(false));
      return;
    }
    // Deferring the initial request prevents a synchronous state update during effect setup. Also
    // re-runs whenever any toolbar filter or the page changes — every filter setter already resets
    // page to 1 in the same event, so a filter change and its page reset land in one fetch.
    void Promise.resolve().then(fetchData);
  }, [
    savedFiltersReady, serverQueryKey, layerWindowKey, createdDateFrom, startDateFromFilter, dueDateFromFilter,
    projectFilters, pmSmFilters, componentFilters, alertFilters, typeFilters, statusQuery,
    dataIssueFilter, requestingUnitFilters, debouncedSearch, page,
  ]);
  useEffect(() => () => fetchAbortRef.current?.abort(), []);

  const handlePendingQuickFilter = () => {
    if (activeQuickFilter === 'PENDING') {
      setActiveQuickFilter(null);
      setStatusFilters(statusOptions.filter((status) => !isCancelledStatus(status)));
    } else {
      setActiveQuickFilter('PENDING');
      const matched = statusOptions.filter((s) => s.trim().toLocaleUpperCase('en-US').includes('PENDING'));
      setStatusFilters(matched.length > 0 ? matched : ['Pending']);
    }
    setPage(1);
  };

  const handleInPoQuickFilter = () => {
    if (activeQuickFilter === 'IN_PO') {
      setActiveQuickFilter(null);
      setStatusFilters(statusOptions.filter((status) => !isCancelledStatus(status)));
    } else {
      setActiveQuickFilter('IN_PO');
      const targetStatuses = new Set(['TO DO', 'IN PO', 'RELEASED']);
      const matched = statusOptions.filter((s) => targetStatuses.has(s.trim().toLocaleUpperCase('en-US')));
      setStatusFilters(matched.length > 0 ? matched : ['To Do', 'In PO', 'Released']);
    }
    setPage(1);
  };

  const handleNotInPoQuickFilter = () => {
    if (activeQuickFilter === 'NOT_IN_PO') {
      setActiveQuickFilter(null);
      setStatusFilters(statusOptions.filter((status) => !isCancelledStatus(status)));
    } else {
      setActiveQuickFilter('NOT_IN_PO');
      const matched = statusOptions.filter((s) => !EXCLUDED_NOT_IN_PO.has(normalizeEpicWorkflowStatus(s)));
      setStatusFilters(matched);
    }
    setPage(1);
  };

  const handleSaveFilters = () => {
    const config: SavedFilterConfig = {
      activeQuickFilter,
      alertFilters,
      componentFilters,
      createdDateFrom,
      dataIssueFilter,
      domainFilter,
      dueDateFromFilter,
      pmSmFilter: pmSmFilters.join(','),
      pmSmFilters,
      projectFilters,
      requestingUnitFilters,
      search,
      selectedLayerAnchor,
      startDateFromFilter,
      statusFilters,
      typeFilters,
    };
    try {
      localStorage.setItem(SAVED_FILTER_STORAGE_KEY, JSON.stringify(config));
      showToast('Đã lưu trạng thái filter');
    } catch {
      showToast('Lỗi: Không thể lưu trạng thái filter');
    }
  };

  const handleResetFilters = () => {
    try {
      localStorage.removeItem(SAVED_FILTER_STORAGE_KEY);
    } catch {}
    setProjectFilters([]);
    setDomainFilter('');
    setPmSmFilters([]);
    setComponentFilters([]);
    setAlertFilters([]);
    setTypeFilters([]);
    setStatusFilters(statusOptions.filter((status) => !isCancelledStatus(status)));
    setRequestingUnitFilters([]);
    setDataIssueFilter(false);
    setSearch('');
    setActiveQuickFilter(null);
    setSelectedLayerAnchor('');
    setCreatedDateFrom('');
    setStartDateFromFilter('');
    setDueDateFromFilter('');
    setPage(1);
    showToast('Đã đặt lại bộ lọc mặc định');
  };

  // Stat widgets (Fail TTM-CNTT/E2E, Cảnh báo muộn) act on "Nhận xét": active only while that value
  // is the sole selection; clicking replaces whatever is selected with just it (or clears it).
  const isOnlyAlertFilter = (value: AlertFilterValue) => alertFilters.length === 1 && alertFilters[0] === value;
  const toggleOnlyAlertFilter = (value: AlertFilterValue) => {
    setAlertFilters(isOnlyAlertFilter(value) ? [] : [value]);
    setPage(1);
  };

  // Paged mode: the server already filtered/sorted `rows` down to exactly this page (see the API
  // route) — re-filtering here would double-apply the same filters against a set that's already
  // narrowed, silently dropping rows. 'full' mode keeps the original client-side pipeline.
  const filteredRows = useMemo(() => {
    if (data?.mode === 'paged') return rows;
    return rows.filter((row) => {
      const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
      return (projectFilters.length === 0 || projectFilters.includes(row.projectKey))
        && (pmSmFilters.length === 0 || row.ownerName.split(',').map((name) => name.trim()).some((name) => pmSmFilters.includes(name)))
        && (componentFilters.length === 0 || row.components.some((component) => componentFilters.includes(component)))
        && (alertFilters.length === 0 || alertFilters.some((alertFilter) => matchesAlertFilter(row, alertFilter)))
        && (typeFilters.length === 0 || (row.epicType !== null && typeFilters.includes(row.epicType)))
        && (statusFilters.length === 0 ? !isCancelledStatus(row.currentStatus) : statusFilters.includes(row.currentStatus))
        && (!dataIssueFilter || row.hasDataAnomaly)
        && (requestingUnitFilters.length === 0 || (row.requestingUnit !== null && requestingUnitFilters.includes(row.requestingUnit)))
        && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch));
    }).sort((a, b) => listGroupRankOf(a.currentStatus, a.ttmCnttInScope) - listGroupRankOf(b.currentStatus, b.ttmCnttInScope));
  }, [data?.mode, rows, projectFilters, pmSmFilters, componentFilters, alertFilters, typeFilters, statusFilters, dataIssueFilter, requestingUnitFilters, search]);

  const clientTtmCnttQlda = useMemo(() => summarizeTtmCntt(filteredRows), [filteredRows]);
  const clientTtmCnttQa = useMemo(() => summarizeQaIndex(filteredRows), [filteredRows]);
  const ttmCnttQlda = data?.mode === 'paged' && data.ttmIndexPm ? data.ttmIndexPm : clientTtmCnttQlda;
  const ttmCnttQa = data?.mode === 'paged' && data.qaIndexPm ? data.qaIndexPm : clientTtmCnttQa;
  // Publishes the badges into AppShell's shared sticky header (see epic-header-widgets-context.tsx).
  // Clearing lives in its own cleanup-only effect above, so an ordinary data refresh never flashes
  // them empty-then-full.
  useEffect(() => {
    if (!data) return;
    setHeaderWidgetItems([
      {
        key: 'ttm-cntt-qlda',
        label: 'TTM-CNTT (QLDA)',
        tone: 'ttm',
        value: formatTtmIndexValue(ttmCnttQlda),
        tooltip: formatTtmIndexTooltip('Chỉ số TTM-CNTT (QLDA) tính trên các Epic đang hiển thị trong bảng Danh sách Epic (theo bộ lọc)', ttmCnttQlda),
      },
      {
        key: 'ttm-cntt-qa',
        label: 'TTM-CNTT (QA)',
        tone: 'qa',
        value: formatTtmIndexValue(ttmCnttQa),
        tooltip: formatTtmIndexTooltip('Chỉ số TTM-CNTT (QA) tính trên các Epic đang hiển thị trong bảng Danh sách Epic (theo bộ lọc), theo cách tính của QA', ttmCnttQa),
      },
      {
        key: 'ttm-e2e-global',
        label: 'TTM-E2E',
        tone: 'e2e',
        value: formatTtmIndexValue(ttmIndexGlobal?.e2e ?? null),
        tooltip: formatTtmIndexTooltip('Chỉ số Hoàn thành TTM-E2E tính trên toàn bộ Epic trong ứng dụng (giống nhau với mọi người dùng, không đổi theo bộ lọc)', ttmIndexGlobal?.e2e ?? null),
      },
    ]);
  }, [data, setHeaderWidgetItems, ttmCnttQa, ttmCnttQlda, ttmIndexGlobal]);

  // Raw status strings (case as stored) whose normalized form is PENDING/TO DO — the Pending/To Do
  // stat widgets set the Status filter (a multi-select) to exactly this set.
  const pendingStatusValues = useMemo(() => statusOptions.filter((status) => status.trim().toLocaleUpperCase('en-US') === 'PENDING'), [statusOptions]);
  const todoStatusValues = useMemo(() => statusOptions.filter((status) => status.trim().toLocaleUpperCase('en-US') === 'TO DO'), [statusOptions]);
  const isExactStatusSet = (values: string[]) => values.length > 0 && statusFilters.length === values.length && values.every((value) => statusFilters.includes(value));

  // Paged mode: the server already computed this over the full filtered set (queryEpicAlertStat-
  // Counts), not just the current page — the client fallback below only applies in 'full' mode.
  const clientStatCounts = useMemo(() => {
    let failCntt = 0;
    let failE2e = 0;
    let late = 0;
    let dataIssue = 0;
    let pending = 0;
    let todo = 0;
    for (const row of filteredRows) {
      if (row.ttmCnttInScope && row.alertLevel === 'FAIL') failCntt += 1;
      if (row.ttmE2eAlertLevel === 'FAIL') failE2e += 1;
      if (row.ttmCnttInScope && row.alertLevel === 'LATE') late += 1;
      if (row.hasDataAnomaly) dataIssue += 1;
      const normalizedStatus = row.currentStatus.trim().toLocaleUpperCase('en-US');
      if (normalizedStatus === 'PENDING') pending += 1;
      else if (normalizedStatus === 'TO DO') todo += 1;
    }
    return { dataIssue, failCntt, failE2e, late, pending, todo };
  }, [filteredRows]);
  const statCounts = data?.mode === 'paged' && data.statCounts ? data.statCounts : clientStatCounts;

  // Admin/superadmin-tier viewers (accessRole LEAD/CBQL_PHONG) can be scoped to a huge number of
  // project keys, so the stat widgets only compute/show once the Project filter narrows that down
  // to a workable range (1–3 projects) — a PM/SM viewer's own scope is already small, so it's exempt.
  const statWidgetsGateMessage = isAdminTierAccess && (projectFilters.length === 0 || projectFilters.length > 3)
    ? 'Chọn từ 1 đến 3 dự án ở bộ lọc "Dự án" để xem thống kê nhanh.'
    : undefined;

  // Paged mode: `rows` IS the current page already (server-paginated) — slicing it again would cut
  // it down to a sub-page. totalCount/page/pageSize come straight from the API response.
  const totalPages = data?.mode === 'paged'
    ? Math.max(1, Math.ceil((data.totalCount ?? 0) / (data.pageSize ?? PAGE_SIZE)))
    : Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = data?.mode === 'paged' ? (data.page ?? page) : Math.min(page, totalPages);
  const pageRows = useMemo(
    () => (data?.mode === 'paged' ? filteredRows : filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)),
    [data?.mode, filteredRows, currentPage],
  );

  return (
    <div className="ttm-app">
      {!isEmbedded && <InfoBannerDisplay pathname="/epic-alerts-15" />}
      {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}
      {data?.viewAsUser && (
        <div className="ttm-note" style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#78350f', fontWeight: 600 }}>
          Đang xem danh sách dưới quyền của: {data.viewAsUser.fullName} ({data.viewAsUser.email})
        </div>
      )}
      {data?.asOfDate && (
        <div className="ttm-note" style={{ background: '#fff7e6', borderColor: '#f0c36d', color: '#7a5200', fontWeight: 700 }}>
          Đang xem dữ liệu &amp; đánh giá cảnh báo tại thời điểm {data.asOfDate.split('-').reverse().join('/')} (không phải hôm nay thực tế).
        </div>
      )}

      {data && !isEmbedded && !domainPending && (
        <div className="border-b border-slate-300 pb-3 mb-3">
          <EpicStatWidgets
            gateMessage={statWidgetsGateMessage}
            items={[
              {
                icon: XCircle, isActive: isOnlyAlertFilter('FAIL'), key: 'fail-cntt', label: 'Epic Fail TTM-CNTT (QLDA)',
                onClick: () => toggleOnlyAlertFilter('FAIL'),
                tone: 'danger', value: statCounts.failCntt,
              },
              {
                icon: Prohibit, isActive: isOnlyAlertFilter('FAIL_E2E'), key: 'fail-e2e', label: 'Epic Fail TTM-E2E',
                onClick: () => toggleOnlyAlertFilter('FAIL_E2E'),
                tone: 'danger', value: statCounts.failE2e,
              },
              {
                icon: ClockCountdown, isActive: isOnlyAlertFilter('LATE'), key: 'late', label: 'Epic Cảnh báo muộn',
                onClick: () => toggleOnlyAlertFilter('LATE'),
                tone: 'warning', value: statCounts.late,
              },
              {
                icon: WarningOctagon, isActive: dataIssueFilter, key: 'data-issue', label: 'Epic sai lệch dữ liệu',
                onClick: () => { setDataIssueFilter((current) => !current); setPage(1); },
                tone: 'warning', value: statCounts.dataIssue,
              },
              {
                icon: HourglassMedium, isActive: isExactStatusSet(pendingStatusValues), key: 'pending', label: 'Epic Pending',
                onClick: () => {
                  const nextActive = !isExactStatusSet(pendingStatusValues);
                  setStatusFilters(nextActive ? pendingStatusValues : []);
                  setActiveQuickFilter(nextActive ? 'PENDING' : null);
                  setPage(1);
                },
                tone: 'neutral', value: statCounts.pending,
              },
              {
                icon: ListChecks, isActive: isExactStatusSet(todoStatusValues), key: 'todo', label: 'Epic To Do',
                onClick: () => {
                  const nextActive = !isExactStatusSet(todoStatusValues);
                  setStatusFilters(nextActive ? todoStatusValues : []);
                  setActiveQuickFilter(null);
                  setPage(1);
                },
                tone: 'neutral', value: statCounts.todo,
              },
            ]}
          />
        </div>
      )}

      {/* Single-row toolbar (.ttm-toolbar-row): every control shrinks to share one line instead of
          wrapping — see epic-alerts-15.css. Empty-state labels are the short filter names. */}
      <section className="ttm-toolbar ttm-toolbar-row" aria-label="Bộ lọc Epic">
        <div className="ttm-toolbar-title flex items-center gap-1.5 text-xs font-bold text-black shrink-0 select-none">
          <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
          <span>Filters:</span>
        </div>
        {isAdminTierAccess && (
          <select
            className={`ttm-select${domainFilter ? ' has-filter' : ''}`}
            aria-label="Domain"
            title="Domain"
            value={domainFilter}
            onChange={(event) => handleDomainFilterChange(event.target.value)}
          >
            <option value="">Domain</option>
            {domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
        )}
        <ToolbarMultiSelect
          ariaLabel="Dự án"
          searchable
          allLabel="Projects"
          options={projectOptions}
          value={projectFilters}
          onChange={(values) => { setDomainFilter(''); handleProjectFiltersChange(values); }}
        />
        <ToolbarMultiSelect
          ariaLabel="PM/SM"
          searchable
          allLabel="PM/SM"
          options={pmSmOptions}
          value={pmSmFilters}
          onChange={(values) => { setPmSmFilters(values); setPage(1); }}
        />
        <ToolbarMultiSelect
          ariaLabel="Components"
          allLabel="Components"
          title={projectFilters.length === 0 ? 'Chọn dự án trước' : undefined}
          disabled={projectFilters.length === 0}
          options={componentOptions}
          value={componentFilters}
          onChange={(values) => { setComponentFilters(values); setPage(1); }}
        />
        <ToolbarMultiSelect
          ariaLabel="Lọc Nhận xét"
          allLabel="Nhận xét"
          options={alertFilterOptionsFor(data?.engineMode).filter((option) => option.value !== '')}
          value={alertFilters}
          onChange={(values) => { setAlertFilters(values as AlertFilterValue[]); setPage(1); }}
        />
        <ToolbarMultiSelect
          ariaLabel="Loại Epic"
          allLabel="Loại Epic"
          options={EPIC_COMPLEXITY_TYPES}
          value={typeFilters}
          onChange={(values) => { setTypeFilters(values); setPage(1); }}
        />
        <ToolbarMultiSelect
          ariaLabel="Status"
          allLabel="Status"
          options={statusOptions}
          value={statusFilters}
          onChange={(values) => { setStatusFilters(values); setActiveQuickFilter(null); setPage(1); }}
        />
        <ToolbarMultiSelect
          ariaLabel="Đơn vị yêu cầu"
          searchable
          allLabel="Đơn vị yêu cầu"
          options={requestingUnitOptions}
          value={requestingUnitFilters}
          onChange={(values) => { setRequestingUnitFilters(values); setPage(1); }}
        />
        <input
          className={`ttm-field ttm-search-field${search.trim() ? ' has-filter' : ''}`}
          type="search"
          aria-label="Tìm epic"
          placeholder="Tìm epic"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
        <button
          type="button"
          className="ttm-button ghost ttm-collapse-all-toggle"
          onClick={toggleAllColumns}
          title={allColumnsCollapsed ? 'Mở rộng các cột DESIGN/DEV/TEST/PENTEST' : 'Thu gọn các cột DESIGN/DEV/TEST/PENTEST'}
          aria-label={allColumnsCollapsed ? 'Mở rộng các cột DESIGN/DEV/TEST/PENTEST' : 'Thu gọn các cột DESIGN/DEV/TEST/PENTEST'}
        >
          {allColumnsCollapsed ? <ArrowsOutLineHorizontal size={16} weight="bold" /> : <ArrowsInLineHorizontal size={16} weight="bold" />}
        </button>
      </section>

      <div className="border-t border-slate-300 pt-3 mb-3 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-black shrink-0 mr-1 select-none">
            <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
            <span>Quick filters:</span>
          </div>
          <Tooltip content="Lọc các Epic có status là Pending" side="top" className="inline-flex w-auto shrink-0">
            <button
              type="button"
              onClick={handlePendingQuickFilter}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                activeQuickFilter === 'PENDING'
                  ? 'bg-amber-500 border-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 hover:border-amber-400'
              }`}
            >
              <HourglassMedium className="size-3.5" weight={activeQuickFilter === 'PENDING' ? 'bold' : 'regular'} />
              <span>Pending Epics</span>
            </button>
          </Tooltip>
          <Tooltip content="Lọc các Epic có status thuộc: To Do, In PO, Released" side="top" className="inline-flex w-auto shrink-0">
            <button
              type="button"
              onClick={handleInPoQuickFilter}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                activeQuickFilter === 'IN_PO'
                  ? 'bg-[#1463f7] border-blue-700 text-white shadow-sm'
                  : 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100 hover:border-blue-300'
              }`}
            >
              <FolderSimple className="size-3.5" weight={activeQuickFilter === 'IN_PO' ? 'bold' : 'regular'} />
              <span>Epics in PO</span>
            </button>
          </Tooltip>
          <Tooltip content="Lọc các Epic ở tất cả trạng thái trừ: Cancelled, To Do, In PO, Released" side="top" className="inline-flex w-auto shrink-0">
            <button
              type="button"
              onClick={handleNotInPoQuickFilter}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                activeQuickFilter === 'NOT_IN_PO'
                  ? 'bg-purple-600 border-purple-700 text-white shadow-sm'
                  : 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100 hover:border-purple-300'
              }`}
            >
              <Sparkle className="size-3.5" weight={activeQuickFilter === 'NOT_IN_PO' ? 'bold' : 'regular'} />
              <span>not Epics in PO</span>
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <Tooltip content="Lưu trạng thái filter" side="top" className="inline-flex w-auto shrink-0">
            <button
              type="button"
              onClick={handleSaveFilters}
              aria-label="Lưu trạng thái filter"
              className="flex items-center justify-center p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-slate-700 shadow-sm transition-colors cursor-pointer shrink-0"
            >
              <FloppyDisk className="size-4 text-slate-600" weight="bold" />
            </button>
          </Tooltip>
          <Tooltip content="Đặt lại bộ lọc mặc định" side="top" className="inline-flex w-auto shrink-0">
            <button
              type="button"
              onClick={handleResetFilters}
              aria-label="Đặt lại bộ lọc mặc định"
              className="flex items-center justify-center p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-slate-700 shadow-sm transition-colors cursor-pointer shrink-0"
            >
              <ArrowCounterClockwise className="size-4 text-slate-600" weight="bold" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="border-t border-slate-300 pt-3 mb-4">
        <button
          type="button"
          onClick={() => setAdvancedFiltersOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors"
        >
          {advancedFiltersOpen ? <CaretDown className="size-4 text-[#1463f7]" weight="bold" /> : <CaretRight className="size-4 text-[#1463f7]" weight="bold" />}
          <span>Advanced Filters</span>
        </button>
        {advancedFiltersOpen && (
          <div className="mt-3 space-y-3 pl-2 border-l-2 border-[#1463f7] pt-1">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-black">Chọn lớp dữ liệu</label>
                <span className="text-[10px] text-gray-700 font-medium">Chọn 1 lớp dữ liệu, dữ liệu sẽ tự động drill xuống các lớp cũ hơn nếu thiếu.</span>
              </div>
              {availableLayerDates.length === 0 ? (
                <p className="text-[11px] text-gray-600">Chưa có lớp dữ liệu nào trong hệ thống.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {recentLayerDates.map((layer, idx) => {
                    const isSelected = layer === effectiveLayerAnchor;
                    return (
                      <button
                        key={layer}
                        type="button"
                        onClick={() => { setSelectedLayerAnchor(layer); setPage(1); }}
                        title={`Chọn lớp dữ liệu ${layer} (drill xuống các lớp cũ hơn)`}
                        className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${isSelected ? 'border-[#1463f7] bg-[#1463f7] text-white' : 'border-slate-400 bg-white text-gray-800 hover:border-black'}`}
                      >
                        {isSelected && <Check className="size-3.5" weight="bold" />}
                        <span>{layer}</span>
                        {idx === 0 && <span className="bg-black text-white px-1 text-[9px] uppercase">Mới nhất</span>}
                      </button>
                    );
                  })}
                  {olderLayerDates.length > 0 && (
                    <select
                      className={`rounded-none border px-2 py-1.5 text-xs font-bold font-mono cursor-pointer ${olderLayerDates.includes(effectiveLayerAnchor) ? 'border-[#1463f7] text-[#1463f7]' : 'border-slate-400 text-gray-800'}`}
                      value={olderLayerDates.includes(effectiveLayerAnchor) ? effectiveLayerAnchor : ''}
                      onChange={(event) => { if (event.target.value) { setSelectedLayerAnchor(event.target.value); setPage(1); } }}
                      title="Chọn 1 lớp dữ liệu cũ hơn (ngoài 5 lớp gần nhất) — drill xuống các lớp cũ hơn nữa"
                    >
                      <option value="">Lớp dữ liệu cũ hơn…</option>
                      {olderLayerDates.map((layer) => <option key={layer} value={layer}>{layer}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-300 pt-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-black">Epic tạo mới từ (Created Date ≥)</label>
                <input
                  type="date"
                  value={createdDateFrom}
                  onChange={(event) => { setCreatedDateFrom(event.target.value); setPage(1); }}
                  className={`w-full rounded-none border ${createdDateFrom ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-black">Epic start date từ (Start CNTT / T1 ≥)</label>
                <input
                  type="date"
                  value={startDateFromFilter}
                  onChange={(event) => { setStartDateFromFilter(event.target.value); setPage(1); }}
                  className={`w-full rounded-none border ${startDateFromFilter ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-black">Epic golive sau (Due Date ≥)</label>
                <input
                  type="date"
                  value={dueDateFromFilter}
                  onChange={(event) => { setDueDateFromFilter(event.target.value); setPage(1); }}
                  className={`w-full rounded-none border ${dueDateFromFilter ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading || domainPending ? (
        <TableSkeleton rows={8} />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="Không có Epic phù hợp" description="Thử thay đổi bộ lọc." />
      ) : (
        <TableContainer>
          <Table className={allColumnsCollapsed ? 'ttm-table-compact' : 'min-w-[1540px]'}>
            <THead>
              <TR>
                <TH className={`ttm-epic-col-sticky ttm-col-border-right ${allColumnsCollapsed ? 'min-w-[150px]' : 'min-w-[180px]'}`} title="issues.issue_key / issues.issue_name">Epic</TH>
                <TH className={allColumnsCollapsed ? 'min-w-[90px]' : 'min-w-[120px]'} title="Tính toán (alertLevel) — không lưu trực tiếp trong CSDL">Nhận xét</TH>
                <TH title="Baseline (dòng trên) = Start Date + TTM-CNTT (QLDA); Thực tế (dòng dưới) = Start Date → R4G Date (hoặc hôm nay nếu chưa có)">TTM-CNTT (QLDA)</TH>
                <TH className="ttm-col-border-right" title="Baseline (dòng trên) = T0 + TTM-E2E; Thực tế (dòng dưới) = T0 → Due Date (hoặc hôm nay nếu chưa có). T0 = Idea Approved Date, hoặc Start Date, hoặc ngày tạo Jira">TTM-E2E</TH>
                <TH className={allColumnsCollapsed ? 'ttm-col-compact-status' : undefined} title="issues.current_status">Status</TH>
                <TH className={allColumnsCollapsed ? 'min-w-[92px]' : 'min-w-[100px]'} title="T0 = Idea Approved Date, hoặc ngày tạo Jira nếu không có — điểm bắt đầu chu kỳ TTM-E2E">START-E2E</TH>
                <TH title="issues.start_date">START-CNTT</TH>
                <CollapsiblePhaseHeader phase="DESIGN" isCollapsed={collapsedColumns.has('DESIGN')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="DEV" isCollapsed={collapsedColumns.has('DEV')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="TEST" isCollapsed={collapsedColumns.has('TEST')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="PENTEST" isCollapsed={collapsedColumns.has('PENTEST')} onToggle={toggleColumn} />
                <TH className={allColumnsCollapsed ? 'min-w-[92px]' : 'min-w-[110px]'} title="Baseline = Start Date + 100% TTM-CNTT (QLDA); dòng dưới = issues.r4g_date">R4GOLIVE</TH>
                <TH className={allColumnsCollapsed ? 'min-w-[98px]' : 'min-w-[118px]'} title="Baseline = Ngày duyệt ý tưởng (hoặc Ngày epic created nếu không có) + 20 ngày làm việc, không tính holiday. Dòng dưới = issues.due_date">Release</TH>
              </TR>
            </THead>
            <TBody>
              {pageRows.map((row: EpicAlertRowPhased) => {
                const isMissingCore = !row.t1StartDate;
                return (
                  <TR key={row.epicKey} className={row.hasDataAnomaly ? 'missing-row' : undefined}>
                    <TD className="ttm-epic-col-sticky ttm-col-border-right">
                      <AlertHistoryButton row={row} onOpen={setAlertHistoryRow} />
                      <JiraLinkButton epicKey={row.epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <button
                        type="button"
                        className="ttm-epic-key"
                        onClick={() => { trackDataUsage(); setBrowsingEpicKey(row.epicKey); }}
                        title={`Duyệt Epic (Epic Browser) — Lớp dữ liệu: ${formatDate(row.dataLayerDate)}`}
                      >
                        {row.epicKey}
                      </button>
                      {row.epicName && (
                        <span className="ttm-epic-summary" title={row.epicName}>{truncateSummary(row.epicName)}</span>
                      )}
                      {(row.epicType || row.ownerName) && (
                        <span className="ttm-project-tag">{row.epicType ? `${row.epicType}. ` : ''}PM/SM: {row.ownerName || '-'}</span>
                      )}
                      {row.missingStandardInfo.filter((item) => item !== 'Start Date').length > 0 && (
                        <span>
                          {row.missingStandardInfo
                            .filter((item) => item !== 'Start Date')
                            .map((item) => (
                              <span key={item} className="ttm-missing-tag">Thiếu {item}</span>
                            ))}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {(() => {
                        // "Sai Status" (see resolveTtmCnttStatusMismatch in epic-alert-service.ts) always
                        // takes priority over Đạt/Fail TTM-CNTT — the recorded date is on schedule, but
                        // the workflow status hasn't caught up, so neither badge would be honest here.
                        // "Đạt TTM-CNTT" requires the recorded date to have actually already passed —
                        // ttmActualToDate only equals r4gDate once it's chronological AND <= today (see
                        // resolveTtmActualRange); a future-dated R4G Date (still "in progress") must not
                        // be praised as achieved just because it exists.
                        const ttmCnttAchieved = isTtmCnttAchieved(row);
                        // "Đạt TTM-E2E" (2026-09-24 rule): status Released AND T0→R4G Date on schedule —
                        // see resolveTtmE2eRelease's doc comment for why status alone isn't derived there.
                        const ttmE2eAchieved = isTtmE2eAchieved(row);
                        // "Phạm vi dữ liệu cho TTM" (Cấu hình cảnh báo, 2026-09-27) — !ttmCnttInScope
                        // always wins over every other TTM-CNTT badge below (Sai Status/Fail/Late/
                        // Early/Đạt): the underlying alertLevel is still computed as usual, it's just
                        // not honest to show it for an Epic outside the admin-configured R4G window.
                        const hasCnttBadge = !row.ttmCnttInScope || row.ttmCnttStatusMismatch || row.alertLevel !== 'NONE' || ttmCnttAchieved;
                        const hasE2eBadge = row.ttmE2eAlertLevel === 'FAIL' || ttmE2eAchieved;
                        const hasReleaseBadge = row.releaseAxisState !== 'NONE' || isWaitingGolive(row);
                        const hasAnyBadge = hasCnttBadge || hasE2eBadge || hasReleaseBadge || row.hasDataAnomaly || hasScoringExtraBadges(row);

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {!row.ttmCnttInScope ? (
                              <Tooltip content="Epic nằm ngoài phạm vi dữ liệu TTM-CNTT (QLDA) đang cấu hình (R4G Date/baseline nằm ngoài khoảng ngày thiết lập tại 'Cấu hình cảnh báo')." className="inline-flex w-auto">
                                <span className="ttm-badge out-of-scope">Ngoài phạm vi TTM-CNTT (QLDA)</span>
                              </Tooltip>
                            ) : row.ttmCnttStatusMismatch ? (
                              <Tooltip content="R4G Date đã ghi nhận và đúng hạn theo TTM-CNTT (QLDA), nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status đúng quy định." className="inline-flex w-auto">
                                <span className="ttm-badge status-mismatch">Sai Status</span>
                              </Tooltip>
                            ) : row.alertLevel === 'FAIL' ? (
                              <span className="ttm-badge fail-cntt">Fail TTM-CNTT (QLDA)</span>
                            ) : row.alertLevel === 'LATE' ? (
                              <span className="ttm-badge late-warning">Cảnh báo muộn</span>
                            ) : row.alertLevel === 'EARLY' ? (
                              <span className="ttm-badge early-warning">Cảnh báo sớm</span>
                            ) : ttmCnttAchieved ? (
                              <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT (QLDA) đúng hạn theo rule">Đạt TTM-CNTT (QLDA)</span>
                            ) : null}
                            {/* Scoring Service (2026-10-01): "Sai Status" no longer takes the pass away — both show. */}
                            {row.ttmCnttInScope && row.ttmCnttStatusMismatch && ttmCnttAchieved && (
                              <span className="ttm-badge-achieved" title="R4G Date đúng hạn — vẫn tính Đạt; cần cập nhật status Epic sang R4GOLIVE">Đạt TTM-CNTT (QLDA)</span>
                            )}

                            {row.ttmE2eAlertLevel === 'FAIL' ? (
                              <span className="ttm-badge fail-e2e">Fail TTM-E2E</span>
                            ) : ttmE2eAchieved ? (
                              <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-E2E đúng hạn theo rule (T0 → R4G Date) và đã Released">Đạt TTM-e2e</span>
                            ) : null}

                            {isWaitingGolive(row) && (
                              <Tooltip content={findingOf(row, 'RELEASE_WAITING_GOLIVE')?.message ?? `Epic đã có R4G Date, còn trong hạn ${formatDate(row.releaseGraceDeadline)} (R4G Date + 5 ngày làm việc) và chưa có Due Date.`} className="inline-flex w-auto">
                                <span className="ttm-badge waiting-golive">Chờ golive</span>
                              </Tooltip>
                            )}
                            {row.releaseAxisState === 'EARLY_WARNING' ? (
                              <Tooltip content={`Đã qua R4GOLIVE, còn trong hạn ${formatDate(row.releaseGraceDeadline)} để có Due Date hợp lệ và chuyển status Released.`} className="inline-flex w-auto">
                                <span className="ttm-badge early-warning">Cảnh báo sớm</span>
                              </Tooltip>
                            ) : row.releaseAxisState === 'JUSTIFY_GOLIVE' ? (
                              <Tooltip content={`Đã quá hạn ${formatDate(row.releaseGraceDeadline)} (R4G Date + 5 ngày làm việc) mà Epic chưa Released đúng hạn hoặc Due Date vượt hạn — cần giải trình.`} className="inline-flex w-auto">
                                <span className="ttm-badge justify-golive">Giải trình Golive</span>
                              </Tooltip>
                            ) : null}

                            {!hasAnyBadge && <span className="ttm-empty-warning">—</span>}

                            <ScoringExtraBadges row={row} />

                            {row.hasDataAnomaly && <DataAnomalyBadge violations={row.dataAnomalyViolations} />}
                          </div>
                        );
                      })()}
                    </TD>
                    {isMissingCore ? (
                      <TD className="ttm-metric na">Không tính được</TD>
                    ) : (
                      <TtmCnttStrips compact={allColumnsCollapsed} row={row} />
                    )}
                    {/* TTM-E2E: T0 (Idea Approved → Jira creation date) always resolves — independent
                        of Start Date, so this renders the same whether or not the Epic is missing
                        Start Date (see resolveTtmE2eRelease in epic-alert-service.ts). */}
                    <TtmE2eStrips compact={allColumnsCollapsed} row={row} />
                    <TD className={allColumnsCollapsed ? 'ttm-col-compact-status' : undefined}><StatusBadge status={row.currentStatus} /></TD>
                    <TD className="ttm-phase-cell pass">
                      {row.stages.release.baselineSourceDate ? (
                        <span className="inline-flex items-center gap-0.5 text-slate-500 font-medium text-[11px]">
                          <CaretRight className="size-3 shrink-0 text-slate-500" weight="bold" />
                          <span>{formatDate(row.stages.release.baselineSourceDate)}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    {isMissingCore ? (
                      <TD><span className="ttm-metric na">Không có</span></TD>
                    ) : (
                      <TD className="ttm-phase-cell pass">
                        <span className="inline-flex items-center gap-0.5 text-slate-500 font-medium text-[11px]">
                          <CaretLineRight className="size-3 shrink-0 text-slate-500" weight="bold" />
                          <span>{formatDate(row.t1StartDate)}</span>
                        </span>
                      </TD>
                    )}
                    {isMissingCore ? (
                      <TD colSpan={5} className="ttm-metric na">Chưa thể tính lịch TTM-CNTT (QLDA) do thiếu dữ liệu bắt buộc.</TD>
                    ) : (
                      <>
                        <CollapsiblePhaseCell cell={row.stages.design} isCollapsed={collapsedColumns.has('DESIGN')} />
                        <CollapsiblePhaseCell cell={row.stages.dev} isCollapsed={collapsedColumns.has('DEV')} />
                        <CollapsiblePhaseCell cell={row.stages.test} isCollapsed={collapsedColumns.has('TEST')} />
                        <CollapsiblePhaseCell cell={row.stages.pentest} isCollapsed={collapsedColumns.has('PENTEST')} />
                        <PhaseStageCell cell={row.stages.r4golive} actualDateText={row.r4gDate} />
                      </>
                    )}
                    {/* Release: T0-based baseline, always resolves independent of Start Date. */}
                    <PhaseStageCell cell={row.stages.release} actualDateText={row.dueDate} />
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <div className="ttm-pagination-row">
        <div className="ttm-report-date">Dữ liệu cập nhật lần cuối: <b>{data ? formatDateTime(data.lastAggregatedAt) : '—'}</b></div>
        {filteredRows.length > 0 && (
          <nav className="ttm-pagination" aria-label="Điều hướng phân trang">
            <button type="button" className="ttm-button" disabled={currentPage <= 1} onClick={() => { trackDataUsage(); setPage((current) => Math.max(1, current - 1)); }}>‹ Trước</button>
            <span className="ttm-pagination-label">Trang</span>
            <select className="ttm-select" aria-label="Chọn trang" value={currentPage} onChange={(event) => { trackDataUsage(); setPage(Number(event.target.value)); }}>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
              ))}
            </select>
            <span className="ttm-pagination-label">/ {totalPages}</span>
            <button type="button" className="ttm-button" disabled={currentPage >= totalPages} onClick={() => { trackDataUsage(); setPage((current) => Math.min(totalPages, current + 1)); }}>Sau ›</button>
          </nav>
        )}
        <StatusColorLegend />
      </div>

      <p className="ttm-page-subtitle" style={{ marginTop: 12 }}>
        Hiển thị {pageRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{(currentPage - 1) * PAGE_SIZE + pageRows.length} / {data?.mode === 'paged' ? (data.totalCount ?? 0) : filteredRows.length} Epic{data ? ` — vai trò: ${ACCESS_ROLE_LABEL[data.accessRole]}` : ''}.
      </p>

      {alertHistoryRow && (
        <AlertHistoryPanel key={alertHistoryRow.epicKey} row={alertHistoryRow} onClose={() => setAlertHistoryRow(null)} />
      )}

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
    </div>
  );
}
