import pool from '@/lib/db';
import { assignmentKey, NO_PM_SM_NARROWINGS, type PmSmNarrowings } from '@/lib/epic-pm-sm-assignment';

/**
 * Loads the component narrowing of every PM/SM grant (see epic-pm-sm-assignment.ts), keyed the way
 * Epic rows name their PM/SMs: by project key and username.
 *
 * Mirrors resolveAccessScope (epic-alert-service.ts): narrowing only applies to role USER — an Admin
 * who is PM/SM of a project keeps the whole project whatever user_project_components says. Usernames
 * are globally unique across all users (auth-service.ts assertUniqueUsername + idx_users_unique_username).
 */
export async function loadPmSmNarrowings(): Promise<PmSmNarrowings> {
  try {
    const result = await pool.query<{ components: string[]; projectKey: string; username: string }>(`
      SELECT p.source_project_key AS "projectKey", SPLIT_PART(LOWER(u.email), '@', 1) AS username,
        CASE WHEN u.role = 'USER' THEN ARRAY(
          SELECT upc.component_name FROM user_project_components upc
          WHERE upc.user_id = up.user_id AND upc.project_id = up.project_id
        ) ELSE ARRAY[]::varchar[] END AS components
      FROM user_projects up
      JOIN users u ON u.id = up.user_id
      JOIN projects p ON p.id = up.project_id
      WHERE p.is_active;
    `);
    // null = at least one grant under that username covers the whole project.
    const grants = new Map<string, Map<string, Set<string> | null>>();
    for (const row of result.rows) {
      const byName = grants.get(row.projectKey) ?? new Map<string, Set<string> | null>();
      grants.set(row.projectKey, byName);
      const name = assignmentKey(row.username);
      const known = byName.get(name);
      if (row.components.length === 0 || known === null) byName.set(name, null);
      else byName.set(name, new Set([...(known ?? []), ...row.components]));
    }
    const narrowings = new Map<string, Map<string, string[]>>();
    for (const [projectKey, byName] of grants) {
      const narrowed = new Map<string, string[]>();
      for (const [name, components] of byName) {
        if (components) narrowed.set(name, [...components].sort());
      }
      if (narrowed.size > 0) narrowings.set(projectKey, narrowed);
    }
    return narrowings;
  } catch (error: unknown) {
    console.error('PM/SM component narrowing lookup failed — naming every PM/SM of the project on each Epic:', error);
    return NO_PM_SM_NARROWINGS;
  }
}
