import type { AlertLevel } from '@/lib/ttm-rules';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';

/** FAIL sorts first, NONE last — shared by the live sort (epic-alert-phase-service.ts) and the
 * epic_alert_row_cache write path (epic-alert-row-cache-service.ts). */
export const ALERT_RANK: Record<AlertLevel, number> = { FAIL: 0, LATE: 1, EARLY: 2, NONE: 3 };

/** Epics in these statuses sort to the bottom of "Quản trị Epic", in this exact order: In PO, then
 * To Do, then Released. Everything else ranks 0 (unranked, keeps its normal order ahead of them). */
export const BOTTOM_STATUS_RANK: Record<string, number> = {
  'IN PO': 1,
  'TO DO': 2,
  RELEASED: 3,
};

export function bottomStatusRankOf(status: string): number {
  return BOTTOM_STATUS_RANK[normalizeEpicWorkflowStatus(status)] ?? 0;
}
