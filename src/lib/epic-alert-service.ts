import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel, EpicComplexity } from '@/lib/ttm-rules';
import { RELEASE_DUE_GRACE_WORKING_DAYS } from '@/lib/ttm-rules';
import { evaluateIssueCompliance } from '@/lib/epic-compliance-engine';
import { addWorkingDays, diffWorkingDays, toDateKey } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { getActiveHolidaySet, getDomainByProjectKeyMap, getProjectMetaByProjectKeyMap } from '@/lib/master-data-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import { findActiveTtmPolicy, listTtmPolicies } from '@/lib/ttm-policy-service';
import { getEpicKeysWithCnttAlertRuns } from '@/lib/epic-alert-timeline-service';
import { EPIC_WORKFLOW_STATUS_ORDER, epicWorkflowStatusIndex } from '@/lib/ttm-phase-rules';
import { isCancelledStatus, isPendingStatus } from '@/lib/issue-status-rules';
import { breaksTtmCnttCalculation } from '@/lib/epic-data-anomaly';
import type { EpicAnomalyInput } from '@/lib/epic-data-anomaly';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import type { EpicAlertAccessRole } from '@/lib/epic-alert-types';
import { getTtmScopeConfig } from '@/lib/ttm-scope-config-service';
import { computeQaInScope, computeTtmCnttInScope } from '@/lib/ttm-scope-rules';


// Canonical Epic workflow order (core logic — an Epic moves through these statuses strictly in
// order). "R4G Date" on the Epic is the completion date of R4GOLIVE. Statuses that don't match
// anything here sort after everything — same "already past" convention.
export const STATUS_ORDER = EPIC_WORKFLOW_STATUS_ORDER;

export function statusOrderIndex(status: string): number {
  return epicWorkflowStatusIndex(status);
}

// Cancelled/Pending (core logic, shared across Epic/Story/Subtask) — see issue-status-rules.ts.
export { isCancelledStatus, isPendingStatus };

export interface EpicRow {
  aggregatedAt: string;
  assignee: string | null;
  complexity: EpicComplexity | null;
  /** issues.components — Jira Component/s on the Epic itself (Story-level components don't roll up here). */
  components: string[];
  dueDate: string | null;
  epicKey: string;
  epicName: string;
  epicType: string | null;
  ideaApprovedDate: string | null;
  /** issues.jira_created_at — when the Epic was created in the source Jira system, distinct from startDate (T1). */
  jiraCreatedAt: string | null;
  project: string | null;
  r4gDate: string | null;
  /** "Đơn vị yêu cầu" — issues.requesting_unit, epic rows only (Py Jira API adapter). */
  requestingUnit: string | null;
  requirementLevel: string | null;
  startDate: string | null;
  status: string;
  targetR4gDate: string | null;
}

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date: Date | null): string | null {
  return date ? toDateKey(date) : null;
}

export function missingStandardInfo(row: EpicRow): string[] {
  const missing: string[] = [];
  if (!row.startDate) missing.push('Start Date');
  if (!row.epicType && !row.complexity) missing.push('Epic Type');
  if (!row.ideaApprovedDate) missing.push('T0');
  return missing;
}

// "Epic bị sai lệch dữ liệu" logic now lives in epic-data-anomaly.ts (shared by every screen,
// Báo cáo, Dashboard and the alert timeline). Re-exported here so existing imports keep working.
export { breaksTtmCnttCalculation, breaksTtmE2eCalculation, EPIC_ANOMALY_RULE_INDEX, evaluateEpicDataAnomaly, hasDataAnomaly } from '@/lib/epic-data-anomaly';
export type { EpicAnomalyCode, EpicAnomalyInput, EpicAnomalyViolation } from '@/lib/epic-data-anomaly';

/** Assembles an EpicAnomalyInput from an EpicRow + the resolved TTM-CNTT working-day budget. */
export function toEpicAnomalyInput(
  row: Pick<EpicRow, 'complexity' | 'dueDate' | 'epicType' | 'ideaApprovedDate' | 'jiraCreatedAt' | 'r4gDate' | 'requirementLevel' | 'startDate' | 'status'>,
  ttmCnttWorkingDays: number | null,
): EpicAnomalyInput {
  return {
    dueDate: row.dueDate,
    epicComplexityType: row.complexity,
    ideaApprovedDate: row.ideaApprovedDate,
    jiraCreatedAt: row.jiraCreatedAt,
    r4gDate: row.r4gDate,
    requestType: row.epicType,
    requirementLevel: row.requirementLevel,
    startDate: row.startDate,
    status: row.status,
    ttmCnttWorkingDays,
  };
}

