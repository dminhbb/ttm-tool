import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TtmCalculatorResult } from '../ttm-calculator';
import { CALCULATOR_EXPORT_COLUMNS, calculatorExportRow } from '../ttm-calculator-export';

/** Minimal result — only the fields the export reads, cast for brevity. */
function makeResult(overrides: Partial<TtmCalculatorResult> = {}): TtmCalculatorResult {
  return {
    complexity: 'CT-Lv12',
    e2e: { budgetWorkingDays: 60, sourceDate: '2026-11-10', sourceLabel: 'Ngày duyệt ý tưởng', targetDate: '2027-02-05' },
    goliveDate: '2027-01-12',
    r4gDate: '2027-01-08',
    rows: [
      { key: 'DESIGN', label: 'Design', percent: 20, workingDays: 6, fromDate: '2026-11-25', toDate: '2026-12-02' },
      { key: 'DEV', label: 'Dev', percent: 40, workingDays: 12, fromDate: '2026-12-03', toDate: '2026-12-18' },
      { key: 'TEST', label: 'Test', percent: 25, workingDays: 8, fromDate: '2026-12-21', toDate: '2026-12-30' },
      { key: 'PENTEST', label: 'Pentest', percent: 15, workingDays: 4, fromDate: '2027-01-04', toDate: '2027-01-07' },
      { key: 'R4GOLIVE', label: 'R4G', percent: null, workingDays: 1, fromDate: '2027-01-08', toDate: '2027-01-08' },
      { key: 'GOLIVE', label: 'Golive', percent: null, workingDays: 2, fromDate: '2027-01-11', toDate: '2027-01-12' },
    ],
    startDate: '2026-11-25',
    totalCnttWorkingDays: 31,
    ...overrides,
  } as TtmCalculatorResult;
}

const INPUT = { requestType: 'Cải tiến', requirementLevel: '2', startDate: '2026-11-25', createdDate: '2026-11-01', ideaApprovedDate: null };

describe('TTM Calculator export (REQ-20261126-03)', () => {
  it('columns: Project/Epic first, phase baselines yellow, Start date + R4G bold', () => {
    assert.deepEqual(CALCULATOR_EXPORT_COLUMNS.map((column) => column.label), [
      'Project', 'Epic', 'Loại yêu cầu', 'Requirement level', 'Start date', 'Created date', 'Ngày duyệt ý tưởng',
      'TTM-CNTT', 'TTM-e2e', 'Design', 'Dev', 'Test', 'Pentest & Change', 'R4G', 'Golive',
    ]);
    assert.deepEqual(
      CALCULATOR_EXPORT_COLUMNS.filter((column) => column.headerTone === 'yellow').map((column) => column.label),
      ['Design', 'Dev', 'Test', 'Pentest & Change', 'R4G', 'Golive'],
    );
    assert.deepEqual(CALCULATOR_EXPORT_COLUMNS.filter((column) => column.boldCells).map((column) => column.label), ['Start date', 'R4G']);
  });

  it('one row: blank Project/Epic, entered facts, budgets, phase end dates', () => {
    assert.deepEqual(calculatorExportRow(INPUT, makeResult()), [
      '', '', 'Cải tiến', '2', '25/11/2026', '01/11/2026', '',
      31, 60, '02/12/2026', '18/12/2026', '30/12/2026', '07/01/2027', '08/01/2027', '12/01/2027',
    ]);
  });

  it('no basis for a budget / no phase rows → blank cells', () => {
    const row = calculatorExportRow(INPUT, makeResult({ e2e: null, totalCnttWorkingDays: null, rows: [], r4gDate: null, goliveDate: null }));
    assert.deepEqual(row.slice(7), ['', '', '', '', '', '', '', '']);
    assert.equal(row.length, CALCULATOR_EXPORT_COLUMNS.length);
  });
});
