import 'server-only';
import type { AuthUser } from '@/lib/auth-types';
import { resolveAccessScope, type AccessScope } from '@/lib/epic-alert-service';
import type { Domain, Project, ProjectComponent } from '@/lib/master-data-types';

/**
 * Báo cáo Epic uses the same data scope as every other Epic screen (resolveAccessScope):
 * SUPERADMIN/SUPERVISOR → every project; ADMIN → projects of their Domains + projects they are
 * PM/SM of; USER → projects they are PM/SM of, narrowed to their components where granted that way.
 */
export async function getReportAccessScope(user: AuthUser): Promise<AccessScope> {
  return resolveAccessScope(user.id, user.role);
}

function findScopeKey(scope: AccessScope, projectKey: string): string | null {
  if (scope.sourceProjectKeys === null) return projectKey;
  const wanted = projectKey.toLowerCase();
  return scope.sourceProjectKeys.find((key) => key.toLowerCase() === wanted) ?? null;
}

export function reportScopeAllowsProject(scope: AccessScope, projectKey: string): boolean {
  return findScopeKey(scope, projectKey) !== null;
}

/** Component narrowing for one project, or null when the whole project is visible. */
export function reportAllowedComponents(scope: AccessScope, projectKey: string): string[] | null {
  const key = findScopeKey(scope, projectKey);
  const narrowed = key ? scope.projectComponents.get(key) : undefined;
  return narrowed && narrowed.length > 0 ? narrowed : null;
}

/** The report screen's Domain / Project / Component pickers, limited to the viewer's scope. */
export function scopeReportFilterOptions(scope: AccessScope, domains: Domain[], projects: Project[], components: ProjectComponent[]) {
  if (scope.sourceProjectKeys === null) return { components, domains, projects };
  const scopedProjects = projects.filter((project) => reportScopeAllowsProject(scope, project.sourceProjectKey));
  const domainIds = new Set(scopedProjects.map((project) => project.domainId));
  const scopedComponents = components.filter((item) => {
    if (!reportScopeAllowsProject(scope, item.projectKey)) return false;
    const allowed = reportAllowedComponents(scope, item.projectKey);
    return !allowed || allowed.some((name) => name.toLowerCase() === item.componentName.toLowerCase());
  });
  return { components: scopedComponents, domains: domains.filter((domain) => domainIds.has(domain.id)), projects: scopedProjects };
}
