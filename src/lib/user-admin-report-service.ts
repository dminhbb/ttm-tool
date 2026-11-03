import 'server-only';
import pool from '@/lib/db';
import { USAGE_STATS_RETENTION_DAYS } from '@/lib/usage-stats-service';
import { buildViewGrantClause } from '@/lib/epic-alert-row-cache-query-service';
import { resolveViewGrants } from '@/lib/user-view-grants-service';
import { hasViewGrants } from '@/lib/user-view-grants';

/**
 * Quản lý user — "Đã đọc" of pending registrations (table user_registration_reads, per reader) and the
 * "Báo cáo user" tab (owner 2026-11-02).
 */

/** Ids of the pending registrations (inactive users) this reader marked as read. */
export async function listReadRegistrationIds(readerUserId: number): Promise<number[]> {
  const result = await pool.query<{ id: number }>(`
    SELECT r.registered_user_id AS id
    FROM user_registration_reads r JOIN users u ON u.id = r.registered_user_id
    WHERE r.reader_user_id = $1 AND u.is_active = FALSE;
  `, [readerUserId]);
  return result.rows.map((row) => row.id);
}

/** Marks pending registrations as read for this reader (already-read and non-pending ids are ignored). Returns how many were newly marked. */
export async function markRegistrationsRead(readerUserId: number, registeredUserIds: readonly number[]): Promise<number> {
  const result = await pool.query(`
    INSERT INTO user_registration_reads (reader_user_id, registered_user_id)
    SELECT $1, u.id FROM users u WHERE u.id = ANY($2::int[]) AND u.is_active = FALSE
    ON CONFLICT DO NOTHING;
  `, [readerUserId, [...registeredUserIds]]);
  return result.rowCount ?? 0;
}

