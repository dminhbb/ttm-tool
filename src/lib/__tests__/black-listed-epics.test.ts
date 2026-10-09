import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BLACK_LIST_FORMAT_EXAMPLE, formatBlackListText, parseBlackListText, projectKeyOfEpicKey } from '../black-listed-epics-format';
import { matchesAlertFilter, ttmFunnelBucket } from '../epic-row-verdicts';
import { summarizeE2e, summarizeQaIndex, summarizeTtmCntt } from '../ttm-cntt-qa';
import { summarizeTtmFunnel, ttmFunnelCnttIndex, ttmFunnelLayers } from '../ttm-funnel-summary';
import type { TtmFunnelRow } from '../ttm-funnel-summary';
import { hasBadge, indexFlagsOf } from '../scoring/select';
import { scoreEpic } from '../scoring/score-epic';
import { makeContext, makeFacts } from '../scoring/__tests__/fixtures';

describe('"Epic ngoại lệ" text format', () => {
  it('parses the documented example: one project per line, Epics separated by ","', () => {
    const { entries, errors } = parseBlackListText(BLACK_LIST_FORMAT_EXAMPLE);
    assert.deepEqual(errors, []);
    assert.deepEqual(entries, [
      { epicKey: 'PAMS-1234', projectKey: 'PAMS' }, { epicKey: 'PAMS-5678', projectKey: 'PAMS' },
      { epicKey: 'ALM-23455', projectKey: 'ALM' }, { epicKey: 'ALM-294759', projectKey: 'ALM' },
    ]);
  });

  it('ignores blank lines, tolerates blanks around tokens, and upper-cases keys', () => {
    const { entries, errors } = parseBlackListText('\n  pams : pams-1 , PAMS-2\r\n\nA1B:A1B-7\n');
    assert.deepEqual(errors, []);
    assert.deepEqual(entries.map((entry) => entry.epicKey), ['PAMS-1', 'PAMS-2', 'A1B-7']);
  });

  it('points at the exact characters at fault', () => {
    const find = (text: string) => parseBlackListText(text).errors.map((error) => [error.line, error.columnStart, error.columnEnd, error.excerpt]);
    // no ":" → the whole line
    assert.deepEqual(find('PAMS PAMS-1'), [[1, 1, 11, 'PAMS PAMS-1']]);
    // "-" in the project key
    assert.deepEqual(find('PA-MS:PA-MS-1'), [[1, 1, 5, 'PA-MS']]);
    // a bad Epic key in the middle of line 2, the rest of the line still checked
    assert.deepEqual(find('ALM:ALM-1\nPAMS:PAMS-1,PAMS_2,ALM-3'), [[2, 13, 18, 'PAMS_2'], [2, 20, 24, 'ALM-3']]);
    // missing Epic between two commas / after a trailing comma
    assert.deepEqual(find('PAMS:PAMS-1,,PAMS-2,'), [[1, 13, 13, ','], [1, 21, 21, '']]);
    // nothing after ":"
    assert.equal(parseBlackListText('PAMS:').errors.length, 1);
    // nothing before ":"
    assert.equal(parseBlackListText(':PAMS-1').errors[0].columnStart, 1);
  });

  it('rejects a project declared on two lines and an Epic declared twice', () => {
    const { entries, errors } = parseBlackListText('PAMS:PAMS-1,PAMS-1\nPAMS:PAMS-2');
    assert.deepEqual(entries.map((entry) => entry.epicKey), ['PAMS-1']);
    assert.deepEqual(errors.map((error) => [error.line, error.excerpt]), [[1, 'PAMS-1'], [2, 'PAMS']]);
  });

  it('writes the stored list back in the same format (projects A→Z, Epics by number)', () => {
    const text = formatBlackListText([
      { epicKey: 'PAMS-5678', projectKey: 'PAMS' }, { epicKey: 'ALM-294759', projectKey: 'ALM' },
      { epicKey: 'PAMS-99', projectKey: 'PAMS' }, { epicKey: 'ALM-23455', projectKey: 'ALM' },
    ]);
    assert.equal(text, 'ALM:ALM-23455,ALM-294759\nPAMS:PAMS-99,PAMS-5678');
    assert.deepEqual(parseBlackListText(text).errors, []);
    assert.equal(formatBlackListText([]), '');
  });

  it('reads the project key off an Epic key', () => {
    assert.equal(projectKeyOfEpicKey('pams-12'), 'PAMS');
    assert.equal(projectKeyOfEpicKey('PAMS'), null);
    assert.equal(projectKeyOfEpicKey('PA-MS-1'), null);
  });
});

