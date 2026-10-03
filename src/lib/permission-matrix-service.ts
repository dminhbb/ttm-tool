import pool, { getClient } from '@/lib/db';
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
 * Bulk-replaces the given (featureKey, role) permission rows in one transaction. Callers must have
 * already stripped out SUPERADMIN rows and clamped VIEW_ONLY features' add/edit/delete to FALSE —
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