/** Pending registrations (inactive users) this reader has not marked as read yet. */
export async function countUnreadRegistrations(readerUserId: number): Promise<number> {
  try {
    const result = await pool.query<{ n: string }>(`
      SELECT count(*)::text AS n FROM users u
      WHERE u.is_active = FALSE
        AND NOT EXISTS (SELECT 1 FROM user_registration_reads r WHERE r.reader_user_id = $1 AND r.registered_user_id = u.id);
    `, [readerUserId]);
    return Number(result.rows[0]?.n ?? 0);
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== '42P01') throw error;
    // Migration 20261111 not applied yet: nothing can be marked read, so every pending registration counts.
    return Number((await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM users WHERE is_active = FALSE;')).rows[0]?.n ?? 0);
  }
}

export interface UserReportGrant {
  projectKey: string;
  projectName: string;
  /** Empty = the whole project. */
  components: string[];
}

export interface UserReportRow {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  domains: string[];
  /** "Phân quyền": projects the user is PM/SM of (user_projects + component narrowing). */
  assignments: UserReportGrant[];
  /** "Quyền xem": projects granted for viewing (user_view_projects + component narrowing). */
  viewProjects: UserReportGrant[];
  /** "Quyền xem": number of single Epics granted for viewing. */
  viewEpicCount: number;
  /** "Quyền xem": every current Epic the grants let the user see (project grants with their components and time limit, plus single Epics). */
  viewEpicTotal: number;
  /** The first 10 of those Epics by key. */
  viewEpicSample: { epicKey: string; epicName: string }[];
  /** Logins within the usage-stats retention window (same figure as the "Đăng nhập" column of the user list). */
  loginCount: number;
  lastLoginAt: string | null;
  /** MCP personal access tokens not revoked. */
  activeTokenCount: number;
}

/** The report is the same for every reader, and each load costs a query per user with grants — kept for a moment so
 * re-opening the tab (or several admins at once) does not repeat it. Free-tier database: spare the pool. */
const REPORT_MEMO_MS = 60_000;
/** Users resolved at the same time — the hosted pool holds 3 connections (db.ts). */
const REPORT_CONCURRENCY = 3;
let reportMemo: { at: number; rows: Promise<UserReportRow[]> } | null = null;

export function getUserReport(): Promise<UserReportRow[]> {
  if (reportMemo && Date.now() - reportMemo.at < REPORT_MEMO_MS) return reportMemo.rows;
  const rows = loadUserReport();
  reportMemo = { at: Date.now(), rows };
  // A failed load must not stay cached.
  rows.catch(() => { if (reportMemo?.rows === rows) reportMemo = null; });
  return rows;
}

/** `work` over every item, at most `limit` at a time; results in input order. */
async function mapWithLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

async function loadUserReport(): Promise<UserReportRow[]> {
  const result = await pool.query<UserReportRow>(`
    SELECT
      u.id,
      SPLIT_PART(LOWER(u.email), '@', 1) AS username,
      u.full_name AS "fullName",
      u.role,
      u.is_active AS "isActive",
      COALESCE((
        SELECT array_agg(d.domain_name ORDER BY d.domain_name) FROM user_domains ud JOIN domains d ON d.id = ud.domain_id WHERE ud.user_id = u.id
      ), '{}') AS domains,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'projectKey', p.source_project_key, 'projectName', p.project_name,
          'components', COALESCE((SELECT jsonb_agg(c.component_name ORDER BY c.component_name) FROM user_project_components c WHERE c.user_id = u.id AND c.project_id = p.id), '[]'::jsonb)
        ) ORDER BY p.source_project_key)
        FROM user_projects up JOIN projects p ON p.id = up.project_id WHERE up.user_id = u.id
      ), '[]'::jsonb) AS assignments,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'projectKey', p.source_project_key, 'projectName', p.project_name,
          'components', COALESCE((SELECT jsonb_agg(c.component_name ORDER BY c.component_name) FROM user_view_project_components c WHERE c.user_id = u.id AND c.project_id = p.id), '[]'::jsonb)
        ) ORDER BY p.source_project_key)
        FROM user_view_projects vp JOIN projects p ON p.id = vp.project_id WHERE vp.user_id = u.id
      ), '[]'::jsonb) AS "viewProjects",
      (SELECT count(*)::int FROM user_view_epics ve WHERE ve.user_id = u.id) AS "viewEpicCount",
      COALESCE((
        SELECT SUM(s.login_count)::int FROM user_usage_daily_stats s WHERE s.user_id = u.id AND s.stat_date >= CURRENT_DATE - $1::int
      ), 0) AS "loginCount",
      to_char(u.last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastLoginAt",
      (SELECT count(*)::int FROM mcp_access_tokens t WHERE t.user_id = u.id AND t.revoked_at IS NULL) AS "activeTokenCount"
    FROM users u
    ORDER BY SPLIT_PART(LOWER(u.email), '@', 1) ASC;
  `, [USAGE_STATS_RETENTION_DAYS - 1]);
  // Same rule Quản trị Epic applies (resolveViewGrants + buildViewGrantClause), over the current Epics (row cache).
  return mapWithLimit(result.rows, REPORT_CONCURRENCY, async (row): Promise<UserReportRow> => {
    const empty = { ...row, viewEpicSample: [], viewEpicTotal: 0 };
    // Nothing granted (the common case) costs no query at all.
    if (row.viewProjects.length === 0 && row.viewEpicCount === 0) return empty;
    const grants = await resolveViewGrants(row.id, row.role);
    if (!grants || !hasViewGrants(grants)) return empty;
    const params: unknown[] = [];
    const clause = buildViewGrantClause(grants, params);
    // Count and the first Epics by key (index order) — no random sort of every matching row.
    const [total, sample] = await Promise.all([
      pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM epic_alert_row_cache WHERE ${clause};`, params),
      pool.query<{ epicKey: string; epicName: string }>(`
        SELECT epic_key AS "epicKey", epic_name AS "epicName" FROM epic_alert_row_cache WHERE ${clause}
        ORDER BY epic_key LIMIT ${VIEW_EPIC_SAMPLE_SIZE};
      `, params),
    ]);
    return { ...row, viewEpicSample: sample.rows, viewEpicTotal: total.rows[0]?.total ?? 0 };
  });
}

/** How many granted Epics the "Quyền xem" cell lists. */
export const VIEW_EPIC_SAMPLE_SIZE = 10;