export interface TtmActualRange {
  fromDate: string | null;
  toDate: string | null;
}

/**
 * Range the "stripe thực tế" (actual, bottom strip) of the TTM-CNTT column draws for — shared by
 * every screen with a TTM-CNTT stripe (Quản trị Epic rút gọn/đầy đủ, Epic in PO) so it can never
 * disagree between them. Start is always Start Date (T1), same as the baseline stripe directly
 * above it. End (X):
 * - X = today, when there's no R4G Date yet, R4G Date is still in the future (today < R4G Date), or
 *   R4G Date is chronologically nonsense (before Start Date — a data anomaly, see hasDataAnomaly;
 *   the row is highlighted separately, but the stripe itself still draws start→today rather than
 *   backwards) — the Epic is treated as still ongoing.
 * - X = R4G Date, once today has reached or passed it (and it's not before Start Date).
 * ISO "YYYY-MM-DD" strings compare lexicographically the same as chronologically, so a plain
 * string comparison against R4G Date is exact here (see isPastBaseline's identical convention on
 * the client side).
 */
export function resolveTtmActualRange(
  row: Pick<EpicRow, 'r4gDate' | 'startDate'>,
  now: Date,
): TtmActualRange {
  const todayIso = toIsoDate(now);
  const r4gDateIsChronological = Boolean(row.r4gDate && row.startDate && row.r4gDate >= row.startDate);
  const usesR4gDate = Boolean(r4gDateIsChronological && row.r4gDate && todayIso && row.r4gDate <= todayIso);
  return { fromDate: row.startDate, toDate: usesR4gDate ? row.r4gDate : todayIso };
}

export const RELEASE_BASELINE_SOURCE_LABEL = {
  ideaApproved: 'Idea Approved Date (T0)',
  jiraCreated: 'Ngày tạo trên Jira',
} as const;

export interface TtmE2eRelease {
  /** R4G Date once it's already in the past (<= today), else today — see the 2026-09-24 rule
   * change: TTM-E2E now measures T0 → R4G Date, not T0 → Due Date (Due Date's own discipline is a
   * separate concern, see resolveReleaseAxis below). */
  actualToDate: string | null;
  /** FAIL once actualToDate passes baselineDate — no EARLY/LATE tiers for TTM-E2E. */
  alertLevel: AlertLevel;
  baselineDate: string | null;
  /** T0 itself — Idea Approved Date, else the Epic's Jira creation date. */
  baselineSourceDate: string | null;
  baselineSourceLabel: string | null;
  elapsedWorkingDays: number | null;
}

/** Which recorded date TTM-E2E measures its "stripe thực tế" end point against — configured per
 * (TTM_E2E, complexity) policy row's `to_ttm_field` (Tiêu chí Time to Market screen), instead of a
 * hardcoded field choice. Any value other than 'DUE_DATE' (case/separator-insensitive, matching
 * epic-compliance-engine.ts's fieldDate normalization) falls back to R4G Date — today's default and
 * the only other value this axis has ever used (see the 2026-09-24 rule-change comment below) — so
 * an empty/unrecognized policy field never silently breaks the calculation. */
function resolveTtmE2eEndDateField(row: Pick<EpicRow, 'dueDate' | 'r4gDate'>, toTtmField: string): string | null {
  const normalized = toTtmField.trim().toLocaleUpperCase('en-US').replace(/[ _-]+/g, '');
  return normalized === 'DUEDATE' ? row.dueDate : row.r4gDate;
}

