import pool from '@/lib/db';
import type { AdPopup, AdPopupInput, AdPopupPublic } from '@/lib/ad-popup-types';

const ADMIN_SELECT_COLUMNS = `
  id, campaign_name AS "campaignName", is_active AS "isActive", max_impressions AS "maxImpressions",
  message, COALESCE(image_url, '') AS "imageUrl", COALESCE(click_url, '') AS "clickUrl",
  start_date::text AS "startDate", end_date::text AS "endDate", timeout_seconds AS "timeoutSeconds",
  created_at::text AS "createdAt"
`;

export async function listAdPopups(): Promise<AdPopup[]> {
  const result = await pool.query<AdPopup>(`SELECT ${ADMIN_SELECT_COLUMNS} FROM ad_popups ORDER BY created_at DESC;`);
  return result.rows;
}

export async function createAdPopup(input: AdPopupInput): Promise<AdPopup> {
  const result = await pool.query<AdPopup>(`
    INSERT INTO ad_popups (campaign_name, is_active, max_impressions, message, image_url, click_url, start_date, end_date, timeout_seconds)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${ADMIN_SELECT_COLUMNS};
  `, [input.campaignName, input.isActive, input.maxImpressions, input.message, input.imageUrl || null, input.clickUrl || null, input.startDate, input.endDate, input.timeoutSeconds]);
  return result.rows[0];
}

export async function updateAdPopup(id: number, input: AdPopupInput): Promise<AdPopup | null> {
  const result = await pool.query<AdPopup>(`
    UPDATE ad_popups SET
      campaign_name = $2, is_active = $3, max_impressions = $4, message = $5,
      image_url = $6, click_url = $7, start_date = $8, end_date = $9, timeout_seconds = $10,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING ${ADMIN_SELECT_COLUMNS};
  `, [id, input.campaignName, input.isActive, input.maxImpressions, input.message, input.imageUrl || null, input.clickUrl || null, input.startDate, input.endDate, input.timeoutSeconds]);
  return result.rows[0] ?? null;
}

export async function deleteAdPopup(id: number): Promise<void> {
  await pool.query('DELETE FROM ad_popups WHERE id = $1;', [id]);
}

/**
 * Popups eligible to show THIS user right now: active, today falls within [start_date, end_date],
 * and this user's own impression count (0 if never shown) hasn't reached the popup's cap yet.
 * Ordered oldest-campaign-first so a long-running campaign doesn't get perpetually crowded out by
 * newer ones.
 */
export async function getEligibleAdPopupsForUser(userId: number): Promise<AdPopupPublic[]> {
  const result = await pool.query<AdPopupPublic>(`
    SELECT p.id, p.campaign_name AS "campaignName", p.message, p.timeout_seconds AS "timeoutSeconds",
      COALESCE(p.image_url, '') AS "imageUrl", COALESCE(p.click_url, '') AS "clickUrl"
    FROM ad_popups p
    LEFT JOIN ad_popup_impressions i ON i.popup_id = p.id AND i.user_id = $1
    WHERE p.is_active
      AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
      AND COALESCE(i.shown_count, 0) < p.max_impressions
    ORDER BY p.created_at ASC;
  `, [userId]);
  return result.rows;
}

/** Called the moment a popup is actually displayed to a user (not on click/dismiss) — "số lần hiện
 * tối đa" counts impressions shown, regardless of how the user closes it afterward. */
export async function recordAdPopupImpression(popupId: number, userId: number): Promise<void> {
  await pool.query(`
    INSERT INTO ad_popup_impressions (popup_id, user_id, shown_count, last_shown_at)
    VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (popup_id, user_id) DO UPDATE SET
      shown_count = ad_popup_impressions.shown_count + 1,
      last_shown_at = CURRENT_TIMESTAMP;
  `, [popupId, userId]);
}
