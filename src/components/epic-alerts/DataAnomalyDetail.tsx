'use client';

import { Tooltip } from '@/components/ui/Tooltip';
import type { EpicAnomalyViolation } from '@/lib/epic-data-anomaly';

/**
 * Compact badge for the "Nhận xét" cell of an Epic flagged "sai lệch dữ liệu" — the count of rules
 * it breaks, with the full breakdown in the hover tooltip (same Tooltip component as the left
 * panel). The dedicated list (DataAnomalyList) repeats the detail inside the Epic History popup.
 */
export function DataAnomalyBadge({ violations }: { violations: EpicAnomalyViolation[] }) {
  return (
    <Tooltip multiline className="inline-flex w-auto" content={violations.map((violation) => `• ${violation.message}`).join('\n')}>
      <span className="ttm-badge anomaly">Sai lệch dữ liệu ({violations.length})</span>
    </Tooltip>
  );
}

/** Full list of the rules an Epic currently breaks — Epic History popup's "Sai lệch dữ liệu" section. */
export function DataAnomalyList({ violations }: { violations: EpicAnomalyViolation[] }) {
  return (
    <ul className="ttm-anomaly-list">
      {violations.map((violation) => (
        <li key={violation.message}>{violation.message}</li>
      ))}
    </ul>
  );
}
