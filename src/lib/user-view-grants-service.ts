import 'server-only';
import pool, { getClient } from '@/lib/db';
import { roleUsesViewGrants, type UserViewGrantsDetail, type UserViewGrantsInput, type ViewGrants } from '@/lib/user-view-grants';

/**
 * "Quyền xem" (owner 2026-11-01) — tables user_view_projects / user_view_project_components / user_view_epics /
 * user_view_settings (migration 20261110). Read by Quản trị Epic only (epic-alerts-15 route); every other screen and
 * every metric keeps the real data scope (resolveAccessScope), so view grants can never change a number.
 */

export async function getUserViewGrants(userId: number): Promise<UserViewGrantsDetail> {
  const [projects, components, epics, settings] = await Promise.all([
    pool.query<{ projectId: number }>('SELECT project_id AS "projectId" FROM user_view_projects WHERE user_id = $1 ORDER BY project_id;', [userId]),
    pool.query<{ componentName: string; projectId: number }>(
      'SELECT project_id AS "projectId", component_name AS "componentName" FROM user_view_project_components WHERE user_id = $1 ORDER BY component_name;',
      [userId],
    ),
    pool.query<{ epicKey: string; epicName: string | null }>(`
      SELECT v.epic_key AS "epicKey", c.epic_name AS "epicName"
      FROM user_view_epics v LEFT JOIN epic_alert_row_cache c ON c.epic_key = v.epic_key
      WHERE v.user_id = $1 ORDER BY v.epic_key;
    `, [userId]),
    pool.query<{ createdAfter: string | null; startAfter: string | null }>(
      'SELECT created_after::text AS "createdAfter", start_after::text AS "startAfter" FROM user_view_settings WHERE user_id = $1;',
      [userId],
    ),
  ]);
  const componentsOf = new Map<number, string[]>();
  for (const row of components.rows) componentsOf.set(row.projectId, [...(componentsOf.get(row.projectId) ?? []), row.componentName]);
  return {
    createdAfter: settings.rows[0]?.createdAfter ?? null,
    epicKeys: epics.rows.map((row) => row.epicKey),
    epics: epics.rows.map((row) => ({ epicKey: row.epicKey, epicName: row.epicName ?? '' })),
    projects: projects.rows.map((row) => ({ components: componentsOf.get(row.projectId) ?? [], projectId: row.projectId })),
    startAfter: settings.rows[0]?.startAfter ?? null,
  };
}

/** Replaces the user's whole "Quyền xem". Unknown project ids are rejected (ERR_UNKNOWN_PROJECT). */
export async function saveUserViewGrants(userId: number, input: UserViewGrantsInput, actorId: number): Promise<void> {
  const projectIds = input.projects.map((project) => project.projectId);
  if (projectIds.length > 0) {
    const known = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM projects WHERE id = ANY($1::int[]);', [projectIds]);
    if (Number(known.rows[0]?.n ?? 0) !== projectIds.length) throw new Error('ERR_UNKNOWN_PROJECT');
  }
  const componentRows = input.projects.flatMap((project) => project.components.map((component) => ({ component, projectId: project.projectId })));
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_view_projects WHERE user_id = $1;', [userId]); // components cascade
    await client.query('DELETE FROM user_view_epics WHERE user_id = $1;', [userId]);
    if (projectIds.length > 0) {
      await client.query('INSERT INTO user_view_projects (user_id, project_id) SELECT $1, unnest($2::int[]);', [userId, projectIds]);
    }
    if (componentRows.length > 0) {
      await client.query(
        'INSERT INTO user_view_project_components (user_id, project_id, component_name) SELECT $1, * FROM unnest($2::int[], $3::text[]);',
        [userId, componentRows.map((row) => row.projectId), componentRows.map((row) => row.component)],
      );
    }
    if (input.epicKeys.length > 0) {
      await client.query('INSERT INTO user_view_epics (user_id, epic_key) SELECT $1, unnest($2::text[]);', [userId, input.epicKeys]);
    }
    await client.query(`
      INSERT INTO user_view_settings (user_id, created_after, start_after, updated_by_user_id) VALUES ($1, $2::date, $3::date, $4)
      ON CONFLICT (user_id) DO UPDATE SET created_after = EXCLUDED.created_after, start_after = EXCLUDED.start_after,
        updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = CURRENT_TIMESTAMP;
    `, [userId, input.createdAfter, input.startAfter, actorId]);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The grants Quản trị Epic applies for this viewer (active projects only, like the real scope); null when the role
 * does not use them or nothing is granted. A database without migration 20261110 reads as "no grants".
 */
export async function resolveViewGrants(userId: number, role: string): Promise<ViewGrants | null> {
  if (!roleUsesViewGrants(role)) return null;
  try {
    const [projects, epics, settings] = await Promise.all([
      pool.query<{ components: string[] | null; projectKey: string }>(`
        SELECT p.source_project_key AS "projectKey",
               array_agg(c.component_name ORDER BY c.component_name) FILTER (WHERE c.component_name IS NOT NULL) AS components
        FROM user_view_projects v
        JOIN projects p ON p.id = v.project_id AND p.is_active
        LEFT JOIN user_view_project_components c ON c.user_id = v.user_id AND c.project_id = v.project_id
        WHERE v.user_id = $1
        GROUP BY p.source_project_key;
      `, [userId]),
      pool.query<{ epicKey: string }>('SELECT epic_key AS "epicKey" FROM user_view_epics WHERE user_id = $1;', [userId]),
      pool.query<{ createdAfter: string | null; startAfter: string | null }>(
        'SELECT created_after::text AS "createdAfter", start_after::text AS "startAfter" FROM user_view_settings WHERE user_id = $1;',
        [userId],
      ),
    ]);
    if (projects.rows.length === 0 && epics.rows.length === 0) return null;
    return {
      createdAfter: settings.rows[0]?.createdAfter ?? null,
      epicKeys: epics.rows.map((row) => row.epicKey.toUpperCase()),
      projects: new Map(projects.rows.map((row) => [row.projectKey, row.components ?? []])),
      startAfter: settings.rows[0]?.startAfter ?? null,
    };
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '42P01') return null; // migration 20261110 not applied yet
    throw error;
  }
}

/**
 * Epic suggestions for the "Quyền xem Epic" input: closest key first (exact, then key starting with the text, then key
 * containing it), then name matches. Reads the current Epics (epic_alert_row_cache).
 */
export async function suggestEpicsForViewGrant(query: string, limit: number): Promise<{ epicKey: string; epicName: string }[]> {
  const text = query.trim();
  if (text.length === 0) return [];
  const escaped = text.replace(/[\\%_]/g, (char) => `\\${char}`);
  const result = await pool.query<{ epicKey: string; epicName: string }>(`
    SELECT epic_key AS "epicKey", epic_name AS "epicName"
    FROM epic_alert_row_cache
    WHERE epic_key ILIKE '%' || $1 || '%' ESCAPE '\\' OR epic_name ILIKE '%' || $1 || '%' ESCAPE '\\'
    ORDER BY CASE
        WHEN UPPER(epic_key) = UPPER($2) THEN 0
        WHEN epic_key ILIKE $1 || '%' ESCAPE '\\' THEN 1
        WHEN epic_key ILIKE '%' || $1 || '%' ESCAPE '\\' THEN 2
        ELSE 3
      END, length(epic_key), epic_key
    LIMIT $3;
  `, [escaped, text, limit]);
  return result.rows;
}
