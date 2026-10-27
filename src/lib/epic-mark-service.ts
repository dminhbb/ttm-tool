import 'server-only';
import pool from '@/lib/db';
import type { AuthUser } from '@/lib/auth-types';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { rowInAccessScope } from '@/lib/epic-alert-row-cache-query-service';
import type { EpicCommentEntry, EpicMarkSummary, EpicTaskStatus } from '@/lib/epic-mark-format';
import { scoringNotesOf, type ScoringNote } from '@/lib/epic-scoring-notes';
import type { Finding } from '@/lib/scoring/types';

/**
 * "Epic Mark" — comments per Epic (table epic_comments, migration 20261106) and a PERSONAL Hide/Unhide (table
 * epic_hidden_by_users, migration 20261107, owner 2026-10-27): hiding leaves the Epic out of "Quản trị Epic" for the
 * user who pressed Hide only; Unhide deletes that row and the Epic is shown as usual. Hide/Unhide writes no comment.
 * Comments only ever accumulate. "Giao việc" (table epic_task_status, migration 20261108) is one TODO/DONE state per
 * Epic, switched by its PM/SMs and ADMIN/SUPERADMIN (canSetEpicTaskStatus). Who may read/comment/hide: any user whose data scope contains the Epic — a PM/SM of
 * its project (component narrowing included), an ADMIN of its Domain/project, SUPERVISOR and SUPERADMIN.
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
  /** PM/SM usernames of the Epic (owner_names). */
  ownerNames: string[];
  /** The Epic's active Scoring Service badges with their explanations (tab "Scoring" of Review Notes). */
  scoring: ScoringNote[];
}

/** The Epic's name + PM/SM when the user's data scope contains it, else null (unknown Epic = out of scope). */
export async function resolveEpicMarkAccess(user: Pick<AuthUser, 'id' | 'role'>, epicKey: string): Promise<EpicMarkAccess | null> {
  const [scope, cached] = await Promise.all([
    resolveAccessScope(user.id, user.role),
    pool.query<{ badgeCodes: string[]; components: string[]; epicName: string; findings: Finding[]; ownerNames: string[]; projectKey: string }>(
      `SELECT project_key AS "projectKey", components, epic_name AS "epicName", owner_names AS "ownerNames",
              findings, badge_codes AS "badgeCodes"
       FROM epic_alert_row_cache WHERE epic_key = $1 LIMIT 1;`,
      [epicKey],
    ),
  ]);
  const row = cached.rows[0];
  if (!row || !rowInAccessScope(scope, row.projectKey, row.components)) return null;
  return {
    epicName: row.epicName,
    ownerName: (row.ownerNames ?? []).join(', '),
    ownerNames: row.ownerNames ?? [],
    scoring: scoringNotesOf(row.findings, row.badgeCodes),
  };
}

export interface EpicTaskState {
  status: EpicTaskStatus;
  /** Who last switched it (full name), null while it was never switched. */
  updatedByName: string | null;
  updatedAt: string | null;
}

/** "Giao việc" of the Epic — TODO when nobody switched it yet. */
export async function getEpicTaskState(epicKey: string): Promise<EpicTaskState> {
  const result = await pool.query<EpicTaskState>(`
    SELECT t.status, COALESCE(u.full_name, SPLIT_PART(LOWER(u.email), '@', 1)) AS "updatedByName", t.updated_at::text AS "updatedAt"
    FROM epic_task_status t LEFT JOIN users u ON u.id = t.updated_by_user_id
    WHERE t.epic_key = $1;
  `, [epicKey]);
  return result.rows[0] ?? { status: 'TODO', updatedAt: null, updatedByName: null };
}

/** Sets "Giao việc" (permission checked by the caller — canSetEpicTaskStatus). Returns whether it changed. */
export async function setEpicTaskStatus(epicKey: string, status: EpicTaskStatus, userId: number): Promise<boolean> {
  const result = await pool.query<{ inserted: boolean }>(`
    INSERT INTO epic_task_status (epic_key, status, updated_by_user_id) VALUES ($1, $2, $3)
    ON CONFLICT (epic_key) DO UPDATE SET status = EXCLUDED.status, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = CURRENT_TIMESTAMP
      WHERE epic_task_status.status <> EXCLUDED.status
    RETURNING (xmax = 0) AS inserted;
  `, [epicKey, status, userId]);
  const row = result.rows[0];
  // No row = already in that state. A new row set to TODO was TODO before too (no row = TODO).
  return Boolean(row) && !(row.inserted && status === 'TODO');
}

