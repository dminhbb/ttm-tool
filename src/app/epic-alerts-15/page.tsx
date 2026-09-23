'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import type { EpicAlertAccessRole, EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';
import type { EpicMilestoneHistoryEntry } from '@/lib/epic-milestone-history-service';
import type { ProjectComponent } from '@/lib/master-data-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { EPIC_COMPLEXITY_TYPES } from '@/lib/status-alert-rule-types';
import { ArrowBendUpRight, ArrowSquareOut, ArrowsInLineHorizontal, ArrowsOutLineHorizontal, CaretDown, CaretLineRight, CaretRight, Check, Checks, ClockCountdown, HourglassMedium, ListChecks, Prohibit, Warning, WarningOctagon, XCircle } from '@phosphor-icons/react';
import { epicWorkflowStatusIndex, normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { trackDataUsage } from '@/lib/usage-tracking';

const PAGE_SIZE = 20;

const EMPTY_ROWS: EpicAlertRowPhased[] = [];
const EMPTY_LAYER_DATES: string[] = [];
// "Chọn lớp dữ liệu" only shows the newest 5 as quick-pick chips — everything older lives in a
// dropdown right after them, so any recorded layer stays reachable without the button row growing
// unbounded (availableLayerDates now returns up to 365 dates, not just 7).
const RECENT_LAYER_CHIP_COUNT = 5;

/** TO DO/IN PO/RELEASED now have their own dedicated screen ("Epic in PO"), and Cancelled Epics
 * are noise on this screen by default, so Quản trị Epic defaults its Status filter to everything
 * else — applied once, the first time real status options load (see the statusOptions effect
 * below), and never reapplied after that so it doesn't fight a user's own filter choice. */
const DEFAULT_EXCLUDED_STATUSES = new Set(['TO DO', 'IN PO', 'RELEASED', 'CANCELLED']);

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

type AlertFilterValue = AlertLevel | 'FAIL_E2E' | 'ACHIEVED_CNTT' | 'ACHIEVED_E2E' | 'STATUS_MISMATCH' | 'DATA_ANOMALY' | '';

const ALERT_FILTER_OPTIONS: { label: string; value: AlertFilterValue }[] = [
  { label: 'Tất cả nhận xét', value: '' },
  { label: 'Đạt TTM-CNTT', value: 'ACHIEVED_CNTT' },
  { label: 'Đạt TTM-E2E', value: 'ACHIEVED_E2E' },
  { label: 'Cảnh báo sớm', value: 'EARLY' },
  { label: 'Cảnh báo muộn', value: 'LATE' },
  { label: 'Fail TTM-CNTT', value: 'FAIL' },
  { label: 'Fail TTM-E2E', value: 'FAIL_E2E' },
  { label: 'Sai Status', value: 'STATUS_MISMATCH' },
  { label: 'Sai lệch dữ liệu', value: 'DATA_ANOMALY' },
];

/**
 * "Lọc Nhận xét" (formerly "Cảnh báo") — matches the same "Nhận xét" badges rendered in the table
 * (see the Nhận xét TD below): FAIL_E2E, ACHIEVED_CNTT, ACHIEVED_E2E, STATUS_MISMATCH and
 * DATA_ANOMALY are sentinel values layered on top of the raw AlertLevel values (EARLY/LATE/FAIL)
 * already used elsewhere (sorting, stat widgets). A "Sai Status" row never also matches an
 * ACHIEVED/FAIL_E2E option — see resolveTtmCnttStatusMismatch/resolveTtmE2eStatusMismatch in
 * epic-alert-service.ts, which only ever flag status mismatch when the underlying axis is
 * objectively on schedule (alertLevel NONE).
 */
function matchesAlertFilter(row: EpicAlertRowPhased, alertFilter: AlertFilterValue): boolean {
  switch (alertFilter) {
    case '': return true;
    case 'FAIL_E2E': return row.ttmE2eAlertLevel === 'FAIL' && !row.ttmE2eStatusMismatch;
    case 'ACHIEVED_CNTT': return row.alertLevel === 'NONE' && Boolean(row.r4gDate) && !row.ttmCnttStatusMismatch && row.ttmActualToDate === row.r4gDate;
    case 'ACHIEVED_E2E': return row.ttmE2eAlertLevel === 'NONE' && Boolean(row.dueDate) && !row.ttmE2eStatusMismatch && row.ttmE2eActualToDate === row.dueDate;
    case 'STATUS_MISMATCH': return row.ttmCnttStatusMismatch || row.ttmE2eStatusMismatch;
    case 'DATA_ANOMALY': return row.hasDataAnomaly;
    default: return row.alertLevel === alertFilter;
  }
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
  DESIGN: { char: 'D', title: 'Baseline = Start Date + 20% TTM-CNTT (làm tròn ngày)' },
  DEV: { char: 'V', title: 'Baseline = Start Date + (20%+30%) TTM-CNTT (làm tròn ngày)' },
  TEST: { char: 'T', title: 'Baseline = Start Date + (20%+30%+30%) TTM-CNTT (làm tròn ngày)' },
  PENTEST: { char: 'P', title: 'Baseline = Start Date + (20%+30%+30%+10%) TTM-CNTT (làm tròn ngày)' },
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
  /** "Sai Status" (see resolveTtmCnttStatusMismatch/resolveTtmE2eStatusMismatch in
   * epic-alert-service.ts): the recorded date is on schedule, but the caller still forces `isOver`
   * true since the workflow status hasn't actually caught up — this renders a "*" marker beside the
   * actual end date so the red color doesn't read as a plain, unexplained lateness. */
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
      isOver={row.ttmE2eStatusMismatch || row.ttmE2eAlertLevel === 'FAIL'}
      ratio={row.ttmE2eTargetWorkingDays > 0 ? (row.ttmE2eElapsedWorkingDays ?? 0) / row.ttmE2eTargetWorkingDays : 0}
      statusMismatch={row.ttmE2eStatusMismatch}
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


export default function EpicAlerts15Page() {
  const [data, setData] = useState<EpicAlertPhasedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projectFilters, setProjectFilters] = useState<string[]>([]);
  const [pmSmFilter, setPmSmFilter] = useState('');
  const [componentFilters, setComponentFilters] = useState<string[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilterValue>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [requestingUnitFilter, setRequestingUnitFilter] = useState('');
  const [dataIssueFilter, setDataIssueFilter] = useState(false);
  const [search, setSearch] = useState('');
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

  const fetchData = async () => {
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
      const queryString = query.toString();
      const res = await fetch(`/api/epic-alerts-15${queryString ? `?${queryString}` : ''}`);
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Lỗi hệ thống khi tải dữ liệu.');
      } else {
        setData(result);
      }
    } catch {
      setError('Không thể kết nối API Quản trị Epic.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Deferring the initial request prevents a synchronous state update during effect setup. Also
    // re-runs whenever an advanced filter changes — those are applied server-side (see
    // EpicAlertFilters), unlike every other toolbar filter which stays client-side on `rows`.
    void Promise.resolve().then(fetchData);
  }, [layerWindowKey, createdDateFrom, startDateFromFilter, dueDateFromFilter]);

  useEffect(() => {
    fetch('/api/project-components').then((res) => (res.ok ? res.json() : [])).then(setProjectComponents).catch(() => undefined);
  }, []);

  const rows = data?.rows ?? EMPTY_ROWS;
  const projectOptions = useMemo(() => [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort(), [rows]);
  // PM/SM options: ownerName is comma-joined when a project has several PM/SM users (see
  // getProjectMetaByProjectKeyMap) — split back out so each individual person is its own option,
  // and selecting one shows every Epic whose project lists them (single-choice, next to "Dự án").
  const pmSmOptions = useMemo(
    () => [...new Set(rows.flatMap((row) => row.ownerName.split(',').map((name) => name.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows],
  );
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.currentStatus).filter(Boolean))].sort(), [rows]);
  const requestingUnitOptions = useMemo(
    () => [...new Set(rows.map((row) => row.requestingUnit).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows],
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
    for (const row of rows) {
      if (!row.domainName || !row.projectKey) continue;
      if (!map.has(row.domainName)) map.set(row.domainName, new Set());
      map.get(row.domainName)!.add(row.projectKey);
    }
    return map;
  }, [rows]);
  const domainOptions = useMemo(() => [...domainProjectKeys.keys()].sort((a, b) => a.localeCompare(b, 'vi')), [domainProjectKeys]);
  const [domainFilter, setDomainFilter] = useState('');
  const handleDomainFilterChange = (value: string) => {
    setDomainFilter(value);
    handleProjectFiltersChange(value ? [...(domainProjectKeys.get(value) ?? [])].sort() : []);
  };

  const hasAppliedDefaultStatusFilter = useRef(false);
  useEffect(() => {
    if (hasAppliedDefaultStatusFilter.current || statusOptions.length === 0) return;
    hasAppliedDefaultStatusFilter.current = true;
    setStatusFilters(statusOptions.filter((status) => !DEFAULT_EXCLUDED_STATUSES.has(normalizeEpicWorkflowStatus(status))));
  }, [statusOptions]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    return (projectFilters.length === 0 || projectFilters.includes(row.projectKey))
      && (!pmSmFilter || row.ownerName.split(',').map((name) => name.trim()).includes(pmSmFilter))
      && (componentFilters.length === 0 || row.components.some((component) => componentFilters.includes(component)))
      && matchesAlertFilter(row, alertFilter)
      && (!typeFilter || row.epicType === typeFilter)
      && (statusFilters.length === 0 || statusFilters.includes(row.currentStatus))
      && (!dataIssueFilter || row.hasDataAnomaly)
      && (!requestingUnitFilter || row.requestingUnit === requestingUnitFilter)
      && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch));
  }), [rows, projectFilters, pmSmFilter, componentFilters, alertFilter, typeFilter, statusFilters, dataIssueFilter, requestingUnitFilter, search]);

  // Raw status strings (case as stored) whose normalized form is PENDING/TO DO — the Pending/To Do
  // stat widgets set the Status filter (a multi-select) to exactly this set.
  const pendingStatusValues = useMemo(() => statusOptions.filter((status) => status.trim().toLocaleUpperCase('en-US') === 'PENDING'), [statusOptions]);
  const todoStatusValues = useMemo(() => statusOptions.filter((status) => status.trim().toLocaleUpperCase('en-US') === 'TO DO'), [statusOptions]);
  const isExactStatusSet = (values: string[]) => values.length > 0 && statusFilters.length === values.length && values.every((value) => statusFilters.includes(value));

  const statCounts = useMemo(() => {
    let failCntt = 0;
    let failE2e = 0;
    let late = 0;
    let dataIssue = 0;
    let pending = 0;
    let todo = 0;
    for (const row of filteredRows) {
      if (row.alertLevel === 'FAIL') failCntt += 1;
      if (row.ttmE2eAlertLevel === 'FAIL') failE2e += 1;
      if (row.alertLevel === 'LATE') late += 1;
      if (row.hasDataAnomaly) dataIssue += 1;
      const normalizedStatus = row.currentStatus.trim().toLocaleUpperCase('en-US');
      if (normalizedStatus === 'PENDING') pending += 1;
      else if (normalizedStatus === 'TO DO') todo += 1;
    }
    return { dataIssue, failCntt, failE2e, late, pending, todo };
  }, [filteredRows]);

  // Admin/superadmin-tier viewers (accessRole LEAD/CBQL_PHONG) can be scoped to a huge number of
  // project keys, so the stat widgets only compute/show once the Project filter narrows that down
  // to a workable range (1–3 projects) — a PM/SM viewer's own scope is already small, so it's exempt.
  const statWidgetsGateMessage = isAdminTierAccess && (projectFilters.length === 0 || projectFilters.length > 3)
    ? 'Chọn từ 1 đến 3 dự án ở bộ lọc "Dự án" để xem thống kê nhanh.'
    : undefined;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

  return (
    <div className="ttm-app">
      <InfoBannerDisplay pathname="/epic-alerts-15" />
      {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}
      {data?.asOfDate && (
        <div className="ttm-note" style={{ background: '#fff7e6', borderColor: '#f0c36d', color: '#7a5200', fontWeight: 700 }}>
          Đang xem dữ liệu &amp; đánh giá cảnh báo tại thời điểm {data.asOfDate.split('-').reverse().join('/')} (không phải hôm nay thực tế).
        </div>
      )}

      <section className="ttm-toolbar" aria-label="Bộ lọc Epic">
        {isAdminTierAccess && (
          <select
            className={`ttm-select${domainFilter ? ' has-filter' : ''}`}
            aria-label="Domain"
            value={domainFilter}
            onChange={(event) => handleDomainFilterChange(event.target.value)}
          >
            <option value="">Chọn Domain…</option>
            {domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
        )}
        <ToolbarMultiSelect
          ariaLabel="Dự án"
          allLabel="Tất cả dự án của tôi"
          options={projectOptions}
          value={projectFilters}
          onChange={(values) => { setDomainFilter(''); handleProjectFiltersChange(values); }}
        />
        <select
          className={`ttm-select${pmSmFilter ? ' has-filter' : ''}`}
          aria-label="PM/SM"
          value={pmSmFilter}
          onChange={(event) => { setPmSmFilter(event.target.value); setPage(1); }}
          title="Lọc theo PM/SM của dự án — hiển thị Epic của mọi dự án do người này phụ trách"
        >
          <option value="">Tất cả PM/SM</option>
          {pmSmOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <ToolbarMultiSelect
          ariaLabel="Components"
          allLabel={projectFilters.length === 0 ? 'Chọn dự án trước' : 'Tất cả Components'}
          disabled={projectFilters.length === 0}
          options={componentOptions}
          value={componentFilters}
          onChange={(values) => { setComponentFilters(values); setPage(1); }}
        />
        <select
          className={`ttm-select${alertFilter ? ' has-filter' : ''}`}
          aria-label="Lọc Nhận xét"
          value={alertFilter}
          onChange={(event) => { setAlertFilter(event.target.value as AlertFilterValue); setPage(1); }}
        >
          {ALERT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          className={`ttm-select${typeFilter ? ' has-filter' : ''}`}
          aria-label="Loại Epic"
          value={typeFilter}
          onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}
        >
          <option value="">Tất cả loại Epic</option>
          {EPIC_COMPLEXITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <ToolbarMultiSelect
          ariaLabel="Status"
          allLabel="Tất cả status"
          options={statusOptions}
          value={statusFilters}
          onChange={(values) => { setStatusFilters(values); setPage(1); }}
        />
        <select
          className={`ttm-select${requestingUnitFilter ? ' has-filter' : ''}`}
          aria-label="Đơn vị yêu cầu"
          value={requestingUnitFilter}
          onChange={(event) => { setRequestingUnitFilter(event.target.value); setPage(1); }}
        >
          <option value="">Tất cả đơn vị yêu cầu</option>
          {requestingUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
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

      <div className="border-t border-slate-300 pt-3 mb-4">
        <button
          type="button"
          onClick={() => setAdvancedFiltersOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors"
        >
          {advancedFiltersOpen ? <CaretDown className="size-4 text-[#1463f7]" weight="bold" /> : <CaretRight className="size-4 text-[#1463f7]" weight="bold" />}
          <span>Bộ lọc nâng cao...</span>
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

      {data && (
        <EpicStatWidgets
          gateMessage={statWidgetsGateMessage}
          items={[
            {
              icon: XCircle, isActive: alertFilter === 'FAIL', key: 'fail-cntt', label: 'Epic Fail TTM-CNTT',
              onClick: () => { setAlertFilter((current) => (current === 'FAIL' ? '' : 'FAIL')); setPage(1); },
              tone: 'danger', value: statCounts.failCntt,
            },
            {
              icon: Prohibit, isActive: alertFilter === 'FAIL_E2E', key: 'fail-e2e', label: 'Epic Fail TTM-E2E',
              onClick: () => { setAlertFilter((current) => (current === 'FAIL_E2E' ? '' : 'FAIL_E2E')); setPage(1); },
              tone: 'danger', value: statCounts.failE2e,
            },
            {
              icon: ClockCountdown, isActive: alertFilter === 'LATE', key: 'late', label: 'Epic Cảnh báo muộn',
              onClick: () => { setAlertFilter((current) => (current === 'LATE' ? '' : 'LATE')); setPage(1); },
              tone: 'warning', value: statCounts.late,
            },
            {
              icon: WarningOctagon, isActive: dataIssueFilter, key: 'data-issue', label: 'Epic sai lệch dữ liệu',
              onClick: () => { setDataIssueFilter((current) => !current); setPage(1); },
              tone: 'warning', value: statCounts.dataIssue,
            },
            {
              icon: HourglassMedium, isActive: isExactStatusSet(pendingStatusValues), key: 'pending', label: 'Epic Pending',
              onClick: () => { setStatusFilters(isExactStatusSet(pendingStatusValues) ? [] : pendingStatusValues); setPage(1); },
              tone: 'neutral', value: statCounts.pending,
            },
            {
              icon: ListChecks, isActive: isExactStatusSet(todoStatusValues), key: 'todo', label: 'Epic To Do',
              onClick: () => { setStatusFilters(isExactStatusSet(todoStatusValues) ? [] : todoStatusValues); setPage(1); },
              tone: 'neutral', value: statCounts.todo,
            },
          ]}
        />
      )}

      {isLoading ? (
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
                <TH title="Baseline (dòng trên) = Start Date + TTM-CNTT; Thực tế (dòng dưới) = Start Date → R4G Date (hoặc hôm nay nếu chưa có)">TTM-CNTT</TH>
                <TH className="ttm-col-border-right" title="Baseline (dòng trên) = T0 + TTM-E2E; Thực tế (dòng dưới) = T0 → Due Date (hoặc hôm nay nếu chưa có). T0 = Idea Approved Date, hoặc Start Date, hoặc ngày tạo Jira">TTM-E2E</TH>
                <TH className={allColumnsCollapsed ? 'ttm-col-compact-status' : undefined} title="issues.current_status">Status</TH>
                <TH className={allColumnsCollapsed ? 'min-w-[92px]' : 'min-w-[100px]'} title="T0 = Idea Approved Date, hoặc ngày tạo Jira nếu không có — điểm bắt đầu chu kỳ TTM-E2E">START-E2E</TH>
                <TH title="issues.start_date">START-CNTT</TH>
                <CollapsiblePhaseHeader phase="DESIGN" isCollapsed={collapsedColumns.has('DESIGN')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="DEV" isCollapsed={collapsedColumns.has('DEV')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="TEST" isCollapsed={collapsedColumns.has('TEST')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="PENTEST" isCollapsed={collapsedColumns.has('PENTEST')} onToggle={toggleColumn} />
                <TH className={allColumnsCollapsed ? 'min-w-[92px]' : 'min-w-[110px]'} title="Baseline = Start Date + 100% TTM-CNTT; dòng dưới = issues.r4g_date">R4GOLIVE</TH>
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
                        // "Sai Status" (see resolveTtmCnttStatusMismatch/resolveTtmE2eStatusMismatch in
                        // epic-alert-service.ts) always takes priority over Đạt/Fail on its own axis —
                        // the recorded date is on schedule, but the workflow status hasn't caught up,
                        // so neither badge would be honest here.
                        // "Đạt" requires the recorded date to have actually already passed — ttmActualToDate/
                        // ttmE2eActualToDate only equal r4gDate/dueDate once they're chronological AND <=
                        // today (see resolveTtmActualRange/resolveTtmE2eRelease); a future-dated R4G/Due
                        // Date (still "in progress") must not be praised as achieved just because it exists.
                        const isTtmCnttAchieved = !row.ttmCnttStatusMismatch && row.alertLevel === 'NONE' && Boolean(row.r4gDate) && row.ttmActualToDate === row.r4gDate;
                        const isTtmE2eAchieved = !row.ttmE2eStatusMismatch && row.ttmE2eAlertLevel === 'NONE' && Boolean(row.dueDate) && row.ttmE2eActualToDate === row.dueDate;
                        const hasCnttBadge = row.ttmCnttStatusMismatch || row.alertLevel !== 'NONE' || isTtmCnttAchieved;
                        const hasE2eBadge = row.ttmE2eStatusMismatch || row.ttmE2eAlertLevel === 'FAIL' || isTtmE2eAchieved;
                        const hasAnyBadge = hasCnttBadge || hasE2eBadge || row.hasDataAnomaly;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {row.ttmCnttStatusMismatch ? (
                              <Tooltip content="R4G Date đã ghi nhận và đúng hạn theo TTM-CNTT, nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status đúng quy định." className="inline-flex w-auto">
                                <span className="ttm-badge status-mismatch">Sai Status</span>
                              </Tooltip>
                            ) : row.alertLevel === 'FAIL' ? (
                              <span className="ttm-badge fail-cntt">Fail TTM-CNTT</span>
                            ) : row.alertLevel === 'LATE' ? (
                              <span className="ttm-badge late-warning">Cảnh báo muộn</span>
                            ) : row.alertLevel === 'EARLY' ? (
                              <span className="ttm-badge early-warning">Cảnh báo sớm</span>
                            ) : isTtmCnttAchieved ? (
                              <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT đúng hạn theo rule">Đạt TTM-CNTT</span>
                            ) : null}

                            {row.ttmE2eStatusMismatch ? (
                              <Tooltip content="Due Date đã ghi nhận và đúng hạn theo TTM-E2E, nhưng status Epic chưa chuyển sang RELEASED — vui lòng cập nhật status đúng quy định." className="inline-flex w-auto">
                                <span className="ttm-badge status-mismatch">Sai Status</span>
                              </Tooltip>
                            ) : row.ttmE2eAlertLevel === 'FAIL' ? (
                              <span className="ttm-badge fail-e2e">Fail TTM-E2E</span>
                            ) : isTtmE2eAchieved ? (
                              <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-E2E đúng hạn theo rule">Đạt TTM-e2e</span>
                            ) : null}

                            {!hasAnyBadge && <span className="ttm-empty-warning">—</span>}

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
                      <TD colSpan={5} className="ttm-metric na">Chưa thể tính lịch TTM-CNTT do thiếu dữ liệu bắt buộc.</TD>
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
        Hiển thị {pageRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{(currentPage - 1) * PAGE_SIZE + pageRows.length} / {filteredRows.length} Epic{data ? ` — vai trò: ${ACCESS_ROLE_LABEL[data.accessRole]}` : ''}.
      </p>

      {alertHistoryRow && (
        <AlertHistoryPanel key={alertHistoryRow.epicKey} row={alertHistoryRow} onClose={() => setAlertHistoryRow(null)} />
      )}

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
    </div>
  );
}
