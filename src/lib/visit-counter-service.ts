import pool from '@/lib/db';
import type {
  DetailedVisitStats,
  DomainUserStat,
  DomainVisitStat,
  FooterVisitSummary,
  RecentLoginUser,
  ScreenKey,
  ScreenVisitStat,
  TrendLinePoint,
} from '@/lib/visit-counter-types';
import { SCREEN_NAMES, TRACKED_SCREEN_KEYS } from '@/lib/visit-counter-types';

/**
 * Records an application login event for a user.
 */
export async function recordAppLogin(userId: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO visit_logs (event_type, user_id) VALUES ('APP_LOGIN', $1);`,
      [userId]
    );
  } catch (err) {
    console.error('[VisitCounter] Failed to record app login:', err);
  }
}

/**
 * Records a screen view event for a tracked screen.
 */
export async function recordScreenView(userId: number | null, screenKey: ScreenKey): Promise<void> {
  try {
    if (!screenKey || !(screenKey in SCREEN_NAMES)) return;
    await pool.query(
      `INSERT INTO visit_logs (event_type, screen_key, user_id) VALUES ('SCREEN_VIEW', $1, $2);`,
      [screenKey, userId]
    );
  } catch (err) {
    console.error('[VisitCounter] Failed to record screen view:', err);
  }
}

/**
 * Retrieves the most recent login users.
 * Looks up distinct users by latest APP_LOGIN visit log, falling back to users.last_login_at.
 */
export async function getRecentLoginUsers(limit: number = 5): Promise<RecentLoginUser[]> {
  const result = await pool.query<{
    userId: number;
    email: string;
    fullName: string;
    lastLoginAt: Date | string | null;
  }>(`
    SELECT 
      u.id AS "userId",
      u.email,
      u.full_name AS "fullName",
      COALESCE(v.latest_visit, u.last_login_at) AS "lastLoginAt"
    FROM users u
    LEFT JOIN (
      SELECT user_id, MAX(created_at) AS latest_visit
      FROM visit_logs
      WHERE event_type = 'APP_LOGIN' AND user_id IS NOT NULL
      GROUP BY user_id
    ) v ON v.user_id = u.id
    WHERE COALESCE(v.latest_visit, u.last_login_at) IS NOT NULL
      AND u.is_active = TRUE
    ORDER BY "lastLoginAt" DESC
    LIMIT $1;
  `, [limit]);

  return result.rows.map((row) => ({
    userId: row.userId,
    username: (row.email ?? '').split('@')[0],
    fullName: row.fullName ?? '',
    email: row.email ?? '',
    lastLoginAt: row.lastLoginAt instanceof Date ? row.lastLoginAt.toISOString() : String(row.lastLoginAt ?? ''),
  }));
}

/**
 * Retrieves the visit summary for the system footer:
 * - totalVisits: All-time app logins
 * - weeklyVisits: App logins in the last 8 days (T-7 to T)
 * - screenVisits: Total visits for the current screen, if it's one of the 4 tracked screens
 * - lastLoginUsers: 5 most recent login users
 */
export async function getFooterVisitSummary(screenKey?: ScreenKey | null): Promise<FooterVisitSummary> {
  const isValidScreenKey = Boolean(screenKey && screenKey in SCREEN_NAMES);
  const resolvedScreenKey = isValidScreenKey ? (screenKey as ScreenKey) : null;

  const [appTotalsRes, screenVisitsRes, lastLoginUsers] = await Promise.all([
    pool.query<{ totalVisits: number; weeklyVisits: number }>(`
      SELECT
        COUNT(*)::int AS "totalVisits",
        COUNT(*) FILTER (
          WHERE created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )::int AS "weeklyVisits"
      FROM visit_logs
      WHERE event_type = 'APP_LOGIN';
    `),
    resolvedScreenKey
      ? pool.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count
          FROM visit_logs
          WHERE event_type = 'SCREEN_VIEW' AND screen_key = $1;
        `, [resolvedScreenKey])
      : Promise.resolve({ rows: [] }),
    getRecentLoginUsers(5),
  ]);

  const appTotals = appTotalsRes.rows[0] ?? { totalVisits: 0, weeklyVisits: 0 };
  const screenVisits = resolvedScreenKey && screenVisitsRes.rows[0] ? screenVisitsRes.rows[0].count : null;

  return {
    totalVisits: appTotals.totalVisits ?? 0,
    weeklyVisits: appTotals.weeklyVisits ?? 0,
    screenVisits,
    screenKey: resolvedScreenKey,
    lastLoginUsers,
  };
}

