import 'server-only';
import pool, { getClient } from '@/lib/db';
import type { AuthUser } from '@/lib/auth-types';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { rowInAccessScope } from '@/lib/epic-alert-row-cache-query-service';
import { EPIC_HIDE_COMMENT, EPIC_UNHIDE_COMMENT, type EpicCommentEntry, type EpicMarkSummary } from '@/lib/epic-mark-format';

/**
 * "Epic Mark" — comments + Hide/Unhide per Epic (tables epic_comments / epic_marks, migration 20261106).
 * Comments only ever accumulate; Hide/Unhide writes a system comment so the trail shows who did it.
 * Who may read/comment: any user whose data scope contains the Epic — a PM/SM of its project (component
 * narrowing included), an ADMIN of its Domain/project, SUPERVISOR and SUPERADMIN.
 */

interface CommentRow {
  content: string;
  createdAt: string;
  epicKey?: string;
  id: string;
  isSystem: boolean;
  userName: string;
}

function toEntry(row: CommentRow): EpicCommentEntry {
  return { content: row.content, createdAt: row.createdAt, id: Number(row.id), isSystem: row.isSystem, userName: row.userName };
}

const COMMENT_COLUMNS = `id::text AS id, content, created_at::text AS "createdAt", is_system AS "isSystem", user_name AS "userName"`;

export interface EpicMarkAccess {
  epicName: string;
  ownerName: string;
}

/** The Epic's name + PM/SM when the user's data scope contains it, else null (unknown Epic = out of scope). */
export async function resolveEpicMarkAccess(user: Pick<AuthUser, 'id' | 'role'>, epicKey: string): Promise<EpicMarkAccess | null> {
  const [scope, cached] = await Promise.all([
    resolveAccessScope(user.id, user.role),
    pool.query<{ components: string[]; epicName: string; ownerNames: string[]; projectKey: string }>(
      'SELECT project_key AS "projectKey", components, epic_name AS "epicName", owner_names AS "ownerNames" FROM epic_alert_row_cache WHERE epic_key = $1 LIMIT 1;',
      [epicKey],
    ),
  ]);
  const row = cached.rows[0];
  if (!row || !rowInAccessScope(scope, row.projectKey, row.components)) return null;
  return { epicName: row.epicName, ownerName: (row.ownerNames ?? []).join(', ') };
}

export async function getEpicMarkDetail(epicKey: string): Promise<{ comments: EpicCommentEntry[]; isHidden: boolean }> {
  const [comments, mark] = await Promise.all([
    pool.query<CommentRow>(`SELECT ${COMMENT_COLUMNS} FROM epic_comments WHERE epic_key = $1 ORDER BY created_at DESC, id DESC;`, [epicKey]),
    pool.query<{ isHidden: boolean }>('SELECT is_hidden AS "isHidden" FROM epic_marks WHERE epic_key = $1;', [epicKey]),
  ]);
  return { comments: comments.rows.map(toEntry), isHidden: mark.rows[0]?.isHidden ?? false };
}

/** Author name written on a comment: the username (e-mail before "@", lower-case) — the same form as the PM/SM names (`ownerName`). */
export function commentAuthorName(user: Pick<AuthUser, 'email'>): string {
  return user.email.split('@')[0].toLowerCase();
}

export async function addEpicComment(epicKey: string, user: Pick<AuthUser, 'email' | 'id'>, content: string): Promise<EpicCommentEntry> {
  const inserted = await pool.query<CommentRow>(
    `INSERT INTO epic_comments (epic_key, user_id, user_name, content) VALUES ($1, $2, $3, $4) RETURNING ${COMMENT_COLUMNS};`,
    [epicKey, user.id, commentAuthorName(user), content],
  );
  return toEntry(inserted.rows[0]);
}

