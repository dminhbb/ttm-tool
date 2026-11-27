/**
 * Shared client-side table export (XLSX via ExcelJS, PDF via jsPDF + autotable) — used by the "Xuất dữ liệu" button of
 * Quản trị Epic (`/epic-alerts-15`) and TTM Calculator (REQ-20261126-03). The heavy libraries (and the ~400KB embedded
 * Roboto fonts for Vietnamese glyphs) are dynamically imported so they only load when the user actually exports.
 *
 * The pure helpers (`pdfColumnIndexes`, `xlsxAutoFilterColumns`, `headerToneColors`) carry the layout rules and are
 * unit-tested; `exportTable` only wires them to the libraries.
 */

/** Header colour of a column: default blue, green (baseline block), yellow pastel (Jira dates / phase baselines). */
export type TableHeaderTone = 'blue' | 'green' | 'yellow';

export type TableExportCell = string | number;

export interface TableExportColumn {
  label: string;
  /** false → left out of the PDF (default: included). */
  pdf?: boolean;
  /** true → present but hidden in the XLSX (the user can unhide it). */
  xlsxHidden?: boolean;
  /** true → the XLSX header gets an AutoFilter drop-down. Excel allows one contiguous AutoFilter range per sheet, so
   * filtered columns must sit next to each other (`xlsxAutoFilterColumns` throws otherwise). */
  filter?: boolean;
  headerTone?: TableHeaderTone;
  /** true → the data cells of this column are bold (XLSX + PDF). */
  boldCells?: boolean;
}

export interface TableExportSpec {
  /** Title row above the header (merged across the width in XLSX). */
  title: string;
  sheetName: string;
  columns: readonly TableExportColumn[];
  rows: readonly (readonly TableExportCell[])[];
  /** File name without extension. */
  fileBase: string;
  /** Hyperlinks of data cells: `links[row][column]` (aligned with `rows`); empty / absent = plain text. Only http(s). */
  links?: readonly (readonly (string | undefined)[])[];
}

const LINK_ARGB = 'FF1D4ED8';
const LINK_RGB: [number, number, number] = [29, 78, 216];

/** The URL of a data cell when it is a safe (http / https) link, else null. */
export function exportCellLink(spec: Pick<TableExportSpec, 'links'>, rowIndex: number, columnIndex: number): string | null {
  const url = spec.links?.[rowIndex]?.[columnIndex];
  return url && /^https?:\/\//i.test(url) ? url : null;
}

interface ToneColors { argbFill: string; argbText: string; rgbFill: [number, number, number]; rgbText: [number, number, number] }

const TONES: Record<TableHeaderTone, ToneColors> = {
  blue: { argbFill: 'FF2563EB', argbText: 'FFFFFFFF', rgbFill: [37, 99, 235], rgbText: [255, 255, 255] },
  green: { argbFill: 'FF16A34A', argbText: 'FFFFFFFF', rgbFill: [22, 163, 74], rgbText: [255, 255, 255] },
  yellow: { argbFill: 'FFFFF2B3', argbText: 'FF1F2937', rgbFill: [255, 242, 179], rgbText: [31, 41, 55] },
};

/** Fill/text colours of a header tone (default blue). */
export function headerToneColors(tone: TableHeaderTone | undefined): ToneColors {
  return TONES[tone ?? 'blue'];
}

/** Indexes (into `columns`) of the columns that go into the PDF. */
export function pdfColumnIndexes(columns: readonly TableExportColumn[]): number[] {
  return columns.flatMap((column, index) => (column.pdf === false ? [] : [index]));
}

/** 1-based first/last column of the XLSX AutoFilter, or null when no column asks for one. Throws when the filtered
 * columns are not contiguous (Excel supports a single AutoFilter range per sheet). */
export function xlsxAutoFilterColumns(columns: readonly TableExportColumn[]): { from: number; to: number } | null {
  const indexes = columns.flatMap((column, index) => (column.filter ? [index + 1] : []));
  if (indexes.length === 0) return null;
  const from = indexes[0];
  const to = indexes[indexes.length - 1];
  if (to - from + 1 !== indexes.length) throw new Error('Các cột có bộ lọc phải nằm liền nhau trong file Excel.');
  return { from, to };
}

