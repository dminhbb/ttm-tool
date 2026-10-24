import 'server-only';
import pool from '@/lib/db';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-alert-rows-service';
import { getEpicAlertRowCacheMeta, queryDashboardEpicRows } from '@/lib/epic-alert-row-cache-query-service';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { toDashboardEpicRow } from '@/lib/epic-alert-types';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import type { UserRole } from '@/lib/auth-types';

/** Epic rows of TTM Dashboard 2 (its row loader; the older /api/dashboard-new was removed 2026-10-11):
 * epic_alert_row_cache scoped to this viewer when the cache exists, otherwise the live computation.
 * Cancelled Epics are left out unless `includeCancelled` (TTM Dashboard 2's funnel shows them as its own layer).
 * `needsNormalizationOnly` ("Chuẩn hoá dữ liệu") narrows the cache-backed read to the Epics that can be
 * in one of that screen's panels; the live computation has no such shortcut and returns every row, so
 * the caller must not rely on it for correctness — `fromCache` says which of the two it got. */
export async function loadDashboardEpicRows(userId: number, role: UserRole, options: { includeCancelled?: boolean; needsNormalizationOnly?: boolean } = {}): Promise<{ fromCache: boolean; lastAggregatedAt: string | null; rows: DashboardEpicRow[] }> {
  const cacheMeta = await getEpicAlertRowCacheMeta();
  if (cacheMeta.hasCache) {
    const [scope, latestBatch] = await Promise.all([
      resolveAccessScope(userId, role),
      pool.query<{ aggregatedAt: string }>('SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
    ]);
    return { fromCache: true, lastAggregatedAt: latestBatch.rows[0]?.aggregatedAt ?? null, rows: await queryDashboardEpicRows(scope, options) };
  }
  const context = await getEpicAlertRowsForDisplay(userId, role);
  return {
    fromCache: false,
    lastAggregatedAt: context.lastAggregatedAt,
    rows: context.rows.filter((row) => options.includeCancelled || !isCancelledStatus(row.currentStatus || '')).map(toDashboardEpicRow),
  };
}
