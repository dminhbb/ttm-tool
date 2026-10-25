import 'server-only';
import pool from '@/lib/db';
import { draftsToScoringRuleGroups } from '@/lib/rule-group-config';
import type { RuleGroupDraft, RuleGroupPreviewResponse, RuleGroupPreviewTotals } from '@/lib/rule-group-config';
import { assertValidRuleGroups, cleanRuleGroupDrafts, readRuleGroupDrafts } from '@/lib/rule-group-service';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { loadEpicFacts } from '@/lib/scoring-facts-service';
import { BADGE_BY_ID } from '@/lib/scoring/catalog';
import { isCancelledStatus } from '@/lib/scoring/derive';
import { scoreEpic } from '@/lib/scoring/score-epic';
import { badgeCodesOf } from '@/lib/scoring/select';
import type { EpicFacts, EpicScorecard } from '@/lib/scoring/types';

function emptyTotals(): RuleGroupPreviewTotals {
  return { ttmPass: 0, ttmFail: 0, qaPass: 0, qaFail: 0, e2ePass: 0, e2eFail: 0, dataAnomaly: 0 };
}

function addToTotals(totals: RuleGroupPreviewTotals, facts: EpicFacts, card: EpicScorecard): void {
  const active = new Set(card.findings.filter((item) => !item.suppressedBy).map((item) => item.badge));
  if (card.indexMembership.ttm.pass) totals.ttmPass += 1;
  if (card.indexMembership.ttm.fail) totals.ttmFail += 1;
  if (card.indexMembership.qa.pass) totals.qaPass += 1;
  if (card.indexMembership.qa.fail) totals.qaFail += 1;
  if (facts.ttmExclusion || isCancelledStatus(facts.status)) return;
  if (active.has('E2E_PASS')) totals.e2ePass += 1;
  if (active.has('E2E_FAIL')) totals.e2eFail += 1;
  if ([...active].some((badge) => BADGE_BY_ID.get(badge)?.axis === 'DATA_QUALITY' && BADGE_BY_ID.get(badge)?.group === 'ALERT')) totals.dataAnomaly += 1;
}

/**
 * "Xem trước tác động" (§10.2): every Epic of the newest data, scored today with the saved configuration and with
 * the draft — Epics per draft group and the TTM-CNTT (QLDA/QA) / TTM-E2E verdict counts before / after. Not limited
 * to a viewer's data scope (SUPERADMIN only). Phase completion is not loaded (the slow story/subtask walk): phases
 * only feed the Phase badges, identical in both configurations, never a verdict.
 */
export async function previewRuleGroups(input: readonly RuleGroupDraft[]): Promise<RuleGroupPreviewResponse> {
  const groups = cleanRuleGroupDrafts(input);
  const asOf = vnToday();
  const [ctx, facts, stored] = await Promise.all([loadScoringContext(asOf), loadEpicFacts(asOf, { withPhaseCompletion: false }), readRuleGroupDrafts(pool).catch(() => [])]);
  assertValidRuleGroups(groups, stored);
  const draftGroups = draftsToScoringRuleGroups(groups);
  const keyById = new Map(draftGroups.map((group, index) => [group.id, groups[index].key]));
  const draftCtx = { ...ctx, ruleGroups: draftGroups };

  const matchedByGroupKey: Record<string, number> = Object.fromEntries(groups.map((group) => [group.key, 0]));
  const current = emptyTotals();
  const draft = emptyTotals();
  let excludedCount = 0;
  let changedEpicCount = 0;
  for (const item of facts) {
    const before = scoreEpic(item, ctx);
    const after = scoreEpic(item, draftCtx);
    addToTotals(current, item, before);
    addToTotals(draft, item, after);
    const key = after.ruleGroup ? keyById.get(after.ruleGroup.id) : undefined;
    if (key) matchedByGroupKey[key] += 1;
    else excludedCount += 1;
    if (badgeCodesOf(before).join(',') !== badgeCodesOf(after).join(',')) changedEpicCount += 1;
  }
  return { asOf, epicCount: facts.length, matchedByGroupKey, excludedCount, current, draft, changedEpicCount };
}
