/**
 * Ma trận phân quyền → page access (2026-10-05). Unticking "Xem" of a feature for a role now blocks
 * that role from the feature's page itself — not only its menu entry: src/proxy.ts redirects a page
 * request (and answers 403 to the page's own data API), AppShell does the same for an in-tab change
 * right after the matrix is saved. The matrix still only NARROWS access: the hardcoded role gates
 * (AppShell PAGE_ROLES, requireUser(..., roles) in each API) keep applying on top.
 *
 * Pure (no db import) so the proxy, server code and the client all share this one mapping.
 */

/** Page path → feature key of Ma trận phân quyền. `prefix` also covers sub-paths (path + '/…'). */
const PAGE_FEATURES: readonly { featureKey: string; path: string; prefix?: boolean }[] = [
  { path: '/', featureKey: 'data_source' },
  { path: '/data-review', featureKey: 'data_source', prefix: true },
  { path: '/ttm-dashboard-2', featureKey: 'ttm_dashboard_2' },
  { path: '/dashboard-new', featureKey: 'dashboard_new' },
  { path: '/dashboard', featureKey: 'dashboard' },
  { path: '/epic-alerts-15', featureKey: 'epic_alerts_15' },
  { path: '/epic-alerts', featureKey: 'epic_alerts_30' },
  { path: '/epic-in-po', featureKey: 'epic_in_po' },
  { path: '/reports', featureKey: 'epic_reports' },
  { path: '/visit-stats', featureKey: 'visit_counter' },
  { path: '/docs/product', featureKey: 'product_docs' },
  { path: '/docs/product-guide.html', featureKey: 'product_docs' },
  { path: '/admin/users', featureKey: 'users', prefix: true },
  { path: '/admin/projects', featureKey: 'projects', prefix: true },
  { path: '/admin/domains', featureKey: 'domains', prefix: true },
  { path: '/admin/status-alert-rules', featureKey: 'status_alert_rules', prefix: true },
  { path: '/admin/database', featureKey: 'database_backup', prefix: true },
  { path: '/admin/permissions', featureKey: 'permission_matrix', prefix: true },
];

/**
 * Data APIs that serve exactly one page, so denying the page's "Xem" also denies its data. Shared
 * APIs (e.g. /api/epic-alerts-15, used by Quản trị Epic, Epic in PO and the dashboards' drill-down
 * popups; /api/projects, /api/users…) are left to their own role checks — blocking them for one
 * screen would break the others.
 */
const API_FEATURES: readonly { featureKey: string; prefix: string }[] = [
  { prefix: '/api/ttm-dashboard-2', featureKey: 'ttm_dashboard_2' },
  { prefix: '/api/dashboard-new', featureKey: 'dashboard_new' },
  { prefix: '/api/reports', featureKey: 'epic_reports' },
];

/** Where a denied page sends the user — the first of these the role may still view. */
const LANDING_PATHS: readonly string[] = ['/ttm-dashboard-2', '/epic-alerts-15', '/reports', '/epic-in-po', '/visit-stats', '/dashboard-new'];

/** Shown when the role may view none of LANDING_PATHS. Never feature-gated itself. */
export const NO_ACCESS_PATH = '/no-access';

function matches(pathname: string, path: string, prefix = false): boolean {
  return pathname === path || (prefix && pathname.startsWith(`${path}/`));
}

/** Feature key guarding a page path, or null when the page isn't tied to a matrix feature. */
export function pageFeatureKey(pathname: string): string | null {
  return PAGE_FEATURES.find((entry) => matches(pathname, entry.path, entry.prefix))?.featureKey ?? null;
}

/** Feature key guarding an API path (page-exclusive data APIs only), or null. */
export function apiFeatureKey(pathname: string): string | null {
  return API_FEATURES.find((entry) => matches(pathname, entry.prefix, true))?.featureKey ?? null;
}

/** First landing page whose "Xem" the role still has (never `exceptPath`), else NO_ACCESS_PATH. */
export function fallbackPathFor(deniedFeatureKeys: ReadonlySet<string>, exceptPath?: string): string {
  return LANDING_PATHS.find((path) => path !== exceptPath && !deniedFeatureKeys.has(pageFeatureKey(path) ?? '')) ?? NO_ACCESS_PATH;
}
