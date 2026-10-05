import pool, { getClient } from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import type { PermissionFeature, PermissionMatrix, RoleFeaturePermission } from '@/lib/permission-matrix-types';

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const [features, permissions] = await Promise.all([
    pool.query<PermissionFeature>(`
      SELECT feature_key AS "featureKey", feature_name AS "featureName", category, display_order AS "displayOrder"
      FROM permission_features
      ORDER BY display_order ASC;
    `),
    pool.query<RoleFeaturePermission>(`
      SELECT feature_key AS "featureKey", role, can_view AS "canView", can_add AS "canAdd", can_edit AS "canEdit", can_delete AS "canDelete"
      FROM role_feature_permissions;
    `),
  ]);
  return { features: features.rows, permissions: permissions.rows };
}

/**
 * Feature keys whose "Xem" is unticked for `role` — the left panel hides the matching menu item
 * (see `featureKey` on the nav entries in AppShell / UserMenu). A registered feature with no row
 * for the role counts as unticked, same as the matrix screen renders it.
 */
export async function getViewDeniedFeatureKeys(role: UserRole): Promise<string[]> {
  const result = await pool.query<{ featureKey: string }>(`
    SELECT f.feature_key AS "featureKey"
    FROM permission_features f
    LEFT JOIN role_feature_permissions p ON p.feature_key = f.feature_key AND p.role = $1
    WHERE COALESCE(p.can_view, FALSE) = FALSE;
  `, [role]);
  return result.rows.map((row) => row.featureKey);
}

/**
 * Bulk-replaces the given (featureKey, role) permission rows in one transaction. Callers must have
 * already rejected SUPERADMIN rows on ADMIN-category features and clamped VIEW_ONLY features' add/edit/delete to FALSE —
 * this only persists what it's given.
 */
export async function saveRoleFeaturePermissions(updates: RoleFeaturePermission[]): Promise<void> {
  if (updates.length === 0) return;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const update of updates) {
      await client.query(`
        INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (feature_key, role) DO UPDATE
        SET can_view = EXCLUDED.can_view,
            can_add = EXCLUDED.can_add,
            can_edit = EXCLUDED.can_edit,
            can_delete = EXCLUDED.can_delete;
      `, [update.featureKey, update.role, update.canView, update.canAdd, update.canEdit, update.canDelete]);
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