/**
 * TTM-E2E's own baseline/actual pair, shared by every screen that shows a TTM-E2E stripe or its
 * Đạt/Fail badge — same T0 fallback chain "đầy đủ" already used for its Release stage cell (Idea
 * Approved Date → Jira creation date, always resolves, since the Jira `created` field is always
 * present), so a Fail TTM-E2E badge can never disagree with that screen's own TTM-E2E stripe color.
 *
 * 2026-09-24 rule change: TTM-E2E's own end point is now R4G Date instead of Due Date by default —
 * Due Date's discipline against R4G Date (must land within RELEASE_DUE_GRACE_WORKING_DAYS of it) is
 * now a wholly separate axis, see resolveReleaseAxis. Which field this axis actually measures is
 * configurable per complexity via the TTM_E2E policy's `to_ttm_field` (see resolveTtmE2eEndDateField
 * above) — no longer hardcoded, so a future rule change can happen from the "Tiêu chí Time to
 * Market" screen instead of a code change. "Đạt TTM-E2E" (frontend) additionally requires the
 * Epic's status to actually be Released, not just derived here (see each page's isTtmE2eAchieved).
 */
export function resolveTtmE2eRelease(
  row: Pick<EpicRow, 'dueDate' | 'ideaApprovedDate' | 'jiraCreatedAt' | 'r4gDate' | 'status'>,
  ttmE2eTargetWorkingDays: number,
  toTtmField: string,
  now: Date,
  holidays: HolidaySet,
): TtmE2eRelease {
  const ideaApprovedDate = parseDate(row.ideaApprovedDate);
  const [baselineSourceDate, baselineSourceLabel] = ideaApprovedDate
    ? [ideaApprovedDate, RELEASE_BASELINE_SOURCE_LABEL.ideaApproved]
    : [parseDate(row.jiraCreatedAt), RELEASE_BASELINE_SOURCE_LABEL.jiraCreated];
  const baselineDate = baselineSourceDate && ttmE2eTargetWorkingDays ? addWorkingDays(baselineSourceDate, ttmE2eTargetWorkingDays, holidays) : null;
  // "Stripe thực tế" end point (X): the configured end-date field once it's already in the past
  // (<= today) and isn't chronologically nonsense (before T0 — a data anomaly, see hasDataAnomaly),
  // same convention as resolveTtmActualRange's R4G Date handling for TTM-CNTT. Otherwise (not
  // recorded yet, a future date, or an anomalous one) X stays "today", tracking forward live.
  const r4gDate = parseDate(resolveTtmE2eEndDateField(row, toTtmField));
  const r4gDateAlreadyPassed = Boolean(r4gDate && toDateKey(r4gDate) <= toDateKey(now));
  const r4gDateIsChronological = Boolean(r4gDate && baselineSourceDate && r4gDate.getTime() >= baselineSourceDate.getTime());
  const actualToDate = r4gDateAlreadyPassed && r4gDateIsChronological && r4gDate ? r4gDate : now;
  const elapsedWorkingDays = baselineSourceDate ? Math.max(0, diffWorkingDays(baselineSourceDate, actualToDate, holidays)) : null;
  const alertLevel: AlertLevel = !baselineDate || isCancelledStatus(row.status) ? 'NONE' : (actualToDate.getTime() > baselineDate.getTime() ? 'FAIL' : 'NONE');
  return {
    actualToDate: toIsoDate(actualToDate),
    alertLevel,
    baselineDate: toIsoDate(baselineDate),
    baselineSourceDate: baselineSourceDate ? toIsoDate(baselineSourceDate) : null,
    baselineSourceLabel: baselineSourceDate ? baselineSourceLabel : null,
    elapsedWorkingDays,
  };
}

/**
 * "Sai Status" (TTM-CNTT axis): R4G Date is recorded, has already happened (<= today — a future
 * R4G Date is just a plan, not yet an achieved milestone, so there's nothing to flag either way),
 * and is chronologically on schedule against the TTM-CNTT baseline — but the Epic's current Jira
 * status hasn't actually advanced to/past R4GOLIVE yet. Every Epic screen surfaces this instead of
 * "Đạt TTM-CNTT" (see epic-alerts-15/epic-in-po/epic-alerts pages' "Nhận xét" cell), so an Epic can
 * never be praised for reaching a milestone its own workflow status says it hasn't reached, and the
 * actual-progress stripe stays red (with a "*" marker) even though its length is within budget.
 */
export function resolveTtmCnttStatusMismatch(row: Pick<EpicRow, 'r4gDate' | 'status'>, epicStatusIndex: number, targetR4gDate: string | null, todayIso: string): boolean {
  if (!row.r4gDate || !targetR4gDate || row.r4gDate > targetR4gDate) return false;
  if (row.r4gDate > todayIso) return false;
  if (isCancelledStatus(row.status)) return false;
  return epicStatusIndex < statusOrderIndex('R4GOLIVE');
}

