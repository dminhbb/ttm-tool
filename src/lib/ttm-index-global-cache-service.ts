import pool from '@/lib/db';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { isTtmCnttQaInScope, summarizeTtmCntt } from '@/lib/ttm-cntt-qa';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';

export interface TtmIndexGlobalCache {
  computedAt: string;
  qa: TtmCnttSummary;
  sourceImportBatchId: number | null;
  ttm: TtmCnttSummary;
}

interface TtmIndexGlobalCacheDbRow {
  computedAt: string;
  qaEligible: number;
  qaFail: number;
  qaPass: number;
  qaPctPrecise: string;
  qaTotal: number;
  sourceImportBatchId: number | null;
  ttmEligible: number;
  ttmFail: number;
  ttmPass: number;
  ttmPctPrecise: string;
  ttmTotal: number;
}

function toSummary(eligible: number, pass: number, fail: number, total: number, pctPrecise: string): TtmCnttSummary {
  const precise = Number(pctPrecise);
  return { eligible, fail, pass, pct: Math.round(precise), pctPrecise: precise, total };
}

/** Company-wide TTM-Index (QLDA)/QA-Index (QLDA) — read by every screen that shows the "(QLDA)"
 * (no permission scope) badge. Null before the very first import has ever completed. */
export async function getTtmIndexGlobalCache(): Promise<TtmIndexGlobalCache | null> {
  const result = await pool.query<TtmIndexGlobalCacheDbRow>(`
    SELECT
      computed_at::text AS "computedAt",
      qa_eligible AS "qaEligible", qa_fail AS "qaFail", qa_pass AS "qaPass", qa_pct_precise::text AS "qaPctPrecise", qa_total AS "qaTotal",
      source_import_batch_id AS "sourceImportBatchId",
      ttm_eligible AS "ttmEligible", ttm_fail AS "ttmFail", ttm_pass AS "ttmPass", ttm_pct_precise::text AS "ttmPctPrecise", ttm_total AS "ttmTotal"
    FROM ttm_index_global_cache
    WHERE id = 1;
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    computedAt: row.computedAt,
    sourceImportBatchId: row.sourceImportBatchId,
    qa: toSummary(row.qaEligible, row.qaPass, row.qaFail, row.qaTotal, row.qaPctPrecise),
    ttm: toSummary(row.ttmEligible, row.ttmPass, row.ttmFail, row.ttmTotal, row.ttmPctPrecise),
  };
}

/**
 * Recomputes TTM-Index (QLDA) and QA-Index (QLDA) — the company-wide ratios with no permission
 * scope — and caches them, right after an import commits (see processImport in import-service.ts).
 * Every screen that shows the "(QLDA)" badge reads this cached row instead of re-running the
 * unscoped Epic query on every view: that query (every Epic in the system, ignoring the viewer's
 * own project/domain access) is the heaviest query pattern in this app, and this screen is opened
 * many times a day by everyone — see AGENTS.md's Multi-database section on Aiven's low connection
 * cap, and ALERT_HISTORY_RECORDING_ENABLED (epic-alert-phase-service.ts) for a previous instance of
 * the exact same "load added per page view" problem.
 *
 * role: 'SUPERVISOR' resolves to an unrestricted access scope (sourceProjectKeys: null) without a
 * real user id — see resolveAccessScope in epic-alert-service.ts — so the placeholder userId (0)
 * below is never actually used for scoping.
 *
 * Never throws: a stale/missing cache is far less harmful than failing the import itself, so the
 * caller only logs on failure.
 */
export async function refreshTtmIndexGlobalCache(batchId: number | null): Promise<void> {
  const { rows } = await getEpicAlertRowsPhased(0, 'SUPERVISOR', {});
  const ttm = summarizeTtmCntt(rows);
  const qa = summarizeTtmCntt(rows.filter((row) => isTtmCnttQaInScope(row.currentStatus)));

  await pool.query(
    `
    INSERT INTO ttm_index_global_cache (
      id, ttm_eligible, ttm_pass, ttm_fail, ttm_total, ttm_pct_precise,
      qa_eligible, qa_pass, qa_fail, qa_total, qa_pct_precise,
      source_import_batch_id, computed_at
    ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (id) DO UPDATE SET
      ttm_eligible = EXCLUDED.ttm_eligible,
      ttm_pass = EXCLUDED.ttm_pass,
      ttm_fail = EXCLUDED.ttm_fail,
      ttm_total = EXCLUDED.ttm_total,
      ttm_pct_precise = EXCLUDED.ttm_pct_precise,
      qa_eligible = EXCLUDED.qa_eligible,
      qa_pass = EXCLUDED.qa_pass,
      qa_fail = EXCLUDED.qa_fail,
      qa_total = EXCLUDED.qa_total,
      qa_pct_precise = EXCLUDED.qa_pct_precise,
      source_import_batch_id = EXCLUDED.source_import_batch_id,
      computed_at = NOW();
    `,
    [ttm.eligible, ttm.pass, ttm.fail, ttm.total, ttm.pctPrecise, qa.eligible, qa.pass, qa.fail, qa.total, qa.pctPrecise, batchId],
  );
}
