'use client';

import { CheckCircle, Warning, WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { EpicBrowserSummary } from '@/lib/epic-browser-service';

/**
 * "Giải trình Fail TTM" of an Epic — shared by the popups "Duyệt Epic" (EpicBrowserModal) and "Review Notes" (tab
 * "Giải trình Fail TTM", owner 2026-11-11): the TTM-CNTT verdict badges and the 2-column grid of the failure stages
 * (BA, CO, DEV, PM/SM, PO, Pentest, SA, SIT/UAT, Lý do khác) and "Phòng chịu TN chính".
 */

type FailExplainSummary = EpicBrowserSummary | null | undefined;

/** Verdict + "Thiếu lý do Fail TTM" / "Thiếu phòng chịu TN chính" badges. */
export function EpicFailVerdictBadges({ summary }: { summary: FailExplainSummary }) {
  return (
  <div className="flex items-center gap-2">
    {summary?.ttmCnttVerdictLabel && (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs',
          summary.ttmCnttVerdict === 'PASS' && 'bg-status-success-soft text-status-success border-status-success',
          summary.ttmCnttVerdict === 'FAIL' && 'bg-status-danger-soft text-status-danger border-status-danger',
          summary.ttmCnttVerdict === 'DATA_ANOMALY' && 'bg-status-warning-soft text-status-warning border-status-warning',
          summary.ttmCnttVerdict === 'EXCLUDED' && 'bg-fb-accent-soft text-fb-accent border-fb-accent',
          (summary.ttmCnttVerdict === 'PENDING' || summary.ttmCnttVerdict === 'N_A' || !summary.ttmCnttVerdict) &&
            'bg-fb-surface-muted text-fb-text-secondary border-fb-border'
        )}
      >
        {summary.ttmCnttVerdict === 'PASS' && <CheckCircle className="size-3.5 text-status-success" weight="bold" />}
        {summary.ttmCnttVerdict === 'FAIL' && <WarningCircle className="size-3.5 text-status-danger" weight="bold" />}
        {summary.ttmCnttVerdict === 'DATA_ANOMALY' && <Warning className="size-3.5 text-status-warning" weight="bold" />}
        <span>{summary.ttmCnttVerdictLabel}</span>
      </span>
    )}

    {summary?.hasMissingFailReason && (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs bg-status-danger-soft text-status-danger border-status-danger"
        title="Epic bị Scoring Service đánh giá Fail TTM-CNTT nhưng chưa có lý do/giải trình tại các khâu"
      >
        <Warning className="size-3.5 text-status-danger" weight="bold" />
        <span>Thiếu lý do Fail TTM</span>
      </span>
    )}

    {summary?.hasMissingResponsibleDepartment && (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs bg-status-danger-soft text-status-danger border-status-danger"
        title="Epic Fail TTM-CNTT (R4G Date muộn hơn Target) nhưng chưa có Phòng chịu trách nhiệm chính"
      >
        <Warning className="size-3.5 text-status-danger" weight="bold" />
        <span>Thiếu phòng chịu TN chính</span>
      </span>
    )}
  </div>
  );
}

/** The 2-column grid of the failure stages. */
export function EpicFailExplainGrid({ summary }: { summary: FailExplainSummary }) {
  return (
  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-xs bg-fb-surface-muted/50 p-4 rounded-lg border border-fb-border/80">
    {/* Cụm Cột Trái */}
    <div className="space-y-2.5">
      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu BA:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauBa || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu CO:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauCo || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu DEV:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauDev || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu PM/SM:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauPmSm || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu PO:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauPo || '-'}
        </span>
      </div>
    </div>

    {/* Cụm Cột Phải */}
    <div className="space-y-2.5">
      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu Pentest:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauPentest || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu SA:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauSa || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Khâu SIT/UAT:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.khauSitUat || '-'}
        </span>
      </div>

      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Lý do khác:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.noteLyDoKhac || '-'}
        </span>
      </div>

      {/* main_fail_dept (2026-10-14) — Jira sends "None" for an empty value. */}
      <div className="flex items-center">
        <span className="w-36 font-semibold text-fb-text-placeholder">Phòng chịu TN chính:</span>
        <span className="font-medium text-fb-text-primary">
          {summary?.mainFailDept && summary.mainFailDept.trim().toLowerCase() !== 'none' ? summary.mainFailDept : '-'}
        </span>
      </div>
    </div>
  </div>
  );
}
