import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildXlsxWorkbook, exportCellLink, type TableExportSpec } from '../table-export-client';

const spec: TableExportSpec = {
  title: 'T',
  sheetName: 'Epic',
  fileBase: 'x',
  columns: [{ label: 'Dự án' }, { label: 'Epic key' }],
  rows: [['MO', 'MO-1'], ['MO', 'MO-2']],
  links: [[undefined, 'https://jira.example/browse/MO-1'], [undefined, '']],
};

describe('xuất bảng — link Jira của Epic key', () => {
  it('chỉ nhận link http/https', () => {
    assert.equal(exportCellLink(spec, 0, 1), 'https://jira.example/browse/MO-1');
    assert.equal(exportCellLink(spec, 1, 1), null);
    assert.equal(exportCellLink({ links: [['javascript:alert(1)']] }, 0, 0), null);
    assert.equal(exportCellLink({}, 0, 0), null);
  });

  it('file XLSX đọc lại: ô Epic key là hyperlink, ô không có link là chữ thường', async () => {
    const buffer = await (await buildXlsxWorkbook(spec)).xlsx.writeBuffer();
    const read = await buildXlsxWorkbook({ ...spec, rows: [], links: [] });
    read.removeWorksheet(read.getWorksheet('Epic')!.id);
    await read.xlsx.load(buffer);
    const sheet = read.getWorksheet('Epic')!;
    assert.deepEqual(sheet.getCell(3, 2).value, { text: 'MO-1', hyperlink: 'https://jira.example/browse/MO-1' });
    assert.equal(sheet.getCell(4, 2).value, 'MO-2');
  });
});
