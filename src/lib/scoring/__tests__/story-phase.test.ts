import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveMetrics } from '../derive';
import { DEFAULT_SCORING_PARAMETERS } from '../parameters';
import { scoreEpic } from '../score-epic';
import { hasBadge } from '../select';
import { allStoriesReleased, evaluateStoryPhases, isPentestStatusDone, storyPhaseLevel } from '../story-phase';
import type { EpicPhaseCompletionFacts } from '../types';
import { makeContext, makeFacts } from './fixtures';

function completion(storyStatuses: string[], pentestStatus: string | null = null): EpicPhaseCompletionFacts {
  return { designDone: true, r4goliveRecorded: false, storyStatuses, pentestStatus };
}

const evaluate = (storyStatuses: string[], pentestStatus: string | null = null) => evaluateStoryPhases(completion(storyStatuses, pentestStatus), DEFAULT_SCORING_PARAMETERS);

describe('story phase levels', () => {
  it('maps statuses to levels; Cancelled / Pending skipped; unknown → 0', () => {
    assert.equal(storyPhaseLevel('Waiting for Planning'), 0);
    assert.equal(storyPhaseLevel('In Dev'), 1);
    assert.equal(storyPhaseLevel('Dev Done'), 2);
    assert.equal(storyPhaseLevel('Ready for UAT'), 3);
    assert.equal(storyPhaseLevel('PENTEST'), 4);
    assert.equal(storyPhaseLevel('Ready for Golive'), 5);
    assert.equal(storyPhaseLevel('Done'), 6);
    assert.equal(storyPhaseLevel('Pending'), null);
    assert.equal(storyPhaseLevel('Cancelled'), null);
    assert.equal(storyPhaseLevel('Something New'), 0);
    assert.equal(allStoriesReleased(['Released', 'Done', 'Pending']), true);
    assert.equal(allStoriesReleased(['Pending']), false);
  });
});

describe('DEV / TEST by share of Stories', () => {
  it('80 % of Stories past the phase → done', () => {
    const result = evaluate(['DEV DONE', 'IN SIT', 'UAT DONE', 'READY FOR TEST', 'IN DEV']);
    assert.equal(result.done.DEV, true);
    assert.equal(result.done.TEST, false);
    assert.match(result.notes.DEV ?? '', /4\/5 story/);
  });

  it('Pending Stories are skipped (neither counted nor blocking)', () => {
    const result = evaluate(['DEV DONE', 'PENDING']);
    assert.equal(result.done.DEV, true);
    assert.match(result.notes.TEST ?? '', /bỏ qua 1 story Pending/);
  });

  it('≥ 3 Stories with at most 1 behind → done; 2 Stories with 1 behind → not done', () => {
    assert.equal(evaluate(['UAT DONE', 'UAT DONE', 'IN DEV']).done.TEST, true);
    assert.equal(evaluate(['UAT DONE', 'UAT DONE', 'IN DEV']).done.DEV, true);
    assert.match(evaluate(['UAT DONE', 'UAT DONE', 'IN DEV']).notes.TEST ?? '', /dung sai/);
    assert.equal(evaluate(['DEV DONE', 'IN DEV']).done.DEV, false);
  });

  it('no Story left to judge → not done', () => {
    const result = evaluate(['CANCELLED', 'PENDING']);
    assert.equal(result.done.DEV, false);
    assert.match(result.notes.DEV ?? '', /không có story để xét/);
  });

  it('an unknown status counts as not started and is named in the note', () => {
    const result = evaluate(['DEV DONE', 'WEIRD STATUS']);
    assert.equal(result.done.DEV, false);
    assert.match(result.notes.DEV ?? '', /WEIRD STATUS/);
  });
});

describe('PENTEST (owner 2026-11-09: the Epic\'s own epic_pentest_status)', () => {
  it('epic_pentest_status = Done (any case) → PENTEST done; it no longer marks DEV / TEST', () => {
    const result = evaluate(['IN DEV', 'TO DO'], ' done ');
    assert.equal(result.done.PENTEST, true);
    assert.deepEqual([result.done.DEV, result.done.TEST], [false, false]);
    assert.match(result.notes.PENTEST ?? '', /done/);
    assert.equal(isPentestStatusDone('DONE'), true);
    assert.equal(isPentestStatusDone('In Progress'), false);
  });

  it('any other status, or a blank one, keeps PENTEST open even when TEST is done', () => {
    assert.equal(evaluate(['UAT DONE'], 'In Progress').done.PENTEST, false);
    const blank = evaluate(['UAT DONE']);
    assert.equal(blank.done.TEST, true);
    assert.equal(blank.done.PENTEST, false);
    assert.match(blank.notes.PENTEST ?? '', /trống/);
  });
});

describe('current phase (dot)', () => {
  it('first phase not done; none once Released or every phase is done', () => {
    const inTest = deriveMetrics(makeFacts({ phaseCompletion: completion(['IN SIT', 'SIT DONE']) }), makeContext()).phases!;
    assert.equal(inTest.TEST.isCurrent, true);
    const released = deriveMetrics(makeFacts({ status: 'Released', phaseCompletion: { ...completion(['IN DEV']), releasedDone: true } }), makeContext()).phases!;
    assert.ok(Object.values(released).every((cell) => !cell.isCurrent));
    const allDone = deriveMetrics(makeFacts({ phaseCompletion: { ...completion(['UAT DONE'], 'Done'), r4goliveRecorded: true } }), makeContext()).phases!;
    assert.ok(Object.values(allDone).every((cell) => cell.isDone && !cell.isCurrent));
  });

  it('PHASE_DONE carries the Story-share note; a done PENTEST is never late', () => {
    const card = scoreEpic(makeFacts({ phaseCompletion: completion(['UAT DONE', 'UAT DONE'], 'Done') }), makeContext({ asOf: '2026-08-31' }));
    assert.ok(hasBadge(card, 'PHASE_DONE', 'PENTEST'));
    assert.ok(!hasBadge(card, 'PHASE_LATE', 'PENTEST'));
    assert.ok(hasBadge(card, 'PHASE_CURRENT', 'R4GOLIVE'));
  });
});
