import pool from '@/lib/db';

/**
 * "Dashboard Lead view cho tất cả user" (Quản trị hệ thống → Dashboard) — see
 * 20261014c_create_dashboard_view_settings.sql. Read fail-closed: a database without the table yet
 * (migration not applied) behaves as OFF, i.e. everyone keeps the view of their own scope.
 */

export interface DashboardViewSettings {
  leadViewForAllUsers: boolean;
  updatedAt: string | null;
}

export async function getDashboardViewSettings(): Promise<DashboardViewSettings> {
  try {
    const result = await pool.query<DashboardViewSettings>(
      'SELECT lead_view_for_all_users AS "leadViewForAllUsers", updated_at::text AS "updatedAt" FROM dashboard_view_settings WHERE id = 1;',
    );
    return result.rows[0] ?? { leadViewForAllUsers: false, updatedAt: null };
  } catch (error: unknown) {
    console.error('Dashboard view settings read failed (treated as OFF):', error);
    return { leadViewForAllUsers: false, updatedAt: null };
  }
}

export async function setLeadViewForAllUsers(enabled: boolean, userId: number): Promise<DashboardViewSettings> {
  const result = await pool.query<DashboardViewSettings>(`
    INSERT INTO dashboard_view_settings (id, lead_view_for_all_users, updated_by_user_id, updated_at)
    VALUES (1, $1, $2, NOW())
    ON CONFLICT (id) DO UPDATE SET
      lead_view_for_all_users = EXCLUDED.lead_view_for_all_users,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW()
    RETURNING lead_view_for_all_users AS "leadViewForAllUsers", updated_at::text AS "updatedAt";
  `, [enabled, userId]);
  return result.rows[0];
}
