import 'server-only';
import pool, { getClient } from '@/lib/db';
import { richHtmlToText, sanitizeRichHtml } from '@/lib/rich-html-sanitizer';
import { NOT_SUSPENDED, SUSPENSION_MESSAGE_MAX_LENGTH, type SystemSuspensionState } from '@/lib/system-suspension';

/**
 * "Tạm dừng hệ thống" — table system_suspension_settings (20261123_system_suspension_settings.sql), rules in
 * system-suspension.ts. The proxy reads the state on every request, so it is kept in memory for a few seconds per
 * server instance: switching ON / OFF reaches every instance within CACHE_TTL_MS. A failed read keeps the last value
 * known by this instance (or "not suspended" when there is none) — a database hiccup must not lock everybody out.
 */
const CACHE_TTL_MS = 10_000;
let cache: { at: number; state: SystemSuspensionState } | null = null;

const SELECT_STATE = `
  SELECT is_suspended AS "isSuspended", message_html AS "messageHtml", allow_news_letter AS "allowNewsLetter",
    allow_mcp AS "allowMcp", suspended_at::text AS "suspendedAt", updated_at::text AS "updatedAt"
  FROM system_suspension_settings WHERE id = 1`;

export async function getSystemSuspension(options: { fresh?: boolean } = {}): Promise<SystemSuspensionState> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state;
  try {
    const row = (await pool.query<SystemSuspensionState>(`${SELECT_STATE};`)).rows[0];
    const state = row ?? NOT_SUSPENDED;
    cache = { at: Date.now(), state };
    return state;
  } catch (error: unknown) {
    // 42P01: migration 20261123 not applied yet — the feature simply does not exist on this database.
    if ((error as { code?: string }).code !== '42P01') console.error('System suspension read failed (last known state kept):', error);
    return cache?.state ?? NOT_SUSPENDED;
  }
}

export interface SystemSuspensionInput {
  allowMcp: boolean;
  allowNewsLetter: boolean;
  isSuspended: boolean;
  messageHtml: string;
}

export class SuspensionMessageError extends Error {}

/** Sanitized message (links: http / https / mailto only, opened in a new tab), '' when it has no text. */
export function cleanSuspensionMessage(html: string): string {
  if (html.length > SUSPENSION_MESSAGE_MAX_LENGTH) throw new SuspensionMessageError(`Nội dung quá dài (tối đa ${SUSPENSION_MESSAGE_MAX_LENGTH.toLocaleString('vi-VN')} ký tự HTML).`);
  const clean = sanitizeRichHtml(html);
  if (clean.length > SUSPENSION_MESSAGE_MAX_LENGTH) throw new SuspensionMessageError('Nội dung quá dài.');
  return richHtmlToText(clean) ? clean : '';
}

/**
 * Saves the switch, the message and the exceptions; the caller has already proven the SUPERADMIN and their password.
 * Signs out every user below SUPERADMIN (owner 2026-11-08) when the pause starts, and whenever it is saved ON without
 * the "Bản tin" exception (nobody below SUPERADMIN may then keep a session). One audit_logs line per save.
 */
export async function saveSystemSuspension(input: SystemSuspensionInput, actorUserId: number): Promise<{ signedOutSessions: number; state: SystemSuspensionState }> {
  const messageHtml = cleanSuspensionMessage(input.messageHtml);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const previous = (await client.query<SystemSuspensionState>(`${SELECT_STATE} FOR UPDATE;`)).rows[0] ?? NOT_SUSPENDED;
    const state = (await client.query<SystemSuspensionState>(`
      INSERT INTO system_suspension_settings (id, is_suspended, message_html, allow_news_letter, allow_mcp, suspended_at, updated_by_user_id, updated_at)
      VALUES (1, $1, $2, $3, $4, CASE WHEN $1 THEN NOW() END, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        is_suspended = EXCLUDED.is_suspended,
        message_html = EXCLUDED.message_html,
        allow_news_letter = EXCLUDED.allow_news_letter,
        allow_mcp = EXCLUDED.allow_mcp,
        suspended_at = CASE
          WHEN NOT EXCLUDED.is_suspended THEN NULL
          WHEN system_suspension_settings.is_suspended THEN system_suspension_settings.suspended_at
          ELSE NOW() END,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
      RETURNING is_suspended AS "isSuspended", message_html AS "messageHtml", allow_news_letter AS "allowNewsLetter",
        allow_mcp AS "allowMcp", suspended_at::text AS "suspendedAt", updated_at::text AS "updatedAt";
    `, [input.isSuspended, messageHtml, input.allowNewsLetter, input.allowMcp, actorUserId])).rows[0];

    let signedOutSessions = 0;
    if (state.isSuspended && (!previous.isSuspended || !state.allowNewsLetter)) {
      const deleted = await client.query(`
        DELETE FROM auth_sessions s USING users u
        WHERE u.id = s.user_id AND u.role <> 'SUPERADMIN';
      `);
      signedOutSessions = deleted.rowCount ?? 0;
    }

    const action = state.isSuspended && !previous.isSuspended ? 'SYSTEM_SUSPEND'
      : !state.isSuspended && previous.isSuspended ? 'SYSTEM_RESUME'
        : 'SYSTEM_SUSPENSION_UPDATE';
    await client.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4);', [actorUserId, action, 'SYSTEM', 'system_suspension']);
    await client.query('COMMIT');
    cache = { at: Date.now(), state };
    return { signedOutSessions, state };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
