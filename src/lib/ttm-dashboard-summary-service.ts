import 'server-only';
import pool from '@/lib/db';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-scoring-display-service';
import { getEpicAlertRowCacheMeta, queryDashboardEpicRows } from '@/lib/epic-alert-row-cache-query-service';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { toDashboardEpicRow } from '@/lib/epic-alert-types';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { getScoringEngineMode, getStoredScoringEngineMode } from '@/lib/scoring-mode-service';
import type { UserRole } from '@/lib/auth-types';

/** Epic rows of the TTM dashboards (GET /api/dashboard-new, TTM Dashboard 2's row loader):
 * epic_alert_row_cache scoped to this viewer when the cache exists, otherwise the live computation.
 * Cancelled Epics are left out unless `includeCancelled` (TTM Dashboard 2's funnel shows them as its own layer). */
export async function loadDashboardEpicRows(userId: number, role: UserRole, options: { includeCancelled?: boolean } = {}): Promise<{ lastAggregatedAt: string | null; rows: DashboardEpicRow[] }> {
  // The cache holds rows built with the STORED display engine; a per-machine SCORING_ENGINE_MODE
  // override that differs from it is served live instead.
  const [cacheMeta, engineMode, cacheEngineMode] = await Promise.all([getEpicAlertRowCacheMeta(), getScoringEngineMode(), getStoredScoringEngineMode()]);
  if (cacheMeta.hasCache && engineMode === cacheEngineMode) {
    const [scope, latestBatch] = await Promise.all([
      resolveAccessScope(userId, role),
      pool.query<{ aggregatedAt: string }>('SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
    ]);
    return { lastAggregatedAt: latestBatch.rows[0]?.aggregatedAt ?? null, rows: await queryDashboardEpicRows(scope, options) };
  }
  const context = await getEpicAlertRowsForDisplay(userId, role);
  return {
    lastAggregatedAt: context.lastAggregatedAt,
    rows: context.rows.filter((row) => options.includeCancelled || !isCancelledStatus(row.currentStatus || '')).map(toDashboardEpicRow),
  };
}
