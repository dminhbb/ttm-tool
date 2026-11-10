import type { AlertLevel } from '@/lib/ttm-rules';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';

/** FAIL sorts first, NONE last — shared by the live sort (epic-alert-rows-service.ts) and the
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

/**
 * Order of the "Quản trị Epic" list (owner 2026-11-10, replaces the status-group order above for that list), in two groups:
 *   A. Epics WITH a Start Date (T1): T0 (START-E2E — stages.release.baselineSourceDate) newest first, then T1 newest first,
 *      then the Epic key A→Z, "natural" (project, then the number: MO-99 before MO-100);
 *   B. after them, Epics WITHOUT T1: T0 newest first, then the Epic key A→Z (shown with the "Trễ pha" background on the
 *      Epic and T1 cells — page.tsx).
 * A missing T0 sorts after every date. EPIC_LIST_ORDER_SQL is the same order over epic_alert_row_cache (paged mode).
 */
export interface EpicListSortRow {
  epicKey: string;
  t1StartDate: string | null;
  stages: { release: { baselineSourceDate: string | null } };
}

const EPIC_KEY_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function compareDatesNewestFirst(a: string | null | undefined, b: string | null | undefined): number {
  const left = a ? a.slice(0, 10) : '';
  const right = b ? b.slice(0, 10) : '';
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left < right ? 1 : -1;
}

export function compareEpicListRows(a: EpicListSortRow, b: EpicListSortRow): number {
  return Number(!a.t1StartDate) - Number(!b.t1StartDate)
    || compareDatesNewestFirst(a.stages.release.baselineSourceDate, b.stages.release.baselineSourceDate)
    || compareDatesNewestFirst(a.t1StartDate, b.t1StartDate)
    || EPIC_KEY_COLLATOR.compare(a.epicKey, b.epicKey);
}

/** SQL mirror of compareEpicListRows over epic_alert_row_cache (row_data) — must stay in sync with it. */
export const EPIC_LIST_ORDER_SQL = [
  `(NULLIF(row_data->>'t1StartDate', '') IS NULL) ASC`,
  `LEFT(NULLIF(row_data->'stages'->'release'->>'baselineSourceDate', ''), 10) DESC NULLS LAST`,
  `LEFT(NULLIF(row_data->>'t1StartDate', ''), 10) DESC NULLS LAST`,
  `UPPER(SPLIT_PART(epic_key, '-', 1)) ASC`,
  `NULLIF(REGEXP_REPLACE(SPLIT_PART(epic_key, '-', 2), '[^0-9]', '', 'g'), '')::bigint ASC NULLS LAST`,
  `epic_key ASC`,
].join(', ');
