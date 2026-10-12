import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareWithLegacy } from '../parity';
import type { LegacyRowSnapshot } from '../parity';
import { scoreEpic } from '../score-epic';
import { DEFAULT_SCORING_PARAMETERS } from '../parameters';
import { makeContext, makeFacts } from './fixtures';

const cell = { alertLevel: 'NONE' as const, isCurrentStage: false, isDone: false };

function legacyRow(overrides: Partial<LegacyRowSnapshot> = {}): LegacyRowSnapshot {
  return {
    epicKey: 'TEST-1',
    currentStatus: 'Released',
    alertLevel: 'NONE',
    ttmE2eAlertLevel: 'NONE',
    ttmCnttStatusMismatch: false,
    releaseAxisState: 'NONE',
    dataAnomalyViolations: [],
    hasDataAnomaly: false,
    ttmCnttInScope: true,
    qaInScope: true,
    r4gDate: '2026-08-20',
    ttmActualToDate: '2026-08-20',
    ttmE2eActualToDate: '2026-08-20',
    stages: { design: cell, dev: cell, test: cell, pentest: cell, r4golive: cell },
    ...overrides,
  };
}

const OPTIONS = { legacyLiveClock: false, today: '2026-09-01' };

describe('parity with the legacy engine', () => {
  it('D10 (2026-10-11): a Pending Epic whose previous status was To Do / In PO is no longer R5 — an approved difference', () => {
    const ctx = makeContext({ asOf: '2026-09-01' });
    const legacy = legacyRow({
      currentStatus: 'Pending', alertLevel: 'NONE', hasDataAnomaly: true,
      dataAnomalyViolations: [{ code: 'MISSING_REQUIREMENT_LEVEL' }],
      r4gDate: null, ttmActualToDate: null, ttmE2eActualToDate: null,
    });
    const r5Diffs = (previousStatus: string | null) => compareWithLegacy(
      scoreEpic(makeFacts({ status: 'Pending', requirementLevel: '', previousStatus, r4gDate: null, dueDate: null }), ctx), legacy, ctx, OPTIONS,
    ).filter((diff) => diff.check === 'Rule ANOMALY_R5_MISSING_REQUIREMENT_LEVEL');
    const exempt = r5Diffs('To Do');
    assert.equal(exempt.length, 1);
    assert.equal(exempt[0].tag, 'D10_DATA_QUALITY_RULES');
    // Empty or another previous status: the service flags R5 exactly like the legacy engine — no difference.
    assert.equal(r5Diffs(null).length, 0);
    assert.equal(r5Diffs('In Progress').length, 0);
  });

  it('D12: "Epic ngoại lệ" / project Time to Market = N — not counted by the service, an approved difference', () => {
    const ctx = makeContext({ asOf: '2026-09-01' });
    // Đạt in the legacy engine, outside L02 in the service.
    const passed = makeFacts({ status: 'Released', r4gDate: '2026-08-20', dueDate: '2026-08-21', ttmExclusion: 'BLACK_LISTED' });
    const passedDiffs = compareWithLegacy(scoreEpic(passed, ctx), legacyRow(), ctx, OPTIONS).filter((diff) => diff.check.startsWith('TTM-Index'));
    assert.deepEqual(passedDiffs.map((diff) => diff.check), ['TTM-Index: tính', 'TTM-Index: mẫu số', 'TTM-Index: đạt']);
    assert.ok(passedDiffs.every((diff) => diff.tag === 'D12_TTM_EXCLUSION'), JSON.stringify(passedDiffs));

    // Fail without an R4G Date in the legacy engine, project Time to Market = N in the service.
    const failed = makeFacts({ status: 'In Progress', ttmExclusion: 'PROJECT_NON_TTM' });
    const failedDiffs = compareWithLegacy(scoreEpic(failed, ctx), legacyRow({ currentStatus: 'In Progress', alertLevel: 'FAIL', r4gDate: null, ttmActualToDate: null, ttmE2eActualToDate: null }), ctx, OPTIONS)
      .filter((diff) => diff.check.startsWith('TTM-Index'));
    assert.deepEqual(failedDiffs.map((diff) => [diff.check, diff.tag]), [['TTM-Index: tính', 'D12_TTM_EXCLUSION'], ['TTM-Index: fail', 'D12_TTM_EXCLUSION']]);
  });

  it('D12 (2026-10-09): the service does not judge an "Epic ngoại lệ" — every verdict the legacy engine still gives it is that one difference', () => {
    const ctx = makeContext({ asOf: '2026-09-01' });
    const done = { alertLevel: 'NONE' as const, isCurrentStage: false, isDone: true };
    // Legacy: Fail TTM-CNTT + TTM-E2E, Sai lệch dữ liệu, Giải trình golive, phases done / late.
    const legacy = legacyRow({
      currentStatus: 'In Progress', alertLevel: 'FAIL', ttmE2eAlertLevel: 'FAIL', releaseAxisState: 'JUSTIFY_GOLIVE', hasDataAnomaly: true,
      dataAnomalyViolations: [{ code: 'MISSING_REQUEST_TYPE' }],
      r4gDate: null, ttmActualToDate: null, ttmE2eActualToDate: null,
      stages: { design: done, dev: { ...cell, alertLevel: 'LATE', isCurrentStage: true }, test: cell, pentest: cell, r4golive: cell },
    });
    const diffs = compareWithLegacy(scoreEpic(makeFacts({ status: 'In Progress', requestType: '', ttmExclusion: 'BLACK_LISTED' }), ctx), legacy, ctx, OPTIONS);
    const checks = diffs.map((diff) => diff.check);
    for (const expected of ['TTM-CNTT alertLevel', 'TTM-E2E Fail', 'Trục Release', 'Sai lệch dữ liệu', 'Pha DESIGN — Hoàn thành', 'Pha DEV — Trễ', 'Pha DEV — Hiện tại']) {
      assert.ok(checks.includes(expected), `${expected} missing from ${JSON.stringify(checks)}`);
    }
    assert.ok(diffs.every((diff) => diff.tag === 'D12_TTM_EXCLUSION'), JSON.stringify(diffs.filter((diff) => diff.tag !== 'D12_TTM_EXCLUSION')));
  });

  it('the same Epic without an exclusion has no TTM-Index difference', () => {
    const ctx = makeContext({ asOf: '2026-09-01' });
    const facts = makeFacts({ status: 'Released', r4gDate: '2026-08-20', dueDate: '2026-08-21' });
    const diffs = compareWithLegacy(scoreEpic(facts, ctx), legacyRow(), ctx, OPTIONS).filter((diff) => diff.check.startsWith('TTM-Index'));
    assert.deepEqual(diffs, []);
  });

  it('D10 (2026-10-12): a Pending Epic whose previous status was To Do / In PO is no longer R1 — an approved difference whichever way the legacy engine judged it', () => {
    const ctx = makeContext({ asOf: '2026-09-01' });
    const facts = makeFacts({ status: 'Pending', previousStatus: 'In PO', startDate: null, r4gDate: null, dueDate: null });
    const r1Diffs = (legacyFlagsR1: boolean) => compareWithLegacy(
      scoreEpic(facts, ctx),
      legacyRow({
        currentStatus: 'Pending', hasDataAnomaly: legacyFlagsR1, dataAnomalyViolations: legacyFlagsR1 ? [{ code: 'MISSING_START_DATE' }] : [],
        r4gDate: null, ttmActualToDate: null, ttmE2eActualToDate: null,
      }),
      ctx, OPTIONS,
    ).filter((diff) => diff.check === 'Rule ANOMALY_R1_MISSING_START_DATE' || diff.check === 'Sai lệch dữ liệu');
    assert.deepEqual(r1Diffs(true).map((diff) => diff.tag), ['D10_DATA_QUALITY_RULES', 'D10_DATA_QUALITY_RULES']);
    assert.deepEqual(r1Diffs(false), []);
  });

  it('D13: an Epic left out by "Phạm vi rule Sai lệch dữ liệu" is an approved difference, not an unexplained one', () => {
    const scope = (enabled: boolean) => ({
      ...DEFAULT_SCORING_PARAMETERS,
      'anomaly.scopeConfig': { enabled, rules: { ANOMALY_R4_MISSING_REQUEST_TYPE: { enabled: true, createdAfter: '2026-08-01', startAfter: null, r4gAfter: null, dueAfter: null } } },
    });
    const legacy = legacyRow({
      currentStatus: 'In Progress', hasDataAnomaly: true, dataAnomalyViolations: [{ code: 'MISSING_REQUEST_TYPE' }],
      r4gDate: null, ttmActualToDate: null, ttmE2eActualToDate: null,
    });
    const facts = makeFacts({ status: 'In Progress', requestType: '', jiraCreatedAt: '2026-07-01', r4gDate: null, dueDate: null });
    const anomalyDiffs = (enabled: boolean) => {
      const ctx = makeContext({ asOf: '2026-09-01', parameters: scope(enabled) });
      return compareWithLegacy(scoreEpic(facts, ctx), legacy, ctx, OPTIONS).filter((diff) => diff.check === 'Rule ANOMALY_R4_MISSING_REQUEST_TYPE' || diff.check === 'Sai lệch dữ liệu');
    };
    assert.deepEqual(anomalyDiffs(true).map((diff) => diff.tag), ['D13_ANOMALY_SCOPE', 'D13_ANOMALY_SCOPE']);
    // Scope switched off: the service flags R4 like the legacy engine — nothing to explain.
    assert.deepEqual(anomalyDiffs(false), []);
  });
});
