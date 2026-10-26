import type { PoolClient } from 'pg';
import pool, { getClient } from './db';
import { parseCSV, mapCSVToRawIssues } from './csv-parser';
import { validateAllJiraIssues, parseJiraDate, RowValidationResult } from './validator';
import { accumulateProjectComponents, splitComponents } from './project-component-service';
import { e2eGeometry } from './epic-row-geometry';
import { loadScoringContext } from './scoring-context-service';
import { BADGE_BY_ID } from './scoring/catalog';
import { toIsoDate } from './scoring/dates';
import { verdictBadges } from './scoring/projection';
import { scoreEpic } from './scoring/score-epic';
import type { EpicComplexity } from './scoring/types';
import { recordEpicAlertTimelineTransitions, type EpicAlertTimelineDetail, type EpicAlertTimelineStates } from './epic-alert-timeline-service';
import { EPIC_ISSUE_TYPES_SQL } from './issue-resolution-sql';
import { toDateKey } from './working-days';
import { getDenseZoneStart } from './data-layer-retention-service';
import { ADAPTER_TYPES, DEFAULT_ADAPTER, type AdapterType } from './adapters/index';
import { parsePyJiraApi } from './adapters/py-jira-api-adapter';
import { parsePureJiraExport } from './adapters/pure-jira-export-adapter';
import { refreshDerivedCaches } from './daily-cache-service';
import { getImportAdmissionSettings, loadImportAdmissionList, loadLastUnreleasedSeen, MAX_EPIC_DELETIONS_PER_IMPORT, recordDeniedEpicsOfImport, recordProvenExemptions, type DeniedImportDeletionOutcome } from './denied-import-service';
import { describeViolations, normalizeEpicKey, planImportAdmission, vietnamIsoDate } from './import-admission-rules';
import { isLevel1IssueType } from './issue-hierarchy';
import { syncImportBlackList } from './import-black-list';
import { normalizeTtmApplied, parseExceptPlanDate } from './scoring/ttm-applied';

// Epic complexity rule (company rule change, 2026-09) — 4-way classification from epic_request_type
// + epic_request_level:
//   CT: request type ∈ {Tính năng mới, Cải tiến} OR request type is missing/empty ("None")
//   SP: every other request type (anything not matched to CT above)
//   Lv12/Lv34: request level ∈ {1, 2} vs {3, 4}
// A level outside 1-4 (including missing data) defaults the whole Epic to CT-Lv12 — the agreed
// safe default.
const CT_REQUEST_TYPES = new Set(['cải tiến', 'tính năng mới']);
const LV12_LEVELS = new Set(['1', '2']);
const LV34_LEVELS = new Set(['3', '4']);

function normalizeComplexityField(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN');
}

function isBlankComplexityField(normalized: string): boolean {
  return normalized === '' || normalized === 'none';
}

/** 'Loại yêu cầu' (requestType, i.e. epic_request_type) and 'Requirement Level' (requirementLevel,
 * i.e. epic_request_level) — raw text straight from the import source, not yet normalised. See the
 * rule comment above for the exact mapping and its default. */
function computeEpicComplexity(requestType: string, requirementLevel: string): EpicComplexity {
  const type = normalizeComplexityField(requestType);
  const level = normalizeComplexityField(requirementLevel);
  const isCtType = CT_REQUEST_TYPES.has(type) || isBlankComplexityField(type);
  const isSpType = !isCtType;
  const isLv34 = LV34_LEVELS.has(level);
  if (isSpType && isLv34) return 'SP-Lv34';
  if (isSpType && LV12_LEVELS.has(level)) return 'SP-Lv12';
  if (isCtType && isLv34) return 'CT-Lv34';
  // CT + Lv12 lands here too, and so does every unmatched/missing level (the default).
  return 'CT-Lv12';
}

const VALID_COMPLEXITY = new Set<string>(['CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34']);

