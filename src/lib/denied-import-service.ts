import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import { deleteEpicData, type EpicDeletionResult } from '@/lib/epic-deletion-service';
import {
  admissionFactsOfRow,
  describeViolations,
  evaluateImportAdmission,
  type AdmissionListEntry,
  type AdmissionViolation,
  type DeniedEpicInFile,
  type ImportAdmissionSettings,
  MAX_EPIC_DELETIONS_PER_IMPORT,
  type ProvenExemptEpic,
} from '@/lib/import-admission-rules';

export { MAX_EPIC_DELETIONS_PER_IMPORT };
import { getIssueHierarchyLevel } from '@/lib/issue-hierarchy';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';

/**
 * "Từ chối import" (Quản trị nguồn dữ liệu) — the denied_import_epics list, the A/B parameters of the
 * automatic rules (import_admission_settings) and the scan of the Epics already in the database.
 * Every action that denies an Epic also runs the Epic deletion on it, in the same transaction; none
 * rebuilds the caches (the admin runs them by hand afterwards).
 */

type Queryable = Pick<PoolClient, 'query'>;

export type DeniedImportSource = 'AUTO_EXEMPT' | 'AUTO_RULE' | 'MANUAL' | 'SEED';

export interface DeniedImportEpic {
  addedBy: string | null;
  allowImport: boolean;
  createdAt: string;
  createdDate: string | null;
  dueDate: string | null;
  epicKey: string;
  /** The database still holds some data of this Epic (issues / snapshots). */
  hasData: boolean;
  ideaApprovedDate: string | null;
  lastDeletedAt: string | null;
  lastDeletedIssueCount: number | null;
  projectKey: string | null;
  r4gDate: string | null;
  reason: string | null;
  requestingUnit: string | null;
  source: DeniedImportSource;
  startDate: string | null;
  status: string | null;
  summary: string | null;
}

export interface AdmissionScanCandidate {
  epicKey: string;
  reason: string;
  status: string;
  summary: string;
}

export class DeniedImportError extends Error {}

interface EpicInfo {
  createdDate: string | null;
  dueDate: string | null;
  epicKey: string;
  ideaApprovedDate: string | null;
  issueType: string | null;
  r4gDate: string | null;
  requestingUnit: string | null;
  startDate: string | null;
  status: string | null;
  summary: string | null;
}

export async function getImportAdmissionSettings(db: Queryable = pool): Promise<ImportAdmissionSettings> {
  const result = await db.query<ImportAdmissionSettings>(`
    SELECT created_before::text AS "createdBefore", released_due_before::text AS "releasedDueBefore"
    FROM import_admission_settings WHERE id = 1;
  `);
  return result.rows[0] ?? { createdBefore: null, releasedDueBefore: null };
}

export async function saveImportAdmissionSettings(settings: ImportAdmissionSettings, userId: number): Promise<ImportAdmissionSettings> {
  await pool.query(`
    INSERT INTO import_admission_settings (id, created_before, released_due_before, updated_by_user_id, updated_at)
    VALUES (1, $1::date, $2::date, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET
      created_before = EXCLUDED.created_before,
      released_due_before = EXCLUDED.released_due_before,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW();
  `, [settings.createdBefore, settings.releasedDueBefore, userId]);
  return getImportAdmissionSettings();
}

/**
 * Epic key → last day (Vietnam) the database saw it in a status other than Released / MVP Done, in
 * the RAW or the snapshot layers — the proof RELEASED_BEFORE needs that an Epic got to Released
 * after B (import-admission-rules.ts). 'N/A' (status not exported) proves nothing.
 */
export async function loadLastUnreleasedSeen(db: Queryable, epicKeys: readonly string[]): Promise<Map<string, string>> {
  if (epicKeys.length === 0) return new Map();
  const result = await db.query<{ epicKey: string; lastDate: string }>(`
    SELECT issue_key AS "epicKey", MAX((aggregated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS "lastDate"
    FROM (
      SELECT issue_key, current_status, aggregated_at FROM issues WHERE issue_key = ANY($1::text[])
      UNION ALL
      SELECT issue_key, current_status, aggregated_at FROM issue_daily_snapshots WHERE issue_key = ANY($1::text[])
    ) history
    WHERE UPPER(TRIM(current_status)) NOT IN ('RELEASED', 'MVP DONE', 'MVPDONE', 'N/A', '')
    GROUP BY issue_key;
  `, [[...epicKeys]]);
  return new Map(result.rows.map((row) => [row.epicKey, row.lastDate]));
}

