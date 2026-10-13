import 'server-only';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import {
  compareEpicKeys,
  describeNormalizationPanel,
  NORMALIZATION_PAGE_SIZE,
  NORMALIZATION_PANELS,
  normalizationPanelsOf,
  paginate,
  type NormalizationEpicRow,
  type NormalizationPanel,
} from '@/lib/data-normalization';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import type { ScoringEngineMode } from '@/lib/scoring-mode-service';
import { isOutsideTtmCalculation } from '@/lib/ttm-cntt-qa';
import { getTtmDashboard2Snapshot } from '@/lib/ttm-dashboard-2-cache-service';
import { loadDashboardEpicRows } from '@/lib/ttm-dashboard-summary-service';
import { buildTtmDashboard2FilterOptions, filterTtmDashboard2Rows, type TtmDashboard2FilterOptions, type TtmDashboard2Filters } from '@/lib/ttm-funnel-summary';

/**
 * "Chuẩn hoá dữ liệu" — the Epics breaking each rule of the screen (data-normalization.ts), within
 * the viewer's data scope (resolveAccessScope, through the same row loader as TTM Dashboard 2) and
 * narrowed by the same toolbar filters (filterTtmDashboard2Rows). Cancelled Epics and "Epic ngoại lệ"
 * / non-TTM-project Epics are left out, as in the dashboard: fixing their data doesn't move any TTM
 * number.
 *
 * Kept light on purpose — the screen calls this on every filter change, page click and panel opened:
 * only the Epics that can be in a panel are read from the row cache, the filter options are sent once
 * (first load), and Epic rows + their Jira dates only for the panels the caller has open.
 */

export interface DataNormalizationInput {
  filters: TtmDashboard2Filters;
  /** true on the screen's first load; later calls reuse the options they already hold. */
  includeFilterOptions: boolean;
  /** Panel codes whose Epic rows to return (the expanded panels); the others only get their count. */
  openPanels: readonly string[];
  /** Panel code ('R1'…) → 1-based page; a panel not listed shows page 1. */
  pages: Record<string, number>;
}

export interface DataNormalizationPayload {
  engineMode: ScoringEngineMode;
  /** null unless `includeFilterOptions` was asked. */
  filterOptions: TtmDashboard2FilterOptions | null;
  lastAggregatedAt: string | null;
  panels: NormalizationPanel[];
  /** Distinct Epics in at least one panel — an Epic in several panels counts once. */
  totalEpics: number;
}

interface IssueDates {
  createdDate: string | null;
  dueDate: string | null;
  epicKey: string;
  ideaApprovedDate: string | null;
  r4gDate: string | null;
  startDate: string | null;
}

/** Raw dates of the newest data layer of each Epic — what the owner has to fix on Jira. */
async function loadIssueDates(epicKeys: readonly string[]): Promise<Map<string, IssueDates>> {
  if (epicKeys.length === 0) return new Map();
  const result = await pool.query<IssueDates>(
    `
    SELECT DISTINCT ON (issue_key)
      issue_key AS "epicKey",
      jira_created_at::date::text AS "createdDate",
      idea_approved_date::text AS "ideaApprovedDate",
      start_date::text AS "startDate",
      r4g_date::text AS "r4gDate",
      due_date::text AS "dueDate"
    FROM issues
    WHERE issue_key = ANY($1::text[])
    ORDER BY issue_key, aggregated_at DESC;
    `,
    [[...epicKeys]],
  );
  return new Map(result.rows.map((row) => [row.epicKey, row]));
}

/**
 * The toolbar options of the viewer's whole scope — the same ones TTM Dashboard 2 offers. From the
 * dashboard's per-scope cache when the rows came from the row cache; on the live path the rows just
 * loaded ARE the whole scope, so the options are built from them instead of running the full Epic
 * computation a second time.
 */
async function loadFilterOptions(userId: number, role: UserRole, loaded: { fromCache: boolean; rows: readonly DashboardEpicRow[] }): Promise<TtmDashboard2FilterOptions> {
  if (loaded.fromCache) return (await getTtmDashboard2Snapshot(userId, role)).filterOptions;
  return buildTtmDashboard2FilterOptions(loaded.rows, (await resolveAccessScope(userId, role)).projectComponents);
}

export async function getDataNormalization(userId: number, role: UserRole, input: DataNormalizationInput): Promise<DataNormalizationPayload> {
  // Cancelled Epics come along (the live path's rows double as the source of the filter options, which
  // cover them like the dashboard's) and are dropped right below.
  const loaded = await loadDashboardEpicRows(userId, role, { includeCancelled: true, needsNormalizationOnly: true });
  const filterOptions = input.includeFilterOptions ? await loadFilterOptions(userId, role, loaded) : null;

  // Panel code → its Epics (with the messages for that panel), in Epic-key order.
  const byPanel = new Map<string, { messages: string[]; row: DashboardEpicRow }[]>();
  const matched: { panels: Map<string, string[]>; row: DashboardEpicRow }[] = [];
  for (const row of filterTtmDashboard2Rows(loaded.rows, input.filters)) {
    if (isOutsideTtmCalculation(row)) continue;
    const panels = normalizationPanelsOf(row);
    if (panels.size > 0) matched.push({ panels, row });
  }
  matched.sort((a, b) => compareEpicKeys(a.row.epicKey, b.row.epicKey));
  for (const { panels, row } of matched) {
    for (const [code, messages] of panels) {
      const list = byPanel.get(code) ?? [];
      list.push({ messages, row });
      byPanel.set(code, list);
    }
  }

  const open = new Set(input.openPanels);
  const pageOf = NORMALIZATION_PANELS.map((panel) => paginate(byPanel.get(panel.code) ?? [], input.pages[panel.code] ?? 1));
  const dates = await loadIssueDates([...new Set(
    NORMALIZATION_PANELS.flatMap((panel, position) => (open.has(panel.code) ? pageOf[position].rows.map((item) => item.row.epicKey) : [])),
  )]);

  const panels = NORMALIZATION_PANELS.map((panel, position): NormalizationPanel => {
    const page = pageOf[position];
    const rowsLoaded = open.has(panel.code);
    return {
      code: panel.code,
      guide: panel.guide,
      inLegacyEngine: panel.inLegacyEngine,
      label: panel.label,
      ...describeNormalizationPanel(panel, loaded.engineMode),
      page: page.page,
      pageSize: NORMALIZATION_PAGE_SIZE,
      rows: !rowsLoaded ? [] : page.rows.map(({ messages, row }): NormalizationEpicRow => {
        const issue = dates.get(row.epicKey);
        return {
          createdDate: issue?.createdDate ?? null,
          dueDate: issue?.dueDate ?? row.dueDate ?? null,
          epicKey: row.epicKey,
          epicName: row.epicName,
          ideaApprovedDate: issue?.ideaApprovedDate ?? null,
          r4gDate: issue?.r4gDate ?? row.r4gDate ?? null,
          startDate: issue?.startDate ?? null,
          status: row.currentStatus,
          violations: messages,
        };
      }),
      rowsLoaded,
      tag: panel.tag,
      totalCount: (byPanel.get(panel.code) ?? []).length,
      totalPages: page.totalPages,
    };
  });

  return {
    engineMode: loaded.engineMode,
    filterOptions,
    lastAggregatedAt: loaded.lastAggregatedAt,
    panels,
    totalEpics: matched.length,
  };
}
