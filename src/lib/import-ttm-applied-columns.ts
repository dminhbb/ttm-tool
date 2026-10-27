/**
 * Header spellings of the crawl's "TTM-applied" / "except-TTM-plan" Epic fields (2026-10-26), shared by both import
 * adapters and the importer. Pure — no database.
 *
 * A file WITHOUT the column (the Jira UI export, an older crawl file) says nothing about the field: the importer keeps
 * the value the Epic had in its previous version and leaves the black list alone. A file WITH the column but a blank
 * cell does say something — "Theo quy định" (normalizeTtmApplied → STANDARD).
 */

export const TTM_APPLIED_HEADERS = ['TTM-applied', 'ttm_applied', 'epic_ttm_applied'] as const;
export const EXCEPT_TTM_PLAN_HEADERS = ['except-TTM-plan', 'except_ttm_plan', 'epic_except_ttm_plan'] as const;

/** Index of the first header (case-insensitive, trimmed) matching one of `names`, else -1. */
export function headerIndex(headers: readonly string[], names: readonly string[]): number {
  const wanted = names.map((name) => name.toLowerCase());
  return headers.findIndex((header) => wanted.includes(header.trim().toLowerCase()));
}

export interface TtmAppliedColumns {
  hasTtmApplied: boolean;
  hasExceptTtmPlan: boolean;
}

export function ttmAppliedColumnsOf(headers: readonly string[]): TtmAppliedColumns {
  return {
    hasTtmApplied: headerIndex(headers, TTM_APPLIED_HEADERS) >= 0,
    hasExceptTtmPlan: headerIndex(headers, EXCEPT_TTM_PLAN_HEADERS) >= 0,
  };
}
