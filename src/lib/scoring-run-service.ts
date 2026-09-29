import 'server-only';
import pool from '@/lib/db';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { loadEpicFacts } from '@/lib/scoring-facts-service';
import { compareWithLegacy, summarizeParity } from '@/lib/scoring/parity';
import type { LegacyRowSnapshot, ParitySummary } from '@/lib/scoring/parity';
import { scoreEpic } from '@/lib/scoring/score-epic';
import type { EpicScorecard, ScoringContext } from '@/lib/scoring/types';
import { toDateKey } from '@/lib/working-days';

export interface ScoringRun {
  ctx: ScoringContext;
  cards: Map<string, EpicScorecard>;
}

/** One Epic's scorecard as of today (VN) — used by MCP get_epic_detail. Null when unknown. */
export async function scoreEpicByKey(epicKey: string): Promise<EpicScorecard | null> {
  const asOf = vnToday();
  const [ctx, facts] = await Promise.all([loadScoringContext(asOf), loadEpicFacts(asOf, { epicKeys: [epicKey] })]);
  return facts[0] ? scoreEpic(facts[0], ctx) : null;
}

/** Scores every Epic as known at `asOf`. */
export async function scoreAllEpics(asOf: string): Promise<ScoringRun> {
  const [ctx, facts] = await Promise.all([loadScoringContext(asOf), loadEpicFacts(asOf)]);
  const cards = new Map<string, EpicScorecard>();
  for (const item of facts) cards.set(item.epicKey, scoreEpic(item, ctx));
  return { ctx, cards };
}

function toLegacySnapshot(row: EpicAlertRowPhased): LegacyRowSnapshot {
  const cell = (stage: EpicAlertRowPhased['stages']['design']) => ({ alertLevel: stage.alertLevel, isCurrentStage: stage.isCurrentStage, isDone: stage.isDone });
  return {
    epicKey: row.epicKey,
    currentStatus: row.currentStatus,
    alertLevel: row.alertLevel,
    ttmE2eAlertLevel: row.ttmE2eAlertLevel,
    ttmCnttStatusMismatch: row.ttmCnttStatusMismatch,
    releaseAxisState: row.releaseAxisState,
    dataAnomalyViolations: row.dataAnomalyViolations,
    hasDataAnomaly: row.hasDataAnomaly,
    ttmCnttInScope: row.ttmCnttInScope,
    qaInScope: row.qaInScope,
    r4gDate: row.r4gDate,
    ttmActualToDate: row.ttmActualToDate,
    ttmE2eActualToDate: row.ttmE2eActualToDate,
    stages: { design: cell(row.stages.design), dev: cell(row.stages.dev), test: cell(row.stages.test), pentest: cell(row.stages.pentest), r4golive: cell(row.stages.r4golive) },
  };
}

function compareRun(run: ScoringRun, legacyRows: EpicAlertRowPhased[], legacyLiveClock: boolean): ParitySummary {
  const results = legacyRows.flatMap((row) => {
    const card = run.cards.get(row.epicKey);
    if (!card) return [{ epicKey: row.epicKey, diffs: [{ check: 'Có trong Scoring Service', legacy: 'true', scoring: 'false', tag: 'UNEXPLAINED' as const }] }];
    return [{ epicKey: row.epicKey, diffs: compareWithLegacy(card, toLegacySnapshot(row), run.ctx, { legacyLiveClock, today: vnToday() }) }];
  });
  return summarizeParity(run.ctx.asOf, results);
}

export interface ParityRunRecord {
  id: number;
  asOf: string;
  source: string;
  rulesetVersion: string;
  epicCount: number;
  identicalEpics: number;
  intentionalOnlyEpics: number;
  unexplainedEpics: number;
  summary: ParitySummary;
  durationMs: number | null;
  computedAt: string;
  triggeredByName: string | null;
}