export type ReleaseAxisState = 'NONE' | 'WAITING_GOLIVE' | 'EARLY_WARNING' | 'JUSTIFY_GOLIVE';

export interface ReleaseAxisResult {
  /** R4G Date + RELEASE_DUE_GRACE_WORKING_DAYS working days — null until the Epic has an R4G Date. */
  graceDeadline: string | null;
  state: ReleaseAxisState;
}

/**
 * "Trục Release" (company rule, 2026-09-24) — governs the "Chờ golive"/"Cảnh báo sớm"/"Giải trình
 * Golive" badges, entirely separate from the TTM-E2E duration axis (resolveTtmE2eRelease) and from
 * "Sai lệch dữ liệu" (see RELEASE_STATUS_MISMATCH in
 * epic-data-anomaly.ts, which owns the "Due Date on time but status still not Released" case
 * instead of this function):
 *
 * - No R4G Date yet → NONE. This axis doesn't start until the Epic actually has an R4G Date — an
 *   Epic still in DESIGN/DEV/TEST/PENTEST (no R4G Date at all) has nothing to say here, and neither
 *   does one that's somehow past R4GOLIVE without one recorded (a different anomaly's concern).
 * - R4G Date recorded:
 *   - Due Date recorded and later than R4G Date + grace → JUSTIFY_GOLIVE, regardless of status (a
 *     Due Date that badly overshoots the grace period needs explaining even once Released).
 *   - Due Date recorded and within the grace window → NONE here — either genuinely clean (Released)
 *     or the RELEASE_STATUS_MISMATCH anomaly rule owns the badge (status not yet Released).
 *   - No Due Date yet, and today is past R4G Date + grace → JUSTIFY_GOLIVE (stuck with no Due Date
 *     at all past the grace window, regardless of status).
 *   - No Due Date yet, still inside [R4G Date, R4G Date + grace] → WAITING_GOLIVE ("Chờ golive")
 *     while status hasn't advanced past R4GOLIVE yet (still sitting right at that milestone), else
 *     EARLY_WARNING ("Cảnh báo sớm" — status has already moved on, e.g. MVPDONE, but Due Date isn't
 *     recorded yet).
 */
export function resolveReleaseAxis(
  row: Pick<EpicRow, 'dueDate' | 'r4gDate' | 'status'>,
  epicStatusIndex: number,
  now: Date,
  holidays: HolidaySet,
): ReleaseAxisResult {
  if (isCancelledStatus(row.status)) return { graceDeadline: null, state: 'NONE' };

  const r4gDate = parseDate(row.r4gDate);
  if (!r4gDate) return { graceDeadline: null, state: 'NONE' };
  const graceDeadline = toIsoDate(addWorkingDays(r4gDate, RELEASE_DUE_GRACE_WORKING_DAYS, holidays));

  const dueDate = parseDate(row.dueDate);
  if (dueDate && graceDeadline) {
    const dueIso = toIsoDate(dueDate);
    if (dueIso && dueIso > graceDeadline) return { graceDeadline, state: 'JUSTIFY_GOLIVE' };
    return { graceDeadline, state: 'NONE' };
  }

  const todayIso = toIsoDate(now);
  if (graceDeadline && todayIso && todayIso > graceDeadline) return { graceDeadline, state: 'JUSTIFY_GOLIVE' };
  return { graceDeadline, state: epicStatusIndex <= statusOrderIndex('R4GOLIVE') ? 'WAITING_GOLIVE' : 'EARLY_WARNING' };
}

export interface AccessScope {
  accessRole: EpicAlertAccessRole;
  /**
   * Component-level narrowing of a PM/SM's per-project grant (user_project_components) — keyed by
   * source_project_key, same key as EpicRow.project. A project present here with a non-empty list
   * only shows Epics whose `components` intersects it; a granted project absent from this map is
   * unrestricted (full project access) — the pre-existing user_projects behavior, unchanged.
   * Always empty for LEAD/CBQL_PHONG (component narrowing is PM/SM-only, per the permission matrix).
   */
  projectComponents: Map<string, string[]>;
  sourceProjectKeys: string[] | null;
}

