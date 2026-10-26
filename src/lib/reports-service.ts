import { normalizeTtmApplied, parseExceptPlanDate } from '@/lib/scoring/ttm-applied';
import { loadTtmExclusionSources } from '@/lib/black-listed-epic-service';
import pool from '@/lib/db';
import { getActiveHolidaySet } from '@/lib/master-data-service';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import { diffWorkingDays } from '@/lib/working-days';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { listSelectableLayerDates, listSelectableLayers } from '@/lib/data-layer-retention-service';
import type { SelectableLayers } from '@/lib/data-layer-retention-service';
import { BADGE_BY_ID } from '@/lib/scoring/catalog';
import type { BadgeId } from '@/lib/scoring/catalog';
import { toIsoDate } from '@/lib/scoring/dates';
import { scoreEpic } from '@/lib/scoring/score-epic';
import type { EpicComplexity, EpicScorecard } from '@/lib/scoring/types';

const VALID_COMPLEXITY = new Set(['CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34']);

export interface ReportFilterOptions {
  /** Pins every FAIL/EARLY/LATE and "sai lệch dữ liệu" calculation to this date instead of the real
   * wall-clock date — set together with an OLDER `stateDate` ("Chọn lớp dữ liệu") so viewing a past
   * date also evaluates it as of that date, not today. Omit/null for the default: evaluate as of the real
   * current date. */
  asOfDate?: string | null;
  /** Viewer's component narrowing for this project (PM/SM grant, see resolveAccessScope) — only
   * Epics in one of these components are reported. Omit/empty = the whole project. */
  allowedComponents?: string[] | null;
  component?: string;
  createdDateFrom?: string; // YYYY-MM-DD (Epic tạo mới từ >=)
  domainId?: number;
  projectKey: string;
  releasedDateFrom?: string; // YYYY-MM-DD (Epic golive sau >=)
  /** The date whose state the report shows: every Epic as its newest row dated on/before it. */
  stateDate: string;
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
  /** "Epic ngoại lệ" — the Epic has a row in black_listed_epics (black dot next to its key). */
  ttmBlackListed: boolean;
  /** Rule Group that judged the Epic (Rule Management); null for an "Epic ngoại lệ". */
  ruleGroupName: string | null;
  ruleGroupIsDefault: boolean;
}

