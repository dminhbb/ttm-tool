import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EpicAlertRowPhased } from '../epic-alert-types';
import { GROUP_ORDER, summarizeEpicComments } from '../epic-comment-groups';

const baseRow = {
  alertLevel: 'NONE', currentStatus: 'In Progress', dataAnomalyViolations: [], hasDataAnomaly: false, r4gDate: null,
  releaseAxisState: 'NONE', releaseGraceDeadline: null, scoringBadges: undefined, scoringFindings: undefined,
  ttmActualToDate: null, ttmCnttInScope: true, ttmCnttStatusMismatch: false, ttmE2eActualToDate: null, ttmE2eAlertLevel: 'NONE',
  ttmExclusion: null,
};
const rowOf = (patch: Record<string, unknown>) => ({ ...baseRow, ...patch }) as unknown as EpicAlertRowPhased;
const finding = (badge: string, message = badge) => ({ badge, message, suppressedBy: undefined });
const countsOf = (row: EpicAlertRowPhased) => summarizeEpicComments(row).groups.map((group) => [group.key, group.items.length]);

describe('"Nhận xét" 1x4 table groups (Quản trị Epic, 2026-10-16)', () => {
  it('groups are always present in the fixed order: Kết quả, Xử lý, Cảnh báo, Sai lệch dữ liệu', () => {
    assert.deepEqual(GROUP_ORDER, ['RESULT', 'ACTION', 'WARNING', 'DATA_ANOMALY']);
    const summary = summarizeEpicComments(rowOf({}));
    assert.deepEqual(summary.groups.map((g) => g.key), ['RESULT', 'ACTION', 'WARNING', 'DATA_ANOMALY']);
  });

  it('an Epic with nothing to say has all 4 groups with 0 items (rendered as "-")', () => {
    const summary = summarizeEpicComments(rowOf({}));
    assert.equal(summary.headline, null);
    assert.deepEqual(countsOf(rowOf({})), [
      ['RESULT', 0],
      ['ACTION', 0],
      ['WARNING', 0],
      ['DATA_ANOMALY', 0],
    ]);
  });

  it('Fail TTM-CNTT and E2E join "Kết quả"; group tone turns red', () => {
    const summary = summarizeEpicComments(rowOf({
      alertLevel: 'FAIL', r4gDate: '2026-08-25', scoringBadges: ['E2E_PASS'],
    }));
    assert.equal(summary.headline?.kind, 'FAIL');
    const resultGroup = summary.groups.find((g) => g.key === 'RESULT')!;
    assert.deepEqual(resultGroup.items.map((item) => item.key), ['CNTT_FAIL', 'E2E_PASS']);
    assert.equal(resultGroup.tone, 'danger');
  });

  it('only passes → "Kết quả" stays green', () => {
    const row = rowOf({ alertLevel: 'NONE', r4gDate: '2026-08-01', ttmActualToDate: '2026-08-01', ttmE2eAlertLevel: 'FAIL' });
    assert.equal(summarizeEpicComments(row).headline?.kind, 'ACHIEVED');
    const passOnly = rowOf({ scoringBadges: ['CNTT_PASS', 'E2E_PASS'] });
    const summary = summarizeEpicComments(passOnly);
    const resultGroup = summary.groups.find((g) => g.key === 'RESULT')!;
    assert.equal(resultGroup.items.length, 2);
    assert.equal(resultGroup.tone, 'success');
  });

  it('outside "Phạm vi dữ liệu cho TTM" no CNTT item is listed in RESULT', () => {
    const summary = summarizeEpicComments(rowOf({ alertLevel: 'FAIL', ttmCnttInScope: false }));
    assert.equal(summary.headline?.kind, 'OUT_OF_SCOPE');
    const resultGroup = summary.groups.find((g) => g.key === 'RESULT')!;
    assert.equal(resultGroup.items.length, 0);
  });

  it('Giải trình Golive is a "Cảnh báo" item and makes the group red; Cảnh báo muộn alone stays orange', () => {
    const justify = summarizeEpicComments(rowOf({ releaseAxisState: 'JUSTIFY_GOLIVE', releaseGraceDeadline: '2026-08-25' }));
    const warningJustify = justify.groups.find((g) => g.key === 'WARNING')!;
    assert.equal(warningJustify.tone, 'danger');
    assert.match(warningJustify.items[0].message, /25\/08\/2026/);

    const late = summarizeEpicComments(rowOf({ alertLevel: 'LATE' }));
    const warningLate = late.groups.find((g) => g.key === 'WARNING')!;
    assert.equal(warningLate.tone, 'warning');
  });

  it('Sai lệch dữ liệu has one item per violated rule, titled from the catalog', () => {
    const summary = summarizeEpicComments(rowOf({
      hasDataAnomaly: true,
      dataAnomalyViolations: [
        { code: 'MISSING_START_DATE', message: 'Thiếu Start Date (T1)', ruleIndex: 1 },
        { code: 'MISSING_REQUIREMENT_LEVEL', message: 'Thiếu Requirement Level', ruleIndex: 5 },
      ],
    }));
    const anomalyGroup = summary.groups.find((g) => g.key === 'DATA_ANOMALY')!;
    assert.equal(anomalyGroup.tone, 'danger');
    assert.deepEqual(anomalyGroup.items.map((item) => item.label), ['R1 — Thiếu Start Date', 'R5 — Thiếu Requirement Level']);
  });

  it('"Xử lý" gathers the missing-reason items and the other recommendations', () => {
    const row = rowOf({
      alertLevel: 'NONE', scoringBadges: ['REC_MISSING_FAIL_REASON', 'REC_MISSING_RESPONSIBLE_DEPARTMENT', 'REC_FILL_START_DATE'],
      scoringFindings: [finding('REC_MISSING_FAIL_REASON'), finding('REC_MISSING_RESPONSIBLE_DEPARTMENT'), finding('REC_FILL_START_DATE')],
    });
    const summary = summarizeEpicComments(row);
    const actionGroup = summary.groups.find((g) => g.key === 'ACTION')!;
    assert.equal(actionGroup.items.length, 3);
    assert.equal(actionGroup.tone, 'action');
  });
});
