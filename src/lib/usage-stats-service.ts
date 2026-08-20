import pool from '@/lib/db';
import type { UsageStatKind, UsageStatsTotals } from '@/lib/usage-stats-types';

const COLUMN_BY_KIND: Record<UsageStatKind, string> = { login: 'login_count', feature: 'feature_count', data: 'data_count' };

/** Rolling retention window for user_usage_daily_stats — a day's row ages out once it's more than
 * this many days old. Shared by the write-side purge below and every totals query (auth-service.ts's
 * listManagedUsers included), so "totals" always means "totals within the retained window", never
 * true all-time. */
export const USAGE_STATS_RETENTION_DAYS = 30;

/** Deletes stat_date rows older than the retention window. Cheap indexed range delete — run
 * opportunistically on every write instead of a separate scheduled job, since this app has no
 * background job runner. */
async function purgeExpiredUsageStats(): Promise<void> {
  await pool.query('DELETE FROM user_usage_daily_stats WHERE stat_date < CURRENT_DATE - $1::int;', [USAGE_STATS_RETENTION_DAYS - 1]);
}

/** Upserts today's row for the user, incrementing the counter for `kind` by 1, then prunes rows
 * that have aged out of the retention window. */
export async function recordUsageEvent(userId: number, kind: UsageStatKind): Promise<void> {
  const column = COLUMN_BY_KIND[kind];
  await pool.query(`
    INSERT INTO user_usage_daily_stats (user_id, stat_date, ${column})
    VALUES ($1, CURRENT_DATE, 1)
    ON CONFLICT (user_id, stat_date) DO UPDATE SET ${column} = user_usage_daily_stats.${column} + 1;
  `, [userId]);
  await purgeExpiredUsageStats();
}

/** Totals within the retention window (SUM across every stat_date still retained) for one user —
 * used by the "Thông tin cá nhân" popup. */
export async function getUsageStatsTotals(userId: number): Promise<UsageStatsTotals> {
  const result = await pool.query<UsageStatsTotals>(`
    SELECT
      COALESCE(SUM(login_count), 0)::int AS "loginCount",
      COALESCE(SUM(feature_count), 0)::int AS "featureCount",
      COALESCE(SUM(data_count), 0)::int AS "dataCount"
    FROM user_usage_daily_stats
    WHERE user_id = $1 AND stat_date >= CURRENT_DATE - $2::int;
  `, [userId, USAGE_STATS_RETENTION_DAYS - 1]);
  return result.rows[0] ?? { loginCount: 0, featureCount: 0, dataCount: 0 };
}
