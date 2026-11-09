import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveMetrics } from '../derive';
import { DEFAULT_SCORING_PARAMETERS } from '../parameters';
import { scoreEpic } from '../score-epic';
import { hasBadge } from '../select';
import { allStoriesReleased, evaluateStoryPhases, storyPhaseLevel } from '../story-phase';
import type { EpicPhaseCompletionFacts } from '../types';
import { makeContext, makeFacts } from './fixtures';

function completion(storyStatuses: string[], subtaskCountsByType: EpicPhaseCompletionFacts['subtaskCountsByType'] = {}): EpicPhaseCompletionFacts {
  return { designDone: true, r4goliveRecorded: false, storyStatuses, subtaskCountsByType };
}

const evaluate = (storyStatuses: string[], subtasks: EpicPhaseCompletionFacts['subtaskCountsByType'] = {}) => evaluateStoryPhases(completion(storyStatuses, subtasks), DEFAULT_SCORING_PARAMETERS);

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

describe('PENTEST', () => {
  it('every Pentest subtask Done → DEV, TEST and PENTEST done regardless of Stories', () => {
    const result = evaluate(['IN DEV', 'TO DO'], { 'PEN TEST': { total: 2, done: 2 } });
    assert.deepEqual([result.done.DEV, result.done.TEST, result.done.PENTEST], [true, true, true]);
  });

  it('a Pentest subtask not Done keeps PENTEST open even when TEST is done', () => {
    const result = evaluate(['UAT DONE'], { PENTEST: { total: 1, done: 0 } });
    assert.equal(result.done.TEST, true);
    assert.equal(result.done.PENTEST, false);
  });

  it('Task PENTEST counts with the Pentest subtasks (owner 2026-11-09)', () => {
    const allDone = evaluateStoryPhases({ ...completion(['IN DEV']), pentestTasks: { total: 1, done: 1 } }, DEFAULT_SCORING_PARAMETERS);
    assert.deepEqual([allDone.done.DEV, allDone.done.TEST, allDone.done.PENTEST], [true, true, true]);
    assert.match(allDone.notes.PENTEST ?? '', /1\/1 Done/);
    // A Task PENTEST not Done keeps PENTEST open even when every Pentest subtask is Done.
    const open = evaluateStoryPhases({ ...completion(['UAT DONE'], { PENTEST: { total: 2, done: 2 } }), pentestTasks: { total: 1, done: 0 } }, DEFAULT_SCORING_PARAMETERS);
    assert.equal(open.done.TEST, true);
    assert.equal(open.done.PENTEST, false);
    assert.match(open.notes.PENTEST ?? '', /2\/3 Done/);
  });

  it('no Pentest subtask → PENTEST done together with TEST', () => {
    assert.equal(evaluate(['UAT DONE'], { DEV: { total: 3, done: 3 } }).done.PENTEST, true);
    assert.equal(evaluate(['IN SIT']).done.PENTEST, false);
  });
});

describe('current phase (dot)', () => {
  it('first phase not done; none once Released or every phase is done', () => {
    const inTest = deriveMetrics(makeFacts({ phaseCompletion: completion(['IN SIT', 'SIT DONE']) }), makeContext()).phases!;
    assert.equal(inTest.TEST.isCurrent, true);
    const released = deriveMetrics(makeFacts({ status: 'Released', phaseCompletion: { ...completion(['IN DEV']), releasedDone: true } }), makeContext()).phases!;
    assert.ok(Object.values(released).every((cell) => !cell.isCurrent));
    const allDone = deriveMetrics(makeFacts({ phaseCompletion: { ...completion(['UAT DONE']), r4goliveRecorded: true } }), makeContext()).phases!;
    assert.ok(Object.values(allDone).every((cell) => cell.isDone && !cell.isCurrent));
  });

  it('PHASE_DONE carries the Story-share note; a done PENTEST is never late', () => {
    const card = scoreEpic(makeFacts({ phaseCompletion: completion(['UAT DONE', 'UAT DONE']) }), makeContext({ asOf: '2026-08-31' }));
    assert.ok(hasBadge(card, 'PHASE_DONE', 'PENTEST'));
    assert.ok(!hasBadge(card, 'PHASE_LATE', 'PENTEST'));
    assert.ok(hasBadge(card, 'PHASE_CURRENT', 'R4GOLIVE'));
  });
});
