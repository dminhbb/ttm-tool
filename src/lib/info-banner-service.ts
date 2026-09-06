import pool, { getClient } from '@/lib/db';
import type { PoolClient } from 'pg';
import type { InfoBanner, InfoBannerInput, InfoBannerPublic } from '@/lib/info-banner-types';

const ADMIN_SELECT_COLUMNS = `
  id, name, message, banner_type AS "bannerType", screen_key AS "screenKey", is_active AS "isActive",
  start_date::text AS "startDate", end_date::text AS "endDate", created_at::text AS "createdAt"
`;

export async function listInfoBanners(): Promise<InfoBanner[]> {
  const result = await pool.query<InfoBanner>(`
    SELECT ${ADMIN_SELECT_COLUMNS} FROM info_banners
    ORDER BY (banner_type = 'DEFAULT') DESC, created_at DESC;
  `);
  return result.rows;
}

/** If `input.bannerType` is DEFAULT, demotes whichever OTHER row currently holds that slot first
 * (to PER_SCREEN with no screen assigned) — see the table's uq_info_banners_single_default index,
 * which this keeps satisfied without ever needing two DEFAULT rows to exist even momentarily. */
async function demoteExistingDefault(client: PoolClient, excludeId: number | null): Promise<void> {
  await client.query(
    `UPDATE info_banners SET banner_type = 'PER_SCREEN', screen_key = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE banner_type = 'DEFAULT' AND ($1::int IS NULL OR id <> $1);`,
    [excludeId],
  );
}

export async function createInfoBanner(input: InfoBannerInput): Promise<InfoBanner> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (input.bannerType === 'DEFAULT') await demoteExistingDefault(client, null);
    const result = await client.query<InfoBanner>(`
      INSERT INTO info_banners (name, message, banner_type, screen_key, is_active, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${ADMIN_SELECT_COLUMNS};
    `, [
      input.name, input.message, input.bannerType,
      input.bannerType === 'DEFAULT' ? null : input.screenKey,
      input.isActive, input.startDate, input.endDate,
    ]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateInfoBanner(id: number, input: InfoBannerInput): Promise<InfoBanner | null> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (input.bannerType === 'DEFAULT') await demoteExistingDefault(client, id);
    const result = await client.query<InfoBanner>(`
      UPDATE info_banners SET
        name = $2, message = $3, banner_type = $4, screen_key = $5, is_active = $6,
        start_date = $7, end_date = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${ADMIN_SELECT_COLUMNS};
    `, [
      id, input.name, input.message, input.bannerType,
      input.bannerType === 'DEFAULT' ? null : input.screenKey,
      input.isActive, input.startDate, input.endDate,
    ]);
    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type DeleteInfoBannerResult = 'DELETED' | 'IS_DEFAULT' | 'NOT_FOUND';

/** The current DEFAULT banner can't be deleted — "banner này sẽ không xóa được" — edit it to
 * PER_SCREEN first (freeing the slot) if it truly needs removing. */
export async function deleteInfoBanner(id: number): Promise<DeleteInfoBannerResult> {
  const existing = await pool.query<{ bannerType: string }>('SELECT banner_type AS "bannerType" FROM info_banners WHERE id = $1;', [id]);
  if (existing.rowCount === 0) return 'NOT_FOUND';
  if (existing.rows[0].bannerType === 'DEFAULT') return 'IS_DEFAULT';
  await pool.query('DELETE FROM info_banners WHERE id = $1;', [id]);
  return 'DELETED';
}

export interface ActiveInfoBanners {
  defaultBanner: InfoBannerPublic | null;
  screenBanner: InfoBannerPublic | null;
}

/**
 * What a given screen should show right now: the DEFAULT banner (if active/in range) plus that
 * screen's own PER_SCREEN banner (if one is assigned to `screenKey`, active, and in range) — either,
 * both, or neither. Both share the same active/date-range gate, so one query covers both, split by
 * bannerType afterward.
 */
export async function getActiveBannersForScreen(screenKey: string): Promise<ActiveInfoBanners> {
  const result = await pool.query<InfoBannerPublic & { bannerType: string }>(`
    SELECT id, message, banner_type AS "bannerType"
    FROM info_banners
    WHERE is_active
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
      AND (banner_type = 'DEFAULT' OR (banner_type = 'PER_SCREEN' AND screen_key = $1))
    ORDER BY updated_at DESC;
  `, [screenKey]);
  return {
    defaultBanner: result.rows.find((row) => row.bannerType === 'DEFAULT') ?? null,
    screenBanner: result.rows.find((row) => row.bannerType === 'PER_SCREEN') ?? null,
  };
}