/** Sets the Epic's hidden flag. Returns whether the value changed (only then is a system comment written). */
export async function setEpicHidden(epicKey: string, hidden: boolean, user: Pick<AuthUser, 'email' | 'id'>): Promise<boolean> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const changed = hidden
      ? await client.query(`
          INSERT INTO epic_marks (epic_key, is_hidden, updated_by_user_id) VALUES ($1, TRUE, $2)
          ON CONFLICT (epic_key) DO UPDATE SET is_hidden = TRUE, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = CURRENT_TIMESTAMP
            WHERE NOT epic_marks.is_hidden;
        `, [epicKey, user.id])
      : await client.query(
          'UPDATE epic_marks SET is_hidden = FALSE, updated_by_user_id = $2, updated_at = CURRENT_TIMESTAMP WHERE epic_key = $1 AND is_hidden;',
          [epicKey, user.id],
        );
    const didChange = (changed.rowCount ?? 0) > 0;
    if (didChange) {
      await client.query(
        'INSERT INTO epic_comments (epic_key, user_id, user_name, content, is_system) VALUES ($1, $2, $3, $4, TRUE);',
        [epicKey, user.id, commentAuthorName(user), hidden ? EPIC_HIDE_COMMENT : EPIC_UNHIDE_COMMENT],
      );
    }
    await client.query('COMMIT');
    return didChange;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Comment count, hidden flag and the 2 newest comments of the Epics that have any (the rest are left out
 * of the map). `epicKeys` null = every Epic (the live list, which holds them all).
 */
export async function loadEpicMarkSummaries(epicKeys: readonly string[] | null): Promise<Map<string, EpicMarkSummary>> {
  if (epicKeys && epicKeys.length === 0) return new Map();
  const keys = epicKeys ? [...epicKeys] : null;
  const [counts, hidden, latest] = await Promise.all([
    pool.query<{ epicKey: string; n: string }>('SELECT epic_key AS "epicKey", count(*)::text AS n FROM epic_comments WHERE $1::text[] IS NULL OR epic_key = ANY($1) GROUP BY epic_key;', [keys]),
    pool.query<{ epicKey: string }>('SELECT epic_key AS "epicKey" FROM epic_marks WHERE is_hidden AND ($1::text[] IS NULL OR epic_key = ANY($1));', [keys]),
    pool.query<CommentRow>(`
      SELECT * FROM (
        SELECT epic_key AS "epicKey", ${COMMENT_COLUMNS},
               row_number() OVER (PARTITION BY epic_key ORDER BY created_at DESC, id DESC) AS rn
        FROM epic_comments WHERE $1::text[] IS NULL OR epic_key = ANY($1)
      ) t WHERE rn <= 2 ORDER BY "createdAt" DESC;
    `, [keys]),
  ]);
  const map = new Map<string, EpicMarkSummary>();
  const summaryOf = (epicKey: string): EpicMarkSummary => {
    let summary = map.get(epicKey);
    if (!summary) {
      summary = { commentCount: 0, isHidden: false, latestComments: [] };
      map.set(epicKey, summary);
    }
    return summary;
  };
  for (const row of counts.rows) summaryOf(row.epicKey).commentCount = Number(row.n);
  for (const row of hidden.rows) summaryOf(row.epicKey).isHidden = true;
  for (const row of latest.rows) summaryOf(row.epicKey as string).latestComments.push(toEntry(row));
  return map;
}

/** Stamps `mark` on the rows that have comments or are hidden. */
export function applyEpicMarks<T extends { epicKey: string }>(rows: readonly T[], marks: ReadonlyMap<string, EpicMarkSummary>): (T & { mark?: EpicMarkSummary })[] {
  return rows.map((row) => {
    const mark = marks.get(row.epicKey);
    return mark ? { ...row, mark } : row;
  });
}

/** PM/SM names (e-mail local part, as in `owner_names`) of the Epics in the viewer's scope that have a comment — the "Marked epics" user dropdown. */
export async function listMarkedOwnerNames(accessClause: string, params: unknown[]): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT DISTINCT unnest(owner_names) AS name FROM epic_alert_row_cache WHERE ${accessClause} AND EXISTS (SELECT 1 FROM epic_comments c WHERE c.epic_key = epic_alert_row_cache.epic_key) ORDER BY 1;`,
    params,
  );
  return result.rows.map((row) => row.name);
}
