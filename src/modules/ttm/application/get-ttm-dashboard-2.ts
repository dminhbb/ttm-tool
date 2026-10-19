import 'server-only';

import {
  listDashboardPreviewUsers,
  resolveDashboardTarget,
  type AuthUser,
} from '@/modules/iam/public';
import { getLatestImportAggregatedAt } from '@/modules/integration/public';
import { getDashboardViewSettings } from '@/lib/dashboard-view-settings-service';
import {
  getTtmDashboard2Snapshot,
  loadTtmDashboard2Rows,
  ttmDashboard2ScopeKey,
} from '@/lib/ttm-dashboard-2-cache-service';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { filterTtmDashboard2Rows, summarizeTtmFunnel, type TtmDashboard2Filters, type TtmFunnelSummary } from '@/lib/ttm-funnel-summary';
import type { UserRole } from '@/lib/auth-types';

/**
 * Application use case behind the existing Dashboard 2 BFF. It preserves the response shape while
 * moving IAM/Integration/TTM orchestration and the import-batch read out of the Route Handler.
 */

/** Which data scope the dashboard numbers come from — `view` query parameter of the BFF. */
export type TtmDashboard2RequestedView = 'lead' | 'own' | null;

export interface TtmDashboard2LeadView {
  /** "Dashboard Lead view cho tất cả user" is ON and the viewer's own scope is narrower than the company. */
  available: boolean;
  /** The numbers are the whole company's (Lead view) rather than the viewer's own scope. */
  active: boolean;
}

/**
 * The scope the numbers are read for. With "Dashboard Lead view cho tất cả user" ON, an ADMIN / USER
 * (not previewing someone) gets the company-wide Lead numbers by default — read as a SUPERVISOR, i.e.
 * the shared 'ALL' cache entry — unless they ask for their own view. Only aggregated numbers widen:
 * the Quản trị Epic popups behind them are served by Quản trị Epic under the viewer's own session and
 * scope, so they still list only the Epics the viewer may see.
 */
async function resolveDataScope(actor: AuthUser, rawViewAsUserId: string | null, requestedView: TtmDashboard2RequestedView) {
  const [target, settings] = await Promise.all([resolveDashboardTarget(actor, rawViewAsUserId), getDashboardViewSettings()]);
  const available = settings.leadViewForAllUsers && !target.viewAsUser && ttmDashboard2ScopeKey(actor.id, actor.role) !== 'ALL';
  const active = available && requestedView !== 'own';
  const scope: { role: UserRole; userId: number } = active ? { role: 'SUPERVISOR', userId: actor.id } : { role: target.role, userId: target.userId };
  return { leadView: { active, available } satisfies TtmDashboard2LeadView, scope, target };
}

export async function getTtmDashboard2(actor: AuthUser, rawViewAsUserId: string | null, requestedView: TtmDashboard2RequestedView = null) {
  const { leadView, scope, target } = await resolveDataScope(actor, rawViewAsUserId, requestedView);
  const [snapshot, lastAggregatedAt, ttmIndexGlobal, managedUsers] = await Promise.all([
    getTtmDashboard2Snapshot(scope.userId, scope.role),
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
    leadView,
    managedUsers,
    summary: snapshot.summary,
    ttmIndexGlobal,
    viewAsUser: target.viewAsUser,
  };
}

/**
 * The funnel rows of the viewer's own scope (or the previewed user's), for the browser to recompute a
 * filter on. Null in the Lead view (2026-10-19): the company-wide rows — one per Epic, with project,
 * PM/SM and verdict — never leave the server; a filter there is summarized by
 * getTtmDashboard2FilteredSummary instead, so the viewer only ever receives aggregated numbers.
 */
export async function getTtmDashboard2Rows(actor: AuthUser, rawViewAsUserId: string | null, requestedView: TtmDashboard2RequestedView = null) {
  const { leadView, scope } = await resolveDataScope(actor, rawViewAsUserId, requestedView);
  if (leadView.active) return null;
  return { rows: await loadTtmDashboard2Rows(scope.userId, scope.role) };
}

/** A toolbar filter applied to the Lead view, summarized server-side with the very functions the page
 * (and the cache) use — same numbers as recomputing in the browser, without sending the rows. */
export async function getTtmDashboard2FilteredSummary(
  actor: AuthUser,
  rawViewAsUserId: string | null,
  requestedView: TtmDashboard2RequestedView,
  filters: TtmDashboard2Filters,
): Promise<{ summary: TtmFunnelSummary }> {
  const { scope } = await resolveDataScope(actor, rawViewAsUserId, requestedView);
  const rows = await loadTtmDashboard2Rows(scope.userId, scope.role);
  return { summary: summarizeTtmFunnel(filterTtmDashboard2Rows(rows, filters)) };
}

export function parseTtmDashboard2View(value: string | null): TtmDashboard2RequestedView {
  return value === 'lead' || value === 'own' ? value : null;
}
