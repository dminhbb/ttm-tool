/**
 * "Phạm vi dữ liệu cho TTM" — pure date-range gate shared by both server code (epic-alert-service.ts
 * building ttmCnttInScope/qaInScope per row) and the client (Dashboard 2's own live Advanced Filter
 * override, dashboard-new/page.tsx) — kept dependency-free (no `pool`/db import) so the client
 * bundle can import it directly. See ttm-scope-config-service.ts for the persisted admin default.
 *
 * A NULL bound means "no limit on that side"; both bounds NULL (the default, nothing configured)
 * means every Epic is in scope — this feature is fully opt-in and never changes existing behavior
 * until a bound is set, here or via the Dashboard's own override.
 */
export interface TtmScopeConfig {
  cnttFrom: string | null;
  cnttTo: string | null;
  qaFrom: string | null;
  qaTo: string | null;
}

/** True when neither bound is set — the common/default case, where every Epic is in scope
 * regardless of its dates. */
function isUnbounded(from: string | null, to: string | null): boolean {
  return !from && !to;
}

/** `dateIso` and the bounds are all plain "YYYY-MM-DD" (DATE columns / `<input type="date">`
 * values, no time component — see issues.r4g_date/target_r4g_date in db/schema.sql), so
 * lexicographic string comparison is exact. */
function isWithinRange(dateIso: string | null, from: string | null, to: string | null): boolean {
  if (!dateIso) return false;
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

/**
 * "R4G for TTM (CNTT)" gate — A < R4G Date < B once the Epic has one recorded; while it doesn't,
 * A < TTM-CNTT baseline (targetR4gDate — the Start Date + working-day-budget deadline shown as the
 * TTM-CNTT stripe's baseline end) < B instead. An Epic with neither date at all (e.g. missing Start
 * Date, so no baseline can be computed either) is excluded whenever a bound is configured — same
 * "nothing to compare against" convention as the QA gate below.
 */
export function computeTtmCnttInScope(r4gDate: string | null, targetR4gDate: string | null, config: Pick<TtmScopeConfig, 'cnttFrom' | 'cnttTo'>): boolean {
  if (isUnbounded(config.cnttFrom, config.cnttTo)) return true;
  return isWithinRange(r4gDate ?? targetR4gDate, config.cnttFrom, config.cnttTo);
}

/**
 * "R4G for TTM (QA)" gate — C < R4G Date < D. Unlike the CNTT gate above, there is no baseline
 * fallback: an Epic without a recorded R4G Date is excluded from QA scope whenever a bound is
 * configured (confirmed 2026-09-27) — nothing to compare against C/D otherwise.
 */
export function computeQaInScope(r4gDate: string | null, config: Pick<TtmScopeConfig, 'qaFrom' | 'qaTo'>): boolean {
  if (isUnbounded(config.qaFrom, config.qaTo)) return true;
  return isWithinRange(r4gDate, config.qaFrom, config.qaTo);
}
