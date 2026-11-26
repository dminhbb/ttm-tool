import { exportBudgetCell, formatExportDate } from '@/lib/epic-row-export';
import type { CalculatorRowKey, TtmCalculatorResult } from '@/lib/ttm-calculator';
import type { TableExportCell, TableExportColumn } from '@/lib/table-export-client';

/**
 * "Xuất dữ liệu" of TTM Calculator (REQ-20261126-03, owner 2026-11-26): one row with the entered Epic facts, the two TTM
 * budgets and the baseline (end date) of each phase. Project / Epic are left blank (a calculator run has no real Epic) so
 * the file has the same leading shape as the Quản trị Epic export. Pure — no DOM, no clock.
 */

/** What the user entered for the run the result panel is showing. */
export interface CalculatorExportInput {
  requestType: string;
  requirementLevel: string;
  startDate: string;
  createdDate: string | null;
  ideaApprovedDate: string | null;
}

/** Ordered columns: phase baselines with yellow pastel headers; Start date and R4G cells bold. */
export const CALCULATOR_EXPORT_COLUMNS: readonly TableExportColumn[] = [
  { label: 'Project' },
  { label: 'Epic' },
  { label: 'Loại yêu cầu' },
  { label: 'Requirement level' },
  { label: 'Start date', boldCells: true },
  { label: 'Created date' },
  { label: 'Ngày duyệt ý tưởng' },
  { label: 'TTM-CNTT' },
  { label: 'TTM-e2e' },
  { label: 'Design', headerTone: 'yellow' },
  { label: 'Dev', headerTone: 'yellow' },
  { label: 'Test', headerTone: 'yellow' },
  { label: 'Pentest & Change', headerTone: 'yellow' },
  { label: 'R4G', headerTone: 'yellow', boldCells: true },
  { label: 'Golive', headerTone: 'yellow' },
];

/** Baseline (planned end date) of a phase row; '' when the rule set has no row for it. */
function phaseBaseline(result: TtmCalculatorResult, key: CalculatorRowKey): string {
  return formatExportDate(result.rows.find((row) => row.key === key)?.toDate ?? null);
}

/** The single data row, aligned with CALCULATOR_EXPORT_COLUMNS. */
export function calculatorExportRow(input: CalculatorExportInput, result: TtmCalculatorResult): TableExportCell[] {
  return [
    '',
    '',
    input.requestType,
    input.requirementLevel,
    formatExportDate(result.startDate),
    formatExportDate(input.createdDate),
    formatExportDate(input.ideaApprovedDate),
    exportBudgetCell(result.totalCnttWorkingDays),
    exportBudgetCell(result.e2e?.budgetWorkingDays),
    phaseBaseline(result, 'DESIGN'),
    phaseBaseline(result, 'DEV'),
    phaseBaseline(result, 'TEST'),
    phaseBaseline(result, 'PENTEST'),
    formatExportDate(result.r4gDate),
    formatExportDate(result.goliveDate),
  ];
}