/**
 * Derives the alert timeline for one import batch from the canonical `issues` rows already stored
 * for it (Cảnh báo muộn/Fail TTM-CNTT/E2E, thiếu Start Date, dữ liệu bất thường, as of that batch's
 * aggregatedAtDate). Every Epic is judged by the Epic Scoring Service — the same verdicts every screen
 * shows — so the timeline can never disagree with what a screen shows for the same Epic. Every write is
 * idempotent (ON CONFLICT upsert / unique constraint), so this is safe to call again for a batch
 * whose raw `issues` rows are still present — it never re-reads or re-validates the original CSV.
 */
export async function aggregateBatchData(client: PoolClient, batchId: number, aggregatedAtDate: Date): Promise<void> {
  const ctx = await loadScoringContext(toDateKey(aggregatedAtDate));
  const epicRows = await client.query<{
    complexity: string | null; dueDate: string | null; epicKey: string; ideaApprovedDate: string | null;
    jiraCreatedAt: string | null; r4gDate: string | null; requestType: string | null;
    requirementLevel: string | null; startDate: string | null; status: string;
    ttmApplied: string | null; exceptTtmPlan: string | null;
  }>(`
    SELECT i.issue_key AS "epicKey", i.current_status AS status, i.epic_complexity_type AS complexity,
      i.idea_approved_date::text AS "ideaApprovedDate", i.start_date::text AS "startDate",
      i.r4g_date::text AS "r4gDate", i.due_date::text AS "dueDate", i.jira_created_at::text AS "jiraCreatedAt",
      i.requirement_level AS "requirementLevel",
      NULLIF(i.request_type, '') AS "requestType",
      i.ttm_applied AS "ttmApplied", i.except_ttm_plan AS "exceptTtmPlan"
    FROM issues i
    WHERE i.source_import_batch_id = $1 AND UPPER(i.issue_type) IN (${EPIC_ISSUE_TYPES_SQL});
  `, [batchId]);
  // epic_alert_timeline transitions (Fail TTM-CNTT/E2E, thiếu Start Date, dữ liệu bất thường) are
  // collected per-epic here and applied in ONE batched diff below (see
  // recordEpicAlertTimelineTransitions) instead of one write per epic — same connection-cap
  // reasoning as everything else recorded during import.
  const timelineStatesByEpic = new Map<string, EpicAlertTimelineStates>();
  for (const epic of epicRows.rows) {
    const card = scoreEpic({
      epicKey: epic.epicKey,
      status: epic.status,
      complexity: epic.complexity && VALID_COMPLEXITY.has(epic.complexity) ? (epic.complexity as EpicComplexity) : null,
      ideaApprovedDate: toIsoDate(epic.ideaApprovedDate),
      jiraCreatedAt: toIsoDate(epic.jiraCreatedAt),
      startDate: toIsoDate(epic.startDate),
      r4gDate: toIsoDate(epic.r4gDate),
      dueDate: toIsoDate(epic.dueDate),
      requestType: epic.requestType,
      requirementLevel: epic.requirementLevel,
      phaseCompletion: null,
      // TTM-applied (2026-10-26): 'Không áp dụng' Epics are black listed by this import, so the timeline leaves them out too.
      ttmApplied: normalizeTtmApplied(epic.ttmApplied),
      ttmExclusion: normalizeTtmApplied(epic.ttmApplied) === 'NOT_APPLICABLE' ? 'BLACK_LISTED' : null,
      exceptPlanRaw: epic.exceptTtmPlan,
      exceptPlanDate: parseExceptPlanDate(epic.exceptTtmPlan),
    }, ctx);
    // The TTM verdicts ignore the "Phạm vi" gate (a run is recorded even for an Epic the screens show as
    // "Ngoài phạm vi"), data-quality findings are the ones still active.
    const verdicts = verdictBadges(card.findings);
    const anomalies = card.findings.filter((item) => !item.suppressedBy && BADGE_BY_ID.get(item.badge)?.axis === 'DATA_QUALITY' && BADGE_BY_ID.get(item.badge)?.group === 'ALERT');
    const missingStartDate = anomalies.some((item) => item.badge === 'ANOMALY_R1_MISSING_START_DATE');
    const otherAnomalies = anomalies.filter((item) => item.badge !== 'ANOMALY_R1_MISSING_START_DATE');

    // Key order matters: the diff in recordEpicAlertTimelineTransitions compares JSON.stringify of the
    // stored jsonb (keys come back shortest-first), so keep 'status' (the Epic's Jira status, shown in
    // "Epic History") ahead of fromDate/targetDate or every open run would be rewritten on every import.
    const cnttDetail: EpicAlertTimelineDetail = { status: epic.status, fromDate: card.derived.cnttFromDate, targetDate: card.derived.cnttTargetDate };
    const failCnttDetail: EpicAlertTimelineDetail | null = verdicts.has('CNTT_FAIL') ? cnttDetail : null;
    const lateCnttDetail: EpicAlertTimelineDetail | null = verdicts.has('CNTT_LATE') ? cnttDetail : null;
    const failE2eDetail: EpicAlertTimelineDetail | null = card.findings.some((item) => !item.suppressedBy && item.badge === 'E2E_FAIL')
      ? (() => { const e2e = e2eGeometry(card.derived, ctx); return { baselineDate: e2e.baselineDate, actualToDate: e2e.actualToDate }; })()
      : null;

    timelineStatesByEpic.set(epic.epicKey, {
      FAIL_TTM_CNTT: { active: failCnttDetail !== null, detail: failCnttDetail },
      LATE_TTM_CNTT: { active: lateCnttDetail !== null, detail: lateCnttDetail },
      FAIL_TTM_E2E: { active: failE2eDetail !== null, detail: failE2eDetail },
      MISSING_START_DATE: { active: missingStartDate, detail: null },
      DATA_ANOMALY: {
        active: otherAnomalies.length > 0,
        detail: otherAnomalies.length > 0 ? { rules: otherAnomalies.map((item) => item.message).join('; ') } : null,
      },
    });
  }
  await recordEpicAlertTimelineTransitions(client, aggregatedAtDate, timelineStatesByEpic, batchId);
  // Phase completion (design / dev / test / R4GOLIVE done) is not recorded: it is evaluated live from the
  // current Story/Subtask statuses on every request (epic-phase-completion-service.ts).
}

