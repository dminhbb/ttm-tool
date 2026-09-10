import type { PoolClient } from 'pg';
import pool, { getClient } from './db';
import { parseCSV, mapCSVToRawIssues } from './csv-parser';
import { validateAllJiraIssues, parseJiraDate, RowValidationResult, ValidationError } from './validator';
import { accumulateProjectComponents, splitComponents } from './project-component-service';
import { DEFAULT_RAW_IMPORT_RETENTION_DAYS } from './data-retention-service';
import { evaluateIssueCompliance } from './epic-compliance-engine';
import { recordEpicAlertHistory } from './epic-alert-history-service';
import { resolveTtmE2eRelease } from './epic-alert-service';
import { evaluateEpicDataAnomaly } from './epic-data-anomaly';
import type { EpicComplexity } from './ttm-rules';
import { recordEpicAlertTimelineTransitions, type EpicAlertTimelineDetail, type EpicAlertTimelineStates } from './epic-alert-timeline-service';
import { computeMilestoneCandidates, recordEpicMilestone } from './epic-milestone-history-service';
import { EPIC_ISSUE_TYPES_SQL } from './issue-resolution-sql';
import { getActiveHolidaySet } from './master-data-service';
import { listActiveStatusAlertRules } from './status-alert-rule-service';
import { listTtmPolicies } from './ttm-policy-service';
import { ADAPTER_TYPES, DEFAULT_ADAPTER, type AdapterType } from './adapters/index';
import { parsePyJiraApi } from './adapters/py-jira-api-adapter';
import { parsePureJiraExport } from './adapters/pure-jira-export-adapter';

// See the write-loop this guards, near the bottom of aggregateBatchData.
const MILESTONE_RECORDING_ENABLED = false;

// Epic complexity rule (company rule change, 2026-09) — 4-way classification from epic_request_type
// + epic_request_level:
//   CT-Lv12: request type ∈ {Tính năng mới, Cải tiến} AND level ∈ {1, 2}
//   CT-Lv34: request type ∈ {Tính năng mới, Cải tiến} AND level ∈ {3, 4}
//   SP-Lv12: request type ∈ {Sản phẩm/dịch vụ/quy trình mới, Sản phẩm} AND level ∈ {1, 2}
//   SP-Lv34: request type ∈ {Sản phẩm/dịch vụ/quy trình mới, Sản phẩm} AND level ∈ {3, 4}
// Any combination that doesn't match one of these 4 (missing data, an unrecognized request type, a
// level outside 1-4) defaults to CT-Lv12 — the agreed safe default.
const CT_REQUEST_TYPES = new Set(['cải tiến', 'tính năng mới']);
const SP_REQUEST_TYPES = new Set(['sản phẩm/dịch vụ/quy trình mới', 'sản phẩm']);
const LV12_LEVELS = new Set(['1', '2']);
const LV34_LEVELS = new Set(['3', '4']);

function normalizeComplexityField(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN');
}

/** 'Loại yêu cầu' (requestType, i.e. epic_request_type) and 'Requirement Level' (requirementLevel,
 * i.e. epic_request_level) — raw text straight from the import source, not yet normalised. See the
 * rule comment above for the exact 4-way mapping and its default. */
function computeEpicComplexity(requestType: string, requirementLevel: string): EpicComplexity {
  const type = normalizeComplexityField(requestType);
  const level = normalizeComplexityField(requirementLevel);
  const isSpType = SP_REQUEST_TYPES.has(type);
  const isCtType = CT_REQUEST_TYPES.has(type);
  const isLv34 = LV34_LEVELS.has(level);
  if (isSpType && isLv34) return 'SP-Lv34';
  if (isSpType && LV12_LEVELS.has(level)) return 'SP-Lv12';
  if (isCtType && isLv34) return 'CT-Lv34';
  // CT + Lv12 lands here too, and so does every unmatched/missing combination (the default).
  return 'CT-Lv12';
}

/**
 * Derives every "lớp dữ liệu tổng hợp" (aggregated data layer) for one import batch from the
 * canonical `issues` rows already stored for it: the compact epic_ttm_snapshots and
 * issue_daily_snapshots history tables, plus epic_alert_history (Cảnh báo muộn/Fail TTM as of
 * that batch's aggregatedAtDate). All three inserts are idempotent (ON CONFLICT upsert / unique
 * constraint), so this is safe to call again to "re-run" aggregation for a batch whose raw
 * `issues` rows are still present — it never re-reads or re-validates the original CSV.
 */