export async function resolveAccessScope(userId: number, role: UserRole): Promise<AccessScope> {
  if (role === 'SUPERADMIN' || role === 'SUPERVISOR') return { accessRole: 'CBQL_PHONG', projectComponents: new Map(), sourceProjectKeys: null };
  if (role === 'ADMIN') {
    // Projects of the Domains this Admin manages + projects they are directly PM/SM of (2026-10-04,
    // owner rule from the TTM Dashboard 2 cache spec). Whole projects — component narrowing is PM/SM-only.
    const result = await pool.query<{ sourceProjectKey: string }>(`
      SELECT DISTINCT p.source_project_key AS "sourceProjectKey"
      FROM projects p
      WHERE p.is_active AND (
        p.domain_id IN (SELECT ud.domain_id FROM user_domains ud WHERE ud.user_id = $1)
        OR p.id IN (SELECT up.project_id FROM user_projects up WHERE up.user_id = $1)
      );
    `, [userId]);
    return { accessRole: 'LEAD', projectComponents: new Map(), sourceProjectKeys: result.rows.map((row) => row.sourceProjectKey) };
  }
  const [projectRows, componentRows] = await Promise.all([
    pool.query<{ sourceProjectKey: string }>(`
      SELECT p.source_project_key AS "sourceProjectKey"
      FROM projects p
      JOIN user_projects up ON up.project_id = p.id
      WHERE up.user_id = $1 AND p.is_active;
    `, [userId]),
    pool.query<{ componentName: string; sourceProjectKey: string }>(`
      SELECT p.source_project_key AS "sourceProjectKey", upc.component_name AS "componentName"
      FROM user_project_components upc
      JOIN projects p ON p.id = upc.project_id
      WHERE upc.user_id = $1 AND p.is_active;
    `, [userId]),
  ]);
  const projectComponents = new Map<string, string[]>();
  for (const row of componentRows.rows) {
    projectComponents.set(row.sourceProjectKey, [...(projectComponents.get(row.sourceProjectKey) ?? []), row.componentName]);
  }
  return { accessRole: 'PM_SM', projectComponents, sourceProjectKeys: projectRows.rows.map((row) => row.sourceProjectKey) };
}

export interface EvaluatedEpicEntry {
  complexity: EpicComplexity;
  domain: string;
  epicStatusIndex: number;
  evaluation: ReturnType<typeof evaluateIssueCompliance>;
  hasAlertHistory: boolean;
  pmSmName: string;
  projectName: string;
  /** See resolveReleaseAxis — "Chờ golive"/"Cảnh báo sớm"/"Giải trình Golive" on the Release axis. */
  releaseAxis: ReleaseAxisResult;
  row: EpicRow;
  startDate: Date | null;
  /** See computeTtmCnttInScope (ttm-scope-rules.ts) — "Phạm vi dữ liệu cho TTM" gate. */
  ttmCnttInScope: boolean;
  qaInScope: boolean;
  /** See resolveTtmCnttStatusMismatch — "Sai Status" on the TTM-CNTT axis. */
  ttmCnttStatusMismatch: boolean;
  /** Precomputed once here (shared by every screen) instead of recomputed per consumer. */
  ttmE2eRelease: TtmE2eRelease;
  ttmE2eTarget: number;
}

export interface EpicAlertContext {
  accessRole: EpicAlertAccessRole;
  /** Distinct `issues.aggregated_at` dates in the system, newest first, capped at 365 — the "Chọn
   * lớp dữ liệu" filter shows the newest 5 as quick-pick chips and every older one in a dropdown
   * beside them, so any recorded layer stays reachable. */
  availableLayerDates: string[];
  /** Echoes EpicAlertFilters.asOfDate — the date `now` below was actually pinned to, or null when
   * `now` is the real wall-clock date. */
  asOfDate: string | null;
  entries: EvaluatedEpicEntry[];
  holidays: HolidaySet;
  lastAggregatedAt: string | null;
  now: Date;
  statusAlertRules: Awaited<ReturnType<typeof listActiveStatusAlertRules>>;
  viewerName: string;
}

/**
 * "Bộ lọc nâng cao" on the Epic admin screens (Quản trị Epic rút gọn/đầy đủ, Epic in PO) — same
 * filter set/semantics as the Epic Report's own advanced filters (reports-service.ts), applied to
 * a single flat Epic list instead of the Report's multi-table split.
 */