export interface ImportBatch {
  id: number;
  fileName: string;
  importType: string;
  importedBy: string;
  importedAt: Date;
  aggregatedAt: Date;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  /** Reporting label only — 'FAILED' (errorRows > 0) no longer means nothing was saved: rows that
   * failed validation are skipped individually (see `validIssues` in processImport), every other
   * row in the batch is still ingested and aggregated normally. */
  status: 'SUCCESS' | 'FAILED' | 'COMPLETED_WITH_WARNINGS';
  /** Rows dropped by "Từ chối import" (from metadata_json; 0 for batches imported before it). */
  deniedRows: number;
  /** The batch's issue rows are all still stored — it is one of the 30 newest import days (data-layer-retention.ts). Older batches keep only the versions in force at the weekly snapshot dates. */
  hasFullData: boolean;
}

export interface ImportResult {
  batchId: number;
  fileName: string;
  aggregatedAt: string;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  status: 'SUCCESS' | 'FAILED' | 'COMPLETED_WITH_WARNINGS';
  validationReport: RowValidationResult[];
  /** Rows dropped by "Từ chối import" — not counted in totalRows. */
  deniedRows: number;
  deniedEpics: ImportDeniedEpic[];
  /** What happened to the data the database already held of the denied Epics (null for validateOnly). */
  deniedDataOutcome: (DeniedImportDeletionOutcome & { maxDeletions: number }) | null;
  /** Epics admitted thanks to the rule B proof and newly listed as "Cho phép import" (AUTO_EXEMPT). */
  provenExemptEpicKeys: string[];
}

export interface ImportDeniedEpic {
  epicKey: string;
  /** LIST: listed in Từ chối import; RULE: denied now by an automatic rule (and listed as AUTO_RULE). */
  origin: 'LIST' | 'RULE';
  reason: string;
}

/** Calendar day (Vietnam) of a raw date of the import file, for the "Từ chối import" rules. */
function admissionIsoDate(raw: string): string | null {
  return vietnamIsoDate(parseJiraDate(raw));
}

