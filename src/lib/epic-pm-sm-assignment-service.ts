import pool from '@/lib/db';
import { NO_PM_SM_NARROWINGS, type PmSmNarrowings } from '@/lib/epic-pm-sm-assignment';

/**
 * Loads the component narrowing of every PM/SM grant (see epic-pm-sm-assignment.ts), keyed the way
 * Epic rows name their PM/SMs: by project key and full name.
 *
 * Mirrors resolveAccessScope (epic-alert-service.ts): narrowing only applies to role USER — an Admin
 * who is PM/SM of a project keeps the whole project whatever user_project_components says. Should two
 * PM/SMs of one project share a full name, the wider grant wins (whole project over components, the
 * union of their components otherwise), since a row's name can't tell them apart.
 */
export async function loadPmSmNarrowings(): Promise<PmSmNarrowings> {
  try {
    const result = await pool.query<{ components: string[]; fullName: string; projectKey: string }>(`
      SELECT p.source_project_key AS "projectKey", u.full_name AS "fullName",
        CASE WHEN u.role = 'USER' THEN ARRAY(
          SELECT upc.component_name FROM user_project_components upc
          WHERE upc.user_id = up.user_id AND upc.project_id = up.project_id
        ) ELSE ARRAY[]::varchar[] END AS components
      FROM user_projects up
      JOIN users u ON u.id = up.user_id
      JOIN projects p ON p.id = up.project_id
      WHERE p.is_active;
    `);
    // null = at least one grant under that name covers the whole project.
    const grants = new Map<string, Map<string, Set<string> | null>>();
    for (const row of result.rows) {
      const byName = grants.get(row.projectKey) ?? new Map<string, Set<string> | null>();
      grants.set(row.projectKey, byName);
      const name = row.fullName.trim();
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