export async function aggregateBatchData(client: PoolClient, batchId: number, aggregatedAtDate: Date): Promise<void> {
  // Compact, long-retention Epic-level snapshot (survives raw-data cleanup — see epic_ttm_snapshots).
  const insertSnapshotQuery = `
    INSERT INTO epic_ttm_snapshots (
      epic_key, epic_name, project_key, domain_id, assignee_name, current_status,
      epic_complexity_type, requirement_level, idea_approved_date, start_date, r4g_date, due_date,
      target_r4g_date, source_import_batch_id, aggregated_at
    )
    SELECT
      issues.issue_key, issues.issue_name,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), '')
      ),
      project.domain_id, issues.assignee_name, issues.current_status,
      issues.epic_complexity_type, issues.requirement_level, issues.idea_approved_date, issues.start_date,
      issues.r4g_date, issues.due_date, issues.target_r4g_date, issues.source_import_batch_id,
      issues.aggregated_at
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    LEFT JOIN projects project
      ON project.source_project_key = COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), '')
      )
    WHERE issues.source_import_batch_id = $1 AND UPPER(issues.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    ON CONFLICT (epic_key, aggregated_at) DO UPDATE SET
      epic_name = EXCLUDED.epic_name,
      project_key = EXCLUDED.project_key,
      domain_id = EXCLUDED.domain_id,
      assignee_name = EXCLUDED.assignee_name,
      current_status = EXCLUDED.current_status,
      epic_complexity_type = EXCLUDED.epic_complexity_type,
      requirement_level = EXCLUDED.requirement_level,
      idea_approved_date = EXCLUDED.idea_approved_date,
      start_date = EXCLUDED.start_date,
      r4g_date = EXCLUDED.r4g_date,
      due_date = EXCLUDED.due_date,
      target_r4g_date = EXCLUDED.target_r4g_date,
      source_import_batch_id = EXCLUDED.source_import_batch_id;
  `;
  await client.query(insertSnapshotQuery, [batchId]);

  // Compact, permanent daily history for every hierarchy level. No cascade-delete relationship
  // to the raw batch, so Epic/Story/Subtask history remains available when raw import data
  // reaches its retention limit.
  const insertDailySnapshotsQuery = `
    INSERT INTO issue_daily_snapshots (
      issue_key, issue_type, issue_name, jira_id, project_key, epic_key, parent_key,
      assignee_name, current_status, epic_complexity_type, requirement_level,
      idea_approved_date, start_date, r4g_date, due_date, target_r4g_date,
      source_import_batch_id, aggregated_at
    )
    SELECT
      issues.issue_key, issues.issue_type, issues.issue_name, issues.jira_id,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), '')
      ),
      issues.epic_key, issues.parent_key, issues.assignee_name, issues.current_status,
      issues.epic_complexity_type, issues.requirement_level, issues.idea_approved_date,
      issues.start_date, issues.r4g_date, issues.due_date, issues.target_r4g_date,
      issues.source_import_batch_id, issues.aggregated_at
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE issues.source_import_batch_id = $1
    ON CONFLICT (issue_key, aggregated_at) DO UPDATE SET
      issue_type = EXCLUDED.issue_type,
      issue_name = EXCLUDED.issue_name,
      jira_id = EXCLUDED.jira_id,
      project_key = EXCLUDED.project_key,
      epic_key = EXCLUDED.epic_key,
      parent_key = EXCLUDED.parent_key,
      assignee_name = EXCLUDED.assignee_name,
      current_status = EXCLUDED.current_status,
      epic_complexity_type = EXCLUDED.epic_complexity_type,
      requirement_level = EXCLUDED.requirement_level,
      idea_approved_date = EXCLUDED.idea_approved_date,
      start_date = EXCLUDED.start_date,
      r4g_date = EXCLUDED.r4g_date,
      due_date = EXCLUDED.due_date,
      target_r4g_date = EXCLUDED.target_r4g_date,
      source_import_batch_id = EXCLUDED.source_import_batch_id;
  `;
  await client.query(insertDailySnapshotsQuery, [batchId]);

  // Accumulate a permanent alert-history record for every Epic in this batch whose status,
  // evaluated as of aggregatedAtDate against the configured 'Quy tắc cảnh báo Epic' rules, is
  // already Cảnh báo muộn (LATE) or Fail TTM (FAIL) — never overwritten, only refreshed per-day.
  const [holidays, statusAlertRules, ttmPolicies] = await Promise.all([
    getActiveHolidaySet(),
    listActiveStatusAlertRules(),
    listTtmPolicies(true),
  ]);
  const epicRows = await client.query<{
    complexity: string | null; dueDate: string | null; epicKey: string; ideaApprovedDate: string | null;
    jiraCreatedAt: string | null; r4gDate: string | null; requestType: string | null;
    requirementLevel: string | null; startDate: string | null; status: string;
  }>(`
    SELECT i.issue_key AS "epicKey", i.current_status AS status, i.epic_complexity_type AS complexity,
      i.idea_approved_date::text AS "ideaApprovedDate", i.start_date::text AS "startDate",
      i.r4g_date::text AS "r4gDate", i.due_date::text AS "dueDate", i.jira_created_at::text AS "jiraCreatedAt",
      i.requirement_level AS "requirementLevel",
      NULLIF(ir.normalized_data_json::jsonb ->> 'epicType', '') AS "requestType"
    FROM issues i
    LEFT JOIN import_rows ir
      ON ir.import_batch_id = i.source_import_batch_id
      AND ir.normalized_data_json::jsonb ->> 'issueKey' = i.issue_key
    WHERE i.source_import_batch_id = $1 AND UPPER(i.issue_type) IN (${EPIC_ISSUE_TYPES_SQL});
  `, [batchId]);
  // epic_alert_timeline transitions (Fail TTM-CNTT/E2E, thiếu Start Date, dữ liệu bất thường) are
  // collected per-epic here and applied in ONE batched diff below (see
  // recordEpicAlertTimelineTransitions) instead of one write per epic — same connection-cap
  // reasoning as everything else recorded during import.
  const timelineStatesByEpic = new Map<string, EpicAlertTimelineStates>();
  for (const epic of epicRows.rows) {
    const evaluation = evaluateIssueCompliance({
      dueDate: epic.dueDate,
      epicComplexityType: epic.complexity as EpicComplexity | null,
      ideaApprovedDate: epic.ideaApprovedDate,
      issueKey: epic.epicKey,
      issueType: 'EPIC',
      r4gDate: epic.r4gDate,
      startDate: epic.startDate,
      status: epic.status,
    }, aggregatedAtDate, holidays, statusAlertRules, ttmPolicies);

    if (evaluation.alertLevel === 'LATE' || evaluation.alertLevel === 'FAIL') {
      await recordEpicAlertHistory(client, epic.epicKey, evaluation.alertLevel, epic.status, aggregatedAtDate, batchId);
    }

    // Same "sai lệch dữ liệu" engine the live screens / Báo cáo / Dashboard use (evaluateEpicDataAnomaly)
    // so the timeline can never disagree with what a screen shows today for the same Epic. The
    // MISSING_START_DATE run tracks rule c specifically; DATA_ANOMALY covers every other violation.
    const anomalyViolations = evaluateEpicDataAnomaly({
      dueDate: epic.dueDate,
      ideaApprovedDate: epic.ideaApprovedDate,
      jiraCreatedAt: epic.jiraCreatedAt,
      r4gDate: epic.r4gDate,
      requestType: epic.requestType,
      requirementLevel: epic.requirementLevel,
      startDate: epic.startDate,
      status: epic.status,
      ttmCnttWorkingDays: evaluation.ttm.cntt.workingDays,
    }, aggregatedAtDate, holidays);
    const missingStartDateViolation = anomalyViolations.find((v) => v.code === 'MISSING_START_DATE') ?? null;
    const otherAnomalyViolations = anomalyViolations.filter((v) => v.code !== 'MISSING_START_DATE');
    const dataAnomaly = anomalyViolations.length > 0;
    const ttmE2eRelease = resolveTtmE2eRelease(epic, evaluation.ttm.e2e.workingDays ?? 0, aggregatedAtDate, holidays);

    const failCnttDetail: EpicAlertTimelineDetail | null = !dataAnomaly && evaluation.alertLevel === 'FAIL'
      ? { fromDate: evaluation.ttm.cntt.fromDate, targetDate: evaluation.ttm.cntt.targetDate }
      : null;
    const lateCnttDetail: EpicAlertTimelineDetail | null = !dataAnomaly && evaluation.alertLevel === 'LATE'
      ? { fromDate: evaluation.ttm.cntt.fromDate, targetDate: evaluation.ttm.cntt.targetDate }
      : null;
    const failE2eDetail: EpicAlertTimelineDetail | null = !dataAnomaly && ttmE2eRelease.alertLevel === 'FAIL'
      ? { baselineDate: ttmE2eRelease.baselineDate, actualToDate: ttmE2eRelease.actualToDate }
      : null;

    timelineStatesByEpic.set(epic.epicKey, {
      FAIL_TTM_CNTT: { active: failCnttDetail !== null, detail: failCnttDetail },
      LATE_TTM_CNTT: { active: lateCnttDetail !== null, detail: lateCnttDetail },
      FAIL_TTM_E2E: { active: failE2eDetail !== null, detail: failE2eDetail },
      MISSING_START_DATE: { active: missingStartDateViolation !== null, detail: null },
      DATA_ANOMALY: {
        active: otherAnomalyViolations.length > 0,
        detail: otherAnomalyViolations.length > 0 ? { rules: otherAnomalyViolations.map((v) => v.message).join('; ') } : null,
      },
    });
  }
  await recordEpicAlertTimelineTransitions(client, aggregatedAtDate, timelineStatesByEpic, batchId);

  // DESIGN_DONE / DEV_DONE / TEST_DONE milestone recording is temporarily off — phase completion
  // is now evaluated live from current statuses on every request instead (see
  // epic-phase-completion-service.ts). The write path is left fully intact, same convention as
  // ALERT_HISTORY_RECORDING_ENABLED in epic-alert-phase-service.ts.
  if (MILESTONE_RECORDING_ENABLED) {
    const { designDoneCandidates, devDoneCandidates, testDoneCandidates } = await computeMilestoneCandidates(client);
    for (const candidate of designDoneCandidates) {
      await recordEpicMilestone(client, candidate.epicKey, 'DESIGN_DONE', candidate.designDoneDate, batchId);
    }
    for (const candidate of devDoneCandidates) {
      await recordEpicMilestone(client, candidate.epicKey, 'DEV_DONE', candidate.devDoneDate, batchId);
    }
    for (const candidate of testDoneCandidates) {
      await recordEpicMilestone(client, candidate.epicKey, 'TEST_DONE', candidate.testDoneDate, batchId);
    }
  }
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
}

