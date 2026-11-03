/**
 * Early warning for the long jobs (cache rebuild, trend refresh, SQL import / export, CSV import): a serverless
 * function that runs past its `maxDuration` is cut mid-way and the minutes are paid for nothing. Every route that
 * sets `maxDuration = 300` shares this budget; a job that used more than 70% of it is logged at warn level, so the
 * Vercel logs show it long before the first job is actually cut. Pure of Next.js; logs only.
 */

export const FUNCTION_BUDGET_MS = 300_000;
export const SLOW_OPERATION_WARN_RATIO = 0.7;

/** True when `elapsedMs` used more than the warning share of the budget. */
export function isSlowOperation(elapsedMs: number, budgetMs: number = FUNCTION_BUDGET_MS): boolean {
  return elapsedMs > budgetMs * SLOW_OPERATION_WARN_RATIO;
}

/** Runs `work`; when it took long (even if it then failed) logs how much of the budget it used. */
export async function withSlowLog<T>(name: string, work: () => Promise<T>, budgetMs: number = FUNCTION_BUDGET_MS): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    const elapsed = Date.now() - startedAt;
    if (isSlowOperation(elapsed, budgetMs)) {
      console.warn(`[slow-operation] ${name} took ${Math.round(elapsed / 1000)}s of the ${Math.round(budgetMs / 1000)}s function budget (${Math.round((elapsed / budgetMs) * 100)}%) — split it or shrink its input before it gets cut.`);
    }
  }
}