async function recordParityRun(summary: ParitySummary, source: string, rulesetVersion: string, durationMs: number, userId: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO scoring_parity_runs (as_of, source, ruleset_version, epic_count, identical_epics, intentional_only_epics, unexplained_epics, summary, duration_ms, triggered_by_user_id)
     VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10);`,
    [summary.asOf, source, rulesetVersion, summary.epicCount, summary.identicalEpics, summary.epicsWithIntentionalDiffsOnly, summary.epicsWithUnexplainedDiffs, JSON.stringify(summary), durationMs, userId],
  );
}

/**
 * Shadow scoring for the cache refresh: scores today's (VN) data for the cache columns, and records
 * a parity run against the legacy rows the refresh just computed. The legacy rows use the server's
 * live clock, so parity scores at that clock's date (differs from the VN date only between 00:00 and
 * 07:00 VN on a UTC server — decision D2, still to be verified). Never throws: shadow scoring must
 * not break the legacy cache.
 */
export async function runShadowScoring(legacyRows: EpicAlertRowPhased[]): Promise<Map<string, EpicScorecard> | null> {
  const startedAt = Date.now();
  try {
    const today = vnToday();
    const run = await scoreAllEpics(today);
    const legacyDate = toDateKey(new Date());
    const parityRun = legacyDate === today ? run : await scoreAllEpics(legacyDate);
    const summary = compareRun(parityRun, legacyRows, true);
    await recordParityRun(summary, 'cache-refresh', run.ctx.rulesetVersion, Date.now() - startedAt, null);
    return run.cards;
  } catch (error: unknown) {
    console.error('Shadow scoring failed (legacy cache unaffected):', error);
    return null;
  }
}

/** On-demand parity for any date (SUPERADMIN tool). A past date compares against the legacy engine
 * pinned to that date's data layers ("Chọn lớp dữ liệu" semantics). */
export async function runParityForDate(asOf: string, userId: number | null): Promise<ParitySummary> {
  const startedAt = Date.now();
  const today = vnToday();
  const historical = asOf < today;
  let legacyRows: EpicAlertRowPhased[];
  let scoringDate = asOf;
  if (historical) {
    const layers = await pool.query<{ layerDate: string }>('SELECT DISTINCT aggregated_at::date::text AS "layerDate" FROM issues WHERE aggregated_at::date <= $1::date;', [asOf]);
    legacyRows = (await getEpicAlertRowsPhased(0, 'SUPERVISOR', { asOfDate: asOf, layerDates: layers.rows.map((row) => row.layerDate) })).rows;
  } else {
    legacyRows = (await getEpicAlertRowsPhased(0, 'SUPERVISOR', {})).rows;
    scoringDate = toDateKey(new Date());
  }
  const run = await scoreAllEpics(scoringDate);
  // A pinned asOfDate becomes `new Date('YYYY-MM-DD')` (UTC midnight) in the legacy engine: on a
  // UTC server that is exactly local midnight, elsewhere it carries a time of day like the live clock.
  const legacyLiveClock = !historical || new Date(asOf).getTimezoneOffset() !== 0;
  const summary = compareRun(run, legacyRows, legacyLiveClock);
  await recordParityRun(summary, historical ? 'manual-historical' : 'manual', run.ctx.rulesetVersion, Date.now() - startedAt, userId);
  return summary;
}

export async function listParityRuns(limit = 10): Promise<ParityRunRecord[]> {
  const result = await pool.query<ParityRunRecord>(`
    SELECT r.id, r.as_of::text AS "asOf", r.source, r.ruleset_version AS "rulesetVersion", r.epic_count AS "epicCount",
      r.identical_epics AS "identicalEpics", r.intentional_only_epics AS "intentionalOnlyEpics", r.unexplained_epics AS "unexplainedEpics",
      r.summary, r.duration_ms AS "durationMs", r.computed_at::text AS "computedAt", u.full_name AS "triggeredByName"
    FROM scoring_parity_runs r
    LEFT JOIN users u ON u.id = r.triggered_by_user_id
    ORDER BY r.computed_at DESC
    LIMIT $1;
  `, [limit]);
  return result.rows;
}