/** Listed Epic key → its "Cho phép import" flag, for the import adapter. */
export async function loadImportAdmissionList(db: Queryable = pool): Promise<Map<string, AdmissionListEntry>> {
  const result = await db.query<{ allowImport: boolean; epicKey: string; source: DeniedImportSource }>(
    'SELECT epic_key AS "epicKey", allow_import AS "allowImport", source FROM denied_import_epics;',
  );
  // The import's own AUTO_EXEMPT entry only stands in for the rule B proof (import-admission-rules.ts).
  return new Map(result.rows.map((row) => [row.epicKey, { allowImport: row.allowImport, exemptFrom: row.source === 'AUTO_EXEMPT' ? 'RELEASED_BEFORE' : 'ALL' }]));
}

export async function listDeniedImportEpics(): Promise<DeniedImportEpic[]> {
  const result = await pool.query<DeniedImportEpic>(`
    SELECT
      denied.epic_key AS "epicKey", denied.project_key AS "projectKey", denied.summary, denied.status,
      denied.requesting_unit AS "requestingUnit", denied.created_date::text AS "createdDate",
      denied.idea_approved_date::text AS "ideaApprovedDate", denied.start_date::text AS "startDate",
      denied.r4g_date::text AS "r4gDate", denied.due_date::text AS "dueDate",
      denied.allow_import AS "allowImport", denied.source, denied.reason,
      users.full_name AS "addedBy", denied.created_at AS "createdAt",
      denied.last_deleted_at AS "lastDeletedAt", denied.last_deleted_issue_count AS "lastDeletedIssueCount",
      (
        EXISTS (SELECT 1 FROM issues WHERE issues.issue_key = denied.epic_key)
        OR EXISTS (SELECT 1 FROM issue_daily_snapshots snap WHERE snap.issue_key = denied.epic_key)
        OR EXISTS (SELECT 1 FROM epic_ttm_snapshots ttm WHERE ttm.epic_key = denied.epic_key)
      ) AS "hasData"
    FROM denied_import_epics denied
    LEFT JOIN users ON users.id = denied.added_by_user_id
    ORDER BY denied.created_at DESC, denied.epic_key;
  `);
  return result.rows;
}

/** Newest known state of each Epic — RAW issues first, else the Epic TTM Snapshot (no created date there). */
async function loadEpicInfo(db: Queryable, epicKeys: readonly string[]): Promise<Map<string, EpicInfo>> {
  const result = await db.query<EpicInfo>(`
    WITH from_issues AS (
      SELECT DISTINCT ON (issue_key)
        issue_key AS "epicKey", issue_type AS "issueType", issue_name AS summary, current_status AS status,
        requesting_unit AS "requestingUnit", (jira_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS "createdDate",
        idea_approved_date::text AS "ideaApprovedDate", start_date::text AS "startDate",
        r4g_date::text AS "r4gDate", due_date::text AS "dueDate"
      FROM issues WHERE issue_key = ANY($1::text[])
      ORDER BY issue_key, aggregated_at DESC
    ),
    from_snapshots AS (
      SELECT DISTINCT ON (epic_key)
        epic_key AS "epicKey", 'EPIC'::text AS "issueType", epic_name AS summary, current_status AS status,
        requesting_unit AS "requestingUnit", NULL::text AS "createdDate",
        idea_approved_date::text AS "ideaApprovedDate", start_date::text AS "startDate",
        r4g_date::text AS "r4gDate", due_date::text AS "dueDate"
      FROM epic_ttm_snapshots
      WHERE epic_key = ANY($1::text[]) AND epic_key NOT IN (SELECT "epicKey" FROM from_issues)
      ORDER BY epic_key, aggregated_at DESC
    )
    SELECT * FROM from_issues UNION ALL SELECT * FROM from_snapshots;
  `, [[...epicKeys]]);
  return new Map(result.rows.map((row) => [row.epicKey, row]));
}

interface DeniedRowInput {
  info: Omit<EpicInfo, 'issueType'> | null;
  reason: string | null;
}

