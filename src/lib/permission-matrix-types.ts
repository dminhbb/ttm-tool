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

export interface PermissionMatrix {
  features: PermissionFeature[];
  permissions: RoleFeaturePermission[];
}
