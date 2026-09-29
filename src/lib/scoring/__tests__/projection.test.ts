import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';
import { isTtmCnttAchieved, isTtmIndexPass, matchesAlertFilter } from '@/lib/epic-row-verdicts';
import { summarizeTtmCntt } from '@/lib/ttm-cntt-qa';
import { projectScorecardOntoRow } from '../projection';
import { scoreEpic } from '../score-epic';
import { makeContext, makeFacts } from './fixtures';

const cell: PhaseCell = { alertLevel: 'EARLY', baselineDate: null, baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false };

/** A legacy row carrying deliberately "wrong" verdicts, so the test proves projection overwrites them. */
function legacyRow(overrides: Partial<EpicAlertRowPhased> = {}): EpicAlertRowPhased {
  return {
    alertLevel: 'EARLY',
    currentStatus: 'DEV',
    dataAnomalyViolations: [{ code: 'RELEASE_STATUS_MISMATCH', message: 'R7', ruleIndex: 7 }],
    epicKey: 'TEST-1',
    hasDataAnomaly: true,
    qaInScope: true,
    r4gDate: null,
    releaseAxisState: 'EARLY_WARNING',
    remainingWorkingDays: 99,
    stages: { design: cell, dev: cell, test: cell, pentest: cell, r4golive: cell, release: cell },
    targetR4gDate: null,
    ttmActualToDate: null,
    ttmCnttInScope: true,
    ttmCnttStatusMismatch: false,
    ttmE2eActualToDate: null,
    ttmE2eAlertLevel: 'NONE',
    ...overrides,
  } as EpicAlertRowPhased;
}

describe('projection onto legacy rows (display engine "scoring")', () => {
  it('overwrites every verdict field and removes early warnings', () => {
    const card = scoreEpic(makeFacts(), makeContext({ asOf: '2026-08-31' }));
    const row = projectScorecardOntoRow(legacyRow(), card);
    assert.equal(row.alertLevel, 'FAIL');
    assert.equal(row.releaseAxisState, 'NONE');
    assert.equal(row.hasDataAnomaly, false);
    assert.deepEqual(row.dataAnomalyViolations, []);
    assert.equal(row.targetR4gDate, '2026-08-21');
    assert.equal(row.stages.dev.alertLevel, 'LATE');
    assert.equal(row.stages.design.alertLevel, 'NONE');
    assert.equal(row.stages.design.isDone, true);
    assert.equal(row.stages.dev.isCurrentStage, true);
    assert.ok(row.scoringBadges?.includes('PHASE_LATE:DEV'));
    assert.equal(row.stages.release, cell);
  });

  it('keeps data-quality ALERT badges as legacy violations (R1/R3–R6 only)', () => {
    const card = scoreEpic(makeFacts({ requirementLevel: '', status: 'Pending' }), makeContext({ asOf: '2026-08-31' }));
    const row = projectScorecardOntoRow(legacyRow(), card);
    assert.deepEqual(row.dataAnomalyViolations.map((item) => item.code), ['MISSING_REQUIREMENT_LEVEL']);
    assert.ok(row.scoringBadges?.includes('ANOMALY_R2_PENDING_TOO_LONG'));
  });

  it('Cancelled Epic is never "Đạt TTM-CNTT" (legacy showed it)', () => {
    const cancelled = makeFacts({ status: 'Cancelled', r4gDate: '2026-08-20' });
    const row = projectScorecardOntoRow(legacyRow({ r4gDate: '2026-08-20', ttmActualToDate: '2026-08-20', alertLevel: 'NONE' }), scoreEpic(cancelled, makeContext()));
    assert.equal(isTtmCnttAchieved(row), false);
  });

  it('Sai Status: filter STATUS_MISMATCH matches, ACHIEVED_CNTT does not, Index counts it as not passed', () => {
    const card = scoreEpic(makeFacts({ r4gDate: '2026-08-20', status: 'TEST' }), makeContext());
    const row = projectScorecardOntoRow(legacyRow({ r4gDate: '2026-08-20' }), card);
    assert.ok(matchesAlertFilter(row, 'STATUS_MISMATCH'));
    assert.ok(!matchesAlertFilter(row, 'ACHIEVED_CNTT'));
    assert.ok(!matchesAlertFilter(row, 'EARLY'));
    assert.equal(isTtmIndexPass(row), false);
    const summary = summarizeTtmCntt([row]);
    assert.deepEqual([summary.eligible, summary.pass], [1, 0]);
  });

  it('legacy rows (no scoring fields) keep the legacy formulas', () => {
    const row = legacyRow({ alertLevel: 'NONE', r4gDate: '2026-08-20', ttmActualToDate: '2026-08-20', hasDataAnomaly: false, ttmCnttStatusMismatch: true });
    assert.ok(matchesAlertFilter(row, 'STATUS_MISMATCH'));
    assert.equal(isTtmIndexPass(row), true); // legacy D1 behavior, unchanged in legacy mode
  });
});
