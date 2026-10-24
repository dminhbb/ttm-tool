import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import type { EpicComplexity } from '@/lib/ttm-rules';
import { getDomainByProjectKeyMap, getProjectMetaByProjectKeyMap } from '@/lib/master-data-service';
import { getEpicKeysWithCnttAlertRuns } from '@/lib/epic-alert-timeline-service';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import type { EpicAlertAccessRole } from '@/lib/epic-alert-types';

/**
 * Who may see which Epics, and each Epic's non-verdict facts (names, dates, project / domain / PM-SM,
 * components). Verdicts — alert levels, badges, anomalies, scope, phases — are not computed here: they come
 * from the Epic Scoring Service (src/lib/scoring), and epic-alert-rows-service.ts lays them out into the
 * rows every screen reads.
 */

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

export function missingStandardInfo(row: EpicRow): string[] {
  const missing: string[] = [];
  if (!row.startDate) missing.push('Start Date');
  if (!row.epicType && !row.complexity) missing.push('Epic Type');
  if (!row.ideaApprovedDate) missing.push('T0');
  return missing;
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

/** One Epic the caller may see: its latest known row plus the metadata every screen shows next to it. */
export interface EpicAlertEntry {
  complexity: EpicComplexity;
  domain: string;
  /** The Epic has at least one Cảnh báo muộn / Fail TTM-CNTT run — the "Released ẩn trừ khi từng có cảnh báo" rule. */
  hasAlertHistory: boolean;
  /** PM/SM of the Epic's project, comma-joined when there are several. */
  pmSmName: string;
  projectName: string;
  row: EpicRow;
}

export interface EpicAlertContext {
  accessRole: EpicAlertAccessRole;
  /** Distinct `issues.aggregated_at` dates in the system, newest first, capped at 365 — the "Chọn
   * lớp dữ liệu" filter shows the newest 5 as quick-pick chips and every older one in a dropdown
   * beside them, so any recorded layer stays reachable. */
  availableLayerDates: string[];
  entries: EpicAlertEntry[];
  lastAggregatedAt: string | null;
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

/**
 * Shared fetch behind every Epic list: resolves the access scope and reads each permitted Epic's latest
 * known `issues` row (daily imports are incremental, so no single batch is a complete snapshot — DISTINCT ON
 * + aggregated_at DESC picks up the most recent data per Epic regardless of which day it was last touched),
 * with the project / domain / PM-SM metadata. No status-based visibility rule is applied here.
 */
export async function fetchEpicAlertContext(userId: number, role: UserRole, filters: EpicAlertFilters = {}): Promise<EpicAlertContext> {
  const [scope, domainByProjectKey, projectMetaByProjectKey, epicKeysWithAlertHistory, viewer, latestBatch, layerDatesResult] = await Promise.all([
    resolveAccessScope(userId, role),
    getDomainByProjectKeyMap(),
    getProjectMetaByProjectKeyMap(),
    getEpicKeysWithCnttAlertRuns(),
    pool.query<{ fullName: string }>('SELECT full_name AS "fullName" FROM users WHERE id = $1', [userId]),
    pool.query<{ aggregatedAt: string; id: number }>('SELECT id, aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
    pool.query<{ layerDate: string }>('SELECT DISTINCT aggregated_at::date::text AS "layerDate" FROM issues ORDER BY "layerDate" DESC LIMIT 365;'),
  ]);

  const viewerName = viewer.rows[0]?.fullName ?? '';
  const latestAggregatedAt = latestBatch.rows[0]?.aggregatedAt ?? null;
  const availableLayerDates = layerDatesResult.rows.map((row) => row.layerDate);
  if (!latestAggregatedAt) {
    return { accessRole: scope.accessRole, availableLayerDates, entries: [], lastAggregatedAt: null, viewerName };
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
        NULLIF(issues.project_key, ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) AS project,
      COALESCE(NULLIF(issues.request_type, ''), '') AS "epicType"
    FROM issues
    WHERE UPPER(issues.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
      AND ($1::text[] IS NULL OR COALESCE(
        NULLIF(issues.project_key, ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) = ANY($1::text[]))
      AND ($2::date[] IS NULL OR issues.aggregated_at::date = ANY($2::date[]))
    ORDER BY issues.issue_key ASC, issues.aggregated_at DESC
  `, [scope.sourceProjectKeys, filters.layerDates ?? null]);

  const entries: EpicAlertEntry[] = [];

  for (const row of result.rows) {
    const hasAlertHistory = epicKeysWithAlertHistory.has(row.epicKey);

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

    const complexity: EpicComplexity = row.complexity ?? 'CT-Lv12';
    const domain = (row.project && domainByProjectKey.get(row.project)) ?? '';
    const projectMeta = row.project ? projectMetaByProjectKey.get(row.project) : undefined;
    entries.push({ complexity, domain, hasAlertHistory, pmSmName: projectMeta?.leadName ?? '', projectName: projectMeta?.projectName ?? '', row });
  }

  return { accessRole: scope.accessRole, availableLayerDates, entries, lastAggregatedAt: latestAggregatedAt, viewerName };
}
