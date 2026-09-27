export type ScreenKey = 'dashboard' | 'epic_alerts' | 'epic_reports' | 'epic_in_po';

export const SCREEN_NAMES: Record<ScreenKey, string> = {
  dashboard: 'Dashboard',
  epic_alerts: 'Quản trị Epic',
  epic_reports: 'Báo cáo Epic',
  epic_in_po: 'Epic in PO',
};

export const TRACKED_SCREEN_KEYS: ScreenKey[] = ['dashboard', 'epic_alerts', 'epic_reports', 'epic_in_po'];

export interface RecentLoginUser {
  userId: number;
  username: string;
  fullName: string;
  email: string;
  lastLoginAt: string;
}

export interface FooterVisitSummary {
  totalVisits: number;
  weeklyVisits: number;
  screenVisits: number | null;
  screenKey: ScreenKey | null;
  lastLoginUsers: RecentLoginUser[];
}

export interface TrendLinePoint {
  date: string;
  label: string;
  count: number;
}

export interface ScreenVisitStat {
  screenKey: ScreenKey;
  screenName: string;
  totalVisits: number;
  weeklyVisits: number;
  prevWeeklyVisits: number;
  todayVisits: number;
}

export interface DomainUserStat {
  userId: number;
  username: string;
  fullName: string;
  email: string;
  totalVisits: number;
  weeklyVisits: number;
  todayVisits: number;
}

export interface DomainVisitStat {
  domainId: number | null;
  domainCode: string;
  domainName: string;
  totalVisits: number;
  weeklyVisits: number;
  todayVisits: number;
  users: DomainUserStat[];
}

export interface DetailedVisitStats {
  appVisits: {
    total: number;
    weekly: number;
    today: number;
  };
  trendLine: TrendLinePoint[];
  screenStats: ScreenVisitStat[];
  domainStats: DomainVisitStat[];
  recentLogins: RecentLoginUser[];
}

/**
 * Resolves a URL path (query/hash/trailing slash tolerated) to one of the tracked ScreenKeys, or
 * null if the screen isn't tracked. Shared by the client tracker and the footer API so both always
 * agree on which paths count — previously each kept its own copy.
 */
export function resolveScreenKeyFromPath(rawPath?: string | null): ScreenKey | null {
  if (!rawPath) return null;
  const pathWithoutQuery = rawPath.split('?')[0].split('#')[0].trim();
  const cleanPath = pathWithoutQuery.replace(/\/+$/, '');
  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  if (normalized === '/dashboard-new' || normalized === '/dashboard') return 'dashboard';
  if (normalized === '/epic-alerts-15' || normalized === '/epic-alerts') return 'epic_alerts';
  if (normalized === '/reports') return 'epic_reports';
  if (normalized === '/epic-in-po') return 'epic_in_po';
  return null;
}