export interface EpicAlertFilters {
  /** Pins every FAIL/EARLY/LATE, "stripe thực tế" and remaining/elapsed-working-days calculation to
   * this date instead of the real wall-clock date — set together with an OLDER `layerDates` window
   * ("Chọn lớp dữ liệu" drill-down) so viewing a past data layer also evaluates it as of that layer's
   * own date, not today. Omit/null for the default: evaluate as of the real current date. */
  asOfDate?: string | null;
  /** Epic tạo mới từ (Created Date ≥) — compared against jiraCreatedAt, falling back to ideaApprovedDate. */
  createdDateFrom?: string | null;
  /** Epic golive sau (Due Date ≥) — compared against issues.due_date; Epics without one are excluded once set. */
  dueDateFrom?: string | null;
  /** "Chọn lớp dữ liệu" drill-down window: when set, only issues rows whose aggregated_at::date is in
   * this list are considered (newest-per-epic within that window) — omit/null for the default,
   * unrestricted "always latest known row" behavior. */
  layerDates?: string[] | null;
  /** Epic start date từ (Start CNTT / T1 ≥) — compared against issues.start_date; Epics without one are excluded once set. */
  startDateFrom?: string | null;
  /** "Phạm vi dữ liệu cho TTM" override (Dashboard 2's Advanced Filters deep-link) — undefined uses
   * the persisted admin default (ttm-scope-config-service.ts); null/'' is an explicit "no bound"
   * that OVERRIDES the default. See computeTtmCnttInScope/computeQaInScope in ttm-scope-rules.ts.
   * The CNTT and QA axes are independent. */
  ttmScopeCnttFrom?: string | null;
  ttmScopeCnttTo?: string | null;
  ttmScopeQaFrom?: string | null;
  ttmScopeQaTo?: string | null;
}

/**
 * Shared fetch used by every Epic Alerts screen ("Quản trị Epic (rút gọn)", "Quản trị Epic (đầy
 * đủ)", …): resolves access scope, reads each Epic's latest known `issues` row (daily imports are
 * incremental, so no single batch is a complete snapshot — DISTINCT ON + aggregated_at DESC
 * picks up the most recent data per Epic regardless of which day it was last touched), and
 * evaluates TTM compliance once per Epic. `entries` includes every Epic the caller's access scope
 * permits — no status-based visibility rule (Released-without-history, Cancelled, …) is applied
 * here; those are each screen's own concern (see getEpicAlertRows' Released-hide-unless-alerted
 * filter below, which "Quản trị Epic (đầy đủ)" deliberately does not replicate — see
 * getEpicAlertRowsPhased's doc comment).
 */
export interface EpicAlertHeaderContext {
  accessRole: EpicAlertAccessRole;
  availableLayerDates: string[];
  lastAggregatedAt: string | null;
  scope: AccessScope;
  viewerName: string;
}

/** The 3 cheap header-only queries fetchEpicAlertContext also runs (viewer name, latest import
 * batch, layer-date list) plus resolveAccessScope — split out so the epic_alert_row_cache-backed
 * fast path (epic-alert-row-cache-query-service.ts) can populate the screen header without paying
 * for the full per-Epic Epic query + JS computation fetchEpicAlertContext otherwise runs. */
