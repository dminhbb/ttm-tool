import pool from '@/lib/db';
import { getActiveHolidaySet } from '@/lib/master-data-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import { listTtmPolicies } from '@/lib/ttm-policy-service';
import { resolveTtmActualRange, resolveTtmE2eRelease, hasDataAnomaly, missingStandardInfo } from '@/lib/epic-alert-service';
import { EPIC_WORKFLOW_STATUS_ORDER, normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import { addWorkingDays, diffWorkingDays, toDateKey } from '@/lib/working-days';

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
    components: string[] | null;
    dueDate: string | null;
    epicKey: string;
    epicType: string | null;
    ideaApprovedDate: string | null;
    jiraCreatedAt: string | null;
    projectKey: string;
    r4gDate: string | null;
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
  const [holidays, ttmPolicies] = await Promise.all([
    getActiveHolidaySet(),
    listTtmPolicies(true),
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

    // Calculate Data Anomaly
    const isAnomaly = hasDataAnomaly(epicDataRow);
    const missingInfo = missingStandardInfo(epicDataRow);
    const anomalyDetails: string[] = [];

    if (!row.startDate) anomalyDetails.push('Thiếu Start CNTT (T1)');
    if (!row.ideaApprovedDate) anomalyDetails.push('Thiếu Start E2E (T0)');
    if (row.r4gDate && row.startDate && row.r4gDate < row.startDate) anomalyDetails.push('R4G Date nhỏ hơn Start CNTT');
    if (row.dueDate && row.ideaApprovedDate && row.dueDate < row.ideaApprovedDate) anomalyDetails.push('Due Date nhỏ hơn Start E2E');

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

    // Closing & Target dates
    const cnttClosingDate = row.r4gDate;
    const targetCnttDate = row.dueDate;

    const e2eTargetDays = ttmPolicies.find((p) => p.ttmType === 'TTM_E2E')?.workingDays ?? 30;
    const e2eEval = resolveTtmE2eRelease(epicDataRow, e2eTargetDays, now, holidays);
    const e2eClosingDate = row.dueDate || releasedDate;
    const targetE2eDate = e2eEval.baselineDate;

    // Rule 1: TTM-CNTT Pass condition: r4gDate <= targetCnttDate AND status is R4GOLIVE/RELEASED
    const ttmCnttPassed = Boolean(
      cnttClosingDate &&
      targetCnttDate &&
      cnttClosingDate <= targetCnttDate &&
      isStatusValidForPass
    );

    // Rule 1: TTM-e2e Pass condition: dueDate <= targetE2eDate AND status is R4GOLIVE/RELEASED
    const ttmE2ePassed = Boolean(
      e2eClosingDate &&
      targetE2eDate &&
      e2eClosingDate <= targetE2eDate &&
      isStatusValidForPass
    );

    // Evaluate failure reasons for Bảng 3
    let cnttFailReason: string | null = null;
    if (!ttmCnttPassed) {
      if (!cnttClosingDate) {
        cnttFailReason = 'Thiếu R4G Date';
      } else if (targetCnttDate && cnttClosingDate <= targetCnttDate && !isStatusValidForPass) {
        cnttFailReason = 'Epic Status không đúng';
      } else if (targetCnttDate && cnttClosingDate > targetCnttDate) {
        if (!isStatusValidForPass) {
          cnttFailReason = 'Epic Status không đúng';
        } else {
          cnttFailReason = `Fail TTM-CNTT (${formatDateVietnamese(cnttClosingDate)}>${formatDateVietnamese(targetCnttDate)})`;
        }
      } else if (!isStatusValidForPass) {
        cnttFailReason = 'Epic Status không đúng';
      }
    }

    let e2eFailReason: string | null = null;
    if (!ttmE2ePassed) {
      if (!e2eClosingDate) {
        e2eFailReason = 'Thiếu Released Date';
      } else if (targetE2eDate && e2eClosingDate <= targetE2eDate && !isStatusValidForPass) {
        e2eFailReason = 'Epic Status không đúng';
      } else if (targetE2eDate && e2eClosingDate > targetE2eDate) {
        if (!isStatusValidForPass) {
          e2eFailReason = 'Epic Status không đúng';
        } else {
          e2eFailReason = `Fail TTM-e2e (${formatDateVietnamese(e2eClosingDate)}>${formatDateVietnamese(targetE2eDate)})`;
        }
      } else if (!isStatusValidForPass) {
        e2eFailReason = 'Epic Status không đúng';
      }
    }

    const ttmCnttFailed = !ttmCnttPassed;
    const ttmE2eFailed = !ttmE2ePassed;

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
    // 1. Epic tạo mới từ (createdDateFrom): Idea Approved Date / T0 or Jira Created Date >= createdDateFrom
    const createdDate = row.ideaApprovedDate || row.jiraCreatedAt || null;
    if (createdDateFrom && (!createdDate || createdDate < createdDateFrom)) {
      continue;
    }

    // 2. Epic start date từ (startDateFrom): Start CNTT / T1 >= startDateFrom
    if (startDateFrom && (!row.startDate || row.startDate < startDateFrom)) {
      continue;
    }

    // 3. Epic golive sau (releasedDateFrom): Released Date (or R4G Date / Released Date) >= releasedDateFrom
    const effectiveReleasedDate = releasedDate || row.r4gDate || null;
    if (releasedDateFrom && (!effectiveReleasedDate || effectiveReleasedDate < releasedDateFrom)) {
      continue;
    }

    // Rule: When releasedDateFrom filter is active, tables 1, 2, 3 only allow status = RELEASED!
    const passesReleasedStatusRule = !releasedDateFrom || isReleased;

    // 1. Released Table
    if (isReleased) {
      releasedEpics.push(item);
    }

    // 2. Data Anomaly Table (EXEMPT from status = RELEASED rule)
    if (isAnomaly || anomalyDetails.length > 0) {
      anomalyEpics.push({
        ...item,
        anomalyDetails: anomalyDetails.length > 0 ? anomalyDetails : ['Dữ liệu không đầy đủ/sai lệch'],
      });
    }

    // 3. Passed TTM Table (Rule 1 & 3: ONLY epics satisfying Pass rule)
    if (passesReleasedStatusRule && (ttmCnttPassed || ttmE2ePassed) && !isAnomaly) {
      let passType = 'Đạt TTM-CNTT';
      if (ttmCnttPassed && ttmE2ePassed) passType = 'Đạt cả TTM-CNTT & TTM-e2e';
      else if (ttmE2ePassed && !ttmCnttPassed) passType = 'Đạt TTM-e2e';

      passedEpics.push({
        ...item,
        passType,
      });
    }

    // 4. Failed TTM Table (Rule 2)
    // Rule: Skip if status is 'To do' and ideaApprovedDate (Start E2E / T0) is missing
    const isToDoStatus = normStatus === 'TO DO' || upperStatus.includes('TO DO');
    const skipFailTableIfToDoWithoutIdeaDate = isToDoStatus && !row.ideaApprovedDate;

    if (passesReleasedStatusRule && (ttmCnttFailed || ttmE2eFailed) && !skipFailTableIfToDoWithoutIdeaDate) {
      const reasons = new Set<string>();
      if (cnttFailReason && cnttFailReason !== 'Thiếu R4G Date') reasons.add(cnttFailReason);
      if (e2eFailReason && e2eFailReason !== 'Thiếu Released Date') reasons.add(e2eFailReason);

      let failType = Array.from(reasons).join(' & ');
      if (!failType) {
        failType = 'Dữ liệu không đầy đủ';
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
