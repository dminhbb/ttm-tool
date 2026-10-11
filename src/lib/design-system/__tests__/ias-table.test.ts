/**
 * Task 7 — khoá spec Table và contract chống tràn.
 *
 * Nguồn: references/components/data/table.md
 *        + templates/.../DanhSachChuongTrinh.dc.html
 *
 * Đây là nơi lỗi tràn nặng nhất của app: `ui/Table.tsx` đặt `white-space: nowrap`
 * cho MỌI `td` nhưng không có gì cắt bớt, nên bề rộng tối thiểu của bảng phình theo
 * giá trị dài nhất trong dữ liệu. `nowrap` một mình chỉ CHẶN XUỐNG DÒNG, nó không
 * cắt gì cả — phải đi kèm `max-width`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { collectDeclarations, declarationsFor, resolveToken } from '../css-tokens';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const APP_DIR = path.join(SRC_DIR, 'app');
const GLOBALS_CSS = readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8');
const IAS_TOKENS_CSS = readFileSync(path.join(APP_DIR, 'ias-tokens.css'), 'utf8');
const TABLE_TSX = readFileSync(path.join(SRC_DIR, 'components', 'ui', 'Table.tsx'), 'utf8');
const TOOLTIP_TSX = readFileSync(
  path.join(SRC_DIR, 'components', 'ui', 'TruncationTooltip.tsx'),
  'utf8',
);
const APP_SHELL_TSX = readFileSync(
  path.join(SRC_DIR, 'components', 'layout', 'AppShell.tsx'),
  'utf8',
);

const declaredTokens = collectDeclarations([IAS_TOKENS_CSS, GLOBALS_CSS], 'ias');
const resolve = (token: string) => resolveToken(token, declaredTokens);
const resolveValue = (value: string) =>
  value.replace(/var\((--[\w-]+)\)/g, (_, token) => resolve(token));

/** Mỗi spec phải áp cho cả primitive mới và class cũ của app. */
const HEADER_SELECTORS = [
  '.ias-table thead th',
  ':root[data-brand="ias"] .ui-table thead th',
];
const CELL_SELECTORS = [
  '.ias-table tbody td',
  ':root[data-brand="ias"] .ui-table tbody td',
];

describe('header bảng', () => {
  for (const selector of HEADER_SELECTORS) {
    it(`${selector}: nền bg-page, 11px/700, text-secondary`, () => {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#f4f6fa');
      assert.equal(resolveValue(d.get('font-size') ?? ''), '11px');
      assert.equal(resolveValue(d.get('font-weight') ?? ''), '700');
      assert.equal(resolveValue(d.get('color') ?? '').toLowerCase(), '#6e7191');
      assert.equal(d.get('padding'), '12px 16px');
    });

    it(`${selector}: SENTENCE CASE — bỏ uppercase và letter-spacing`, () => {
      // table.md 2026-08-21: ngoại lệ uppercase của Table đã bị RETIRE. Base
      // `.ui-table thead th` vẫn còn `text-transform: uppercase; letter-spacing: .035em`
      // nên phải đè tường minh, không thể chỉ "không khai báo".
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('text-transform'), 'none');
      assert.equal(d.get('letter-spacing'), 'normal');
    });

    it(`${selector}: KHÔNG có viền — đường chia đến từ viền trên của hàng body đầu`, () => {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('border'), 'none');
    });

    it(`${selector}: sticky theo trục dọc`, () => {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('position'), 'sticky');
      assert.equal(d.get('top'), '0');
    });
  }
});

describe('ô body', () => {
  for (const selector of CELL_SELECTORS) {
    it(`${selector}: lưới viền 0.5px đủ 4 cạnh, 13px, text-body`, () => {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('border') ?? '').toLowerCase(), '0.5px solid #d9dbe9');
      assert.equal(d.get('padding'), '13px 16px');
      assert.equal(d.get('font-size'), '13px');
      assert.equal(resolveValue(d.get('color') ?? '').toLowerCase(), '#4e4b66');
      assert.equal(d.get('vertical-align'), 'middle');
    });
  }

  it('hàng cuối GIỮ viền dưới để lưới hoàn chỉnh', () => {
    // Base có `tbody tr:last-child td { border-bottom: 0 }`; table.md yêu cầu bỏ
    // ngoại lệ đó.
    const d = declarationsFor(
      GLOBALS_CSS,
      ':root[data-brand="ias"] .ui-table tbody tr:last-child td',
    );
    assert.equal(resolveValue(d.get('border-bottom') ?? '').toLowerCase(), '0.5px solid #d9dbe9');
  });

  it('hover hàng dùng bg-hover', () => {
    for (const selector of ['.ias-table tbody tr:hover', ':root[data-brand="ias"] .ui-table tbody tr:hover']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#f4f5ff');
    }
  });
});

