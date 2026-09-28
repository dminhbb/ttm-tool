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

/**
 * List-group rank for "Quản trị Epic" (2026-09-28): normal Epics first (0), then In PO (1), To Do
 * (2), then every Epic whose Nhận xét is "Ngoài phạm vi TTM-CNTT" (!ttmCnttInScope) regardless of
 * its status (3), and Released last (4). Kept separate from bottomStatusRankOf because the cache's
 * `bottom_status_rank` column keeps its original meaning (3 = RELEASED is relied on by the
 * ACHIEVED_E2E SQL filter) — see LIST_GROUP_RANK_SQL for the matching SQL expression.
 */
export const OUT_OF_SCOPE_CNTT_GROUP_RANK = 3;

export function listGroupRankOf(status: string, ttmCnttInScope: boolean): number {
  if (!ttmCnttInScope) return OUT_OF_SCOPE_CNTT_GROUP_RANK;
  const statusRank = bottomStatusRankOf(status);
  return statusRank === BOTTOM_STATUS_RANK.RELEASED ? OUT_OF_SCOPE_CNTT_GROUP_RANK + 1 : statusRank;
}

/** SQL mirror of listGroupRankOf over epic_alert_row_cache columns — must stay in sync with it. */
export const LIST_GROUP_RANK_SQL = `(CASE WHEN NOT ttm_cntt_in_scope THEN ${OUT_OF_SCOPE_CNTT_GROUP_RANK} WHEN bottom_status_rank = ${BOTTOM_STATUS_RANK.RELEASED} THEN ${OUT_OF_SCOPE_CNTT_GROUP_RANK + 1} ELSE bottom_status_rank END)`;