async function upsertDeniedRows(db: Queryable, rows: ReadonlyMap<string, DeniedRowInput>, source: DeniedImportSource, userId: number | null): Promise<void> {
  if (rows.size === 0) return;
  const entries = [...rows.entries()];
  const column = (name: keyof Omit<EpicInfo, 'issueType'>) => entries.map(([, row]) => row.info?.[name] ?? null);
  // Re-denying an Epic already listed only switches it back to "denied" and refreshes what is known
  // of it; its source and the time it was first listed stay — except an AUTO_EXEMPT entry ("Miễn rule
  // B"), which now names the source that denies it: the exemption no longer describes it.
  await db.query(`
    INSERT INTO denied_import_epics (
      epic_key, project_key, summary, status, requesting_unit, created_date, idea_approved_date,
      start_date, r4g_date, due_date, allow_import, source, reason, added_by_user_id
    )
    SELECT key, SPLIT_PART(key, '-', 1), summary, status, unit, created::date, idea::date, start::date,
      r4g::date, due::date, FALSE, $11, reason, $12::int
    FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
      AS input(key, summary, status, unit, created, idea, start, r4g, due, reason)
    ON CONFLICT (epic_key) DO UPDATE SET
      allow_import = FALSE,
      source = CASE WHEN denied_import_epics.source = 'AUTO_EXEMPT' THEN EXCLUDED.source ELSE denied_import_epics.source END,
      summary = COALESCE(EXCLUDED.summary, denied_import_epics.summary),
      status = COALESCE(EXCLUDED.status, denied_import_epics.status),
      requesting_unit = COALESCE(EXCLUDED.requesting_unit, denied_import_epics.requesting_unit),
      created_date = COALESCE(EXCLUDED.created_date, denied_import_epics.created_date),
      idea_approved_date = COALESCE(EXCLUDED.idea_approved_date, denied_import_epics.idea_approved_date),
      start_date = COALESCE(EXCLUDED.start_date, denied_import_epics.start_date),
      r4g_date = COALESCE(EXCLUDED.r4g_date, denied_import_epics.r4g_date),
      due_date = COALESCE(EXCLUDED.due_date, denied_import_epics.due_date),
      reason = COALESCE(EXCLUDED.reason, denied_import_epics.reason),
      updated_at = NOW();
  `, [
    entries.map(([key]) => key),
    column('summary'), column('status'), column('requestingUnit'), column('createdDate'),
    column('ideaApprovedDate'), column('startDate'), column('r4gDate'), column('dueDate'),
    entries.map(([, row]) => row.reason),
    source, userId,
  ]);
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Refuses keys whose newest state is a Story/Subtask — only an Epic can be denied. */
function assertEpics(info: ReadonlyMap<string, EpicInfo>): void {
  const notEpics = [...info.values()].filter((epic) => epic.issueType && getIssueHierarchyLevel(epic.issueType) !== 1);
  if (notEpics.length > 0) {
    throw new DeniedImportError(`Không phải Epic: ${notEpics.map((epic) => `${epic.epicKey} (${epic.issueType})`).join(', ')}.`);
  }
}

/** Lists the Epics as denied ("Thêm") and deletes their data. */
export async function addDeniedImportEpics(epicKeys: readonly string[], reason: string | null, userId: number): Promise<EpicDeletionResult> {
  return inTransaction(async (client) => {
    const info = await loadEpicInfo(client, epicKeys);
    assertEpics(info);
    await upsertDeniedRows(client, new Map(epicKeys.map((key) => [key, { info: info.get(key) ?? null, reason }])), 'MANUAL', userId);
    return deleteEpicData(client, epicKeys, userId);
  });
}

/**
 * Edits "Cho phép import". Turning it on only lets the Epic in again (its data comes back with the
 * next import that carries it); turning it off denies the Epic again and deletes its data.
 */
export async function setDeniedImportAllowance(epicKeys: readonly string[], allowImport: boolean, userId: number): Promise<EpicDeletionResult | null> {
  return inTransaction(async (client) => {
    const updated = await client.query(
      // Re-allowing an AUTO_EXEMPT entry an admin had switched off is now the admin's own decision —
      // a full "Cho phép import" (MANUAL), not just the rule B waiver.
      `UPDATE denied_import_epics SET allow_import = $2,
         source = CASE WHEN $2 AND NOT allow_import AND source = 'AUTO_EXEMPT' THEN 'MANUAL' ELSE source END,
         updated_at = NOW()
       WHERE epic_key = ANY($1::text[]);`,
      [[...epicKeys], allowImport],
    );
    if ((updated.rowCount ?? 0) === 0) throw new DeniedImportError('Không tìm thấy Epic nào trong danh sách Từ chối import.');
    return allowImport ? null : deleteEpicData(client, epicKeys, userId);
  });
}

/** Takes Epics off the list ("Xóa" / "Xóa theo lô") — no data comes back by itself. */
export async function removeDeniedImportEpics(epicKeys: readonly string[], userId: number): Promise<number> {
  // One audit line per Epic actually taken off the list, in the same transaction as the delete.
  return inTransaction(async (client) => {
    const removed = await client.query<{ epicKey: string }>(
      'DELETE FROM denied_import_epics WHERE epic_key = ANY($1::text[]) RETURNING epic_key AS "epicKey";',
      [[...epicKeys]],
    );
    if (removed.rows.length > 0) {
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
         SELECT $1::int, 'DENIED_IMPORT_REMOVE', 'EPIC', key FROM unnest($2::text[]) AS key;`,
        [userId, removed.rows.map((row) => row.epicKey)],
      );
    }
    return removed.rows.length;
  });
}

/** Deletes whatever the database still holds of denied Epics (e.g. the SEED list on a fresh database). */
export async function deleteRemainingDeniedData(epicKeys: readonly string[], userId: number): Promise<EpicDeletionResult> {
  return inTransaction(async (client) => {
    const denied = await client.query<{ epicKey: string }>(
      'SELECT epic_key AS "epicKey" FROM denied_import_epics WHERE epic_key = ANY($1::text[]) AND NOT allow_import;',
      [[...epicKeys]],
    );
    return deleteEpicData(client, denied.rows.map((row) => row.epicKey), userId);
  });
}

/** Epics of the database (newest state) that break a rule and are not listed — "Quét lại". */
async function findScanCandidates(db: Queryable, onlyKeys: readonly string[] | null): Promise<(AdmissionScanCandidate & { info: EpicInfo; violations: AdmissionViolation[] })[]> {
  const settings = await getImportAdmissionSettings(db);
  const result = await db.query<EpicInfo>(`
    SELECT DISTINCT ON (issue_key)
      issue_key AS "epicKey", issue_type AS "issueType", issue_name AS summary, current_status AS status,
      requesting_unit AS "requestingUnit", (jira_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS "createdDate",
      idea_approved_date::text AS "ideaApprovedDate", start_date::text AS "startDate",
      r4g_date::text AS "r4gDate", due_date::text AS "dueDate"
    FROM issues
    WHERE UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
      AND ($1::text[] IS NULL OR issue_key = ANY($1::text[]))
      AND issue_key NOT IN (SELECT epic_key FROM denied_import_epics)
    ORDER BY issue_key, aggregated_at DESC;
  `, [onlyKeys ? [...onlyKeys] : null]);
  const lastUnreleasedSeen = await loadLastUnreleasedSeen(db, result.rows.map((row) => row.epicKey));

  return result.rows.flatMap((info) => {
    const violations = evaluateImportAdmission({
      createdDate: info.createdDate,
      dueDate: info.dueDate,
      issueType: info.issueType ?? 'EPIC',
      lastUnreleasedSeenDate: lastUnreleasedSeen.get(info.epicKey) ?? null,
      r4gDate: info.r4gDate,
      status: info.status ?? '',
      statusChangedDate: null,
    }, settings);
    return violations.length === 0 ? [] : [{
      epicKey: info.epicKey,
      info,
      reason: describeViolations(violations),
      status: info.status ?? '',
      summary: info.summary ?? '',
      violations,
    }];
  });
}

export async function scanImportAdmissionCandidates(): Promise<AdmissionScanCandidate[]> {
  return (await findScanCandidates(pool, null)).map(({ epicKey, reason, status, summary }) => ({ epicKey, reason, status, summary }));
}

/** Denies the chosen scan candidates (re-checked against the rules now) and deletes their data. */
export async function denyScanCandidates(epicKeys: readonly string[], userId: number): Promise<EpicDeletionResult> {
  return inTransaction(async (client) => {
    const candidates = await findScanCandidates(client, epicKeys);
    await upsertDeniedRows(client, new Map(candidates.map((candidate) => [candidate.epicKey, { info: candidate.info, reason: candidate.reason }])), 'AUTO_RULE', userId);
    return deleteEpicData(client, candidates.map((candidate) => candidate.epicKey), userId);
  });
}

export interface DeniedImportDeletionOutcome {
  /** Denied Epics whose data this import deleted. */
  deletedEpicKeys: string[];
  /** Denied Epics that still have data in the database — left for "Xóa dữ liệu còn tồn tại". */
  keptDataEpicKeys: string[];
  /** Why their data was kept (null when nothing was kept). */
  keptReason: 'AUTO_IMPORT' | 'TOO_MANY' | null;
}

/**
 * Import side, inside the import transaction: lists the Epics an automatic rule denied (source
 * AUTO_RULE, described from their row of the file) and — when `allowDeletion` and at most
 * MAX_EPIC_DELETIONS_PER_IMPORT of them still have data — deletes what the database already holds
 * of every Epic denied in this file. The token-authenticated auto import never deletes (nobody
 * reviewed the list): its denied Epics keep their data until SUPERADMIN purges them.
 */
export async function recordDeniedEpicsOfImport(
  client: PoolClient,
  deniedEpics: readonly DeniedEpicInFile[],
  toIsoDate: (raw: string) => string | null,
  allowDeletion: boolean,
): Promise<DeniedImportDeletionOutcome> {
  const outcome: DeniedImportDeletionOutcome = { deletedEpicKeys: [], keptDataEpicKeys: [], keptReason: null };
  if (deniedEpics.length === 0) return outcome;
  const ruleRows = new Map<string, DeniedRowInput>();
  for (const epic of deniedEpics) {
    if (epic.origin !== 'RULE' || !epic.row) continue;
    // Only the descriptive dates are read here — the verdict (violations) came from the plan.
    const facts = admissionFactsOfRow(epic.row, toIsoDate);
    ruleRows.set(epic.epicKey, {
      info: {
        createdDate: facts.createdDate,
        dueDate: facts.dueDate,
        epicKey: epic.epicKey,
        ideaApprovedDate: toIsoDate(epic.row.ideaApprovedDate),
        r4gDate: facts.r4gDate,
        requestingUnit: epic.row.requestingUnit || null,
        startDate: toIsoDate(epic.row.startDate),
        status: epic.row.status || null,
        summary: epic.row.summary || null,
      },
      reason: describeViolations(epic.violations),
    });
  }
  await upsertDeniedRows(client, ruleRows, 'AUTO_RULE', null);

  // Only Epics the database still holds something of need a deletion — a listed Epic was deleted when
  // it was listed, so a routine import adds no audit line / deletion stamp for nothing.
  const withData = (await client.query<{ epicKey: string }>(`
    SELECT key AS "epicKey" FROM unnest($1::text[]) AS key
    WHERE EXISTS (SELECT 1 FROM issues WHERE issue_key = key OR epic_key = key)
       OR EXISTS (SELECT 1 FROM issue_daily_snapshots WHERE issue_key = key OR epic_key = key)
       OR EXISTS (SELECT 1 FROM epic_ttm_snapshots WHERE epic_key = key);
  `, [deniedEpics.map((epic) => epic.epicKey)])).rows.map((row) => row.epicKey);
  if (withData.length === 0) return outcome;
  if (!allowDeletion || withData.length > MAX_EPIC_DELETIONS_PER_IMPORT) {
    return { deletedEpicKeys: [], keptDataEpicKeys: withData, keptReason: allowDeletion ? 'TOO_MANY' : 'AUTO_IMPORT' };
  }
  await deleteEpicData(client, withData, null);
  return { deletedEpicKeys: withData, keptDataEpicKeys: [], keptReason: null };
}

/**
 * Import side: lists the Epics admitted only thanks to the rule B proof (planImportAdmission →
 * provenExemptEpics) as "Cho phép import" with source AUTO_EXEMPT, so they stay exempt once that
 * proof is purged with the RAW retention / "Xóa lớp dữ liệu". Never touches an Epic already listed —
 * an admin's own decision on it wins.
 */
export async function recordProvenExemptions(client: PoolClient, exempts: readonly ProvenExemptEpic[], toIsoDate: (raw: string) => string | null): Promise<string[]> {
  if (exempts.length === 0) return [];
  const facts = exempts.map((epic) => ({ epic, facts: admissionFactsOfRow(epic.row, toIsoDate) }));
  const inserted = await client.query<{ epicKey: string }>(`
    INSERT INTO denied_import_epics (
      epic_key, project_key, summary, status, requesting_unit, created_date, idea_approved_date,
      start_date, r4g_date, due_date, allow_import, source, reason
    )
    SELECT key, SPLIT_PART(key, '-', 1), summary, status, unit, created::date, idea::date, start::date,
      r4g::date, due::date, TRUE, 'AUTO_EXEMPT', reason
    FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
      AS input(key, summary, status, unit, created, idea, start, r4g, due, reason)
    ON CONFLICT (epic_key) DO NOTHING
    RETURNING epic_key AS "epicKey";
  `, [
    facts.map(({ epic }) => epic.epicKey),
    facts.map(({ epic }) => epic.row.summary || null),
    facts.map(({ epic }) => epic.row.status || null),
    facts.map(({ epic }) => epic.row.requestingUnit || null),
    facts.map(({ facts: f }) => f.createdDate),
    facts.map(({ epic }) => toIsoDate(epic.row.ideaApprovedDate)),
    facts.map(({ epic }) => toIsoDate(epic.row.startDate)),
    facts.map(({ facts: f }) => f.r4gDate),
    facts.map(({ facts: f }) => f.dueDate),
    facts.map(({ epic }) => epic.reason),
  ]);
  return inserted.rows.map((row) => row.epicKey);
}
