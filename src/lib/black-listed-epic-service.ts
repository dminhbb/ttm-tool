import 'server-only';
import pool, { getClient } from '@/lib/db';
import type { BlackListedEpicEntry } from '@/lib/black-listed-epics-format';
import type { TtmExclusion } from '@/lib/scoring/types';

/**
 * "Epic ngoại lệ" — table black_listed_epics (migration 20261005). A row means the Epic is taken out
 * of every Time to Market calculation; "not black listed" is always expressed by the row being
 * absent, so the popup's text and the form in Duyệt Epic can never disagree about an Epic.
 */

export interface BlackListedEpicsSnapshot {
  entries: BlackListedEpicEntry[];
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function listBlackListedEpics(): Promise<BlackListedEpicsSnapshot> {
  const [entries, latest] = await Promise.all([
    pool.query<BlackListedEpicEntry>(
      'SELECT epic_key AS "epicKey", project_key AS "projectKey" FROM black_listed_epics WHERE ttm_black_listed ORDER BY project_key, epic_key;',
    ),
    pool.query<{ updatedAt: string; updatedByName: string | null }>(`
      SELECT b.updated_at::text AS "updatedAt", u.full_name AS "updatedByName"
      FROM black_listed_epics b LEFT JOIN users u ON u.id = b.updated_by_user_id
      ORDER BY b.updated_at DESC LIMIT 1;
    `),
  ]);
  return { entries: entries.rows, updatedAt: latest.rows[0]?.updatedAt ?? null, updatedByName: latest.rows[0]?.updatedByName ?? null };
}

export async function isEpicBlackListed(epicKey: string): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM black_listed_epics WHERE epic_key = $1 AND ttm_black_listed;', [epicKey.trim().toUpperCase()]);
  return result.rows.length > 0;
}

/**
 * Makes the table match the popup's (already validated) list: Epics newly declared get a row,
 * Epics no longer declared have theirs deleted, the rest are left as they are. Returns what changed.
 */
export async function replaceBlackListedEpics(entries: readonly BlackListedEpicEntry[], userId: number): Promise<{ added: string[]; removed: string[] }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ epicKey: string }>('SELECT epic_key AS "epicKey" FROM black_listed_epics FOR UPDATE;');
    const before = new Set(existing.rows.map((row) => row.epicKey));
    const after = new Set(entries.map((entry) => entry.epicKey));
    const added = entries.filter((entry) => !before.has(entry.epicKey));
    const removed = [...before].filter((epicKey) => !after.has(epicKey));

    if (removed.length > 0) await client.query('DELETE FROM black_listed_epics WHERE epic_key = ANY($1::text[]);', [removed]);
    if (added.length > 0) {
      await client.query(`
        INSERT INTO black_listed_epics (epic_key, project_key, ttm_black_listed, updated_by_user_id)
        SELECT epic_key, project_key, TRUE, $3 FROM unnest($1::text[], $2::text[]) AS t(epic_key, project_key)
        ON CONFLICT (epic_key) DO UPDATE SET
          project_key = EXCLUDED.project_key, ttm_black_listed = TRUE,
          updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = CURRENT_TIMESTAMP;
      `, [added.map((entry) => entry.epicKey), added.map((entry) => entry.projectKey), userId]);
    }
    await client.query('COMMIT');
    return { added: added.map((entry) => entry.epicKey), removed };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** The form in Duyệt Epic: true = upsert the Epic's row, false = delete it. Returns whether the
 * stored value actually changed (no change → no cache rebuild needed). */
export async function setEpicBlackListed(entry: BlackListedEpicEntry, blackListed: boolean, userId: number): Promise<boolean> {
  if (!blackListed) {
    const deleted = await pool.query('DELETE FROM black_listed_epics WHERE epic_key = $1;', [entry.epicKey]);
    return (deleted.rowCount ?? 0) > 0;
  }
  const inserted = await pool.query(`
    INSERT INTO black_listed_epics (epic_key, project_key, ttm_black_listed, updated_by_user_id)
    VALUES ($1, $2, TRUE, $3)
    ON CONFLICT (epic_key) DO UPDATE SET ttm_black_listed = TRUE, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = CURRENT_TIMESTAMP
      WHERE black_listed_epics.ttm_black_listed = FALSE;
  `, [entry.epicKey, entry.projectKey, userId]);
  return (inserted.rowCount ?? 0) > 0;
}

/** What takes an Epic out of the TTM calculation besides being Cancelled: its own black list row,
 * or its project being marked "Time to Market = N" (Quản lý Dự án). Keys are upper-cased. */
export interface TtmExclusionSources {
  blackListedEpicKeys: ReadonlySet<string>;
  nonTtmProjectKeys: ReadonlySet<string>;
}

const NO_EXCLUSIONS: TtmExclusionSources = { blackListedEpicKeys: new Set(), nonTtmProjectKeys: new Set() };

/**
 * Fails open (nothing excluded) when the black list table isn't there yet — a database the
 * migration hasn't reached must keep computing TTM exactly as before, not break every Epic screen.
 */
export async function loadTtmExclusionSources(): Promise<TtmExclusionSources> {
  try {
    const [blackListed, nonTtmProjects] = await Promise.all([
      pool.query<{ epicKey: string }>('SELECT epic_key AS "epicKey" FROM black_listed_epics WHERE ttm_black_listed;'),
      pool.query<{ projectKey: string }>(`SELECT source_project_key AS "projectKey" FROM projects WHERE ttm = 'N';`),
    ]);
    return {
      blackListedEpicKeys: new Set(blackListed.rows.map((row) => row.epicKey.toUpperCase())),
      nonTtmProjectKeys: new Set(nonTtmProjects.rows.map((row) => row.projectKey.toUpperCase())),
    };
  } catch (error: unknown) {
    console.error('TTM exclusion lookup failed — computing TTM without any exclusion:', error);
    return NO_EXCLUSIONS;
  }
}

/** Black list wins over the project flag, so an Epic that is both is reported as "Epic ngoại lệ". */
export function resolveTtmExclusion(sources: TtmExclusionSources, epicKey: string, projectKey: string | null | undefined): TtmExclusion | null {
  if (sources.blackListedEpicKeys.has(epicKey.toUpperCase())) return 'BLACK_LISTED';
  if (projectKey && sources.nonTtmProjectKeys.has(projectKey.toUpperCase())) return 'PROJECT_NON_TTM';
  return null;
}

/** Stamps `ttmBlackListed` / `ttmExclusion` on Epic rows of either display engine — the legacy row
 * builders don't know about the black list (and stay untouched), so every reader gets it from here. */
export function applyTtmExclusions<T extends { epicKey: string; projectKey: string }>(rows: readonly T[], sources: TtmExclusionSources): (T & { ttmBlackListed: boolean; ttmExclusion: TtmExclusion | null })[] {
  return rows.map((row) => ({
    ...row,
    ttmBlackListed: sources.blackListedEpicKeys.has(row.epicKey.toUpperCase()),
    ttmExclusion: resolveTtmExclusion(sources, row.epicKey, row.projectKey),
  }));
}