/**
 * Retrieves the comprehensive visit statistics for the Visit Counter modal/panel:
 * - appVisits: total, weekly (T-7 to T), today (T)
 * - trendLine: 8-day daily app login counts (T-7 to T) with zero-filling
 * - screenStats: 4 key screens comparison (total, weekly, prev weekly, today)
 * - domainStats: visits aggregated by domain with user breakdowns
 * - recentLogins: 10 most recent login users
 */
export async function getDetailedVisitStats(): Promise<DetailedVisitStats> {
  const [appVisitsRes, trendRes, screenRes, domainsRes, userDomainStatsRes, recentLogins] = await Promise.all([
    // 1. App visits summary
    pool.query<{ total: number; weekly: number; today: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )::int AS weekly,
        COUNT(*) FILTER (
          WHERE created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )::int AS today
      FROM visit_logs
      WHERE event_type = 'APP_LOGIN';
    `),

    // 2. TrendLine (8 days from T-7 to T)
    pool.query<TrendLinePoint>(`
      WITH date_series AS (
        SELECT generate_series(
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days',
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          INTERVAL '1 day'
        )::date AS d
      ),
      counts AS (
        SELECT 
          (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d,
          COUNT(*)::int AS count
        FROM visit_logs
        WHERE event_type = 'APP_LOGIN'
          AND created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        GROUP BY (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      )
      SELECT 
        to_char(ds.d, 'YYYY-MM-DD') AS date,
        to_char(ds.d, 'DD/MM') AS label,
        COALESCE(c.count, 0)::int AS count
      FROM date_series ds
      LEFT JOIN counts c ON c.d = ds.d
      ORDER BY ds.d ASC;
    `),

    // 3. ScreenStats
    pool.query<{
      screenKey: ScreenKey;
      totalVisits: number;
      weeklyVisits: number;
      prevWeeklyVisits: number;
      todayVisits: number;
    }>(`
      SELECT
        screen_key AS "screenKey",
        COUNT(*)::int AS "totalVisits",
        COUNT(*) FILTER (
          WHERE created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )::int AS "weeklyVisits",
        COUNT(*) FILTER (
          WHERE created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '15 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
            AND created_at < (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )::int AS "prevWeeklyVisits",
        COUNT(*) FILTER (
          WHERE created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )::int AS "todayVisits"
      FROM visit_logs
      WHERE event_type = 'SCREEN_VIEW' AND screen_key = ANY($1)
      GROUP BY screen_key;
    `, [TRACKED_SCREEN_KEYS]),

    // 4a. Active domains
    pool.query<{ id: number; domainCode: string; domainName: string }>(`
      SELECT id, domain_code AS "domainCode", domain_name AS "domainName"
      FROM domains
      WHERE is_active = TRUE
      ORDER BY id ASC;
    `),

    // 4b. User visits per domain
    pool.query<{
      userId: number;
      email: string;
      fullName: string;
      totalVisits: number;
      weeklyVisits: number;
      todayVisits: number;
      domainId: number | null;
    }>(`
      WITH user_visits AS (
        SELECT 
          vl.user_id,
          COUNT(*)::int AS total_visits,
          COUNT(*) FILTER (
            WHERE vl.created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          )::int AS weekly_visits,
          COUNT(*) FILTER (
            WHERE vl.created_at >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          )::int AS today_visits
        FROM visit_logs vl
        WHERE vl.event_type = 'APP_LOGIN' AND vl.user_id IS NOT NULL
        GROUP BY vl.user_id
      )
      SELECT 
        u.id AS "userId",
        u.email,
        u.full_name AS "fullName",
        uv.total_visits AS "totalVisits",
        uv.weekly_visits AS "weeklyVisits",
        uv.today_visits AS "todayVisits",
        ud.domain_id AS "domainId"
      FROM user_visits uv
      JOIN users u ON u.id = uv.user_id
      LEFT JOIN user_domains ud ON ud.user_id = u.id
      ORDER BY uv.total_visits DESC, uv.weekly_visits DESC, u.full_name ASC;
    `),

    // 5. Recent logins
    getRecentLoginUsers(10),
  ]);

  // Aggregate screenStats for all 4 screens
  const screenStats: ScreenVisitStat[] = TRACKED_SCREEN_KEYS.map((key) => {
    const match = screenRes.rows.find((r) => r.screenKey === key);
    return {
      screenKey: key,
      screenName: SCREEN_NAMES[key],
      totalVisits: match?.totalVisits ?? 0,
      weeklyVisits: match?.weeklyVisits ?? 0,
      prevWeeklyVisits: match?.prevWeeklyVisits ?? 0,
      todayVisits: match?.todayVisits ?? 0,
    };
  });

  // Aggregate domainStats
  const domainMap = new Map<number | null, DomainVisitStat>();
  for (const d of domainsRes.rows) {
    domainMap.set(d.id, {
      domainId: d.id,
      domainCode: d.domainCode,
      domainName: d.domainName,
      totalVisits: 0,
      weeklyVisits: 0,
      todayVisits: 0,
      users: [],
    });
  }

  let unassignedDomain: DomainVisitStat | null = null;

  for (const row of userDomainStatsRes.rows) {
    const username = (row.email ?? '').split('@')[0];
    const userStat: DomainUserStat = {
      userId: row.userId,
      username,
      fullName: row.fullName ?? '',
      email: row.email ?? '',
      totalVisits: row.totalVisits ?? 0,
      weeklyVisits: row.weeklyVisits ?? 0,
      todayVisits: row.todayVisits ?? 0,
    };

    if (row.domainId && domainMap.has(row.domainId)) {
      const dom = domainMap.get(row.domainId)!;
      dom.totalVisits += userStat.totalVisits;
      dom.weeklyVisits += userStat.weeklyVisits;
      dom.todayVisits += userStat.todayVisits;
      dom.users.push(userStat);
    } else {
      if (!unassignedDomain) {
        unassignedDomain = {
          domainId: null,
          domainCode: 'KHAC',
          domainName: 'Chưa gán domain',
          totalVisits: 0,
          weeklyVisits: 0,
          todayVisits: 0,
          users: [],
        };
      }
      unassignedDomain.totalVisits += userStat.totalVisits;
      unassignedDomain.weeklyVisits += userStat.weeklyVisits;
      unassignedDomain.todayVisits += userStat.todayVisits;
      unassignedDomain.users.push(userStat);
    }
  }

  const domainStats = Array.from(domainMap.values());
  if (unassignedDomain) {
    domainStats.push(unassignedDomain);
  }

  // Sort users in each domain
  for (const d of domainStats) {
    d.users.sort((a, b) => b.totalVisits - a.totalVisits || b.weeklyVisits - a.weeklyVisits || a.fullName.localeCompare(b.fullName));
  }

  const appVisits = appVisitsRes.rows[0] ?? { total: 0, weekly: 0, today: 0 };

  return {
    appVisits: {
      total: appVisits.total ?? 0,
      weekly: appVisits.weekly ?? 0,
      today: appVisits.today ?? 0,
    },
    trendLine: trendRes.rows,
    screenStats,
    domainStats,
    recentLogins,
  };
}
