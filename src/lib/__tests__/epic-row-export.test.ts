import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportRowFields, filterFullModeRows, formatExportDate, passTtmText, sortExportRows, scoringText } from '../epic-row-export';
import type { EpicAlertRowExport } from '../epic-row-export';
import type { AlertFilterValue } from '../epic-row-verdicts';

/** Minimal EpicAlertRowExport fixture — only the fields the pure functions read, cast for brevity. */
function makeRow(overrides: Partial<EpicAlertRowExport>): EpicAlertRowExport {
  return {
    alertLevel: 'NONE',
    components: [],
    currentStatus: 'Design',
    dataLayerDate: null,
    domainName: '',
    dueDate: null,
    epicKey: 'MO-1',
    epicName: 'Epic mẫu',
    epicType: null,
    hasAlertHistory: false,
    hasDataAnomaly: false,
    dataAnomalyViolations: [],
    missingStandardInfo: [],
    ownerName: '',
    projectKey: 'MO',
    projectName: 'Mobile',
    r4gDate: null,
    releaseAxisState: 'NONE',
    releaseGraceDeadline: null,
    remainingWorkingDays: null,
    requestingUnit: null,
    requirementLevel: null,
    sourceType: 'CSV',
    stages: {
      design: { alertLevel: 'NONE', baselineDate: '2026-10-01', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
      dev: { alertLevel: 'NONE', baselineDate: '2026-10-05', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
      pentest: { alertLevel: 'NONE', baselineDate: '2026-10-20', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
      r4golive: { alertLevel: 'NONE', baselineDate: '2026-11-01', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
      release: { alertLevel: 'NONE', baselineDate: '2026-11-10', baselineSourceDate: '2026-09-25', baselineSourceLabel: null, isCurrentStage: false, isDone: false },
      test: { alertLevel: 'NONE', baselineDate: '2026-10-10', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
    },
    t0IdeaApprovedDate: null,
    t1StartDate: '2026-09-30',
    targetR4gDate: null,
    ttmCnttInScope: true,
    qaInScope: true,
    ttmActualElapsedWorkingDays: null,
    ttmActualFromDate: null,
    ttmE2eAlertLevel: 'NONE',
    ttmActualToDate: null,
    ttmCnttElapsedWorkingDays: null,
    ttmCnttFromDate: null,
    ttmCnttFromField: null,
    ttmCnttStatusMismatch: false,
    ttmCnttTargetWorkingDays: 0,
    ttmCnttToField: null,
    ttmE2eActualToDate: null,
    ttmE2eElapsedWorkingDays: null,
    ttmE2eTargetWorkingDays: 0,
    epicRealStartDate: null,
    ...overrides,
  };
}

describe('formatExportDate', () => {
  it('formats ISO date to dd/mm/yyyy, empty for absent/invalid', () => {
    assert.equal(formatExportDate('2026-10-01'), '01/10/2026');
    assert.equal(formatExportDate(null), '');
    assert.equal(formatExportDate(undefined), '');
    assert.equal(formatExportDate('khong-phai-ngay'), 'khong-phai');
  });
});

describe('passTtmText', () => {
  it('joins Pass/Fail TTM-CNTT and TTM-E2E as text (no icons)', () => {
    assert.equal(passTtmText(makeRow({ alertLevel: 'FAIL' })), 'Fail TTM-CNTT');
    assert.equal(passTtmText(makeRow({ scoringBadges: ['CNTT_PASS'] })), 'Pass TTM-CNTT');
    assert.equal(passTtmText(makeRow({ ttmE2eAlertLevel: 'FAIL' })), 'Fail TTM-E2E');
    assert.equal(passTtmText(makeRow({ scoringBadges: ['E2E_PASS'] })), 'Pass TTM-E2E');
    assert.equal(
      passTtmText(makeRow({ alertLevel: 'FAIL', ttmE2eAlertLevel: 'FAIL' })),
      'Fail TTM-CNTT, Fail TTM-E2E',
    );
    assert.equal(passTtmText(makeRow({ alertLevel: 'LATE', ttmE2eAlertLevel: 'NONE' })), '');
  });

  it('leaves TTM-CNTT out of scope / blacklisted / excluded', () => {
    assert.equal(passTtmText(makeRow({ alertLevel: 'FAIL', ttmCnttInScope: false })), '');
    assert.equal(passTtmText(makeRow({ alertLevel: 'FAIL', ttmBlackListed: true })), '');
  });
});

describe('scoringText', () => {
  it('flattens verdicts + data-anomaly + remaining badges to one line', () => {
    assert.equal(scoringText(makeRow({ alertLevel: 'FAIL' })), 'Fail TTM-CNTT');
    assert.equal(scoringText(makeRow({ hasDataAnomaly: true })), 'Sai lệch dữ liệu');
    const row = makeRow({ alertLevel: 'FAIL', scoringBadges: ['CNTT_PASS', 'PHASE_LATE:DEV'] });
    assert.equal(scoringText(row), 'Fail TTM-CNTT; PHASE_LATE:DEV');
  });
});

describe('exportRowFields', () => {
  it('maps every column to the expected cell value', () => {
    const row = makeRow({
      epicKey: 'MO-123',
      epicName: 'Epic summary',
      projectName: 'Mobile',
      ownerName: 'PM A',
      epicType: 'CT-Lv12',
      currentStatus: 'DEV',
      epicRealStartDate: '2026-09-28',
      stages: {
        design: { alertLevel: 'NONE', baselineDate: '2026-10-01', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
        dev: { alertLevel: 'NONE', baselineDate: '2026-10-05', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: true, isDone: false },
        pentest: { alertLevel: 'NONE', baselineDate: '2026-10-20', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
        r4golive: { alertLevel: 'NONE', baselineDate: '2026-11-01', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
        release: { alertLevel: 'NONE', baselineDate: '2026-11-10', baselineSourceDate: '2026-09-25', baselineSourceLabel: null, isCurrentStage: false, isDone: false },
        test: { alertLevel: 'NONE', baselineDate: '2026-10-10', baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false },
      },
      r4gDate: '2026-11-02',
      dueDate: '2026-11-15',
    });
    const cells = exportRowFields(row, 'https://jira.example/browse/');
    assert.equal(cells.duAn, 'Mobile');
    assert.equal(cells.epicKey, 'MO-123');
    assert.equal(cells.epicKeyLink, 'https://jira.example/browse/MO-123');
    assert.equal(cells.epicSummary, 'Epic summary');
    assert.equal(cells.loaiEpic, 'CT-Lv12 — Tính năng mới/Cải tiến, mức 1-2');
    assert.equal(cells.pmSm, 'PM A');
    assert.equal(cells.status, 'DEV');
    assert.equal(cells.currentPhase, 'Dev');
    assert.equal(cells.startE2e, '25/09/2026');
    assert.equal(cells.startDate, '30/09/2026');
    assert.equal(cells.actualStartDate, '28/09/2026');
    assert.equal(cells.design, '01/10/2026');
    assert.equal(cells.dev, '05/10/2026');
    assert.equal(cells.testPentent, '10/10/2026');
    assert.equal(cells.r4golive, '01/11/2026');
    assert.equal(cells.dueDate, '10/11/2026');
    assert.equal(cells.jiraR4golive, '02/11/2026');
    assert.equal(cells.jiraDueDate, '15/11/2026');
  });

  it('builds no Jira link when the base URL is empty', () => {
    assert.equal(exportRowFields(makeRow({}), '').epicKeyLink, '');
  });

  it('no current phase when no stage is current', () => {
    assert.equal(exportRowFields(makeRow({}), '').currentPhase, '');
  });
});

describe('sortExportRows', () => {
  it('sorts by project A→Z, then key prefix A→Z, then numeric part descending', () => {
    const rows = [
      makeRow({ epicKey: 'MO-10', projectName: 'Mobile' }),
      makeRow({ epicKey: 'AB-1', projectName: 'Mobile' }),
      makeRow({ epicKey: 'MO-2', projectName: 'Mobile' }),
      makeRow({ epicKey: 'MO-99', projectName: 'App' }),
      makeRow({ epicKey: 'MO-100', projectName: 'App' }),
      makeRow({ epicKey: 'AB-1', projectName: 'App' }),
    ];
    const keys = sortExportRows(rows).map((row) => `${row.projectName}:${row.epicKey}`);
    assert.deepEqual(keys, ['App:AB-1', 'App:MO-100', 'App:MO-99', 'Mobile:AB-1', 'Mobile:MO-10', 'Mobile:MO-2']);
  });

  it('sorts keys without a numeric part last within their project/prefix', () => {
    const rows = [
      makeRow({ epicKey: 'MO-5', projectName: 'X' }),
      makeRow({ epicKey: 'MO-AB', projectName: 'X' }),
      makeRow({ epicKey: 'MO-1', projectName: 'X' }),
    ];
    assert.deepEqual(sortExportRows(rows).map((row) => row.epicKey), ['MO-5', 'MO-1', 'MO-AB']);
  });
});

describe('filterFullModeRows', () => {
  const options = {
    projectFilters: [] as string[],
    pmSmFilters: [] as string[],
    componentFilters: [] as string[],
    alertFilters: [] as AlertFilterValue[],
    typeFilters: [] as string[],
    statusFilters: [] as string[],
    dataIssueFilter: false,
    requestingUnitFilters: [] as string[],
    ruleGroupFilters: [] as string[],
    search: '',
    markFilter: null as null | 'HIDDEN' | 'MARKED' | 'MINE',
    markedPmSmFilters: [] as string[],
    viewerOwnerName: '',
  };

  it('drops Cancelled Epics by default (no Status filter)', () => {
    const rows = [
      makeRow({ epicKey: 'MO-1', currentStatus: 'Design' }),
      makeRow({ epicKey: 'MO-2', currentStatus: 'Cancelled' }),
      makeRow({ epicKey: 'MO-3', currentStatus: 'Released' }),
    ];
    const kept = filterFullModeRows(rows, options).map((row) => row.epicKey);
    assert.deepEqual(kept, ['MO-1', 'MO-3']);
  });

  it('filters by project and free-text search', () => {
    const rows = [
      makeRow({ epicKey: 'MO-1', epicName: 'Alpha', projectKey: 'MO' }),
      makeRow({ epicKey: 'AB-2', epicName: 'Alpha', projectKey: 'AB' }),
      makeRow({ epicKey: 'MO-3', epicName: 'Beta', projectKey: 'MO' }),
    ];
    const project = filterFullModeRows(rows, { ...options, projectFilters: ['MO'] }).map((row) => row.epicKey);
    assert.deepEqual(project, ['MO-1', 'MO-3']);
    const search = filterFullModeRows(rows, { ...options, search: 'beta' }).map((row) => row.epicKey);
    assert.deepEqual(search, ['MO-3']);
  });
});