export interface ReportResult {
  anomalyEpics: ReportEpicItem[];
  /** Echoes ReportFilterOptions.asOfDate — null means every FAIL/EARLY/LATE/anomaly calculation
   * used the real wall-clock date; a date means they were all evaluated as of that past layer
   * instead, so the frontend can banner-warn the viewer. */
  asOfDate: string | null;
  componentName: string;
  domainName: string;
  evaluatedAt: string;
  failedEpics: ReportEpicItem[];
  inPoEpics: ReportEpicItem[];
  /** The date whose state the report shows ("Chọn lớp dữ liệu"). */
  maxLayerDate: string;
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
 * The dates a report can be run for, newest first: the 30 newest import days and the weekly snapshot dates
 * (data-layer-retention.ts). The "Chọn lớp dữ liệu" filter shows the newest 5 as quick-pick chips and every
 * older one in a dropdown beside them.
 */
export async function getReportLayerDates(): Promise<string[]> {
  return listSelectableLayerDates(pool);
}

/** The same dates plus, for the ones without an import that day, the import their state comes from. */
export async function getReportLayers(): Promise<SelectableLayers> {
  return listSelectableLayers(pool);
}

/**
 * Generate full Epic Report payload based on project, component, selected layer dates, and date range filters.
 */
export async function generateEpicReport(options: ReportFilterOptions): Promise<ReportResult> {
  const { projectKey, component, stateDate, createdDateFrom, startDateFrom, releasedDateFrom, asOfDate: asOfDateOption, allowedComponents } = options;

  if (!projectKey) {
    throw new Error('Dự án (projectKey) là thông tin bắt buộc.');
  }

  if (!stateDate) {
    throw new Error('Bạn phải chọn 1 Lớp dữ liệu.');
  }

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
      SELECT up.project_id, STRING_AGG(SPLIT_PART(LOWER(u.email), '@', 1), ', ' ORDER BY SPLIT_PART(LOWER(u.email), '@', 1)) AS lead_name
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
      SELECT STRING_AGG(SPLIT_PART(LOWER(u.email), '@', 1), ', ' ORDER BY SPLIT_PART(LOWER(u.email), '@', 1)) AS "leadName"
      FROM user_project_components upc
      JOIN projects p ON p.id = upc.project_id
      JOIN users u ON u.id = upc.user_id
      WHERE LOWER(p.source_project_key) = LOWER($1) AND LOWER(upc.component_name) = LOWER($2);
    `, [projectKey, component]);

    if (compLeadResult.rows[0]?.leadName) {
      pmSmNames = compLeadResult.rows[0].leadName;
    }
  }

  // 2. Fetch each Epic's state at `stateDate`: DISTINCT ON (issue_key) over the rows dated on/before it,
  // newest first.
  const epicsResult = await pool.query<{
    aggregatedAt: string;
    complexity: string | null;
    components: string[] | null;
    /** issues.jira_created_at — used ONLY by the "Epic tạo mới từ" filter below (see jiraCreatedAt). */
    createdFilterDate: string | null;
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
    ttmApplied: string | null;
    exceptTtmPlan: string | null;
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
        COALESCE(idea_approved_date::text, '') AS "ideaApprovedDate",
        COALESCE(request_type, '') AS "epicType",
        -- The real Jira creation date feeds the "Epic tạo mới từ" filter only (createdFilterDate).
        -- jiraCreatedAt, which the TTM-E2E evaluation below takes as a baseline fallback, stays NULL
        -- exactly as before (it used to read a JSON key that never existed): feeding it the real date
        -- would also change which Epics Pass/Fail TTM-E2E in the Report, a separate decision.
        jira_created_at::text AS "createdFilterDate",
        NULL::text AS "jiraCreatedAt",
        ttm_applied AS "ttmApplied",
        except_ttm_plan AS "exceptTtmPlan"
      FROM issues
      WHERE aggregated_at::date <= $1::date
        AND UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
        AND LOWER(SPLIT_PART(issue_key, '-', 1)) = LOWER($2)
      ORDER BY issue_key, aggregated_at DESC
    )
    SELECT * FROM layer_issues;
  `, [stateDate, projectKey]);

  let rows = epicsResult.rows;

  if (allowedComponents && allowedComponents.length > 0) {
    const allowedLower = allowedComponents.map((name) => name.toLowerCase());
    rows = rows.filter((r) => (r.components ?? []).some((c) => allowedLower.includes(c.toLowerCase())));
  }

  // Filter component if specified
  if (component && component !== 'ALL') {
    const compLower = component.toLowerCase();
    rows = rows.filter((r) =>
      r.components ? r.components.some((c) => c.toLowerCase() === compLower) : false
    );
  }

  // Fetch TTM rules & holidays for TTM calculations
  const holidays = await getActiveHolidaySet();

  // Viewing a past "Chọn lớp dữ liệu" layer must judge every Epic as of THAT layer's date, not today —
  // options.asOfDate (set together with an older selectedLayerDates window) pins the date accordingly;
  // the default (no asOfDate) keeps today's real date.
  const asOfDate = toIsoDate(asOfDateOption);
  // Pass/Fail/Sai lệch dữ liệu per Epic come from the Epic Scoring Service (same verdicts as every Epic screen).
  const scoringCtx = await loadScoringContext(asOfDate ?? vnToday());
  const { blackListedEpicKeys } = await loadTtmExclusionSources();

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

