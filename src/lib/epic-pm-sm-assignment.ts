/**
 * Which PM/SMs an Epic belongs to, once component-level grants are taken into account (owner rule
 * 2026-10-12). The legacy row builders name every PM/SM of the Epic's project (`ownerName`,
 * comma-joined); a PM/SM whose grant on that project is narrowed to certain components
 * (user_project_components — the same narrowing resolveAccessScope applies to what they may see)
 * is only responsible for the Epics carrying one of those components:
 *
 *   - PM/SM of the whole project (no component narrowing) → every Epic of the project;
 *   - PM/SM narrowed to components → only the Epics whose `components` intersects that list;
 *   - an Epic left with nobody → no PM/SM ("Chưa gán PM/SM").
 *
 * Pure — the lookup comes from epic-pm-sm-assignment-service.ts.
 */

/** Project key → PM/SM full name → the components that PM/SM is narrowed to. Only narrowed PM/SMs
 * are listed: a name absent here (or a project absent here) keeps the whole project. */
export type PmSmNarrowings = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

export const NO_PM_SM_NARROWINGS: PmSmNarrowings = new Map();

/** Value of the PM/SM filter (Quản trị Epic, and the dashboards' drill-downs into it) that selects
 * the Epics no PM/SM is responsible for. Never a real name. */
export const UNASSIGNED_PM_SM = '(Chưa gán PM/SM)';

export function splitOwnerNames(ownerName: string | null | undefined): string[] {
  // Deduplicated: "An, An" must not count the Epic twice under An.
  return [...new Set((ownerName || '').split(',').map((name) => name.trim()).filter(Boolean))];
}

/** "Lọc PM/SM": the Epic names one of the selected PM/SMs — or names nobody, when the selection
 * includes UNASSIGNED_PM_SM. SQL twin: buildFilterClause in epic-alert-row-cache-query-service.ts. */
export function matchesPmSmFilter(ownerName: string | null | undefined, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  const names = splitOwnerNames(ownerName);
  return names.length === 0 ? selected.includes(UNASSIGNED_PM_SM) : names.some((name) => selected.includes(name));
}

/** The project's PM/SM names that are responsible for this Epic, in their original order. */
export function assignedPmSmNames(
  ownerName: string | null | undefined,
  projectKey: string | null | undefined,
  components: readonly string[] | null | undefined,
  narrowings: PmSmNarrowings,
): string[] {
  const names = splitOwnerNames(ownerName);
  const narrowedInProject = projectKey ? narrowings.get(projectKey) : undefined;
  if (!narrowedInProject) return names;
  return names.filter((name) => {
    const granted = narrowedInProject.get(name);
    return !granted || (components ?? []).some((component) => granted.includes(component));
  });
}

/** Rewrites `ownerName` on Epic rows of either display engine to the PM/SMs responsible for each
 * Epic — the legacy row builders only know the project's full PM/SM list (and stay untouched), so
 * every reader gets the component-aware names from here. Rows it doesn't change are returned as is. */
export function applyPmSmAssignments<T extends { components: string[]; ownerName: string; projectKey: string }>(rows: readonly T[], narrowings: PmSmNarrowings): T[] {
  if (narrowings.size === 0) return [...rows];
  return rows.map((row) => {
    if (!narrowings.has(row.projectKey)) return row;
    const ownerName = assignedPmSmNames(row.ownerName, row.projectKey, row.components, narrowings).join(', ');
    return ownerName === row.ownerName ? row : { ...row, ownerName };
  });
}
