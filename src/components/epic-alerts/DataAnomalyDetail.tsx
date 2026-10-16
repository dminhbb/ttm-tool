'use client';

import type { EpicAnomalyViolation } from '@/lib/epic-data-anomaly';

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
