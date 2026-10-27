import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EpicAlertRowPhased } from '../epic-alert-types';
import { GROUP_ORDER, listEpicCommentBadges, packCommentBadges, summarizeEpicComments } from '../epic-comment-groups';

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
    const row = rowOf({ r4gDate: '2026-08-01', scoringBadges: ['CNTT_PASS'] });
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

  it('listEpicCommentBadges returns individual badges with group background colors and omits CNTT_FAIL/CNTT_PASS (already shown in PASS column)', () => {
    const row = rowOf({
      alertLevel: 'FAIL',
      r4gDate: '2026-08-25',
      ttmE2eAlertLevel: 'FAIL',
      scoringBadges: ['REC_MISSING_FAIL_REASON', 'ANOMALY_R2_PENDING_TOO_LONG'],
      scoringFindings: [finding('REC_MISSING_FAIL_REASON'), finding('ANOMALY_R2_PENDING_TOO_LONG')],
      hasDataAnomaly: true,
      dataAnomalyViolations: [{ code: 'MISSING_START_DATE', message: 'Thiếu Start Date (T1)', ruleIndex: 1 }],
    });
    const badges = listEpicCommentBadges(row);
    const byKey = new Map(badges.map((b) => [b.key, b]));
    assert.equal(byKey.has('CNTT_FAIL'), false);
    assert.equal(byKey.get('E2E_FAIL')?.colorClass, 'ttm-comment-cell-orange');
    assert.equal(byKey.get('REC_MISSING_FAIL_REASON')?.colorClass, 'ttm-comment-cell-action');
    assert.equal(byKey.get('ANOMALY_R2_PENDING_TOO_LONG')?.colorClass, 'ttm-comment-cell-warning');
    assert.equal(byKey.get('MISSING_START_DATE:Thiếu Start Date (T1)')?.colorClass, 'ttm-comment-cell-orange');

    const passRow = rowOf({ r4gDate: '2026-08-01', scoringBadges: ['CNTT_PASS', 'E2E_PASS'] });
    const passBadges = listEpicCommentBadges(passRow);
    assert.deepEqual(passBadges.map((b) => b.key), ['E2E_PASS']);
    assert.equal(passBadges[0].colorClass, 'ttm-comment-cell-result');
  });

  it('listEpicCommentBadges includes OUT_OF_SCOPE badge when ttmCnttInScope is false', () => {
    const badges = listEpicCommentBadges(rowOf({ ttmCnttInScope: false }));
    assert.equal(badges.length, 1);
    assert.equal(badges[0].key, 'OUT_OF_SCOPE');
    assert.equal(badges[0].colorClass, 'ttm-comment-badge-out-of-scope');
  });

  it('packCommentBadges never moves a badge ahead of an earlier group (priority order is kept)', () => {
    const packed = packCommentBadges([
      { key: 'S1', label: 'Đạt TTM-E2E', message: '', groupKey: 'RESULT', tone: 'success', colorClass: 'ttm-comment-cell-result' },
      { key: 'L1', label: 'Thiếu phòng chịu TN chính', message: '', groupKey: 'ACTION', tone: 'action', colorClass: 'ttm-comment-cell-action' },
      { key: 'S2', label: 'Sai Status', message: '', groupKey: 'WARNING', tone: 'warning', colorClass: 'ttm-comment-cell-warning' },
    ], 34);
    assert.deepEqual(packed.map((b) => b.key), ['S1', 'L1', 'S2']);
  });

  it('packCommentBadges only swaps badges of the SAME group to fill a line', () => {
    const action = (key: string, label: string) => ({ key, label, message: '', groupKey: 'ACTION' as const, tone: 'action' as const, colorClass: 'ttm-comment-cell-action' });
    const packed = packCommentBadges([
      action('A-short', 'Bổ sung R4G'),
      action('B-long', 'Thiếu phòng chịu trách nhiệm chính'),
      action('C-short', 'Sửa ngày'),
    ], 34);
    assert.deepEqual(packed.map((b) => b.key), ['A-short', 'C-short', 'B-long']);
  });
});
