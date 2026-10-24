import 'server-only';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { loadEpicFacts } from '@/lib/scoring-facts-service';
import { scoreEpic } from '@/lib/scoring/score-epic';
import type { EpicScorecard } from '@/lib/scoring/types';

/** One Epic's scorecard as of today (VN) — used by MCP get_epic_detail. Null when unknown. */
export async function scoreEpicByKey(epicKey: string): Promise<EpicScorecard | null> {
  const asOf = vnToday();
  const [ctx, facts] = await Promise.all([loadScoringContext(asOf), loadEpicFacts(asOf, { epicKeys: [epicKey] })]);
  return facts[0] ? scoreEpic(facts[0], ctx) : null;
}
