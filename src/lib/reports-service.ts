import pool from '@/lib/db';
import { getActiveHolidaySet } from '@/lib/master-data-service';
import { listTtmPolicies, resolveTtmCnttWorkingDays } from '@/lib/ttm-policy-service';
import { resolveTtmE2eRelease } from '@/lib/epic-alert-service';
import { evaluateIssueCompliance } from '@/lib/epic-compliance-engine';
import { breaksTtmCnttCalculation, breaksTtmE2eCalculation, evaluateEpicDataAnomaly } from '@/lib/epic-data-anomaly';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import type { EpicComplexityType } from '@/lib/status-alert-rule-types';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import { diffWorkingDays, toDateKey } from '@/lib/working-days';

export interface ReportFilterOptions {
  component?: string;
  createdDateFrom?: string; // YYYY-MM-DD (Epic tạo mới từ >=)
  domainId?: number;
  projectKey: string;
  releasedDateFrom?: string; // YYYY-MM-DD (Epic golive sau >=)
  selectedLayerDates: string[];
  startDateFrom?: string; // YYYY-MM-DD (Epic start date từ >=)
}

export interface ReportEpicItem {
  actualTtmDays: number | null;
  anomalyDetails: string[];
  components: string[];
  epicKey: string;
  epicType: string | null;
  failType: string | null;
  ideaApprovedDate: string | null; // Start E2E (T0)
  passType: string | null;
  projectKey: string;
  r4gDate: string | null;
  releasedDate: string | null;
  startDate: string | null; // Start CNTT (T1)
  status: string;
  summary: string;
}

export interface ReportResult {
  anomalyEpics: ReportEpicItem[];
  componentName: string;
  domainName: string;
  evaluatedAt: string;
  failedEpics: ReportEpicItem[];
  inPoEpics: ReportEpicItem[];
  layerDates: string[];
  maxLayerDate: string;
  minLayerDate: string;
  passedEpics: ReportEpicItem[];
  pendingEpics: ReportEpicItem[];
  pmSmNames: string;
  projectKey: string;
  projectName: string;
  releasedEpics: ReportEpicItem[];
  totalAnomalyCount: number;
  totalFailedCount: number;
  totalInPoCount: number;
  totalPassedCount: number;
  totalPendingCount: number;
  totalReleasedCount: number;
}

/**
 * List the 7 most recent data layer dates available in the system.
 */
export async function getReportLayerDates(): Promise<string[]> {
  const result = await pool.query<{ layerDate: string }>(`
    SELECT DISTINCT aggregated_at::date::text AS "layerDate"
    FROM issues
    ORDER BY "layerDate" DESC
    LIMIT 7;
  `);
  return result.rows.map((row) => row.layerDate);
}

/**
 * Generate full Epic Report payload based on project, component, selected layer dates, and date range filters.
 */