/**
 * "My assigned epics" counter: Epics of the user's data scope where they are a PM/SM (owner_names), that have a
 * comment and whose "Giao việc" is still TODO — hidden ones included, like the quick filter itself.
 */
export async function countAssignedTodoEpics(accessClause: string, params: unknown[], userId: number): Promise<number> {
  const userParam = params.length + 1;
  const result = await pool.query<{ n: string }>(`
    SELECT count(*)::text AS n FROM epic_alert_row_cache
    WHERE ${accessClause}
      AND owner_names @> ARRAY[(SELECT SPLIT_PART(LOWER(u.email), '@', 1) FROM users u WHERE u.id = $${userParam})]
      AND EXISTS (SELECT 1 FROM epic_comments c WHERE c.epic_key = epic_alert_row_cache.epic_key)
      AND NOT EXISTS (SELECT 1 FROM epic_task_status t WHERE t.epic_key = epic_alert_row_cache.epic_key AND t.status = 'DONE');
  `, [...params, userId]);
  return Number(result.rows[0]?.n ?? 0);
}

/** The Epic's comments, and whether `hiddenForUserId` hid it (each user's own Hide). */
export async function getEpicMarkDetail(epicKey: string, hiddenForUserId: number): Promise<{ comments: EpicCommentEntry[]; isHidden: boolean }> {
  const [comments, hidden] = await Promise.all([
    pool.query<CommentRow>(`SELECT ${COMMENT_COLUMNS} FROM epic_comments WHERE epic_key = $1 ORDER BY created_at DESC, id DESC;`, [epicKey]),
    pool.query('SELECT 1 FROM epic_hidden_by_users WHERE epic_key = $1 AND user_id = $2;', [epicKey, hiddenForUserId]),
  ]);
  return { comments: comments.rows.map(toEntry), isHidden: (hidden.rowCount ?? 0) > 0 };
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

/** Hides / unhides the Epic for this user only. Returns whether anything changed. */
export async function setEpicHidden(epicKey: string, hidden: boolean, userId: number): Promise<boolean> {
  const result = hidden
    ? await pool.query('INSERT INTO epic_hidden_by_users (user_id, epic_key) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [userId, epicKey])
    : await pool.query('DELETE FROM epic_hidden_by_users WHERE user_id = $1 AND epic_key = $2;', [userId, epicKey]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Comment count, the 2 newest comments and whether `viewerUserId` hid it, for the given Epics — only the ones
 * with a comment or hidden by the viewer are in the map. Callers pass the Epics of the viewer's own list (already
 * within their data scope), never the whole table.
 */
export async function loadEpicMarkSummaries(epicKeys: readonly string[], viewerUserId: number): Promise<Map<string, EpicMarkSummary>> {
  if (epicKeys.length === 0) return new Map();
  const keys = [...new Set(epicKeys)];
  const [counts, hidden, latest, done] = await Promise.all([
    pool.query<{ epicKey: string; n: string }>('SELECT epic_key AS "epicKey", count(*)::text AS n FROM epic_comments WHERE epic_key = ANY($1) GROUP BY epic_key;', [keys]),
    pool.query<{ epicKey: string }>('SELECT epic_key AS "epicKey" FROM epic_hidden_by_users WHERE user_id = $2 AND epic_key = ANY($1);', [keys, viewerUserId]),
    pool.query<CommentRow>(`
      SELECT * FROM (
        SELECT epic_key AS "epicKey", ${COMMENT_COLUMNS},
               row_number() OVER (PARTITION BY epic_key ORDER BY created_at DESC, id DESC) AS rn
        FROM epic_comments WHERE epic_key = ANY($1)
      ) t WHERE rn <= 2 ORDER BY "createdAt" DESC;
    `, [keys]),
    pool.query<{ epicKey: string }>(`SELECT epic_key AS "epicKey" FROM epic_task_status WHERE status = 'DONE' AND epic_key = ANY($1);`, [keys]),
  ]);
  const map = new Map<string, EpicMarkSummary>();
  const summaryOf = (epicKey: string): EpicMarkSummary => {
    let summary = map.get(epicKey);
    if (!summary) {
      summary = { commentCount: 0, isHidden: false, latestComments: [], taskDone: false };
      map.set(epicKey, summary);
    }
    return summary;
  };
  for (const row of counts.rows) summaryOf(row.epicKey).commentCount = Number(row.n);
  for (const row of hidden.rows) summaryOf(row.epicKey).isHidden = true;
  for (const row of latest.rows) summaryOf(row.epicKey as string).latestComments.push(toEntry(row));
  for (const row of done.rows) summaryOf(row.epicKey).taskDone = true;
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
