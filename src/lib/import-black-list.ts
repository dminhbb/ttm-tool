import 'server-only';
import type { PoolClient } from 'pg';
import { planImportBlackList } from '@/lib/import-black-list-plan';
import type { ImportBlackListPlan, ImportedEpicTtmApplied } from '@/lib/import-black-list-plan';

/**
 * "TTM-applied" = 'Không áp dụng' → the Epic goes to the black list ("Epic ngoại lệ", table black_listed_epics) while
 * the import runs, so every cache and rule leaves it out (owner 2026-10-26):
 *   - not on the list (or a leftover row with ttm_black_listed = false) → added with source IMPORT;
 *   - already on the list → skipped, whoever added it;
 *   - a person removing the Epic by hand does not stick while the CSV still says 'Không áp dụng': the next import that
 *     carries the Epic adds it again (a daily file only carries the Epics updated on Jira that day, so until the Epic
 *     changes again the removal holds);
 *   - when the CSV no longer says 'Không áp dụng', a row the IMPORT added is removed again (a MANUAL row never is).
 * Only the newest data layer decides — an older file imported later must not undo what a newer one set.
 */

/** Runs inside the import transaction, before the caches are refreshed. Returns what changed (empty when a newer layer exists). */
export async function syncImportBlackList(client: PoolClient, epics: readonly ImportedEpicTtmApplied[], batchId: number, aggregatedAt: Date): Promise<ImportBlackListPlan> {
  const none: ImportBlackListPlan = { add: [], remove: [] };
  if (epics.length === 0) return none;
  const newest = await client.query<{ newest: Date | null }>('SELECT MAX(aggregated_at) AS newest FROM issues WHERE source_import_batch_id <> $1;', [batchId]);
  const newestOther = newest.rows[0]?.newest;
  if (newestOther && newestOther.getTime() > aggregatedAt.getTime()) return none;

  const keys = [...new Set(epics.map((epic) => epic.epicKey.trim().toUpperCase()))];
  const rows = await client.query<{ epicKey: string; ttmBlackListed: boolean; source: 'MANUAL' | 'IMPORT' }>(
    'SELECT epic_key AS "epicKey", ttm_black_listed AS "ttmBlackListed", source FROM black_listed_epics WHERE epic_key = ANY($1::text[]);',
    [keys],
  );
  const existing = new Map(rows.rows.map((row) => [row.epicKey.toUpperCase(), { blackListed: row.ttmBlackListed, source: row.source }]));
  const plan = planImportBlackList(epics, existing);

  if (plan.remove.length) await client.query("DELETE FROM black_listed_epics WHERE epic_key = ANY($1::text[]) AND source = 'IMPORT';", [plan.remove]);
  if (plan.add.length) {
    await client.query(`
      INSERT INTO black_listed_epics (epic_key, project_key, ttm_black_listed, source)
      SELECT epic_key, project_key, TRUE, 'IMPORT' FROM unnest($1::text[], $2::text[]) AS t(epic_key, project_key)
      ON CONFLICT (epic_key) DO UPDATE SET ttm_black_listed = TRUE, source = 'IMPORT', project_key = EXCLUDED.project_key, updated_at = CURRENT_TIMESTAMP;
    `, [plan.add.map((entry) => entry.epicKey), plan.add.map((entry) => entry.projectKey)]);
  }
  return plan;
}
