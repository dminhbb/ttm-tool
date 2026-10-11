import 'server-only';

import { listManagedUsers } from '@/lib/auth-service';
import type { AuthUser, UserRole } from '@/lib/auth-types';
import {
  listPreviewableUsers,
  resolveViewAsTarget,
  VIEW_AS_ALLOWED_ROLES,
  type ViewAsTarget,
} from '@/lib/view-as-user-service';

/**
 * Compatibility DTO for the existing Dashboard 2 response. Deliberately excludes usage statistics
 * and component grants: callers receive only the fields the current route already exposes.
 */
export interface DashboardManagedUser {
  domainIds: number[];
  email: string;
  fullName: string;
  id: number;
  isActive: boolean;
  projectIds: number[];
  role: UserRole;
}

/** Transitional IAM facade. ProjectId-based access replaces the legacy Jira-key scope in a later wave. */
export async function resolveDashboardTarget(actor: AuthUser, rawViewAsUserId: string | null): Promise<ViewAsTarget> {
  return resolveViewAsTarget(actor, rawViewAsUserId);
}

export async function listDashboardPreviewUsers(actor: AuthUser): Promise<DashboardManagedUser[]> {
  if (!VIEW_AS_ALLOWED_ROLES.includes(actor.role)) return [];
  const users = await listPreviewableUsers(actor, await listManagedUsers());
  return users.map((user) => ({
    domainIds: user.domainIds,
    email: user.email,
    fullName: user.fullName,
    id: user.id,
    isActive: user.isActive,
    projectIds: user.projectIds,
    role: user.role,
  }));
}
