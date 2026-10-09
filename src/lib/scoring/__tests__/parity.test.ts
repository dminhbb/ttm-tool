import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareWithLegacy } from '../parity';
import type { LegacyRowSnapshot } from '../parity';
import { scoreEpic } from '../score-epic';
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
});
