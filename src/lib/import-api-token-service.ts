import 'server-only';
import { randomBytes } from 'crypto';
import pool, { getClient } from '@/lib/db';

/**
 * Token of the automatic import API (POST /api/data-source/import/auto) — table import_api_settings
 * (20261128_create_import_api_settings.sql), replacing the IMPORT_API_TOKEN environment variable (owner 2026-11-13:
 * the company's internal deployment cannot set environment variables for the app). Stored in clear so a SUPERADMIN
 * can show / copy it again for the Jira crawl tool; the app runs inside the internal network.
 *
 * The route reads it on every call, kept in memory a few seconds per server instance so a burst of wrong tokens does
 * not turn into a burst of queries; a save resets this instance's copy at once, other instances follow within CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 10_000;
let cache: { at: number; token: string | null } | null = null;

export const IMPORT_TOKEN_MIN_LENGTH = 16;
export const IMPORT_TOKEN_MAX_LENGTH = 256;
const TOKEN_PREFIX = 'ttm_imp_';

export interface ImportApiTokenSettings {
  token: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export class ImportApiTokenError extends Error {}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string }).code === '42P01';
}

/** The token the route compares against; null = not configured (or migration 20261128 not applied yet). */
export async function getImportApiToken(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.token;
  try {
    const row = (await pool.query<{ token: string | null }>('SELECT api_token AS token FROM import_api_settings WHERE id = 1;')).rows[0];
    const token = row?.token ? row.token : null;
    cache = { at: Date.now(), token };
    return token;
  } catch (error: unknown) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export async function getImportApiTokenSettings(): Promise<ImportApiTokenSettings> {
  try {
    const row = (await pool.query<ImportApiTokenSettings>(`
      SELECT s.api_token AS token, s.updated_at::text AS "updatedAt", u.full_name AS "updatedByName"
      FROM import_api_settings s LEFT JOIN users u ON u.id = s.updated_by_user_id
      WHERE s.id = 1;
    `)).rows[0];
    return row ?? { token: null, updatedAt: null, updatedByName: null };
  } catch (error: unknown) {
    if (isMissingTable(error)) throw new ImportApiTokenError('CSDL chưa có bảng import_api_settings — cần chạy migration 20261128_create_import_api_settings.');
    throw error;
  }
}

export function generateImportApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

/** Trimmed token, or an ImportApiTokenError naming what is wrong. Visible ASCII only — it travels in an HTTP header. */
export function validateImportApiToken(value: string): string {
  const token = value.trim();
  if (token.length < IMPORT_TOKEN_MIN_LENGTH) throw new ImportApiTokenError(`Token phải dài ít nhất ${IMPORT_TOKEN_MIN_LENGTH} ký tự.`);
  if (token.length > IMPORT_TOKEN_MAX_LENGTH) throw new ImportApiTokenError(`Token dài tối đa ${IMPORT_TOKEN_MAX_LENGTH} ký tự.`);
  if (!/^[\x21-\x7E]+$/.test(token)) throw new ImportApiTokenError('Token chỉ gồm ký tự ASCII nhìn thấy được (không dấu, không khoảng trắng).');
  return token;
}

/** Sets (token) or clears (null) the token; one audit_logs line per save — the token itself is never logged. */
export async function saveImportApiToken(token: string | null, actorUserId: number): Promise<ImportApiTokenSettings> {
  const value = token === null ? null : validateImportApiToken(token);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO import_api_settings (id, api_token, updated_at, updated_by_user_id)
      VALUES (1, $1, CURRENT_TIMESTAMP, $2)
      ON CONFLICT (id) DO UPDATE SET api_token = EXCLUDED.api_token, updated_at = EXCLUDED.updated_at, updated_by_user_id = EXCLUDED.updated_by_user_id;
    `, [value, actorUserId]);
    await client.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4);',
      [actorUserId, value === null ? 'IMPORT_API_TOKEN_CLEARED' : 'IMPORT_API_TOKEN_SET', 'SYSTEM', 'import_api_settings']);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (isMissingTable(error)) throw new ImportApiTokenError('CSDL chưa có bảng import_api_settings — cần chạy migration 20261128_create_import_api_settings.');
    throw error;
  } finally {
    client.release();
  }
  cache = { at: Date.now(), token: value };
  return getImportApiTokenSettings();
}