/** Column width (characters) from the header text and the longest cell, clamped to a readable range. */
export function xlsxColumnWidth(label: string, cells: readonly TableExportCell[]): number {
  const longest = cells.reduce<number>((max, cell) => Math.max(max, String(cell).length), 0);
  return Math.max(10, Math.min(42, Math.max(label.length + 6, longest + 2)));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** The XLSX workbook of a spec (no DOM — unit-tested). */
export async function buildXlsxWorkbook(spec: TableExportSpec) {
  const imported = await import('exceljs');
  // The browser bundle exposes the classes on the namespace, Node's ESM loader on `default`.
  const ExcelJS = (imported as unknown as { default?: typeof imported }).default ?? imported;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(spec.sheetName);
  const { columns, rows } = spec;
  // Column widths / hidden flags first — assigning `sheet.columns` later would reset them.
  sheet.columns = columns.map((column, index) => ({
    width: xlsxColumnWidth(column.label, rows.map((row) => row[index] ?? '')),
    hidden: column.xlsxHidden === true,
  }));
  // Row 1: title merged across the width; row 2: headers (bold, coloured by tone); then the data rows.
  sheet.addRow([spec.title]);
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).font = { bold: true, size: 12 };
  sheet.addRow(columns.map((column) => column.label));
  columns.forEach((column, index) => {
    const tone = headerToneColors(column.headerTone);
    const cell = sheet.getCell(2, index + 1);
    cell.font = { bold: true, color: { argb: tone.argbText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.argbFill } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  rows.forEach((row, rowIndex) => {
    const added = sheet.addRow([...row]);
    columns.forEach((column, index) => {
      const cell = added.getCell(index + 1);
      const link = exportCellLink(spec, rowIndex, index);
      if (link) cell.value = { text: String(row[index] ?? ''), hyperlink: link };
      if (column.boldCells || link) {
        cell.font = { bold: column.boldCells === true, ...(link ? { underline: true, color: { argb: LINK_ARGB } } : {}) };
      }
    });
  });
  const filter = xlsxAutoFilterColumns(columns);
  if (filter) sheet.autoFilter = { from: { row: 2, column: filter.from }, to: { row: 2 + rows.length, column: filter.to } };
  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  return workbook;
}

async function exportXlsx(spec: TableExportSpec): Promise<void> {
  const workbook = await buildXlsxWorkbook(spec);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${spec.fileBase}.xlsx`);
}

async function exportPdf(spec: TableExportSpec): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  // jsPDF's standard fonts have no Vietnamese glyphs — embed Roboto (regular + bold).
  const { ROBOTO_REGULAR_B64, ROBOTO_BOLD_B64 } = await import('@/lib/epic-pdf-fonts');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_B64);
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_B64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(spec.title, 14, 20);
  const included = pdfColumnIndexes(spec.columns);
  const pdfColumns = included.map((index) => spec.columns[index]);
  autoTable(doc, {
    startY: 30,
    head: [pdfColumns.map((column) => column.label)],
    body: spec.rows.map((row) => included.map((index) => row[index] ?? '')),
    styles: { font: 'Roboto', fontSize: 7, cellPadding: 2 },
    headStyles: { font: 'Roboto', fontStyle: 'bold', fontSize: 7 },
    margin: { top: 10, right: 14, bottom: 14, left: 14 },
    didParseCell: (hook) => {
      const column = pdfColumns[hook.column.index];
      if (!column) return;
      if (hook.section === 'head') {
        const tone = headerToneColors(column.headerTone);
        hook.cell.styles.fillColor = tone.rgbFill;
        hook.cell.styles.textColor = tone.rgbText;
      } else if (hook.section === 'body') {
        if (column.boldCells) hook.cell.styles.fontStyle = 'bold';
        if (exportCellLink(spec, hook.row.index, included[hook.column.index])) hook.cell.styles.textColor = LINK_RGB;
      }
    },
    // The clickable area of a link cell (a link annotation over the whole cell).
    didDrawCell: (hook) => {
      if (hook.section !== 'body') return;
      const url = exportCellLink(spec, hook.row.index, included[hook.column.index]);
      if (url) doc.link(hook.cell.x, hook.cell.y, hook.cell.width, hook.cell.height, { url });
    },
  });
  downloadBlob(doc.output('blob'), `${spec.fileBase}.pdf`);
}

/** Builds the file in the browser and starts the download. */
export function exportTable(format: 'xlsx' | 'pdf', spec: TableExportSpec): Promise<void> {
  return format === 'xlsx' ? exportXlsx(spec) : exportPdf(spec);
}
