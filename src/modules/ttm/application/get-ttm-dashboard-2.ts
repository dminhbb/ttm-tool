import 'server-only';

import {
  listDashboardPreviewUsers,
  resolveDashboardTarget,
  type AuthUser,
} from '@/modules/iam/public';
import { getLatestImportAggregatedAt } from '@/modules/integration/public';
import {
  getTtmDashboard2Snapshot,
  loadTtmDashboard2Rows,
} from '@/lib/ttm-dashboard-2-cache-service';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';

/**
 * Application use case behind the existing Dashboard 2 BFF. It preserves the response shape while
 * moving IAM/Integration/TTM orchestration and the import-batch read out of the Route Handler.
 */
export async function getTtmDashboard2(actor: AuthUser, rawViewAsUserId: string | null) {
  const target = await resolveDashboardTarget(actor, rawViewAsUserId);
  const [snapshot, lastAggregatedAt, ttmIndexGlobal, managedUsers] = await Promise.all([
    getTtmDashboard2Snapshot(target.userId, target.role),
    getLatestImportAggregatedAt(),
    getTtmIndexGlobalCache().catch((error: unknown) => {
      console.error('Failed to get TTM Index Global Cache:', error);
      return null;
    }),
    listDashboardPreviewUsers(actor),
  ]);

  return {
    actor: { email: actor.email, fullName: actor.fullName, id: actor.id, role: actor.role },
    isUserPreview: Boolean(target.viewAsUser),
    cache: snapshot.cache,
    filterOptions: snapshot.filterOptions,
    lastAggregatedAt,
    managedUsers,
    summary: snapshot.summary,
    ttmIndexGlobal,
    viewAsUser: target.viewAsUser,
  };
}

export async function getTtmDashboard2Rows(actor: AuthUser, rawViewAsUserId: string | null) {
  const target = await resolveDashboardTarget(actor, rawViewAsUserId);
  return { rows: await loadTtmDashboard2Rows(target.userId, target.role) };
}
