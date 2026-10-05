import 'server-only';
import { applyTtmExclusions, loadTtmExclusionSources } from '@/lib/black-listed-epic-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import type { EpicAlertFilters } from '@/lib/epic-alert-service';
import type { EpicAlertPhasedResponse } from '@/lib/epic-alert-types';
import type { UserRole } from '@/lib/auth-types';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { loadEpicFacts } from '@/lib/scoring-facts-service';
import { getScoringEngineMode } from '@/lib/scoring-mode-service';
import { toIsoDate } from '@/lib/scoring/dates';
import { projectRows } from '@/lib/scoring/projection';
import { scoreEpic } from '@/lib/scoring/score-epic';
import type { EpicScorecard, ScoringScopeConfig } from '@/lib/scoring/types';

/** EpicAlertFilters' "Phạm vi dữ liệu cho TTM" deep-link override → ScoringContext override
 * (undefined per field = admin default, null/'' = explicit "no bound"). */
function scopeOverrideOf(filters: EpicAlertFilters): Partial<ScoringScopeConfig> {
  const pick = (value: string | null | undefined) => (value === undefined ? undefined : value || null);
  return {
    cnttFrom: pick(filters.ttmScopeCnttFrom),
    cnttTo: pick(filters.ttmScopeCnttTo),
    qaFrom: pick(filters.ttmScopeQaFrom),
    qaTo: pick(filters.ttmScopeQaTo),
  };
}

/**
 * The Epic row set every screen displays: the legacy pipeline (access scope, visibility, filters,
 * row shape) with — when the display engine is 'scoring' — each row's verdicts replaced by the Epic
 * Scoring Service's, scored at the same data layer(s) and as-of date. Use this instead of calling
 * getEpicAlertRowsPhased directly from any screen/API.
 */
export async function getEpicAlertRowsForDisplay(userId: number, role: UserRole, filters: EpicAlertFilters = {}): Promise<EpicAlertPhasedResponse> {
  const [computed, mode, exclusionSources] = await Promise.all([getEpicAlertRowsPhased(userId, role, filters), getScoringEngineMode(), loadTtmExclusionSources()]);
  // "Epic ngoại lệ" / project Time to Market = N — stamped on for both engines (the legacy row
  // builders don't know about them), so every screen can show the black dot and skip the Epic in TTM.
  const legacy = { ...computed, rows: applyTtmExclusions(computed.rows, exclusionSources) };
  if (mode !== 'scoring' || !legacy.rows.length) return { ...legacy, engineMode: mode };

  const asOf = toIsoDate(filters.asOfDate) ?? vnToday();
  const [ctx, facts] = await Promise.all([
    loadScoringContext(asOf, scopeOverrideOf(filters)),
    loadEpicFacts(asOf, { layerDates: filters.layerDates }),
  ]);
  const wanted = new Set(legacy.rows.map((row) => row.epicKey));
  const cards = new Map<string, EpicScorecard>();
  for (const item of facts) {
    if (wanted.has(item.epicKey)) cards.set(item.epicKey, scoreEpic(item, ctx));
  }
  return { ...legacy, engineMode: mode, rows: projectRows(legacy.rows, cards) };
}
