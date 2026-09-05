'use client';

import * as React from 'react';
import type { EpicAlertTimelineEntry, EpicAlertTimelineType } from '@/lib/epic-alert-timeline-service';

const DAY_MS = 86_400_000;
const TIMELINE_WINDOW_DAYS = 21;
const DAY_WIDTH_PX = 16;
const LONG_RUN_THRESHOLD_DAYS = 3;

const ALERT_TYPE_LABEL: Record<EpicAlertTimelineType, string> = {
  FAIL_TTM_CNTT: 'Fail TTM-CNTT',
  LATE_TTM_CNTT: 'Cảnh báo muộn',
  FAIL_TTM_E2E: 'Fail TTM-E2E',
  MISSING_START_DATE: 'Thiếu Start Date',
  DATA_ANOMALY: 'Dữ liệu bất thường',
};
const ALERT_TYPE_ORDER: EpicAlertTimelineType[] = ['FAIL_TTM_CNTT', 'LATE_TTM_CNTT', 'FAIL_TTM_E2E', 'MISSING_START_DATE', 'DATA_ANOMALY'];
const ALERT_TYPE_CLASS: Record<EpicAlertTimelineType, string> = {
  FAIL_TTM_CNTT: 'fail-cntt',
  LATE_TTM_CNTT: 'late-cntt',
  FAIL_TTM_E2E: 'fail-e2e',
  MISSING_START_DATE: 'missing-start',
  DATA_ANOMALY: 'data-anomaly',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

/** Compact "dd/mm" for timeline header markers — the tooltip carries the full date. */
function formatDayMonth(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`).getTime();
  const to = new Date(`${toKey}T00:00:00`).getTime();
  return Math.round((to - from) / DAY_MS);
}

function addDays(fromKey: string, days: number): string {
  const date = new Date(`${fromKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

const DETAIL_FIELD_LABEL: Record<string, string> = {
  fromDate: 'Từ ngày',
  targetDate: 'Mục tiêu',
  baselineDate: 'Baseline TTM-E2E',
  actualToDate: 'Thực tế đến',
  startDate: 'Start Date',
  r4gDate: 'R4G Date',
  dueDate: 'Due Date',
  ideaApprovedDate: 'T0 (Idea Approved)',
};

function formatDetailLines(detail: Record<string, string | number | null> | null): string[] {
  if (!detail) return [];
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${DETAIL_FIELD_LABEL[key] ?? key}: ${typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value}`);
}

interface TimelineRunProps {
  dayWidth: number;
  entry: EpicAlertTimelineEntry;
  rangeStart: string;
  todayKey: string;
}

function TimelineRun({ dayWidth, entry, rangeStart, todayKey }: TimelineRunProps) {
  const endKey = entry.endDate ?? todayKey;
  const rawStartIndex = daysBetween(rangeStart, entry.startDate);
  const endIndex = daysBetween(rangeStart, endKey);
  const startIndex = Math.max(0, rawStartIndex);
  const isTruncated = rawStartIndex < 0;
  const realDurationDays = daysBetween(entry.startDate, endKey) + 1;
  const isOngoing = entry.endDate === null;
  const detailLines = formatDetailLines(entry.detail);
  const rangeLabel = isOngoing
    ? `${formatDate(entry.startDate)} → đang tiếp diễn`
    : `${formatDate(entry.startDate)} → ${formatDate(entry.endDate)} (${realDurationDays} ngày)`;

  const tooltip = (
    <div className="ttm-timeline-tooltip">
      <p className="ttm-timeline-tooltip-title">{ALERT_TYPE_LABEL[entry.alertType]}</p>
      <p>{rangeLabel}</p>
      {isTruncated && <p className="ttm-timeline-tooltip-note">Bắt đầu trước khoảng thời gian đang hiển thị</p>}
      {detailLines.map((line) => <p key={line}>{line}</p>)}
    </div>
  );

  if (realDurationDays > LONG_RUN_THRESHOLD_DAYS) {
    return (
      <div
        className={`ttm-timeline-run ttm-timeline-run-line ${ALERT_TYPE_CLASS[entry.alertType]}`}
        style={{ left: startIndex * dayWidth, width: (endIndex - startIndex + 1) * dayWidth }}
      >
        <span className={`ttm-timeline-line ${isTruncated ? 'ttm-timeline-line-cut' : ''}`} />
        {!isTruncated && <span className="ttm-timeline-badge ttm-timeline-badge-start" />}
        <span className={`ttm-timeline-badge ttm-timeline-badge-end ${isOngoing ? 'ttm-timeline-badge-ongoing' : ''}`} />
        {tooltip}
      </div>
    );
  }

  const dayCount = endIndex - startIndex + 1;
  return (
    <>
      {Array.from({ length: dayCount }).map((_, offset) => (
        <div
          key={offset}
          className={`ttm-timeline-run ttm-timeline-run-badge ${ALERT_TYPE_CLASS[entry.alertType]}`}
          style={{ left: (startIndex + offset) * dayWidth }}
        >
          <span className="ttm-timeline-badge" />
          {tooltip}
        </div>
      ))}
    </>
  );
}

/**
 * Transition-based Epic alert timeline (Fail/Cảnh báo muộn TTM-CNTT, Fail TTM-E2E, thiếu Start
 * Date, dữ liệu bất thường) — one row per alert type, drawn from epic_alert_timeline "runs" (see
 * epic-alert-timeline-service.ts) instead of the day-by-day epic_alert_history table. A run longer
 * than 3 days draws as a single line with a badge at each end; a short run draws one badge per day.
 * The header shows a date marker (plus a faint vertical gridline) at every start/end boundary
 * actually drawn below, so a run's edges can be read off precisely. Shows the last 3 weeks by
 * default — "Xem thêm ngày cũ hơn" lazy-loads runs that closed earlier than that.
 */
export function EpicAlertTimeline({ epicKey }: { epicKey: string }) {
  const todayKey = React.useMemo(() => toDateKey(new Date()), []);
  const initialRangeStart = React.useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - TIMELINE_WINDOW_DAYS);
    return toDateKey(start);
  }, []);

  const [entries, setEntries] = React.useState<EpicAlertTimelineEntry[] | null>(null);
  const [rangeStart, setRangeStart] = React.useState(initialRangeStart);
  const [hasMoreOlder, setHasMoreOlder] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setEntries(null);
      setError(null);
      setRangeStart(initialRangeStart);
      setHasMoreOlder(true);
      try {
        const res = await fetch(`/api/epic-alerts/${encodeURIComponent(epicKey)}/alert-timeline`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(body.error || 'Không thể tải dòng thời gian cảnh báo.'); return; }
        setEntries(body.entries ?? []);
        setHasMoreOlder(Boolean(body.hasMore));
      } catch {
        if (!cancelled) setError('Không thể kết nối API.');
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicKey]);

  const handleLoadOlder = async () => {
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/epic-alerts/${encodeURIComponent(epicKey)}/alert-timeline?before=${encodeURIComponent(rangeStart)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Không thể tải dữ liệu cũ hơn.');
      const older: EpicAlertTimelineEntry[] = body.entries ?? [];
      setEntries((current) => [...older, ...(current ?? [])]);
      setHasMoreOlder(Boolean(body.hasMore));
      if (older.length > 0) {
        const oldestStart = older.reduce((min, e) => (e.startDate < min ? e.startDate : min), rangeStart);
        setRangeStart(oldestStart);
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể kết nối API.');
    } finally {
      setLoadingOlder(false);
    }
  };

  if (error) return <p className="ttm-alert-popup-right-empty" style={{ color: 'var(--ttm-danger-700)' }}>{error}</p>;
  if (entries === null) return <p className="ttm-alert-popup-right-empty">Đang tải dòng thời gian cảnh báo…</p>;

  const totalDays = daysBetween(rangeStart, todayKey) + 1;
  const trackWidth = totalDays * DAY_WIDTH_PX;
  const todayIndex = totalDays - 1;
  const entriesByType = new Map<EpicAlertTimelineType, EpicAlertTimelineEntry[]>();
  for (const entry of entries) {
    entriesByType.set(entry.alertType, [...(entriesByType.get(entry.alertType) ?? []), entry]);
  }
  const hasAnyEntry = entries.length > 0;

  // Header markers + gridlines: one per start/end boundary actually drawn in the rows below (plus
  // "Hôm nay" at the right edge), so a marker's vertical gridline lines up exactly with the run
  // boundaries it corresponds to instead of an arbitrary fixed date grid.
  const markerIndices = new Set<number>();
  for (const entry of entries) {
    markerIndices.add(Math.max(0, daysBetween(rangeStart, entry.startDate)));
    markerIndices.add(daysBetween(rangeStart, entry.endDate ?? todayKey));
  }
  const dateMarkers = [...markerIndices].filter((index) => index !== todayIndex).sort((a, b) => a - b);
  const gridlineIndices = [...new Set([...markerIndices, todayIndex])].sort((a, b) => a - b);
  const gridAreaHeight = ALERT_TYPE_ORDER.length * 26;

  return (
    <div className="ttm-timeline">
      <button type="button" className="ttm-timeline-load-older" onClick={handleLoadOlder} disabled={!hasMoreOlder || loadingOlder}>
        {loadingOlder ? 'Đang tải…' : hasMoreOlder ? '← Xem thêm ngày cũ hơn' : 'Đã tải hết lịch sử'}
      </button>

      {!hasAnyEntry ? (
        <p className="ttm-alert-popup-right-empty">Epic này chưa có cảnh báo nào được ghi nhận trong dòng thời gian.</p>
      ) : (
        <div className="ttm-timeline-grid">
          <div className="ttm-timeline-label-col">
            <div className="ttm-timeline-axis-spacer" />
            {ALERT_TYPE_ORDER.map((alertType) => (
              <div key={alertType} className="ttm-timeline-row-label">
                <span className={`ttm-timeline-legend-dot ${ALERT_TYPE_CLASS[alertType]}`} />
                {ALERT_TYPE_LABEL[alertType]}
              </div>
            ))}
          </div>
          <div className="ttm-timeline-scroll">
            <div className="ttm-timeline-body" style={{ width: trackWidth }}>
              <div className="ttm-timeline-axis">
                {dateMarkers.map((index) => (
                  <span key={index} style={{ left: index * DAY_WIDTH_PX }}>{formatDayMonth(addDays(rangeStart, index))}</span>
                ))}
                <span className="ttm-timeline-axis-today" style={{ left: todayIndex * DAY_WIDTH_PX }}>Hôm nay</span>
              </div>
              <div className="ttm-timeline-gridlines" style={{ height: gridAreaHeight }}>
                {gridlineIndices.map((index) => (
                  <span key={index} className="ttm-timeline-gridline" style={{ left: index * DAY_WIDTH_PX }} />
                ))}
              </div>
              {ALERT_TYPE_ORDER.map((alertType) => (
                <div key={alertType} className="ttm-timeline-track">
                  {(entriesByType.get(alertType) ?? []).map((entry) => (
                    <TimelineRun key={`${entry.alertType}-${entry.startDate}`} entry={entry} rangeStart={rangeStart} todayKey={todayKey} dayWidth={DAY_WIDTH_PX} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
