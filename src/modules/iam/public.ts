import 'server-only';

/**
 * Public IAM compatibility boundary for the first PMS architecture wave.
 *
 * Route handlers import from here instead of the legacy auth/view-as services directly. The
 * underlying implementation intentionally remains unchanged until ProjectId-based IAM is added.
 */
export {
  AuthError,
  authenticateLocal,
  createSession,
  requireUser,
  SESSION_COOKIE_NAME,
} from '@/lib/auth-service';
export type { AuthResult } from '@/lib/auth-service';
export type { AuthUser, UserRole } from '@/lib/auth-types';
export {
  listDashboardPreviewUsers,
  resolveDashboardTarget,
} from '@/modules/iam/application/dashboard-audience';
export type { DashboardManagedUser } from '@/modules/iam/application/dashboard-audience';
