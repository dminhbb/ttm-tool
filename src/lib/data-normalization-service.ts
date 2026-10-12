import 'server-only';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import {
  brokenRuleIndexes,
  compareEpicKeys,
  NORMALIZATION_PAGE_SIZE,
  NORMALIZATION_RULES,
  paginate,
  type NormalizationEpicRow,
  type NormalizationPanel,
} from '@/lib/data-normalization';
import { getScoringEngineMode, type ScoringEngineMode } from '@/lib/scoring-mode-service';
import { getTtmDashboard2Snapshot } from '@/lib/ttm-dashboard-2-cache-service';
import { loadDashboardEpicRows } from '@/lib/ttm-dashboard-summary-service';
import { filterTtmDashboard2Rows, type TtmDashboard2FilterOptions, type TtmDashboard2Filters } from '@/lib/ttm-funnel-summary';

/**
 * "Chuẩn hoá dữ liệu" — the Epics breaking each "Sai lệch dữ liệu" rule, within the viewer's data
 * scope (resolveAccessScope, through the same row loader as TTM Dashboard 2) and narrowed by the same
 * toolbar filters (filterTtmDashboard2Rows). Cancelled Epics and "Epic ngoại lệ" / non-TTM-project
 * Epics are left out, as in the dashboard: fixing their data doesn't move any TTM number.
 */

export interface DataNormalizationInput {
  filters: TtmDashboard2Filters;
  /** Rule code ('R1'…) → 1-based page; a rule not listed shows page 1. */
  pages: Record<string, number>;
}

export interface DataNormalizationPayload {
  engineMode: ScoringEngineMode;
  filterOptions: TtmDashboard2FilterOptions;
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

export async function getDataNormalization(userId: number, role: UserRole, input: DataNormalizationInput): Promise<DataNormalizationPayload> {
  const [snapshot, loaded, engineMode] = await Promise.all([
    getTtmDashboard2Snapshot(userId, role),
    loadDashboardEpicRows(userId, role),
    getScoringEngineMode(),
  ]);

  const rows = filterTtmDashboard2Rows(loaded.rows, input.filters)
    .filter((row) => !row.ttmBlackListed && !row.ttmExclusion);

  // Rule index → Epics (with the messages of that rule), in Epic-key order.
  const byRule = new Map<number, { messages: string[]; row: (typeof rows)[number] }[]>();
  const sorted = [...rows].sort((a, b) => compareEpicKeys(a.epicKey, b.epicKey));
  const distinct = new Set<string>();
  for (const row of sorted) {
    const broken = brokenRuleIndexes(row.dataAnomalyViolations);
    if (broken.size === 0) continue;
    distinct.add(row.epicKey);
    for (const index of broken) {
      const messages = (row.dataAnomalyViolations ?? []).filter((violation) => brokenRuleIndexes([violation]).has(index)).map((violation) => violation.message);
      const list = byRule.get(index) ?? [];
      list.push({ messages, row });
      byRule.set(index, list);
    }
  }

  const pageOf = NORMALIZATION_RULES.map((rule) => paginate(byRule.get(rule.index) ?? [], input.pages[rule.code] ?? 1));
  const dates = await loadIssueDates([...new Set(pageOf.flatMap((page) => page.rows.map((item) => item.row.epicKey)))]);

  const panels = NORMALIZATION_RULES.map((rule, position): NormalizationPanel => {
    const page = pageOf[position];
    return {
      code: rule.code,
      formula: rule.formula,
      guide: rule.guide,
      inLegacyEngine: rule.inLegacyEngine,
      label: rule.label,
      meaning: rule.meaning,
      page: page.page,
      pageSize: NORMALIZATION_PAGE_SIZE,
      rows: page.rows.map(({ messages, row }): NormalizationEpicRow => {
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
      totalCount: (byRule.get(rule.index) ?? []).length,
      totalPages: page.totalPages,
    };
  });

  return {
    engineMode,
    filterOptions: snapshot.filterOptions,
    lastAggregatedAt: loaded.lastAggregatedAt,
    panels,
    totalEpics: distinct.size,
  };
}
