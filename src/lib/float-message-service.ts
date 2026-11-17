import 'server-only';
import pool, { getClient } from '@/lib/db';
import { DEFAULT_FLOAT_MESSAGE, publicFloatMessageOf, type FloatMessageInput, type FloatMessageSettings, type PublicFloatMessage } from '@/lib/float-message';

/**
 * "Float message" — table float_message_settings (migration 20261129), rules in float-message.ts. Every signed-in page
 * load asks for it once, so the row is kept in memory a few seconds per server instance; a save resets this instance's
 * copy at once, other instances follow within CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 10_000;
let cache: { at: number; settings: FloatMessageSettings } | null = null;

const SELECT_SETTINGS = `
  SELECT s.message_text AS "messageText", s.is_active AS "isActive", s.start_date::text AS "startDate", s.end_date::text AS "endDate",
    s.auto_hide_seconds AS "autoHideSeconds", s.dismissible, s.position, s.updated_at::text AS "updatedAt", u.full_name AS "updatedByName"
  FROM float_message_settings s LEFT JOIN users u ON u.id = s.updated_by_user_id
  WHERE s.id = 1`;

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string }).code === '42P01';
}

export async function getFloatMessageSettings(options: { fresh?: boolean } = {}): Promise<FloatMessageSettings> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.settings;
  try {
    const row = (await pool.query<FloatMessageSettings>(`${SELECT_SETTINGS};`)).rows[0];
    const settings = row ?? DEFAULT_FLOAT_MESSAGE;
    cache = { at: Date.now(), settings };
    return settings;
  } catch (error: unknown) {
    // Migration 20261129 not applied yet: the feature does not exist on this database — show nothing.
    if (isMissingTable(error)) return DEFAULT_FLOAT_MESSAGE;
    throw error;
  }
}

/** The message a signed-in user sees right now (today in Vietnam time), or null. */
export async function getPublicFloatMessage(): Promise<PublicFloatMessage | null> {
  const [settings, today] = await Promise.all([
    getFloatMessageSettings(),
    pool.query<{ today: string }>("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today;").then((result) => result.rows[0].today),
  ]);
  return publicFloatMessageOf(settings, today);
}

/** Saves an already validated input (validateFloatMessageInput); one audit_logs line per save. */
export async function saveFloatMessageSettings(input: FloatMessageInput, actorUserId: number): Promise<FloatMessageSettings> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO float_message_settings (id, message_text, is_active, start_date, end_date, auto_hide_seconds, dismissible, position, updated_by_user_id, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        message_text = EXCLUDED.message_text, is_active = EXCLUDED.is_active, start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date, auto_hide_seconds = EXCLUDED.auto_hide_seconds, dismissible = EXCLUDED.dismissible,
        position = EXCLUDED.position, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = EXCLUDED.updated_at;
    `, [input.messageText, input.isActive, input.startDate, input.endDate, input.autoHideSeconds, input.dismissible, input.position, actorUserId]);
    await client.query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4);',
      [actorUserId, 'FLOAT_MESSAGE_UPDATE', 'SYSTEM', 'float_message_settings'],
    );
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  cache = null;
  return getFloatMessageSettings({ fresh: true });
}
