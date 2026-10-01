'use client';

import { Tooltip } from '@/components/ui/Tooltip';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { extraRecommendations, findingOf, hasReleaseStatusMismatch } from '@/lib/epic-row-verdicts';

/**
 * "Nhận xét" badges that only exist in the Epic Scoring Service (display engine 'scoring'): "Sai
 * Status" on the Release axis (former rule R7), "Pending lâu" (former R2) and the remaining
 * recommendations grouped as "Khuyến nghị (n)". Renders nothing for legacy rows.
 */
export function ScoringExtraBadges({ row }: { row: EpicAlertRowPhased }) {
  if (!row.scoringBadges) return null;
  const releaseMismatch = hasReleaseStatusMismatch(row) ? findingOf(row, 'RELEASE_STATUS_MISMATCH') : null;
  // "Sai Status" on the TTM-E2E axis has the same cause as the TTM-CNTT one (status below R4GOLIVE
  // with the date already reached) — shown only when that badge isn't already in the cell.
  const e2eMismatch = row.ttmCnttInScope && row.ttmCnttStatusMismatch ? null : findingOf(row, 'E2E_STATUS_MISMATCH');
  const pending = findingOf(row, 'ANOMALY_R2_PENDING_TOO_LONG');
  const recommendations = extraRecommendations(row);
  return (
    <>
      {releaseMismatch && (
        <Tooltip content={releaseMismatch.message} className="inline-flex w-auto">
          <span className="ttm-badge status-mismatch">Sai Status (Release)</span>
        </Tooltip>
      )}
      {e2eMismatch && (
        <Tooltip content={e2eMismatch.message} className="inline-flex w-auto">
          <span className="ttm-badge status-mismatch">Sai Status</span>
        </Tooltip>
      )}
      {pending && (
        <Tooltip content={pending.message} className="inline-flex w-auto">
          <span className="ttm-badge recommendation">Pending lâu</span>
        </Tooltip>
      )}
      {recommendations.length > 0 && (
        <Tooltip multiline className="inline-flex w-auto" content={recommendations.map((item) => `• ${item.message}`).join('\n')}>
          <span className="ttm-badge recommendation">Khuyến nghị ({recommendations.length})</span>
        </Tooltip>
      )}
    </>
  );
}

/** True when ScoringExtraBadges renders at least one badge (for the cell's empty "—" marker). */
export function hasScoringExtraBadges(row: EpicAlertRowPhased): boolean {
  return Boolean(row.scoringBadges) && (hasReleaseStatusMismatch(row) || Boolean(findingOf(row, 'E2E_STATUS_MISMATCH')) || Boolean(findingOf(row, 'ANOMALY_R2_PENDING_TOO_LONG')) || extraRecommendations(row).length > 0);
}