export async function generateEpicReport(options: ReportFilterOptions): Promise<ReportResult> {
  const { projectKey, component, selectedLayerDates, createdDateFrom, startDateFrom, releasedDateFrom } = options;

  if (!projectKey) {
    throw new Error('Dự án (projectKey) là thông tin bắt buộc.');
  }

  if (!selectedLayerDates || selectedLayerDates.length === 0) {
    throw new Error('Bạn phải chọn ít nhất 1 Lớp dữ liệu.');
  }

  const sortedLayers = [...selectedLayerDates].sort().reverse(); // newest first
  const minLayerDate = sortedLayers[sortedLayers.length - 1];
  const maxLayerDate = sortedLayers[0];

  // 1. Fetch Project & Domain Metadata + PM/SM names
  const projectMetaResult = await pool.query<{
    domainId: number | null;
    domainName: string | null;
    leadName: string | null;
    projectName: string;
    sourceProjectKey: string;
  }>(`
    SELECT
      p.source_project_key AS "sourceProjectKey",
      p.project_name AS "projectName",
      p.domain_id AS "domainId",
      d.domain_name AS "domainName",
      COALESCE(leads.lead_name, '') AS "leadName"
    FROM projects p
    LEFT JOIN domains d ON d.id = p.domain_id
    LEFT JOIN (
      SELECT up.project_id, STRING_AGG(u.full_name, ', ' ORDER BY u.full_name) AS lead_name
      FROM user_projects up
      JOIN users u ON u.id = up.user_id
      GROUP BY up.project_id
    ) leads ON leads.project_id = p.id
    WHERE LOWER(p.source_project_key) = LOWER($1)
    LIMIT 1;
  `, [projectKey]);

  const projMeta = projectMetaResult.rows[0] ?? {
    domainId: null,
    domainName: 'Không xác định',
    leadName: 'Chưa gán PM/SM',
    projectName: projectKey,
    sourceProjectKey: projectKey,
  };

  // If specific component is selected, also check component-level PM/SM
  let pmSmNames = projMeta.leadName || 'Chưa gán PM/SM';
  if (component && component !== 'ALL') {
    const compLeadResult = await pool.query<{ leadName: string }>(`
      SELECT STRING_AGG(u.full_name, ', ' ORDER BY u.full_name) AS "leadName"
      FROM user_project_components upc
      JOIN projects p ON p.id = upc.project_id
      JOIN users u ON u.id = upc.user_id
      WHERE LOWER(p.source_project_key) = LOWER($1) AND LOWER(upc.component_name) = LOWER($2);
    `, [projectKey, component]);

    if (compLeadResult.rows[0]?.leadName) {
      pmSmNames = compLeadResult.rows[0].leadName;
    }
  }

  // 2. Fetch Epics using layer fallback logic:
  // DISTINCT ON (issue_key) filtering aggregated_at::date IN (selectedLayerDates) ORDER BY issue_key, aggregated_at DESC
  const epicsResult = await pool.query<{
    aggregatedAt: string;
    complexity: string | null;
    components: string[] | null;
    dueDate: string | null;
    epicKey: string;
    epicType: string | null;
    ideaApprovedDate: string | null;
    jiraCreatedAt: string | null;
    projectKey: string;
    r4gDate: string | null;
    requirementLevel: string | null;
    startDate: string | null;
    status: string;
    summary: string;
  }>(`
    WITH layer_issues AS (
      SELECT DISTINCT ON (issue_key)
        id,
        issue_key AS "epicKey",
        issue_name AS summary,
        current_status AS status,
        start_date::text AS "startDate",
        r4g_date::text AS "r4gDate",
        due_date::text AS "dueDate",
        aggregated_at::text AS "aggregatedAt",
        epic_complexity_type AS complexity,
        requirement_level AS "requirementLevel",
        components,
        COALESCE(
          NULLIF(SPLIT_PART(issue_key, '-', 1), ''),
          ''
        ) AS "projectKey",
        source_import_batch_id
      FROM issues
      WHERE aggregated_at::date = ANY($1::date[])
        AND UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
        AND LOWER(SPLIT_PART(issue_key, '-', 1)) = LOWER($2)
      ORDER BY issue_key, aggregated_at DESC
    )
    SELECT
      i.*,
      ir.normalized_data_json::jsonb ->> 'ideaApprovedDate' AS "ideaApprovedDate",
      ir.normalized_data_json::jsonb ->> 'epicType' AS "epicType",
      ir.normalized_data_json::jsonb ->> 'created' AS "jiraCreatedAt"
    FROM layer_issues i
    LEFT JOIN import_rows ir
      ON ir.import_batch_id = i.source_import_batch_id
      AND ir.normalized_data_json::jsonb ->> 'issueKey' = i."epicKey";
  `, [sortedLayers, projectKey]);

  let rows = epicsResult.rows;

  // Filter component if specified
  if (component && component !== 'ALL') {
    const compLower = component.toLowerCase();
    rows = rows.filter((r) =>
      r.components ? r.components.some((c) => c.toLowerCase() === compLower) : false
    );
  }

  // Fetch TTM rules & holidays for TTM calculations
  const [holidays, ttmPolicies, statusAlertRules] = await Promise.all([
    getActiveHolidaySet(),
    listTtmPolicies(true),
    listActiveStatusAlertRules(),
  ]);

  const now = new Date();
  const todayKey = toDateKey(now);

  const releasedEpics: ReportEpicItem[] = [];
  const passedEpics: ReportEpicItem[] = [];
  const failedEpics: ReportEpicItem[] = [];
  const anomalyEpics: ReportEpicItem[] = [];
  const inPoEpics: ReportEpicItem[] = [];
  const pendingEpics: ReportEpicItem[] = [];

  const processedKeys = new Set<string>();

  for (const row of rows) {
    if (processedKeys.has(row.epicKey)) continue; // Deduplicate guarantee
    processedKeys.add(row.epicKey);

    const normStatus = normalizeEpicWorkflowStatus(row.status);
    const upperStatus = row.status.toUpperCase();

    // 1. EXCLUDE CANCELLED EPICS ENTIRELY ACROSS ALL TABLES
    if (normStatus === 'CANCELLED' || upperStatus.includes('CANCELLED') || upperStatus.includes('HỦY')) {
      continue;
    }

    const isReleased = normStatus === 'RELEASED';

    const epicDataRow = {
      epicKey: row.epicKey,
      epicName: row.summary,
      status: row.status,
      startDate: row.startDate,
      r4gDate: row.r4gDate,
      dueDate: row.dueDate,
      ideaApprovedDate: row.ideaApprovedDate,
      jiraCreatedAt: row.jiraCreatedAt,
      complexity: null,
      epicType: row.epicType,
      components: row.components || [],
      project: row.projectKey,
      requirementLevel: null,
      targetR4gDate: null,
      assignee: null,
      aggregatedAt: row.aggregatedAt,
    };

    // "Sai lệch dữ liệu" — unified engine shared with every Epic screen, Dashboard and the alert
    // timeline (see epic-data-anomaly.ts). Cancelled Epics are already skipped above; To Do / In PO
    // Epics are exempt inside the engine itself (rule a).
    const ttmCnttWorkingDays = resolveTtmCnttWorkingDays(ttmPolicies, row.complexity);
    const anomalyViolations = evaluateEpicDataAnomaly({
      dueDate: row.dueDate,
      ideaApprovedDate: row.ideaApprovedDate,
      jiraCreatedAt: row.jiraCreatedAt,
      r4gDate: row.r4gDate,
      requestType: row.epicType,
      requirementLevel: row.requirementLevel,
      startDate: row.startDate,
      status: row.status,
      ttmCnttWorkingDays,
    }, now, holidays);
    const isAnomaly = anomalyViolations.length > 0;
    const anomalyDetails: string[] = anomalyViolations.map((violation) => violation.message);

    // Released Date determination
    const releasedDate = isReleased ? (row.dueDate || row.r4gDate || row.aggregatedAt?.slice(0, 10) || null) : null;

    // Actual TTM calculation (working days from Start CNTT to R4G Date)
    let actualTtmDays: number | null = null;
    if (row.startDate && row.r4gDate && row.r4gDate >= row.startDate) {
      const dStart = new Date(row.startDate);
      const dR4g = new Date(row.r4gDate);
      if (!isNaN(dStart.getTime()) && !isNaN(dR4g.getTime())) {
        actualTtmDays = diffWorkingDays(dStart, dR4g, holidays);
      }
    }

    // Status valid for PASS: MUST be R4GOLIVE or RELEASED
    const isStatusValidForPass = normStatus === 'R4GOLIVE' || normStatus === 'RELEASED' || upperStatus.includes('R4G') || upperStatus.includes('RELEASED');

    // Canonical TTM-CNTT / TTM-E2E evaluation — same functions used by Quản trị Epic / Dashboard /
    // alert timeline (evaluateIssueCompliance → computeTtmAlert, resolveTtmE2eRelease), gated by the
    // same breaksTtmCnttCalculation/breaksTtmE2eCalculation narrow checks, so Bảng 2/3 always agree
    // with the live screens instead of re-deriving Pass/Fail from Due Date.
    const complianceEvaluation = evaluateIssueCompliance({
      dueDate: row.dueDate,
      epicComplexityType: row.complexity as EpicComplexityType | null,
      ideaApprovedDate: row.ideaApprovedDate,
      issueKey: row.epicKey,
      issueType: 'EPIC',
      r4gDate: row.r4gDate,
      startDate: row.startDate,
      status: row.status,
    }, now, holidays, statusAlertRules, ttmPolicies);
    const cnttBroken = breaksTtmCnttCalculation(row);
    const cnttAlertLevel = cnttBroken ? 'NONE' : complianceEvaluation.alertLevel;
    const targetCnttDate = complianceEvaluation.ttm.cntt.targetDate;

    const e2eTargetDays = complianceEvaluation.ttm.e2e.workingDays ?? 0;
    const e2eEval = resolveTtmE2eRelease(epicDataRow, e2eTargetDays, now, holidays);
    const e2eBroken = breaksTtmE2eCalculation(row);
    const e2eAlertLevel = e2eBroken ? 'NONE' : e2eEval.alertLevel;
    const targetE2eDate = e2eEval.baselineDate;

    // Pass: the Epic actually reached R4G/Released status AND the canonical engine says it did so
    // within its TTM budget (not FAIL).
    const ttmCnttPassed = Boolean(row.r4gDate) && !cnttBroken && cnttAlertLevel !== 'FAIL' && isStatusValidForPass;
    const ttmE2ePassed = Boolean(row.dueDate || releasedDate) && !e2eBroken && e2eAlertLevel !== 'FAIL' && isStatusValidForPass;

    // Fail: the canonical engine's FAIL determination — no separate "wrong status" fail concept.
    let actualCnttFail = false;
    let cnttFailReason: string | null = null;
    if (cnttAlertLevel === 'FAIL') {
      actualCnttFail = true;
      cnttFailReason = targetCnttDate
        ? `Fail TTM-CNTT (${formatDateVietnamese(row.r4gDate ?? todayKey)}>${formatDateVietnamese(targetCnttDate)})`
        : 'Fail TTM-CNTT';
    }

    let actualE2eFail = false;
    let e2eFailReason: string | null = null;
    if (e2eAlertLevel === 'FAIL') {
      actualE2eFail = true;
      e2eFailReason = targetE2eDate
        ? `Fail TTM-e2e (${formatDateVietnamese(e2eEval.actualToDate)}>${formatDateVietnamese(targetE2eDate)})`
        : 'Fail TTM-e2e';
    }

    const item: ReportEpicItem = {
      actualTtmDays,
      anomalyDetails,
      components: row.components || [],
      epicKey: row.epicKey,
      epicType: row.epicType,
      failType: null,
      ideaApprovedDate: row.ideaApprovedDate,
      passType: null,
      projectKey: row.projectKey,
      r4gDate: row.r4gDate,
      releasedDate,
      startDate: row.startDate,
      status: row.status,
      summary: row.summary,
    };

    // Date Range Filters:
    // 1. Epic tạo mới từ (createdDateFrom): Created Date (Jira Created Date || Start E2E) >= createdDateFrom
    // Applies to ALL TABLES (1, 2, 3, 4, 5, 6)
    const createdDate = row.jiraCreatedAt || row.ideaApprovedDate || null;
    if (createdDateFrom && (!createdDate || createdDate.slice(0, 10) < createdDateFrom)) {
      continue;
    }

    // 2. Epic start date từ (startDateFrom): Start CNTT / T1 >= startDateFrom (Epics without startDate excluded)
    // Applies ONLY to tables 1, 2, 3
    const passesStartDateFilter = !startDateFrom || (Boolean(row.startDate) && row.startDate! >= startDateFrom);

    // 3. Epic golive sau (releasedDateFrom): Due Date >= releasedDateFrom (Epics without dueDate excluded)
    // Applies ONLY to tables 1, 2, 3
    const passesDueDateFilter = !releasedDateFrom || (Boolean(row.dueDate) && row.dueDate! >= releasedDateFrom);

    const passesTable123DateFilters = passesStartDateFilter && passesDueDateFilter;

    // 1. Released Table (Applied Table 1,2,3 date filters)
    if (isReleased && passesTable123DateFilters) {
      releasedEpics.push(item);
    }

    // 2. Data Anomaly Table — every Epic breaking any "sai lệch dữ liệu" rule (unified engine).
    if (isAnomaly) {
      anomalyEpics.push({
        ...item,
        anomalyDetails: anomalyDetails.length > 0 ? anomalyDetails : ['Dữ liệu sai lệch'],
      });
    }

    // 3. Passed TTM Table (Rule 1 & 3: ONLY epics satisfying Pass rule + Table 1,2,3 date filters)
    if (passesTable123DateFilters && (ttmCnttPassed || ttmE2ePassed) && !isAnomaly) {
      let passType = 'Đạt TTM-CNTT';
      if (ttmCnttPassed && ttmE2ePassed) passType = 'Đạt cả TTM-CNTT & TTM-e2e';
      else if (ttmE2ePassed && !ttmCnttPassed) passType = 'Đạt TTM-e2e';

      passedEpics.push({
        ...item,
        passType,
      });
    }

    // 4. Failed TTM Table (Rule 2: Fails 1 of the 2 criteria + Table 1,2,3 date filters)
    // Rule: Skip if status is 'To do' and ideaApprovedDate (Start E2E / T0) is missing
    const isToDoStatus = normStatus === 'TO DO' || upperStatus.includes('TO DO');
    const skipFailTableIfToDoWithoutIdeaDate = isToDoStatus && !row.ideaApprovedDate;
    const isActualFail = actualCnttFail || actualE2eFail;

    if (passesTable123DateFilters && isActualFail && !skipFailTableIfToDoWithoutIdeaDate) {
      const reasons = new Set<string>();
      if (cnttFailReason) reasons.add(cnttFailReason);
      if (e2eFailReason) reasons.add(e2eFailReason);

      let failType = Array.from(reasons).join(' & ');
      if (!failType) {
        failType = 'Fail TTM';
      }

      failedEpics.push({
        ...item,
        failType,
      });
    }

    // 5. Epic in PO Table (Excludes RELEASED, only TO DO and IN PO)
    const isInPoStatus = normStatus === 'TO DO' || normStatus === 'IN PO' || upperStatus.includes('TO DO') || upperStatus.includes('IN PO');
    if (isInPoStatus) {
      inPoEpics.push(item);
    }

    // 6. Epic Pending Table
    const isPendingStatus = normStatus === 'PENDING' || upperStatus.includes('PENDING') || upperStatus.includes('CHỜ') || upperStatus.includes('PAUSED');
    if (isPendingStatus) {
      pendingEpics.push(item);
    }
  }

  return {
    anomalyEpics,
    componentName: component && component !== 'ALL' ? component : 'Tất cả Component',
    domainName: projMeta.domainName || 'Tất cả Domain',
    evaluatedAt: new Date().toISOString(),
    failedEpics,
    inPoEpics,
    layerDates: sortedLayers,
    maxLayerDate,
    minLayerDate,
    passedEpics,
    pendingEpics,
    pmSmNames,
    projectKey,
    projectName: projMeta.projectName,
    releasedEpics,
    totalAnomalyCount: anomalyEpics.length,
    totalFailedCount: failedEpics.length,
    totalInPoCount: inPoEpics.length,
    totalPassedCount: passedEpics.length,
    totalPendingCount: pendingEpics.length,
    totalReleasedCount: releasedEpics.length,
  };
}

function formatDateVietnamese(dStr: string | null): string {
  if (!dStr) return '?';
  const clean = dStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    return `${d}/${m}/${y}`;
  }
  return dStr;
}
