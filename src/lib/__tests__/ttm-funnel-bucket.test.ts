import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesAlertFilter, TTM_FUNNEL_BUCKET_BY_FILTER, ttmFunnelBucket } from '../epic-row-verdicts';
import type { TtmFunnelFilterValue } from '../epic-row-verdicts';

type Row = Parameters<typeof ttmFunnelBucket>[0];

const base: Row = {
  alertLevel: 'NONE',
  currentStatus: 'In Progress',
  hasDataAnomaly: false,
  r4gDate: null,
  scoringIndexFlags: undefined,
  ttmCnttInScope: true,
};
const row = (patch: Partial<Row>): Row => ({ ...base, ...patch });

describe('ttmFunnelBucket (TTM Dashboard 2 funnel)', () => {
  it('peels off Cancelled, then data anomaly, then out-of-scope — in that order', () => {
    assert.equal(ttmFunnelBucket(row({ currentStatus: 'Cancelled', hasDataAnomaly: true, ttmCnttInScope: false })), 'CANCELLED');
    assert.equal(ttmFunnelBucket(row({ hasDataAnomaly: true, ttmCnttInScope: false })), 'DATA_ANOMALY');
    assert.equal(ttmFunnelBucket(row({ ttmCnttInScope: false, r4gDate: '2026-09-01' })), 'OUT_OF_SCOPE');
  });

  it('splits R4G Epics into Đạt / Fail trễ R4G / Chưa chấm (legacy rows)', () => {
    assert.equal(ttmFunnelBucket(row({ r4gDate: '2026-09-01', alertLevel: 'NONE' })), 'R4G_PASS');
    assert.equal(ttmFunnelBucket(row({ r4gDate: '2026-09-01', alertLevel: 'FAIL' })), 'R4G_LATE');
    assert.equal(ttmFunnelBucket(row({ r4gDate: '2026-09-01', alertLevel: 'LATE' })), 'R4G_NOT_SCORED');
  });

  it('uses the TTM_PASS index flag for scoring rows — a future R4G Date is neither Đạt nor Fail', () => {
    assert.equal(ttmFunnelBucket(row({ r4gDate: '2026-10-09', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS'] })), 'R4G_PASS');
    assert.equal(ttmFunnelBucket(row({ r4gDate: '2026-10-09', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE'] })), 'R4G_NOT_SCORED');
    assert.equal(ttmFunnelBucket(row({ r4gDate: '2026-08-01', alertLevel: 'FAIL', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE'] })), 'R4G_LATE');
  });

  it('splits Epics without R4G Date into Quá Target / Trong hạn', () => {
    assert.equal(ttmFunnelBucket(row({ alertLevel: 'FAIL' })), 'NO_R4G_OVERDUE');
    assert.equal(ttmFunnelBucket(row({ alertLevel: 'LATE' })), 'NO_R4G_WITHIN_TARGET');
    assert.equal(ttmFunnelBucket(row({ alertLevel: 'NONE' })), 'NO_R4G_WITHIN_TARGET');
  });

  it('each funnel "Nhận xét" filter matches exactly the rows of its own bucket', () => {
    const samples: Row[] = [
      row({}), row({ alertLevel: 'FAIL' }), row({ r4gDate: '2026-09-01' }), row({ r4gDate: '2026-09-01', alertLevel: 'FAIL' }),
      row({ r4gDate: '2026-09-01', alertLevel: 'LATE' }), row({ ttmCnttInScope: false }), row({ hasDataAnomaly: true }),
      row({ currentStatus: 'Cancelled' }),
    ];
    for (const [filter, bucket] of Object.entries(TTM_FUNNEL_BUCKET_BY_FILTER) as [TtmFunnelFilterValue, string][]) {
      for (const sample of samples) {
        const verdictRow = { ...sample, releaseAxisState: null, releaseGraceDeadline: null, scoringBadges: undefined, scoringFindings: undefined, ttmActualToDate: null, ttmCnttStatusMismatch: false, ttmE2eActualToDate: null, ttmE2eAlertLevel: 'NONE' } as unknown as Parameters<typeof matchesAlertFilter>[0];
        assert.equal(matchesAlertFilter(verdictRow, filter), ttmFunnelBucket(sample) === bucket, `${filter} on ${JSON.stringify(sample)}`);
      }
    }
  });
});
