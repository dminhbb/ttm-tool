import 'server-only';
import pool from '@/lib/db';
import { loadTtmExclusionSources, resolveTtmExclusion } from '@/lib/black-listed-epic-service';
import { computeEpicPhaseCompletionByEpicKey } from '@/lib/epic-phase-completion-service';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import { toIsoDate } from '@/lib/scoring/dates';
import type { EpicComplexity, EpicFacts } from '@/lib/scoring/types';

const VALID_COMPLEXITY = new Set(['CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34']);

interface EpicFactRow {
  epicKey: string;
  status: string;
  complexity: string | null;
  ideaApprovedDate: string | null;
  jiraCreatedAt: string | null;
  startDate: string | null;
  r4gDate: string | null;
  dueDate: string | null;
  requestType: string;
  requirementLevel: string | null;
  projectKey: string;
}

/**
 * Every Epic's facts as known at `asOf`: its newest `issues` row whose data layer is on/before that
 * date (same "latest known row per Epic" rule as fetchEpicAlertContext, bounded by asOf), plus the
 * story/subtask-derived phase completion read at that same date (decision D3). Permission-unscoped —
 * callers filter by access scope when reading. `ttmExclusion` (Epic ngoại lệ / project Time to
 * Market = N) is today's configuration, not a per-layer fact.
 *
 * `layerDates` — the "Chọn lớp dữ liệu" window: when given, only those exact data layers are read
 * (same predicate as fetchEpicAlertContext) instead of every layer up to asOf.
 */
export async function loadEpicFacts(asOf: string, options: { epicKeys?: string[]; layerDates?: string[] | null } = {}): Promise<EpicFacts[]> {
  const layerDates = options.layerDates?.length ? options.layerDates : null;
  const epicKeys = options.epicKeys?.length ? options.epicKeys : null;
  const [rows, completionByEpicKey, exclusionSources] = await Promise.all([
    pool.query<EpicFactRow>(`
      SELECT DISTINCT ON (issues.issue_key)
        issues.issue_key AS "epicKey",
        issues.current_status AS status,
        issues.epic_complexity_type AS complexity,
        issues.idea_approved_date::text AS "ideaApprovedDate",
        issues.jira_created_at::text AS "jiraCreatedAt",
        issues.start_date::text AS "startDate",
        issues.r4g_date::text AS "r4gDate",
        issues.due_date::text AS "dueDate",
        COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'epicType', ''), '') AS "requestType",
        issues.requirement_level AS "requirementLevel",
        COALESCE(
          NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
          NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
          ''
        ) AS "projectKey"
      FROM issues
      LEFT JOIN import_rows
        ON import_rows.import_batch_id = issues.source_import_batch_id
        AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
      WHERE UPPER(issues.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
        AND issues.aggregated_at::date <= $1::date
        AND ($2::date[] IS NULL OR issues.aggregated_at::date = ANY($2::date[]))
        AND ($3::text[] IS NULL OR issues.issue_key = ANY($3::text[]))
      ORDER BY issues.issue_key ASC, issues.aggregated_at DESC
    `, [asOf, layerDates, epicKeys]),
    computeEpicPhaseCompletionByEpicKey(asOf),
    loadTtmExclusionSources(),
  ]);

  return rows.rows.map((row) => {
    const completion = completionByEpicKey.get(row.epicKey);
    return {
      epicKey: row.epicKey,
      status: row.status ?? '',
      complexity: row.complexity && VALID_COMPLEXITY.has(row.complexity) ? (row.complexity as EpicComplexity) : null,
      ideaApprovedDate: toIsoDate(row.ideaApprovedDate),
      jiraCreatedAt: toIsoDate(row.jiraCreatedAt),
      startDate: toIsoDate(row.startDate),
      r4gDate: toIsoDate(row.r4gDate),
      dueDate: toIsoDate(row.dueDate),
      requestType: row.requestType,
      requirementLevel: row.requirementLevel,
      phaseCompletion: completion
        ? { designDone: completion.designDone, devDone: completion.devDone, testDone: completion.testDone, r4goliveDone: completion.r4goliveDone }
        : null,
      ttmExclusion: resolveTtmExclusion(exclusionSources, row.epicKey, row.projectKey),
    };
  });
}