/** importType/importedBy just label the import_batches row for the history screen — default
 * ('MANUAL'/'System') matches the UI upload path; the token-authenticated auto-import route
 * (src/app/api/data-source/import/auto/route.ts) passes 'AUTO'/'Python Script (Auto Import)' so
 * the two entry points stay distinguishable in "Nhật ký lịch sử import". */
export async function processImport(
  fileName: string,
  csvText: string,
  aggregatedAtDate: Date,
  validateOnly: boolean = false,
  adapterType: AdapterType = DEFAULT_ADAPTER,
  importType: string = 'MANUAL',
  importedBy: string = 'System',
): Promise<ImportResult> {
  // 1. Parse CSV — dispatch to the correct adapter
  let parsedIssues;
  if (adapterType === ADAPTER_TYPES.PY_JIRA_API) {
    ({ issues: parsedIssues } = parsePyJiraApi(csvText));
  } else {
    // PURE_JIRA_EXPORT (original / legacy path)
    const parsedRows = parseCSV(csvText);
    ({ issues: parsedIssues } = mapCSVToRawIssues(parsedRows));
    // parsePureJiraExport is a thin wrapper — call it for symmetry in future
    void parsePureJiraExport; // explicit reference so tree-shaking keeps the module
  }

  // 1b. "Từ chối import" — drop every row of a denied Epic (listed in denied_import_epics, or breaking
  // an automatic rule) before anything is validated or stored: the rest of the pipeline never sees
  // them. See import-admission-rules.ts.
  const [admissionList, admissionSettings, lastUnreleasedSeen] = await Promise.all([
    loadImportAdmissionList(),
    getImportAdmissionSettings(),
    loadLastUnreleasedSeen(pool, parsedIssues.filter((issue) => isLevel1IssueType(issue.issueType)).map((issue) => normalizeEpicKey(issue.issueKey))),
  ]);
  const admission = planImportAdmission(parsedIssues, admissionList, admissionSettings, admissionIsoDate, lastUnreleasedSeen);
  const rawIssues = admission.admitted;
  const deniedEpics = admission.deniedEpics.map((epic) => ({
    epicKey: epic.epicKey,
    origin: epic.origin,
    reason: epic.origin === 'RULE' ? describeViolations(epic.violations) : 'Có trong danh sách Từ chối import',
  }));
  const totalRows = rawIssues.length;

  // 2. Validate issues
  const validationReport = validateAllJiraIssues(rawIssues);
  
  let successRows = 0;
  let warningRows = 0;
  let errorRows = 0;

  for (const report of validationReport) {
    if (report.status === 'INVALID') {
      errorRows++;
    } else if (report.status === 'WARNING') {
      warningRows++;
    } else {
      successRows++;
    }
  }

  const batchStatus = errorRows > 0 
    ? 'FAILED' 
    : (warningRows > 0 ? 'COMPLETED_WITH_WARNINGS' : 'SUCCESS');

  // Return validation results early without saving to DB if validateOnly is true
  if (validateOnly) {
    return {
      batchId: 0,
      fileName,
      aggregatedAt: aggregatedAtDate.toISOString(),
      totalRows,
      successRows,
      warningRows,
      errorRows,
      status: batchStatus,
      validationReport,
      deniedRows: admission.deniedRowCount,
      deniedEpics,
      deniedDataOutcome: null,
      provenExemptEpicKeys: admission.provenExemptEpics.map((epic) => epic.epicKey),
    };
  }

  // Connect to DB client
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // 3. Create Import Batch record
    const insertBatchQuery = `
      INSERT INTO import_batches (
        source_type, file_name, import_type, imported_by, aggregated_at, 
        total_rows, success_rows, warning_rows, error_rows, status, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id;
    `;
    const batchValues = [
      'CSV',
      fileName,
      importType,
      importedBy,
      aggregatedAtDate,
      totalRows,
      successRows,
      warningRows,
      errorRows,
      batchStatus,
      JSON.stringify({ validateOnly, adapterType, deniedRows: admission.deniedRowCount, deniedEpics })
    ];

    const batchRes = await client.query(insertBatchQuery, batchValues);
    const batchId = batchRes.rows[0].id;

    // List the Epics an automatic rule just denied and remove what the database already held of every
    // Epic denied in this file (no-op when none was) — before this batch's own rows go in. Only an
    // upload someone confirmed on screen may delete, and at most MAX_EPIC_DELETIONS_PER_IMPORT Epics;
    // otherwise the data stays for "Xóa dữ liệu còn tồn tại" (2026-10-19).
    const deniedDataOutcome = await recordDeniedEpicsOfImport(client, admission.deniedEpics, admissionIsoDate, importType !== 'AUTO');
    // Keep the rule B proof: Epics admitted only because the database saw them unreleased on/after B.
    const provenExemptEpicKeys = await recordProvenExemptions(client, admission.provenExemptEpics, admissionIsoDate);
    if (deniedDataOutcome.keptDataEpicKeys.length > 0 || provenExemptEpicKeys.length > 0) {
      await client.query('UPDATE import_batches SET metadata_json = $2 WHERE id = $1;', [
        batchId,
        JSON.stringify({ validateOnly, adapterType, deniedRows: admission.deniedRowCount, deniedEpics, deniedDataOutcome, provenExemptEpicKeys }),
      ]);
    }

    // 4. Ingest into canonical issues table if NOT validateOnly. Rows that failed validation
    // (status INVALID) are excluded from this insert loop (the upload response lists them, nothing is
    // stored for them) — only issues that passed validation are safe to write into the
    // canonical table and downstream aggregation (epic_alert_timeline).
    // This means one bad row no longer takes the whole batch down with it:
    // every other issue (including other Epics untouched by any error) still gets ingested and
    // aggregated normally. batchStatus stays 'FAILED' whenever errorRows > 0 purely as a reporting
    // label on the batch history screen — it no longer implies "nothing was saved".
    const validIssuesRaw = rawIssues.filter((_issue, index) => validationReport[index].status !== 'INVALID');

    // The Py Jira API export is denormalized (one row per issue, but the crawler has been seen to
    // re-emit the same issue — same issue_key — on more than one row within a single file, e.g.
    // when a multi-valued field is flattened without aggregation). `issues` is upserted with
    // ON CONFLICT (issue_key, source_import_batch_id) DO UPDATE, and Postgres cannot affect the
    // same conflict-target row twice within one statement, so two rows sharing an issue_key inside
    // the same insert/chunk fail the whole import with "ON CONFLICT DO UPDATE command cannot affect
    // row a second time". Collapse to one row per issue_key here — last occurrence in the file wins,
    // the same outcome sequential single-row upserts would have produced — before any DB write reads
    // or inserts from this set (the `issues` insert below, and aggregateBatchData's per-issue reads).
    const dedupedByIssueKey = new Map<string, typeof validIssuesRaw[number]>();
    for (const issue of validIssuesRaw) {
      dedupedByIssueKey.set(issue.issueKey, issue);
    }
    if (dedupedByIssueKey.size < validIssuesRaw.length) {
      console.warn(
        `processImport: collapsed ${validIssuesRaw.length - dedupedByIssueKey.size} duplicate-issue_key row(s) ` +
        `out of ${validIssuesRaw.length} valid row(s) in "${fileName}" (keeping the last occurrence of each issue_key).`,
      );
    }
    const validIssues = [...dedupedByIssueKey.values()];
    if (!validateOnly && validIssues.length > 0) {
      await accumulateProjectComponents(client, validIssues);

      // One INSERT per row would be one DB round trip per row (a real export is tens of thousands of
      // rows), but issues has 3 array
      // columns (epic_stories/story_subtasks/components) — unnest() can't cleanly expand "one
      // array value per row" alongside scalar columns (it flattens every level together), so this
      // stays a multi-row VALUES (...), (...), ... insert instead, chunked to stay well under
      // Postgres's 65535-bound-parameter limit (23 columns × 500 rows = 11,500 params/statement).
      // Still turns tens of thousands of round trips into a handful.
      const ISSUE_INSERT_CHUNK_SIZE = 500;
      const insertIssueColumns = [
        'source_system', 'jira_id', 'issue_key', 'issue_name', 'issue_type', 'current_status',
        'standard_status', 'assignee_name', 'epic_key', 'parent_key',
        'idea_approved_date', 'start_date', 'r4g_date', 'due_date',
        'epic_complexity_type', 'requirement_level', 'requesting_unit', 'source_import_batch_id', 'aggregated_at',
        'jira_created_at', 'jira_updated_at', 'epic_stories', 'story_subtasks', 'components',
        'previous_status', 'khau_ba', 'khau_co', 'khau_dev', 'khau_pm_sm', 'khau_po', 'khau_pentest', 'khau_sa', 'khau_sit_uat', 'note_ly_do_khac', 'main_fail_dept', 'ttm_applied', 'except_ttm_plan',
        'project_key', 'request_type',
      ];
      const insertIssueUpdateClause = `
        ON CONFLICT (issue_key, source_import_batch_id) DO UPDATE SET
          jira_id = EXCLUDED.jira_id,
          issue_name = EXCLUDED.issue_name,
          current_status = EXCLUDED.current_status,
          assignee_name = EXCLUDED.assignee_name,
          epic_key = EXCLUDED.epic_key,
          parent_key = EXCLUDED.parent_key,
          idea_approved_date = EXCLUDED.idea_approved_date,
          start_date = EXCLUDED.start_date,
          r4g_date = EXCLUDED.r4g_date,
          due_date = EXCLUDED.due_date,
          epic_complexity_type = EXCLUDED.epic_complexity_type,
          requirement_level = EXCLUDED.requirement_level,
          requesting_unit = EXCLUDED.requesting_unit,
          jira_created_at = EXCLUDED.jira_created_at,
          jira_updated_at = EXCLUDED.jira_updated_at,
          aggregated_at = EXCLUDED.aggregated_at,
          epic_stories = EXCLUDED.epic_stories,
          story_subtasks = EXCLUDED.story_subtasks,
          components = EXCLUDED.components,
          previous_status = EXCLUDED.previous_status,
          khau_ba = EXCLUDED.khau_ba,
          khau_co = EXCLUDED.khau_co,
          khau_dev = EXCLUDED.khau_dev,
          khau_pm_sm = EXCLUDED.khau_pm_sm,
          khau_po = EXCLUDED.khau_po,
          khau_pentest = EXCLUDED.khau_pentest,
          khau_sa = EXCLUDED.khau_sa,
          khau_sit_uat = EXCLUDED.khau_sit_uat,
          note_ly_do_khac = EXCLUDED.note_ly_do_khac,
          main_fail_dept = EXCLUDED.main_fail_dept,
          ttm_applied = EXCLUDED.ttm_applied,
          except_ttm_plan = EXCLUDED.except_ttm_plan,
          project_key = EXCLUDED.project_key,
          request_type = EXCLUDED.request_type,
          updated_at = NOW();
      `;

      const issueRows = validIssues.map((issue) => {
        // issue.epicType carries the raw 'Loại yêu cầu' (request type) text unchanged from both
        // adapters — see computeEpicComplexity for the actual SIMPLE/COMPLEX rule.
        const complexity = computeEpicComplexity(issue.epicType, issue.requirementLevel);
        const jiraId = parseInt(issue.issueId) || 0;
        const components = splitComponents(issue.components);
        // Parse Jira source timestamps — only provided by Py Jira API adapter for epics
        const jiraCreatedAt = issue.jiraCreatedAt ? parseJiraDate(issue.jiraCreatedAt) : null;
        const jiraUpdatedAt = issue.jiraUpdatedAt ? parseJiraDate(issue.jiraUpdatedAt) : null;

        return [
          'JIRA',
          jiraId,
          issue.issueKey,
          issue.summary,
          issue.issueType.toUpperCase(),
          issue.status,
          issue.status, // standard_status (mock mapping for now, to be detailed later)
          issue.assignee || null,
          issue.epicLink || null,
          issue.parentId || null,
          parseJiraDate(issue.ideaApprovedDate),
          parseJiraDate(issue.startDate),
          parseJiraDate(issue.r4gDate),
          parseJiraDate(issue.dueDate),
          complexity,
          issue.requirementLevel || null,
          issue.requestingUnit || null,
          batchId,
          aggregatedAtDate,
          jiraCreatedAt,
          jiraUpdatedAt,
          issue.epicStories?.length ? issue.epicStories : null,
          issue.storySubtasks?.length ? issue.storySubtasks : null,
          components.length ? components : null,
          issue.previousStatus || null,
          issue.khauBa || null,
          issue.khauCo || null,
          issue.khauDev || null,
          issue.khauPmSm || null,
          issue.khauPo || null,
          issue.khauPentest || null,
          issue.khauSa || null,
          issue.khauSitUat || null,
          issue.noteLyDoKhac || null,
          issue.mainFailDept || null,
          issue.ttmApplied || null,
          issue.exceptTtmPlan || null,
          // The file's own project key, else the issue-key prefix — what every reader used to derive from import_rows.
          issue.projectKey?.trim() || issue.issueKey.split('-')[0] || null,
          // The original "Loại yêu cầu" text (issue.epicType); complexity above is only its CT/SP classification.
          issue.epicType?.trim() || null,
        ];
      });

      for (let chunkStart = 0; chunkStart < issueRows.length; chunkStart += ISSUE_INSERT_CHUNK_SIZE) {
        const chunk = issueRows.slice(chunkStart, chunkStart + ISSUE_INSERT_CHUNK_SIZE);
        const values: unknown[] = [];
        const placeholders = chunk.map((row) => {
          const rowPlaceholders = row.map((_value, columnIndex) => `$${values.length + columnIndex + 1}`).join(', ');
          values.push(...row);
          return `(${rowPlaceholders})`;
        }).join(', ');
        await client.query(
          `INSERT INTO issues (${insertIssueColumns.join(', ')}) VALUES ${placeholders} ${insertIssueUpdateClause}`,
          values,
        );
      }

      // 4b. "TTM-applied" = 'Không áp dụng' → black list (inside this transaction, so the caches refreshed after COMMIT see it).
      await syncImportBlackList(
        client,
        validIssues
          .filter((issue) => isLevel1IssueType(issue.issueType))
          .map((issue) => ({ epicKey: issue.issueKey, projectKey: issue.projectKey?.trim() || issue.issueKey.split('-')[0] || '', ttmApplied: normalizeTtmApplied(issue.ttmApplied) })),
        batchId,
        aggregatedAtDate,
      );

      // 5. Link relationships within the batch.
      //
      // Every one of these is a self-join of `issues` filtered to just this batch — but within
      // this same transaction that filter's true selectivity (tens of thousands of rows for a
      // real import) is invisible to the query planner: pg_statistic is only ever refreshed by
      // ANALYZE/autovacuum, never by the INSERTs this transaction just did, so the planner
      // estimates ~1 row for a `source_import_batch_id = $1` literal it has no stats for — and
      // reasonably (from its point of view) concludes a nested-loop join must be cheap, when the
      // real row counts make that a near-quadratic scan. Confirmed directly by EXPLAIN ANALYZE at
      // real import scale (~40,500 rows): 291s and 850 MILLION row comparisons on the worst of
      // these four queries with a misestimate, vs 1.6s with an accurate one. A plain ANALYZE right
      // after the bulk insert above is enough to fix every one of them — it's the actual cause
      // (bad stats), not a per-query workaround, and it costs under a second here.
      await client.query('ANALYZE issues;');

      // Link parents (Subtasks -> Stories). Split into two single-equality UPDATEs instead of one
      // `child.parent_key = CAST(parent.jira_id AS VARCHAR) OR child.parent_key = parent.issue_key`
      // join — an OR across two different comparisons isn't sargable for a hash/merge join either,
      // regardless of how good the statistics are (same anti-pattern already identified and fixed
      // once in this codebase — see RESOLVED_EPIC_KEY_JOIN's doc comment in issue-resolution-sql.ts).
      await client.query(`
        UPDATE issues child
        SET parent_id = parent.id
        FROM issues parent
        WHERE child.source_import_batch_id = $1
          AND parent.source_import_batch_id = $1
          AND child.parent_key = parent.issue_key
          AND child.parent_key IS NOT NULL;
      `, [batchId]);
      await client.query(`
        UPDATE issues child
        SET parent_id = parent.id
        FROM issues parent
        WHERE child.source_import_batch_id = $1
          AND parent.source_import_batch_id = $1
          AND child.parent_id IS NULL
          AND child.parent_key = CAST(parent.jira_id AS VARCHAR)
          AND child.parent_key IS NOT NULL;
      `, [batchId]);

      // Link epics (Stories/Tasks/Bugs -> Epics)
      await client.query(`
        UPDATE issues story
        SET epic_id = epic.id
        FROM issues epic
        WHERE story.source_import_batch_id = $1
          AND epic.source_import_batch_id = $1
          AND story.epic_key = epic.issue_key
          AND story.epic_key IS NOT NULL;
      `, [batchId]);

      // Link subtask directly to epic via parent's epic Link
      await client.query(`
        UPDATE issues child
        SET epic_id = parent.epic_id
        FROM issues parent
        WHERE child.source_import_batch_id = $1
          AND parent.source_import_batch_id = $1
          AND child.parent_id = parent.id
          AND parent.epic_id IS NOT NULL;
      `, [batchId]);

      // 6. Derive the alert timeline (epic_alert_timeline) for this batch.
      await aggregateBatchData(client, batchId, aggregatedAtDate);
    }

    await client.query('COMMIT');

    // Refresh the derived caches (company-wide TTM-Index/QA-Index + "Quản trị Epic" rows + the
    // Scoring Service's shadow scorecards) now that the new data is committed and visible — must run
    // via the shared pool, after COMMIT, since `client`'s transaction is the only connection that
    // could see this batch's rows before commit. One unscoped recompute feeds every cache (see
    // refreshDerivedCaches). Never lets a cache-refresh failure fail an otherwise-successful import.
    try {
      await refreshDerivedCaches(batchId, 'import');
    } catch (cacheError) {
      console.error('Failed to refresh derived caches after import:', cacheError);
    }

    return {
      batchId,
      fileName,
      aggregatedAt: aggregatedAtDate.toISOString(),
      totalRows,
      successRows,
      warningRows,
      errorRows,
      status: batchStatus,
      validationReport,
      deniedRows: admission.deniedRowCount,
      deniedEpics,
      deniedDataOutcome: { ...deniedDataOutcome, maxDeletions: MAX_EPIC_DELETIONS_PER_IMPORT },
      provenExemptEpicKeys,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import processing failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteImportBatch(batchId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // cascade delete handles related rows and issues automatically
    await client.query('DELETE FROM import_batches WHERE id = $1', [batchId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete import batch:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getImportHistory(): Promise<ImportBatch[]> {
  const denseStart = await getDenseZoneStart(pool);
  const res = await pool.query(`
    SELECT id, file_name as "fileName", import_type as "importType", 
           imported_by as "importedBy", imported_at as "importedAt", 
           aggregated_at as "aggregatedAt", total_rows as "totalRows", 
           success_rows as "successRows", warning_rows as "warningRows", 
           error_rows as "errorRows", status, metadata_json as "metadataJson",
           ($1::date IS NULL OR aggregated_at::date >= $1::date) AS "hasFullData"
    FROM import_batches
    ORDER BY imported_at DESC;
  `, [denseStart]);
  return res.rows.map(({ metadataJson, ...batch }) => ({ ...batch, deniedRows: deniedRowsOf(metadataJson) }));
}

function deniedRowsOf(metadataJson: string | null): number {
  if (!metadataJson) return 0;
  try {
    const value = (JSON.parse(metadataJson) as { deniedRows?: unknown }).deniedRows;
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