describe('L02 leaves out "Epic ngoại lệ" and non-TTM-project Epics (owner rule 2026-10-05)', () => {
  const funnelRow = (patch: Partial<TtmFunnelRow>): TtmFunnelRow => ({
    alertLevel: 'NONE', currentStatus: 'In Progress', domainName: 'D1', epicType: 'CT-Lv12', hasDataAnomaly: false, ownerName: 'An',
    projectKey: 'P1', projectName: 'Dự án 1', qaInScope: true, r4gDate: null, releaseAxisState: 'NONE', releaseGraceDeadline: null,
    requestingUnit: 'Khối A', scoringBadges: undefined, scoringIndexFlags: undefined, ttmCnttInScope: true, ttmE2eAlertLevel: 'NONE',
    ttmExclusion: null, ...patch,
  });

  it('buckets: out of scope → Cancelled → black listed → non-TTM project → the rest', () => {
    assert.equal(ttmFunnelBucket(funnelRow({ ttmExclusion: 'BLACK_LISTED', ttmCnttInScope: false })), 'OUT_OF_SCOPE');
    assert.equal(ttmFunnelBucket(funnelRow({ ttmExclusion: 'BLACK_LISTED', currentStatus: 'Cancelled' })), 'CANCELLED');
    assert.equal(ttmFunnelBucket(funnelRow({ ttmExclusion: 'BLACK_LISTED', hasDataAnomaly: true })), 'BLACK_LISTED');
    assert.equal(ttmFunnelBucket(funnelRow({ ttmExclusion: 'PROJECT_NON_TTM', r4gDate: '2026-09-01' })), 'PROJECT_NON_TTM');
    assert.equal(ttmFunnelBucket(funnelRow({ r4gDate: '2026-09-01' })), 'R4G_PASS');
  });

  const rows = [
    funnelRow({ r4gDate: '2026-09-01' }),                                             // Đạt
    funnelRow({ alertLevel: 'FAIL' }),                                                // Fail, chưa có R4G
    funnelRow({ currentStatus: 'Cancelled' }),
    funnelRow({ r4gDate: '2026-09-01', ttmExclusion: 'BLACK_LISTED' }),               // would be Đạt
    funnelRow({ alertLevel: 'FAIL', ttmExclusion: 'BLACK_LISTED' }),                  // would be Fail
    funnelRow({ r4gDate: '2026-09-01', alertLevel: 'FAIL', ttmExclusion: 'PROJECT_NON_TTM', projectKey: 'P2', projectName: 'Dự án 2' }),
  ];

  it('L02 = L01 − Cancelled − Epic ngoại lệ − dự án Time to Market = N, and the ratio follows', () => {
    const summary = summarizeTtmFunnel(rows);
    const { l1, l2, l3, l5aa, l5ba } = ttmFunnelLayers(summary);
    assert.deepEqual([l1, l2, l3, l5aa, l5ba], [6, 2, 2, 1, 1]);
    assert.deepEqual([summary.buckets.CANCELLED, summary.buckets.BLACK_LISTED, summary.buckets.PROJECT_NON_TTM], [1, 2, 1]);
    const index = ttmFunnelCnttIndex(summary);
    assert.deepEqual([index.pass, index.fail, index.denominator, index.total], [1, 1, 2, 2]);
    // The matrix: project P2 only has an excluded Epic, so it has no row at all.
    assert.deepEqual(summary.insights.breakdowns.project.map((item) => [item.name, item.total, item.pass, item.fail]), [['Dự án 1', 2, 1, 1]]);
  });

  it('TTM Dashboard 2 widgets (2026-10-09): Cảnh báo, Sai lệch, Chờ golive, Giải trình leave "Epic ngoại lệ" out', () => {
    // One of each widget, counted — and the same four as exceptions (2 black listed, 2 of a Time to Market = N project).
    const flagged: Partial<TtmFunnelRow>[] = [
      { alertLevel: 'LATE' },
      { hasDataAnomaly: true },
      { releaseAxisState: 'WAITING_GOLIVE', r4gDate: '2026-09-01', releaseGraceDeadline: '2026-09-08' },
      { releaseAxisState: 'JUSTIFY_GOLIVE', r4gDate: '2026-08-01' },
    ];
    const counted = flagged.map((patch) => funnelRow(patch));
    const exceptions = flagged.map((patch, index) => funnelRow({ ...patch, ttmExclusion: index % 2 === 0 ? 'BLACK_LISTED' : 'PROJECT_NON_TTM' }));
    const widgets = (list: TtmFunnelRow[]) => {
      const { insights } = summarizeTtmFunnel(list);
      return [insights.lateWarning, insights.anomalyCount, insights.waitingGolive.total, insights.justifyGolive];
    };
    assert.deepEqual(widgets(counted), [1, 1, 1, 1]);
    assert.deepEqual(widgets([...counted, ...exceptions]), [1, 1, 1, 1]);
    assert.deepEqual(widgets(exceptions), [0, 0, 0, 0]);
    // The matrix and the pie charts: a group made of exceptions only has no row.
    assert.deepEqual(summarizeTtmFunnel(exceptions).insights.breakdowns.project, []);
  });

  it('the row-based TTM-CNTT (QLDA), TTM-CNTT (QA) and TTM-E2E ratios skip them too', () => {
    const ttm = summarizeTtmCntt(rows);
    assert.deepEqual([ttm.total, ttm.pass, ttm.fail], [2, 1, 1]);
    const released = rows.map((row) => ({ ...row, currentStatus: row.currentStatus === 'Cancelled' ? row.currentStatus : 'Released' }));
    assert.equal(summarizeQaIndex(released).total, 2);
    assert.equal(summarizeE2e(released).total, 2);
    // Scoring rows: an excluded row is skipped even if its flags still say "counted".
    const flagged = rows.map((row) => ({ ...row, scoringIndexFlags: ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS'] }));
    assert.equal(summarizeTtmCntt(flagged).total, 3);
  });

  it('"Nhận xét" filters: L02 lists exactly the counted Epics; each dropped group has its own list', () => {
    const verdictRow = (row: TtmFunnelRow) => ({ ...row, scoringFindings: undefined, ttmActualToDate: null, ttmCnttStatusMismatch: false, ttmE2eActualToDate: null }) as unknown as Parameters<typeof matchesAlertFilter>[0];
    const count = (filter: Parameters<typeof matchesAlertFilter>[1]) => rows.filter((row) => matchesAlertFilter(verdictRow(row), filter)).length;
    assert.equal(count('IN_SCOPE_CNTT'), 6);
    assert.equal(count('TTM_COUNTED_IN_SCOPE'), 2);
    assert.equal(count('TTM_BLACK_LISTED'), 2);
    assert.equal(count('TTM_PROJECT_NON_TTM'), 1);
    assert.equal(count('TTM_ELIGIBLE_IN_SCOPE'), 1);
    assert.equal(count('TTM_PASS_IN_SCOPE'), 1);
    assert.equal(count('OVERDUE_MISSING_R4G_IN_SCOPE'), 1);
  });
});

describe('Epic Scoring Service: TTM exclusion', () => {
  const ctx = makeContext();
  const onTime = { r4gDate: '2026-08-20', status: 'R4GOLIVE' };

  it('"Epic ngoại lệ" (2026-10-09): not judged at all — the exception note is its only badge, and it is in no index', () => {
    const counted = scoreEpic(makeFacts(onTime), ctx);
    assert.deepEqual(indexFlagsOf(counted), ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS']);

    const blackListed = scoreEpic(makeFacts({ ...onTime, ttmExclusion: 'BLACK_LISTED' }), ctx);
    assert.deepEqual(blackListed.findings.map((item) => item.badge), ['SCOPE_TTM_BLACK_LISTED']);
    assert.deepEqual(indexFlagsOf(blackListed), []);
    // Target / baseline dates are still derived — they are dates, not verdicts.
    assert.equal(blackListed.derived.cnttTargetDate, counted.derived.cnttTargetDate);

    const nonTtmProject = scoreEpic(makeFacts({ ...onTime, status: 'Released', ttmExclusion: 'PROJECT_NON_TTM' }), ctx);
    assert.deepEqual(nonTtmProject.findings.map((item) => item.badge), ['SCOPE_PROJECT_NON_TTM']);
    assert.deepEqual(indexFlagsOf(nonTtmProject), []);
  });

  it('"Epic ngoại lệ": whatever the Epic would be — Fail, Sai lệch dữ liệu, Chờ / Giải trình golive, trễ pha — nothing is raised', () => {
    const late = makeContext({ asOf: '2026-12-01' });
    const cases = [
      makeFacts({ status: 'In Progress' }),                                             // Fail TTM-CNTT + TTM-E2E, phases late
      makeFacts({ status: 'In Progress', startDate: null, requestType: '' }),           // Sai lệch dữ liệu R1 + R4
      makeFacts({ status: 'TEST', r4gDate: '2026-08-20' }),                             // R8
      makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-12-15' }),                         // R10
      makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-08-20' }),                         // Chờ golive / Giải trình golive
      makeFacts({ status: 'Pending' }),                                                 // Pending lâu (khuyến nghị)
      makeFacts({ status: 'Cancelled' }),                                               // Không áp dụng
    ];
    for (const facts of cases) {
      // Sanity: counted, each case does raise something beyond the SCOPE axis.
      assert.ok(scoreEpic(facts, late).findings.some((item) => !item.badge.startsWith('SCOPE_')), facts.status);
      for (const ttmExclusion of ['BLACK_LISTED', 'PROJECT_NON_TTM'] as const) {
        const card = scoreEpic({ ...facts, ttmExclusion }, late);
        assert.deepEqual(card.findings.map((item) => item.badge), [ttmExclusion === 'BLACK_LISTED' ? 'SCOPE_TTM_BLACK_LISTED' : 'SCOPE_PROJECT_NON_TTM'], `${facts.status} / ${ttmExclusion}`);
        assert.deepEqual(card.indexMembership, { ttm: { counted: false, eligible: false, pass: false, fail: false }, qa: { counted: false, eligible: false, pass: false, fail: false } });
      }
    }
  });

  it('"Epic ngoại lệ": its place against "Phạm vi dữ liệu cho TTM" is still noted (the funnel reads L01 from it)', () => {
    const scoped = makeContext({ scope: { cnttFrom: '2027-01-01', cnttTo: null, qaFrom: '2027-01-01', qaTo: null } });
    const card = scoreEpic(makeFacts({ ...onTime, ttmExclusion: 'BLACK_LISTED' }), scoped);
    assert.deepEqual(card.findings.map((item) => item.badge), ['SCOPE_TTM_BLACK_LISTED', 'SCOPE_CNTT_OUT', 'SCOPE_QA_OUT']);
  });

  it('no exclusion fact → no badge, scorecard unchanged', () => {
    const card = scoreEpic(makeFacts({ ...onTime, ttmExclusion: null }), ctx);
    assert.ok(!hasBadge(card, 'SCOPE_TTM_BLACK_LISTED') && !hasBadge(card, 'SCOPE_PROJECT_NON_TTM'));
    assert.deepEqual(card.findings, scoreEpic(makeFacts(onTime), ctx).findings);
  });
});