describe('wrap bảng', () => {
  it('KHÔNG radius, KHÔNG viền riêng (table.md 2026-08-18)', () => {
    const d = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-table-wrap');
    assert.equal(d.get('border'), 'none');
    assert.equal(d.get('border-radius'), '0');
    assert.equal(d.get('box-shadow'), 'none');
  });

  it('vẫn là vùng cuộn ngang — TableContainer dựa vào đó để auto-scroll khi hover mép', () => {
    // Bỏ overflow-x ở đây sẽ làm vỡ cơ chế edge-hover auto-scroll trong Table.tsx,
    // tức đổi hành vi (R2), không chỉ đổi diện mạo.
    assert.match(GLOBALS_CSS, /\.ui-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(TABLE_TSX, /EDGE_ZONE_RATIO/);
    assert.match(TABLE_TSX, /scrollLeft/);
  });
});

describe('cột định danh dính trái', () => {
  it('ô body sticky left với z-index 2', () => {
    const d = declarationsFor(GLOBALS_CSS, '.ias-table .ias-sticky-col');
    assert.equal(d.get('position'), 'sticky');
    assert.equal(d.get('left'), '0');
    assert.equal(d.get('z-index'), '2');
    assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#ffffff');
  });

  it('ô header sticky phải nằm TRÊN header sticky (z-index 3)', () => {
    const d = declarationsFor(GLOBALS_CSS, '.ias-table thead .ias-sticky-col');
    assert.equal(d.get('z-index'), '3');
  });

  it('ô dính đổi nền theo hover của hàng', () => {
    // Thiếu rule này thì ô dính giữ nền trắng khi cả hàng đã đổi màu — nó sẽ nổi
    // lên như một ô lạ thay vì thuộc về hàng đó.
    const d = declarationsFor(GLOBALS_CSS, '.ias-table tbody tr:hover .ias-sticky-col');
    assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#f4f5ff');
  });
});

describe('hàng tổng', () => {
  it('có đủ BA dấu hiệu: đậm + nền tint + viền trên tint', () => {
    // table.md 2026-09-15: chỉ lấy nửa phần in đậm thì hàng tổng đọc như một hàng
    // dữ liệu bình thường mà tình cờ bị bôi đậm.
    const d = declarationsFor(GLOBALS_CSS, '.ias-table tbody tr.ias-total-row td');
    assert.equal(resolveValue(d.get('font-weight') ?? ''), '700');
    assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#f4f5ff');
    assert.equal(resolveValue(d.get('border-top') ?? '').toLowerCase(), '1px solid #c4c6f7');
  });
});

describe('contract truncate + tooltip', () => {
  it('TD vẫn giữ nowrap mặc định — đúng IAS, nhưng phải đi kèm .ias-td-truncate', () => {
    assert.match(TABLE_TSX, /whitespace-nowrap/);
    // `.ias-td-truncate` là thứ thực sự tạo ra dấu "…"; nowrap chỉ chặn xuống dòng.
    const d = declarationsFor(IAS_TOKENS_CSS, '.ias-td-truncate');
    assert.ok(d.get('max-width'), 'thiếu max-width — nowrap một mình không cắt gì');
    assert.equal(d.get('text-overflow'), 'ellipsis');
    assert.equal(d.get('overflow'), 'hidden');
  });

  it('bubble dùng position:fixed để thoát clip của overflow-x:auto', () => {
    const d = declarationsFor(IAS_TOKENS_CSS, '.ias-tooltip-bubble');
    assert.equal(d.get('position'), 'fixed');
    assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#14142a');
    assert.equal(d.get('max-width'), '320px');
    // Nội dung ô có thể là một câu dài — phải cho xuống dòng trong max-width,
    // không ép thành một dòng cực rộng (table.md bẻ rule "single line" của Tooltip).
    assert.equal(d.get('white-space'), 'normal');
    assert.equal(d.get('pointer-events'), 'none');
  });

  it('tooltip tính toạ độ từ getBoundingClientRect, không dùng title của browser', () => {
    assert.match(TOOLTIP_TSX, /getBoundingClientRect/);
    assert.doesNotMatch(TOOLTIP_TSX, /\.title\s*=/);
  });

  it('bỏ qua khi ô KHÔNG thực sự bị cắt', () => {
    // table.md: đừng hiện tooltip chỉ để lặp lại chữ đang hiển thị đầy đủ.
    assert.match(TOOLTIP_TSX, /scrollWidth\s*<=\s*\w+\.clientWidth/);
  });

  it('ẩn bubble khi cuộn/resize — position:fixed không cuộn theo ô', () => {
    assert.match(TOOLTIP_TSX, /addEventListener\('scroll'/);
    assert.match(TOOLTIP_TSX, /capture:\s*true/);
    assert.match(TOOLTIP_TSX, /addEventListener\('resize'/);
  });

  it('lật bubble lên trên khi dưới không còn chỗ', () => {
    // Với bảng dài, các hàng cuối luôn rơi vào trường hợp này.
    assert.match(TOOLTIP_TSX, /spaceBelow/);
  });

  it('được mount một lần trong AppShell', () => {
    assert.match(APP_SHELL_TSX, /<TruncationTooltip\s*\/>/);
    assert.match(APP_SHELL_TSX, /from '@\/components\/ui\/TruncationTooltip'/);
  });

  it('aria-hidden — nội dung đã có trong ô, để trình đọc thấy bubble nữa là đọc lặp', () => {
    assert.match(TOOLTIP_TSX, /aria-hidden="true"/);
  });
});
