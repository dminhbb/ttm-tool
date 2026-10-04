import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesAlertFilter, TTM_FUNNEL_BUCKET_BY_FILTER, ttmFunnelBucket } from '../epic-row-verdicts';
import type { TtmFunnelFilterValue } from '../epic-row-verdicts';
import { summarizeQaIndex, summarizeTtmCntt, summarizeTtmCnttFromCounts } from '../ttm-cntt-qa';
import { breakdownIndexes, buildTtmDashboard2FilterOptions, filterTtmDashboard2Rows, hasActiveTtmDashboard2Filter, splitWaitingGolive, summarizeTtmFunnel, TTM_BREAKDOWN_DIMENSIONS, TTM_FUNNEL_CRITERIA, ttmFunnelCnttIndex, ttmFunnelLayers } from '../ttm-funnel-summary';
import { buildEpicAlertsDeepLink } from '../epic-alerts-deep-link';
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
  it('peels off out-of-scope first (not part of L01), then Cancelled, then data anomaly', () => {
    assert.equal(ttmFunnelBucket(row({ currentStatus: 'Cancelled', hasDataAnomaly: true, ttmCnttInScope: false })), 'OUT_OF_SCOPE');
    assert.equal(ttmFunnelBucket(row({ hasDataAnomaly: true, ttmCnttInScope: false })), 'OUT_OF_SCOPE');
    assert.equal(ttmFunnelBucket(row({ ttmCnttInScope: false, r4gDate: '2026-09-01' })), 'OUT_OF_SCOPE');
    assert.equal(ttmFunnelBucket(row({ currentStatus: 'Cancelled', hasDataAnomaly: true })), 'CANCELLED');
    assert.equal(ttmFunnelBucket(row({ hasDataAnomaly: true, alertLevel: 'FAIL' })), 'DATA_ANOMALY');
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
    alertLevel: 'NONE', currentStatus: 'In Progress', domainName: 'D1', epicType: 'CT-Lv12', hasDataAnomaly: false, ownerName: 'An, Bình',
    projectKey: 'P1', projectName: 'Dự án 1', qaInScope: true, r4gDate: null, releaseAxisState: 'NONE', releaseGraceDeadline: null,
    requestingUnit: 'Khối A', scoringBadges: undefined, scoringIndexFlags: undefined, ttmCnttInScope: true, ttmE2eAlertLevel: 'NONE', ...patch,
  });
  const rows = [
    funnelRow({ currentStatus: 'Cancelled' }),
    funnelRow({ hasDataAnomaly: true, projectKey: 'P2', domainName: 'D2', ownerName: 'Chi' }),
    funnelRow({ r4gDate: '2026-09-01' }),
    funnelRow({ r4gDate: '2026-09-01', alertLevel: 'FAIL', requestingUnit: 'Khối B, C' }),
    funnelRow({ alertLevel: 'FAIL', projectKey: 'P2', domainName: 'D2', ownerName: 'Chi' }),
    funnelRow({ requestingUnit: null }),
  ];

  it('criteria add up: L03 = L04a + L04b, L04a = L05aa + L05ab + L05ac, L04b = L05ba + L05bb', () => {
    const summary = summarizeTtmFunnel(rows);
    const { l1, l2, l3, l4a, l4b, l5aa, l5ab, l5ac, l5ba, l5bb } = ttmFunnelLayers(summary);
    assert.deepEqual([l1, l2, l3, l4a, l4b], [6, 5, 4, 2, 2]);
    assert.equal(l3, l4a + l4b);
    assert.equal(l4a, l5aa + l5ab + l5ac);
    assert.equal(l4b, l5ba + l5bb);
    assert.deepEqual(summary.cancelledStatuses, ['Cancelled']);
    assert.deepEqual(summary.scopeStats, { domains: 2, pms: 3, projects: 2, requestingUnits: 2 });
    assert.deepEqual(Object.keys(TTM_FUNNEL_CRITERIA), ['L01', 'L02', 'L03', 'L04a', 'L04b', 'L05aa', 'L05ab', 'L05ac', 'L05ba', 'L05bb']);
  });

  it('Epics outside "Phạm vi dữ liệu cho TTM" are not part of L01 (counted on their own)', () => {
    const withOutside = [...rows, funnelRow({ ttmCnttInScope: false, currentStatus: 'Released', projectKey: 'P9', domainName: 'D9', ownerName: 'Zed' }), funnelRow({ ttmCnttInScope: false, currentStatus: 'Cancelled' })];
    const summary = summarizeTtmFunnel(withOutside);
    assert.equal(summary.total, 6);
    assert.equal(summary.buckets.OUT_OF_SCOPE, 2);
    assert.deepEqual(summary.outOfScopeStatuses, ['Cancelled', 'Released']);
    assert.deepEqual(summary.allStatuses, ['Cancelled', 'In Progress']);
    assert.deepEqual(summary.scopeStats, { domains: 2, pms: 3, projects: 2, requestingUnits: 2 });
    assert.deepEqual(ttmFunnelLayers(summary), ttmFunnelLayers(summarizeTtmFunnel(rows)));
  });

  it('Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba); Tỷ lệ % Fail = (L05ab + L05ba) / same', () => {
    // 3 Đạt, 1 Fail trễ R4G, 1 chưa kết luận (LATE ≠ Đạt/Fail), 1 Fail chưa có R4G, 2 trong hạn,
    // 1 Sai lệch dữ liệu đang FAIL, 1 Cancelled, 1 ngoài phạm vi.
    const sample = [
      funnelRow({ r4gDate: '2026-09-01' }), funnelRow({ r4gDate: '2026-09-02' }), funnelRow({ r4gDate: '2026-09-03' }),
      funnelRow({ r4gDate: '2026-09-01', alertLevel: 'FAIL' }),
      funnelRow({ r4gDate: '2026-09-01', alertLevel: 'LATE' }),
      funnelRow({ alertLevel: 'FAIL' }),
      funnelRow({}), funnelRow({ alertLevel: 'LATE' }),
      funnelRow({ hasDataAnomaly: true, alertLevel: 'FAIL' }),
      funnelRow({ currentStatus: 'Cancelled', r4gDate: '2026-09-01' }),
      funnelRow({ ttmCnttInScope: false, r4gDate: '2026-09-01' }),
    ];
    const index = ttmFunnelCnttIndex(summarizeTtmFunnel(sample));
    assert.deepEqual([index.pass, index.fail, index.denominator, index.eligible], [3, 2, 5, 5]);
    assert.equal(index.pctPrecise, 60);
    assert.equal(index.failPctPrecise, 40);
    // Every TTM-CNTT (QLDA) number in the app comes from the same counts → same ratio as the funnel.
    const fromRows = summarizeTtmCntt(sample);
    assert.deepEqual([fromRows.pass, fromRows.fail, fromRows.denominator, fromRows.pctPrecise, fromRows.failPctPrecise], [3, 2, 5, 60, 40]);
  });

  it('nothing concluded yet → 100% Pass / 0% Fail; scoring rows read the index flags', () => {
    assert.deepEqual([summarizeTtmCnttFromCounts(4, 0, 0, 9).pctPrecise, summarizeTtmCnttFromCounts(4, 0, 0, 9).failPctPrecise], [100, 0]);
    const scored = [
      funnelRow({ r4gDate: '2026-09-01', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS'] }),
      funnelRow({ r4gDate: '2026-12-01', scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE'] }),
      funnelRow({ alertLevel: 'FAIL', scoringIndexFlags: ['TTM_COUNTED', 'TTM_FAIL'] }),
      funnelRow({ scoringIndexFlags: ['TTM_COUNTED'] }),
    ];
    const index = summarizeTtmCntt(scored);
    assert.deepEqual([index.pass, index.fail, index.denominator, index.pctPrecise], [1, 1, 2, 50]);
    assert.equal(ttmFunnelCnttIndex(summarizeTtmFunnel(scored)).pctPrecise, 50);
  });

  describe('insights — widget row, breakdown matrix, pie charts', () => {
    // 2 Đạt (1 Released), 1 không đạt nhóm 1, 1 chưa kết luận, 1 không đạt nhóm 2, 1 trong hạn (LATE),
    // 1 Sai lệch dữ liệu, 1 Cancelled, 1 ngoài phạm vi (Released, vẫn thuộc phạm vi QA).
    const sample = [
      funnelRow({ r4gDate: '2026-09-01', currentStatus: 'Released', epicType: 'SP-Lv34' }),
      funnelRow({ r4gDate: '2026-09-02' }),
      funnelRow({ r4gDate: '2026-09-01', alertLevel: 'FAIL', projectKey: 'P2', projectName: 'Dự án 2', domainName: 'D2', ownerName: 'Chi', requestingUnit: null }),
      funnelRow({ r4gDate: '2026-12-01', alertLevel: 'LATE' }),
      funnelRow({ alertLevel: 'FAIL', projectKey: 'P2', projectName: 'Dự án 2', domainName: 'D2', ownerName: 'Chi' }),
      funnelRow({ alertLevel: 'LATE', epicType: null }),
      funnelRow({ hasDataAnomaly: true }),
      funnelRow({ currentStatus: 'Cancelled', r4gDate: '2026-09-01' }),
      funnelRow({ ttmCnttInScope: false, r4gDate: '2026-09-01', currentStatus: 'Released', projectKey: 'P3', projectName: 'Dự án 3', domainName: 'D3', ownerName: 'Dũng' }),
    ];
    const summary = summarizeTtmFunnel(sample);
    const { l2, l5aa, l5ab, l5ba } = ttmFunnelLayers(summary);

    it('every breakdown adds up to the funnel: Σ total = L02, Σ pass = L05aa, Σ fail = L05ab + L05ba', () => {
      assert.deepEqual([l2, l5aa, l5ab, l5ba, summary.buckets.CANCELLED], [7, 2, 1, 1, 1]);
      for (const dimension of TTM_BREAKDOWN_DIMENSIONS) {
        const items = summary.insights.breakdowns[dimension];
        const sum = (pick: (item: (typeof items)[number]) => number) => items.reduce((total, item) => total + pick(item), 0);
        assert.equal(sum((item) => item.total), l2, `${dimension} total`);
        assert.equal(sum((item) => item.pass), l5aa, `${dimension} pass`);
        assert.equal(sum((item) => item.fail), l5ab + l5ba, `${dimension} fail`);
        assert.equal(sum((item) => item.failLateR4g), l5ab, `${dimension} fail nhóm 1`);
      }
    });

    it('a matrix row: Tổng số Epic = L02, Pass TTM = L05aa, Epic đánh giá = L05aa + L05ab + L05ba, Fail TTM = L05ab + L05ba', () => {
      const p2 = summary.insights.breakdowns.project.find((item) => item.linkValue === 'P2')!;
      assert.deepEqual([p2.name, p2.total, p2.pass, p2.fail, p2.failLateR4g, p2.ok, p2.late], ['Dự án 2', 2, 0, 2, 1, 0, 1]);
      assert.deepEqual([breakdownIndexes(p2).qlda.denominator, breakdownIndexes(p2).qlda.pctPrecise], [2, 0]);
      const p1 = summary.insights.breakdowns.project.find((item) => item.linkValue === 'P1')!;
      // L02 of P1 = 5: 2 Đạt, 1 chưa kết luận, 1 trong hạn đang LATE (chậm), 1 Sai lệch dữ liệu (đúng tiến độ).
      assert.deepEqual([p1.total, p1.pass, p1.fail, p1.ok, p1.late], [5, 2, 0, 1, 1]);
      assert.deepEqual([breakdownIndexes(p1).qlda.denominator, breakdownIndexes(p1).qlda.pctPrecise], [2, 100]);
      // Placeholders carry no Quản trị Epic filter; an unresolved Epic type counts as CT-Lv12.
      assert.equal(summary.insights.breakdowns.requestingUnit.find((item) => item.name === 'Chưa xác định')?.linkValue, null);
      assert.deepEqual(summary.insights.breakdowns.epicType.map((item) => [item.name, item.total]), [['CT-Lv12', 6], ['SP-Lv34', 1]]);
    });

    it('an Epic outside "Phạm vi dữ liệu cho TTM" is in no Tổng số Epic, but still in TTM-CNTT (QA)', () => {
      assert.ok(!summary.insights.breakdowns.project.some((item) => item.linkValue === 'P3' && item.total > 0));
      const p3 = summary.insights.breakdowns.project.find((item) => item.linkValue === 'P3')!;
      assert.deepEqual([p3.total, p3.qaTotal, p3.qaPass], [0, 1, 1]);
      assert.deepEqual([summary.insights.qa.pass, summary.insights.qa.denominator], [2, 2]);
    });

    it('widget row: operational tiles count like TTM Dashboard; Chờ golive is split against today', () => {
      const rows = [
        funnelRow({ releaseAxisState: 'WAITING_GOLIVE' }),
        funnelRow({ releaseAxisState: 'WAITING_GOLIVE', r4gDate: '2026-09-01', releaseGraceDeadline: '2026-09-08' }),
        funnelRow({ releaseAxisState: 'WAITING_GOLIVE', r4gDate: '2026-09-20', releaseGraceDeadline: '2026-09-27' }),
        funnelRow({ releaseAxisState: 'JUSTIFY_GOLIVE', r4gDate: '2026-08-01', alertLevel: 'LATE' }),
        funnelRow({ hasDataAnomaly: true, ttmCnttInScope: false }),
        funnelRow({ currentStatus: 'Cancelled', hasDataAnomaly: true, releaseAxisState: 'WAITING_GOLIVE' }),
      ];
      const { insights } = summarizeTtmFunnel(rows);
      assert.deepEqual([insights.anomalyCount, insights.justifyGolive, insights.lateWarning, insights.waitingGolive.total, insights.scoringEngine], [1, 1, 1, 3, false]);
      assert.deepEqual(splitWaitingGolive(insights.waitingGolive, '2026-09-10'), { missingR4g: 1, overdue: 1, withinGrace: 1 });
      assert.deepEqual(splitWaitingGolive(insights.waitingGolive, '2026-09-30'), { missingR4g: 1, overdue: 2, withinGrace: 0 });
    });

    it('a deep link can list the Epics behind several "Nhận xét" values at once (Fail = nhóm 1 + nhóm 2)', () => {
      const url = buildEpicAlertsDeepLink({ alert: ['TTM_LATE_IN_SCOPE', 'OVERDUE_MISSING_R4G_IN_SCOPE'], projects: ['P2'] });
      assert.equal(new URL(url, 'http://x').searchParams.get('alert'), 'TTM_LATE_IN_SCOPE,OVERDUE_MISSING_R4G_IN_SCOPE');
    });
  });

  it('TTM-CNTT (QA) = the same ratio, only MVP Done / Released Epics inside the QA scope', () => {
    const qaRow = (patch: Partial<Parameters<typeof summarizeQaIndex>[0][number]>) => ({
      alertLevel: 'NONE' as const, currentStatus: 'Released', hasDataAnomaly: false, qaInScope: true, r4gDate: '2026-09-01', scoringIndexFlags: undefined, ...patch,
    });
    const qa = summarizeQaIndex([
      qaRow({}), qaRow({ currentStatus: 'MVP Done' }),
      qaRow({ alertLevel: 'FAIL' }),
      qaRow({ r4gDate: null, alertLevel: 'FAIL' }),
      qaRow({ currentStatus: 'In Progress' }),
      qaRow({ qaInScope: false }),
      qaRow({ hasDataAnomaly: true, alertLevel: 'FAIL' }),
    ]);
    assert.deepEqual([qa.pass, qa.fail, qa.denominator, qa.pctPrecise, qa.failPctPrecise], [2, 2, 4, 50, 50]);
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
