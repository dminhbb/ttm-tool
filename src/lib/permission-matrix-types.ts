import type { UserRole } from '@/lib/auth-types';

export const FEATURE_CATEGORIES = ['ADMIN', 'VIEW_ONLY'] as const;
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export interface PermissionFeature {
  category: FeatureCategory;
  displayOrder: number;
  featureKey: string;
  featureName: string;
}

export interface RoleFeaturePermission {
  canAdd: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canView: boolean;
  featureKey: string;
  role: UserRole;
}

/** Fired on `window` after the matrix is saved, so the left panel re-reads which menu items the
 * current role may still see without waiting for the next navigation. */
export const PERMISSION_MATRIX_CHANGED_EVENT = 'ttm:permission-matrix-changed';

export interface PermissionMatrix {
  features: PermissionFeature[];
  permissions: RoleFeaturePermission[];
}
