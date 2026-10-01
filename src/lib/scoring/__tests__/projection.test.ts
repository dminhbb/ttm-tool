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

  it('Sai Status: filters STATUS_MISMATCH and ACHIEVED_CNTT both match, Index counts it as passed', () => {
    const card = scoreEpic(makeFacts({ r4gDate: '2026-08-20', status: 'TEST' }), makeContext());
    const row = projectScorecardOntoRow(legacyRow({ r4gDate: '2026-08-20' }), card);
    assert.ok(matchesAlertFilter(row, 'STATUS_MISMATCH'));
    assert.ok(matchesAlertFilter(row, 'ACHIEVED_CNTT'));
    assert.ok(row.ttmCnttStatusMismatch && isTtmCnttAchieved(row));
    assert.ok(!matchesAlertFilter(row, 'EARLY'));
    assert.equal(isTtmIndexPass(row), true);
    const summary = summarizeTtmCntt([row]);
    assert.deepEqual([summary.eligible, summary.pass], [1, 1]);
  });

  it('legacy rows (no scoring fields) keep the legacy formulas', () => {
    const row = legacyRow({ alertLevel: 'NONE', r4gDate: '2026-08-20', ttmActualToDate: '2026-08-20', hasDataAnomaly: false, ttmCnttStatusMismatch: true });
    assert.ok(matchesAlertFilter(row, 'STATUS_MISMATCH'));
    assert.equal(isTtmIndexPass(row), true); // legacy D1 behavior, unchanged in legacy mode
  });
});

describe('"Chờ golive" + "Giải trình Golive" on the same Epic (rule 2026-10-01)', () => {
  it('both badges are readable although releaseAxisState keeps only one', async () => {
    const { isJustifyGolive, isWaitingGolive, waitingGoliveBucket } = await import('@/lib/epic-row-verdicts');
    const card = scoreEpic(makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-08-20' }), makeContext({ asOf: '2026-09-15' }));
    const row = projectScorecardOntoRow(legacyRow({ r4gDate: '2026-08-20' }), card);
    assert.equal(row.releaseAxisState, 'JUSTIFY_GOLIVE');
    assert.ok(isWaitingGolive(row) && isJustifyGolive(row));
    assert.equal(waitingGoliveBucket(row, '2026-09-15'), 'OVERDUE');
    assert.equal(waitingGoliveBucket(row, '2026-08-21'), 'WITHIN_GRACE');
    assert.ok(matchesAlertFilter(row, 'WAITING_GOLIVE') && matchesAlertFilter(row, 'JUSTIFY_GOLIVE'));
  });
});

describe('"Fail TTM" split (Ma trận Phân bổ)', () => {
  it('Trễ R4G (in the denominator) vs Thiếu R4G (outside it)', async () => {
    const { ttmFailKind } = await import('@/lib/epic-row-verdicts');
    const lateR4g = projectScorecardOntoRow(legacyRow({ r4gDate: '2026-08-24' }), scoreEpic(makeFacts({ r4gDate: '2026-08-24', status: 'R4GOLIVE' }), makeContext()));
    const noR4g = projectScorecardOntoRow(legacyRow(), scoreEpic(makeFacts(), makeContext({ asOf: '2026-08-31' })));
    assert.equal(ttmFailKind(lateR4g), 'LATE_R4G');
    assert.ok(lateR4g.scoringIndexFlags?.includes('TTM_ELIGIBLE'));
    assert.equal(ttmFailKind(noR4g), 'MISSING_R4G');
    assert.ok(!noR4g.scoringIndexFlags?.includes('TTM_ELIGIBLE'));
    assert.ok(matchesAlertFilter(lateR4g, 'FAIL_LATE_R4G') && !matchesAlertFilter(lateR4g, 'FAIL_MISSING_R4G'));
    assert.ok(matchesAlertFilter(noR4g, 'FAIL_MISSING_R4G') && matchesAlertFilter(noR4g, 'FAIL'));
  });
});