export async function fetchEpicAlertHeaderContext(userId: number, role: UserRole): Promise<EpicAlertHeaderContext> {
  const [scope, viewer, latestBatch, layerDatesResult] = await Promise.all([
    resolveAccessScope(userId, role),
    pool.query<{ fullName: string }>('SELECT full_name AS "fullName" FROM users WHERE id = $1', [userId]),
    pool.query<{ aggregatedAt: string; id: number }>('SELECT id, aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
    pool.query<{ layerDate: string }>('SELECT DISTINCT aggregated_at::date::text AS "layerDate" FROM issues ORDER BY "layerDate" DESC LIMIT 365;'),
  ]);
  return {
    accessRole: scope.accessRole,
    availableLayerDates: layerDatesResult.rows.map((row) => row.layerDate),
    lastAggregatedAt: latestBatch.rows[0]?.aggregatedAt ?? null,
    scope,
    viewerName: viewer.rows[0]?.fullName ?? '',
  };
}

export async function fetchEpicAlertContext(userId: number, role: UserRole, filters: EpicAlertFilters = {}): Promise<EpicAlertContext> {
  const [scope, holidays, domainByProjectKey, projectMetaByProjectKey, statusAlertRules, ttmPolicies, epicKeysWithAlertHistory, viewer, latestBatch, layerDatesResult, ttmScopeConfig] = await Promise.all([
    resolveAccessScope(userId, role),
    getActiveHolidaySet(),
    getDomainByProjectKeyMap(),
    getProjectMetaByProjectKeyMap(),
    listActiveStatusAlertRules(),
    listTtmPolicies(true),
    getEpicKeysWithCnttAlertRuns(),
    pool.query<{ fullName: string }>('SELECT full_name AS "fullName" FROM users WHERE id = $1', [userId]),
    pool.query<{ aggregatedAt: string; id: number }>('SELECT id, aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
    pool.query<{ layerDate: string }>('SELECT DISTINCT aggregated_at::date::text AS "layerDate" FROM issues ORDER BY "layerDate" DESC LIMIT 365;'),
    getTtmScopeConfig(),
  ]);

  const viewerName = viewer.rows[0]?.fullName ?? '';
  const latestAggregatedAt = latestBatch.rows[0]?.aggregatedAt ?? null;
  const availableLayerDates = layerDatesResult.rows.map((row) => row.layerDate);
  // "Phạm vi dữ liệu cho TTM" — a deep-link override (see EpicAlertFilters) replaces the persisted
  // admin default per-axis; `undefined` means "not overridden, use the admin default" while
  // null/'' is a deliberate "no bound" override (see buildEpicAlertsDeepLink's doc comment).
  const effectiveTtmScopeConfig = {
    cnttFrom: filters.ttmScopeCnttFrom !== undefined ? filters.ttmScopeCnttFrom : ttmScopeConfig.cnttFrom,
    cnttTo: filters.ttmScopeCnttTo !== undefined ? filters.ttmScopeCnttTo : ttmScopeConfig.cnttTo,
    qaFrom: filters.ttmScopeQaFrom !== undefined ? filters.ttmScopeQaFrom : ttmScopeConfig.qaFrom,
    qaTo: filters.ttmScopeQaTo !== undefined ? filters.ttmScopeQaTo : ttmScopeConfig.qaTo,
  };
  // Viewing a past "Chọn lớp dữ liệu" layer must evaluate FAIL/EARLY/LATE/stripe/remaining-days as
  // of THAT layer's date, not today — filters.asOfDate (set together with an older layerDates
  // window) pins `now` accordingly; the default (no asOfDate) keeps today's real date.
  const asOfDate = filters.asOfDate ? toIsoDate(parseDate(filters.asOfDate)) : null;
  const now = asOfDate ? (parseDate(asOfDate) ?? new Date()) : new Date();
  const todayIso = toIsoDate(now) ?? '';
  if (!latestAggregatedAt) {
    return { accessRole: scope.accessRole, asOfDate, availableLayerDates, entries: [], holidays, lastAggregatedAt: null, now, statusAlertRules, viewerName };
  }

  const result = await pool.query<EpicRow>(`
    SELECT DISTINCT ON (issues.issue_key)
      issues.issue_key AS "epicKey",
      issues.issue_name AS "epicName",
      issues.current_status AS status,
      issues.epic_complexity_type AS complexity,
      issues.assignee_name AS assignee,
      issues.start_date::text AS "startDate",
      issues.idea_approved_date::text AS "ideaApprovedDate",
      issues.jira_created_at::text AS "jiraCreatedAt",
      issues.r4g_date::text AS "r4gDate",
      issues.target_r4g_date::text AS "targetR4gDate",
      issues.due_date::text AS "dueDate",
      issues.requirement_level AS "requirementLevel",
      issues.requesting_unit AS "requestingUnit",
      issues.aggregated_at::text AS "aggregatedAt",
      COALESCE(issues.components, '{}') AS components,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) AS project,
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'epicType', ''), '') AS "epicType"
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE UPPER(issues.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
      AND ($1::text[] IS NULL OR COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) = ANY($1::text[]))
      AND ($2::date[] IS NULL OR issues.aggregated_at::date = ANY($2::date[]))
    ORDER BY issues.issue_key ASC, issues.aggregated_at DESC
  `, [scope.sourceProjectKeys, filters.layerDates ?? null]);

  const entries: EvaluatedEpicEntry[] = [];

  for (const row of result.rows) {
    const hasAlertHistory = epicKeysWithAlertHistory.has(row.epicKey);
    const epicStatusIndex = statusOrderIndex(row.status);

    // Component-level narrowing (PM/SM only — see resolveAccessScope): a project present in
    // projectComponents only shows Epics whose own components intersect the allowed set. An Epic
    // with no components tagged in Jira is NOT restricted — per the confirmed rule, a blank
    // Component/s field is treated as "general", visible regardless of the user's narrowing.
    const allowedComponents = row.project ? scope.projectComponents.get(row.project) : undefined;
    if (allowedComponents && row.components.length > 0 && !row.components.some((component) => allowedComponents.includes(component))) continue;

    // "Bộ lọc nâng cao" date filters — same semantics as the Epic Report's own filters (see
    // generateEpicReport in reports-service.ts), applied here to the single flat Epic list.
    if (filters.createdDateFrom) {
      const createdDate = row.jiraCreatedAt || row.ideaApprovedDate || null;
      if (!createdDate || createdDate.slice(0, 10) < filters.createdDateFrom) continue;
    }
    if (filters.startDateFrom && (!row.startDate || row.startDate.slice(0, 10) < filters.startDateFrom)) continue;
    if (filters.dueDateFrom && (!row.dueDate || row.dueDate.slice(0, 10) < filters.dueDateFrom)) continue;

    const startDate = parseDate(row.startDate);
    const complexity: EpicComplexity = row.complexity ?? 'CT-Lv12';
    const domain = (row.project && domainByProjectKey.get(row.project)) ?? '';
    const projectMeta = row.project ? projectMetaByProjectKey.get(row.project) : undefined;
    const pmSmName = projectMeta?.leadName ?? '';
    const projectName = projectMeta?.projectName ?? '';

    const evaluation = evaluateIssueCompliance({
      dueDate: row.dueDate,
      epicComplexityType: complexity,
      ideaApprovedDate: row.ideaApprovedDate,
      issueKey: row.epicKey,
      issueType: 'EPIC',
      r4gDate: row.r4gDate,
      startDate: row.startDate,
      status: row.status,
    }, now, holidays, statusAlertRules, ttmPolicies);

    const ttmE2eTarget = evaluation.ttm.e2e.workingDays ?? 0;
    // Falls back to 'R4G_DATE' (today's default) when no active TTM_E2E policy exists for this
    // complexity — see resolveTtmE2eEndDateField's own fallback for unrecognized values too.
    const ttmE2eToField = findActiveTtmPolicy(ttmPolicies, 'TTM_E2E', complexity)?.toTtmField ?? 'R4G_DATE';
    const ttmE2eRelease = resolveTtmE2eRelease(row, ttmE2eTarget, ttmE2eToField, now, holidays);
    // Guarded the same narrow way alertLevel itself is (breaksTtmCnttCalculation) — a row whose
    // underlying calc is already broken (e.g. missing Start Date) shouldn't also claim "Sai Status".
    const ttmCnttStatusMismatch = !breaksTtmCnttCalculation(row) && resolveTtmCnttStatusMismatch(row, epicStatusIndex, evaluation.ttm.cntt.targetDate, todayIso);
    const releaseAxis = resolveReleaseAxis(row, epicStatusIndex, now, holidays);
    const ttmCnttInScope = computeTtmCnttInScope(row.r4gDate, evaluation.ttm.cntt.targetDate, effectiveTtmScopeConfig);
    const qaInScope = computeQaInScope(row.r4gDate, effectiveTtmScopeConfig);

    entries.push({ complexity, domain, epicStatusIndex, evaluation, hasAlertHistory, pmSmName, projectName, qaInScope, releaseAxis, row, startDate, ttmCnttInScope, ttmCnttStatusMismatch, ttmE2eRelease, ttmE2eTarget });
  }

  return { accessRole: scope.accessRole, asOfDate, availableLayerDates, entries, holidays, lastAggregatedAt: latestAggregatedAt, now, statusAlertRules, viewerName };
}

