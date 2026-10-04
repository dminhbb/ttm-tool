import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesAlertFilter, TTM_FUNNEL_BUCKET_BY_FILTER, ttmFunnelBucket } from '../epic-row-verdicts';
import type { TtmFunnelFilterValue } from '../epic-row-verdicts';
import { buildTtmDashboard2FilterOptions, filterTtmDashboard2Rows, hasActiveTtmDashboard2Filter, summarizeTtmFunnel, ttmFunnelLayers } from '../ttm-funnel-summary';
import type { TtmFunnelRow } from '../ttm-funnel-summary';

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

describe('TTM Dashboard 2 summary (cache ↔ filtered recompute share these)', () => {
  const funnelRow = (patch: Partial<TtmFunnelRow>): TtmFunnelRow => ({
    alertLevel: 'NONE', currentStatus: 'In Progress', domainName: 'D1', hasDataAnomaly: false, ownerName: 'An, Bình',
    projectKey: 'P1', r4gDate: null, requestingUnit: 'Khối A', scoringIndexFlags: undefined, ttmCnttInScope: true, ...patch,
  });
  const rows = [
    funnelRow({ currentStatus: 'Cancelled' }),
    funnelRow({ hasDataAnomaly: true, projectKey: 'P2', domainName: 'D2', ownerName: 'Chi' }),
    funnelRow({ r4gDate: '2026-09-01' }),
    funnelRow({ r4gDate: '2026-09-01', alertLevel: 'FAIL', requestingUnit: 'Khối B, C' }),
    funnelRow({ alertLevel: 'FAIL', projectKey: 'P2', domainName: 'D2', ownerName: 'Chi' }),
    funnelRow({ requestingUnit: null }),
  ];

  it('layers add up: L3 = L4A + L4B + L4C', () => {
    const summary = summarizeTtmFunnel(rows);
    const { l1, l2, l3, l4a, l4b } = ttmFunnelLayers(summary);
    assert.deepEqual([l1, l2, l3, l4a, l4b], [6, 5, 4, 2, 2]);
    assert.equal(l3, l4a + l4b + summary.buckets.OUT_OF_SCOPE);
    assert.deepEqual(summary.cancelledStatuses, ['Cancelled']);
    assert.deepEqual(summary.scopeStats, { domains: 2, pms: 3, projects: 2, requestingUnits: 2 });
  });

  it('filters match TTM Dashboard 2 toolbar semantics (PM/SM is any of a comma-joined owner list)', () => {
    const none = { domain: '', pmSms: [], projects: [], requestingUnits: [] };
    assert.equal(hasActiveTtmDashboard2Filter(none), false);
    assert.equal(filterTtmDashboard2Rows(rows, { ...none, pmSms: ['Bình'] }).length, 4);
    assert.equal(filterTtmDashboard2Rows(rows, { ...none, domain: 'D2' }).length, 2);
    assert.equal(filterTtmDashboard2Rows(rows, { ...none, requestingUnits: ['Khối B, C'] }).length, 1);
    assert.equal(filterTtmDashboard2Rows(rows, { ...none, projects: ['P1'], requestingUnits: ['Khối A'] }).length, 2);
  });

  it('filter options cover the whole scope, domain → its projects', () => {
    const options = buildTtmDashboard2FilterOptions(rows);
    assert.deepEqual(options.domainProjectKeys, { D1: ['P1'], D2: ['P2'] });
    assert.deepEqual(options.pmSms, ['An', 'Bình', 'Chi']);
    assert.deepEqual(options.requestingUnits, ['Khối A', 'Khối B, C']);
  });
});
