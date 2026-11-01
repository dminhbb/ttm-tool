/**
 * "Quyền xem" (owner 2026-11-01) — pure part, shared by the user admin screen, the API and Quản trị Epic.
 *
 * A USER / ADMIN may be granted extra Epics to SEE in Quản trị Epic: whole projects (optionally narrowed to some
 * components), single Epics, and for the project grants a "Giới hạn thời gian" (Created date > X, Start Date > Y).
 * Those Epics are listed with an eye icon and never counted in any metric. SUPERADMIN / SUPERVISOR see everything
 * already, so the grants never apply to them (and the tab is not offered).
 */

export const VIEW_GRANT_ROLES = ['USER', 'ADMIN'] as const;

/** The roles whose "Quyền xem" is configured and applied. */
export function roleUsesViewGrants(role: string | null | undefined): boolean {
  return (VIEW_GRANT_ROLES as readonly string[]).includes(role ?? '');
}

export interface ViewGrantProject {
  projectId: number;
  /** Empty = every Epic of the project. */
  components: string[];
}

/** What the "Quyền xem" tab saves. */
export interface UserViewGrantsInput {
  projects: ViewGrantProject[];
  epicKeys: string[];
  /** ISO date; Epics created on Jira AFTER it (strictly). Null = no limit. Project grants only. */
  createdAfter: string | null;
  /** ISO date; Epics whose Start Date is AFTER it (strictly); no Start Date = left out. Null = no limit. Project grants only. */
  startAfter: string | null;
}

/** What the tab loads: the input plus each granted Epic's name for its chip. */
export interface UserViewGrantsDetail extends UserViewGrantsInput {
  epics: { epicKey: string; epicName: string }[];
}

export const MAX_VIEW_GRANT_PROJECTS = 300;
export const MAX_VIEW_GRANT_EPICS = 500;
const EPIC_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeViewEpicKey(value: string): string {
  return value.trim().toUpperCase();
}

function parseDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return undefined;
  return value;
}

/** Validates a body from the "Quyền xem" tab; projects/Epics are de-duplicated, keys upper-cased. */
export function parseUserViewGrantsInput(body: unknown): { value: UserViewGrantsInput } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Dữ liệu quyền xem không hợp lệ.' };
  const record = body as Record<string, unknown>;
  const rawProjects = Array.isArray(record.projects) ? record.projects : [];
  const rawEpics = Array.isArray(record.epicKeys) ? record.epicKeys : [];
  if (rawProjects.length > MAX_VIEW_GRANT_PROJECTS) return { error: `Tối đa ${MAX_VIEW_GRANT_PROJECTS} dự án.` };
  if (rawEpics.length > MAX_VIEW_GRANT_EPICS) return { error: `Tối đa ${MAX_VIEW_GRANT_EPICS} Epic.` };

  const projects = new Map<number, Set<string>>();
  for (const item of rawProjects) {
    const projectId = (item as { projectId?: unknown } | null)?.projectId;
    if (!Number.isInteger(projectId) || (projectId as number) <= 0) return { error: 'Dự án trong quyền xem không hợp lệ.' };
    const rawComponents = (item as { components?: unknown }).components;
    const components = projects.get(projectId as number) ?? new Set<string>();
    for (const component of Array.isArray(rawComponents) ? rawComponents : []) {
      if (typeof component !== 'string' || component.trim() === '' || component.trim().length > 255) return { error: 'Component trong quyền xem không hợp lệ.' };
      components.add(component.trim());
    }
    projects.set(projectId as number, components);
  }

  const epicKeys = new Set<string>();
  for (const key of rawEpics) {
    const normalized = typeof key === 'string' ? normalizeViewEpicKey(key) : '';
    if (!EPIC_KEY.test(normalized) || normalized.length > 100) return { error: `Epic key không hợp lệ: ${String(key)}.` };
    epicKeys.add(normalized);
  }

  const createdAfter = parseDate(record.createdAfter);
  const startAfter = parseDate(record.startAfter);
  if (createdAfter === undefined || startAfter === undefined) return { error: 'Ngày trong Giới hạn thời gian không hợp lệ.' };

  return {
    value: {
      createdAfter,
      epicKeys: [...epicKeys].sort(),
      projects: [...projects.entries()].map(([projectId, components]) => ({ components: [...components].sort(), projectId })),
      startAfter,
    },
  };
}

/** The grants as Quản trị Epic applies them: Jira project key → allowed components (empty = all). */
export interface ViewGrants {
  projects: ReadonlyMap<string, readonly string[]>;
  epicKeys: readonly string[];
  createdAfter: string | null;
  startAfter: string | null;
}

export function hasViewGrants(grants: ViewGrants | null | undefined): grants is ViewGrants {
  return Boolean(grants && (grants.projects.size > 0 || grants.epicKeys.length > 0));
}

export interface ViewGrantEpicFacts {
  epicKey: string;
  projectKey: string;
  components: readonly string[];
  /** Jira created date (ISO, first 10 characters are used). */
  createdDate: string | null;
  startDate: string | null;
}

/**
 * Whether the grants let the user see the Epic. A single-Epic grant always does. A project grant does when the
 * Epic's components meet the narrowing (an Epic without any component is not narrowed — same rule as the real data
 * scope) and it passes the date limits.
 */
export function matchesViewGrants(grants: ViewGrants | null | undefined, epic: ViewGrantEpicFacts): boolean {
  if (!hasViewGrants(grants)) return false;
  if (grants.epicKeys.includes(epic.epicKey.toUpperCase())) return true;
  const allowedComponents = grants.projects.get(epic.projectKey);
  if (allowedComponents === undefined) return false;
  if (allowedComponents.length > 0 && epic.components.length > 0 && !epic.components.some((component) => allowedComponents.includes(component))) return false;
  if (grants.createdAfter && !(epic.createdDate && epic.createdDate.slice(0, 10) > grants.createdAfter)) return false;
  if (grants.startAfter && !(epic.startDate && epic.startDate.slice(0, 10) > grants.startAfter)) return false;
  return true;
}