export interface BatchValidationDetail {
  rowNumber: number;
  rawData: Record<string, string>;
  validationStatus: string;
  validationErrors: ValidationError[];
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
  let rawIssues;
  if (adapterType === ADAPTER_TYPES.PY_JIRA_API) {
    ({ issues: rawIssues } = parsePyJiraApi(csvText));
  } else {
    // PURE_JIRA_EXPORT (original / legacy path)
    const parsedRows = parseCSV(csvText);
    ({ issues: rawIssues } = mapCSVToRawIssues(parsedRows));
    // parsePureJiraExport is a thin wrapper — call it for symmetry in future
    void parsePureJiraExport; // explicit reference so tree-shaking keeps the module
  }
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
      validationReport
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
      JSON.stringify({ validateOnly, adapterType })
    ];

    const batchRes = await client.query(insertBatchQuery, batchValues);
    const batchId = batchRes.rows[0].id;

    // 4. Ingest Raw Import Rows into import_rows
    // (normalized_data_json is the single copy kept — it used to be duplicated verbatim
    // into a separate raw_data_json column, doubling storage for no benefit.)
    //
    // One INSERT per row here used to mean one DB round trip per row — fine for a small file, but
    // a real production export (tens of thousands of rows) turned this into a 10+ minute request
    // that timed out (confirmed by reproducing it directly: ~31,500 rows took over 10 minutes and
    // the connection was eventually dropped). All columns here are scalar, so a single
    // unnest()-based bulk insert replaces the whole loop with one round trip regardless of row
    // count — Postgres has no limit on array-parameter length, only on the number of distinct
    // placeholders ($1..$5 here), so this scales to any file size in one query.
    if (rawIssues.length > 0) {
      await client.query(
        `INSERT INTO import_rows (import_batch_id, row_number, normalized_data_json, validation_status, validation_errors_json)
         SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::text[]);`,
        [
          batchId,
          rawIssues.map((issue) => issue.rowNumber),
          rawIssues.map((issue) => JSON.stringify(issue)),
          validationReport.map((validation) => validation.status),
          validationReport.map((validation) => JSON.stringify(validation.errors)),
        ],
      );
    }

    // 5. Ingest into canonical issues table if NOT validateOnly. Rows that failed validation
    // (status INVALID) are excluded from this insert loop — every row, valid or not, was already
    // recorded verbatim in import_rows above (with its validation_status/errors) so the source
    // data can be corrected — but only issues that passed validation are safe to write into the
    // canonical table and downstream aggregation (epic_ttm_snapshots, issue_daily_snapshots,
    // epic_alert_history). This means one bad row no longer takes the whole batch down with it:
    // every other issue (including other Epics untouched by any error) still gets ingested and
    // aggregated normally. batchStatus stays 'FAILED' whenever errorRows > 0 purely as a reporting
    // label on the batch history screen — it no longer implies "nothing was saved".
    const validIssues = rawIssues.filter((_issue, index) => validationReport[index].status !== 'INVALID');
    if (!validateOnly && validIssues.length > 0) {
      await accumulateProjectComponents(client, validIssues);

      // Same round-trip-per-row problem as the import_rows loop above, but issues has 3 array
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
        'epic_complexity_type', 'requirement_level', 'source_import_batch_id', 'aggregated_at',
        'jira_created_at', 'jira_updated_at', 'epic_stories', 'story_subtasks', 'components',
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
          jira_created_at = EXCLUDED.jira_created_at,
          jira_updated_at = EXCLUDED.jira_updated_at,
          aggregated_at = EXCLUDED.aggregated_at,
          epic_stories = EXCLUDED.epic_stories,
          story_subtasks = EXCLUDED.story_subtasks,
          components = EXCLUDED.components,
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
          batchId,
          aggregatedAtDate,
          jiraCreatedAt,
          jiraUpdatedAt,
          issue.epicStories?.length ? issue.epicStories : null,
          issue.storySubtasks?.length ? issue.storySubtasks : null,
          components.length ? components : null,
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

      // 6. Link relationships within the batch.
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
      // (bad stats), not a per-query workaround, and it costs under a second here. import_rows
      // gets the same treatment since aggregateBatchData (step 7, right after this) joins it
      // against `issues` on this same freshly-inserted batch and hit the identical bad-plan issue.
      await client.query('ANALYZE issues, import_rows;');

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

      // 7. Derive every aggregated data layer (epic_ttm_snapshots, issue_daily_snapshots,
      // epic_alert_history) for this batch — same function used to "re-run" aggregation later.
      await aggregateBatchData(client, batchId, aggregatedAtDate);
    }

    // Raw data is cleaned after every stored import, including a failed batch. Protect
    // both this batch and the newest data layer so an out-of-order historical import
    // can never remove the currently used alert source.
    const retentionResult = await client.query<{ rawImportRetentionDays: number }>(
      'SELECT raw_import_retention_days AS "rawImportRetentionDays" FROM data_retention_configs WHERE id = 1;',
    );
    const retentionDays = retentionResult.rows[0]?.rawImportRetentionDays ?? DEFAULT_RAW_IMPORT_RETENTION_DAYS;
    const latestBatch = await client.query<{ id: number }>(
      'SELECT id FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1;',
    );
    const protectedBatchIds = [...new Set([batchId, latestBatch.rows[0]?.id].filter((id): id is number => typeof id === 'number'))];
    await client.query(
      'DELETE FROM import_batches WHERE aggregated_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL \'1 day\') AND NOT (id = ANY($2::int[]));',
      [retentionDays, protectedBatchIds],
    );

    await client.query('COMMIT');

    return {
      batchId,
      fileName,
      aggregatedAt: aggregatedAtDate.toISOString(),
      totalRows,
      successRows,
      warningRows,
      errorRows,
      status: batchStatus,
      validationReport
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
  const res = await pool.query(`
    SELECT id, file_name as "fileName", import_type as "importType", 
           imported_by as "importedBy", imported_at as "importedAt", 
           aggregated_at as "aggregatedAt", total_rows as "totalRows", 
           success_rows as "successRows", warning_rows as "warningRows", 
           error_rows as "errorRows", status
    FROM import_batches
    ORDER BY imported_at DESC;
  `);
  return res.rows;
}

export async function getBatchValidationDetail(batchId: number): Promise<BatchValidationDetail[]> {
  const res = await pool.query(`
    SELECT row_number as "rowNumber", normalized_data_json as "rawData",
           validation_status as "validationStatus",
           validation_errors_json as "validationErrors"
    FROM import_rows
    WHERE import_batch_id = $1
      AND (validation_status = 'INVALID' OR validation_status = 'WARNING')
    ORDER BY row_number ASC;
  `, [batchId]);
  return res.rows.map(row => ({
    rowNumber: row.rowNumber,
    rawData: JSON.parse(row.rawData),
    validationStatus: row.validationStatus,
    validationErrors: JSON.parse(row.validationErrors)
  }));
}
