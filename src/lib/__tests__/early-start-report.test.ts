import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { earlyStartIndexFlags, listEarlyStartFailEpics, summarizeEarlyStart, type EarlyStartReportRow } from '@/lib/early-start-report';

function row(overrides: Partial<EarlyStartReportRow> = {}): EarlyStartReportRow {
  return {
    alertLevel: 'NONE', currentStatus: 'RELEASED', dataLayerDate: '2026-11-03', domainName: 'Bán lẻ', dueDate: '2026-08-25',
    epicKey: 'A-1', epicName: 'Epic', hasDataAnomaly: false, ownerName: 'PM A', projectKey: 'A', r4gDate: '2026-08-18',
    ruleGroupName: 'Default', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS', 'QA_COUNTED'],
    t0IdeaApprovedDate: '2026-07-20', t1StartDate: '2026-08-03', ttmBlackListed: false, ttmCnttInScope: true, ttmExclusion: null,
    ...overrides,
  };
}

const early = (daysEarly: number, fail: boolean) => ({
  startDate: '2026-08-03', realStartDate: '2026-07-27', daysEarly, cnttTargetDate: '2026-08-14',
  ttm: { counted: true, eligible: true, pass: !fail, fail },
});

describe('Báo cáo Epic start sớm (2026-11-04)', () => {
  it('swaps only the TTM flags of a "Start sớm" Epic', () => {
    assert.deepEqual(earlyStartIndexFlags(row({ scoringEarlyStart: early(7, true) })), ['QA_COUNTED', 'TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_FAIL']);
    assert.deepEqual(earlyStartIndexFlags(row()), row().scoringIndexFlags);
  });

  it('two ratios, and the list of Epics failing from their real start — domain, project, biggest gap first', () => {
    const rows = [
      row({ epicKey: 'B-1', projectKey: 'B', domainName: 'Bán lẻ', scoringEarlyStart: early(3, true) }),
      row({ epicKey: 'A-2', projectKey: 'A', domainName: 'Bán lẻ', scoringEarlyStart: early(2, true) }),
      row({ epicKey: 'A-3', projectKey: 'A', domainName: 'Bán lẻ', scoringEarlyStart: early(9, true) }),
      row({ epicKey: 'C-1', projectKey: 'C', domainName: 'Anh ngữ', scoringEarlyStart: early(1, true) }),
      // Start sớm but still Đạt → not listed.
      row({ epicKey: 'D-1', projectKey: 'D', scoringEarlyStart: early(5, false) }),
      // Fail already, no Start sớm → in both fail counts, not listed.
      row({ epicKey: 'E-1', projectKey: 'E', alertLevel: 'FAIL', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_FAIL'] }),
    ];
    const failed = listEarlyStartFailEpics(rows);
    assert.deepEqual(failed.map((item) => item.epicKey), ['C-1', 'A-3', 'A-2', 'B-1']);
    assert.equal(failed[0].releasedDate, '2026-08-25');
    const summary = summarizeEarlyStart(rows);
    assert.equal(summary.current.pass, 5);
    assert.equal(summary.current.fail, 1);
    assert.equal(summary.earlyStart.pass, 1);
    assert.equal(summary.earlyStart.fail, 5);
    assert.equal(summary.dataLayerDate, '2026-11-03');
  });
});