    const scorecard: EpicScorecard = scoreEpic({
      epicKey: row.epicKey,
      status: row.status,
      complexity: row.complexity && VALID_COMPLEXITY.has(row.complexity) ? (row.complexity as EpicComplexity) : null,
      ideaApprovedDate: toIsoDate(row.ideaApprovedDate),
      jiraCreatedAt: toIsoDate(row.jiraCreatedAt),
      startDate: toIsoDate(row.startDate),
      r4gDate: toIsoDate(row.r4gDate),
      dueDate: toIsoDate(row.dueDate),
      requestType: row.epicType,
      requirementLevel: row.requirementLevel,
      phaseCompletion: null,
      ttmApplied: normalizeTtmApplied(row.ttmApplied),
      exceptPlanRaw: row.exceptTtmPlan,
      exceptPlanDate: parseExceptPlanDate(row.exceptTtmPlan),
    }, scoringCtx);
    // Reports ignore the "Phạm vi" gate (no out-of-scope table) — verdicts hidden only by it still count.
    const scoredVerdicts = new Set<BadgeId>(scorecard.findings.filter((item) => !item.suppressedBy || item.suppressedBy.every((by) => by === 'SCOPE_CNTT_OUT')).map((item) => item.badge));
    const scoredAnomalies = scorecard.findings.filter((item) => !item.suppressedBy && BADGE_BY_ID.get(item.badge)?.axis === 'DATA_QUALITY' && BADGE_BY_ID.get(item.badge)?.group === 'ALERT');

    // "Sai lệch dữ liệu" — the same Scoring Service verdicts every Epic screen shows. Cancelled Epics are
    // already skipped above; To Do / In PO Epics are exempt inside the rules themselves.
    const isAnomaly = scoredAnomalies.length > 0;
    const anomalyDetails: string[] = scoredAnomalies.map((item) => item.message);

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

    // Pass: the Epic actually reached R4G/Released status AND the Scoring Service says it did so within
    // its TTM budget; TTM-E2E "Pass" additionally needs the status to be Released (see E2E_PASS).
    const ttmCnttPassed = scoredVerdicts.has('CNTT_PASS');
    const ttmE2ePassed = scoredVerdicts.has('E2E_PASS');

    // Fail: the Scoring Service's FAIL verdicts — no separate "wrong status" fail concept.
    let actualCnttFail = false;
    let cnttFailReason: string | null = null;
    const cnttTarget = scorecard.derived.cnttTargetDate;
    if (scoredVerdicts.has('CNTT_FAIL')) {
      actualCnttFail = true;
      cnttFailReason = cnttTarget
        ? `Fail TTM-CNTT (QLDA) (${formatDateVietnamese(row.r4gDate ?? scorecard.asOf)}>${formatDateVietnamese(cnttTarget)})`
        : 'Fail TTM-CNTT (QLDA)';
    }

    let actualE2eFail = false;
    let e2eFailReason: string | null = null;
    const e2eTarget = scorecard.derived.e2eTargetDate;
    if (scoredVerdicts.has('E2E_FAIL')) {
      actualE2eFail = true;
      e2eFailReason = e2eTarget
        ? `Fail TTM-e2e (${formatDateVietnamese(scorecard.derived.e2eEndDate ?? scorecard.asOf)}>${formatDateVietnamese(e2eTarget)})`
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
      ttmBlackListed: blackListedEpicKeys.has(row.epicKey.toUpperCase()),
      ruleGroupName: scorecard.ruleGroup?.name ?? null,
      ruleGroupIsDefault: scorecard.ruleGroup?.isDefault ?? true,
    };

    // Date Range Filters:
    // 1. Epic tạo mới từ (createdDateFrom): Created Date (Jira Created Date || Start E2E) >= createdDateFrom
    // Applies to ALL TABLES (1, 2, 3, 4, 5, 6) — same rule as Quản trị Epic (epic-alert-service.ts)
    const createdDate = row.createdFilterDate || row.ideaApprovedDate || null;
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
      let passType = 'Đạt TTM-CNTT (QLDA)';
      if (ttmCnttPassed && ttmE2ePassed) passType = 'Đạt cả TTM-CNTT (QLDA) & TTM-e2e';
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
    asOfDate,
    componentName: component && component !== 'ALL' ? component : 'Tất cả Component',
    domainName: projMeta.domainName || 'Tất cả Domain',
    evaluatedAt: new Date().toISOString(),
    failedEpics,
    inPoEpics,
    maxLayerDate: stateDate,
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
