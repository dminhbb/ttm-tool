/**
 * Task 5 — khoá spec button IAS.
 *
 * Nguồn: templates/ias-danh-sach-chuong-trinh/DanhSachChuongTrinh.dc.html (`.btn`)
 *        + references/component-rules.md (thứ tự nút, một primary mỗi hàng, sentence case)
 *
 * Điểm mấu chốt test này canh: mỗi spec phải áp cho CẢ `.ias-btn*` (primitive mới) và
 * `[data-brand="ias"] .ui-button*` (để `<Button>` đang dùng khắp app đổi diện mạo mà
 * không sửa call site). Nếu ai sửa một bên mà quên bên kia, hai bộ nút sẽ lệch nhau —
 * đúng kiểu đã tạo ra 5 implementation Card song song trước đây.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { collectDeclarations, declarationsFor, resolveToken } from '../css-tokens';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const APP_DIR = path.join(SRC_DIR, 'app');
const GLOBALS_CSS = readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8');
const IAS_TOKENS_CSS = readFileSync(path.join(APP_DIR, 'ias-tokens.css'), 'utf8');

const declaredTokens = collectDeclarations([IAS_TOKENS_CSS, GLOBALS_CSS], 'ias');
const resolve = (token: string) => resolveToken(token, declaredTokens);

/** Resolve mọi var() trong một giá trị CSS để so với hex/px thật. */
function resolveValue(value: string): string {
  return value.replace(/var\((--[\w-]+)\)/g, (_, token) => resolve(token));
}

/**
 * Các cặp selector phải LUÔN đi cùng nhau: primitive mới và class cũ của app.
 * Mọi spec bên dưới được kiểm trên cả hai.
 */
const SELECTOR_PAIRS: { label: string; ias: string; legacy: string }[] = [
  { label: 'base', ias: '.ias-btn', legacy: ':root[data-brand="ias"] .ui-button' },
  { label: 'primary', ias: '.ias-btn-primary', legacy: ':root[data-brand="ias"] .ui-button-primary' },
  { label: 'outline', ias: '.ias-btn-outline', legacy: ':root[data-brand="ias"] .ui-button-secondary' },
  { label: 'ghost', ias: '.ias-btn-ghost', legacy: ':root[data-brand="ias"] .ui-button-ghost' },
  { label: 'danger', ias: '.ias-btn-danger', legacy: ':root[data-brand="ias"] .ui-button-danger' },
  { label: 'icon', ias: '.ias-btn-icon', legacy: ':root[data-brand="ias"] .ui-icon-button' },
  { label: 'sm', ias: '.ias-btn-sm', legacy: ':root[data-brand="ias"] .ui-button-sm' },
  { label: 'lg', ias: '.ias-btn-lg', legacy: ':root[data-brand="ias"] .ui-button-lg' },
];

function walk(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'fonts') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

describe('button IAS — spec hình khối', () => {
  it('base: 40px, radius 8, 14px/600, không co lại, không wrap', () => {
    for (const { ias, legacy } of [SELECTOR_PAIRS[0]]) {
      for (const selector of [ias, legacy]) {
        const d = declarationsFor(GLOBALS_CSS, selector);
        assert.equal(d.get('min-height'), '40px', `${selector}: min-height`);
        assert.equal(resolveValue(d.get('border-radius') ?? ''), '8px', `${selector}: radius`);
        assert.equal(resolveValue(d.get('font-size') ?? ''), '14px', `${selector}: font-size`);
        assert.equal(resolveValue(d.get('font-weight') ?? ''), '600', `${selector}: font-weight`);
        assert.equal(d.get('white-space'), 'nowrap', `${selector}: white-space`);
        assert.equal(d.get('flex-shrink'), '0', `${selector}: flex-shrink`);
        assert.equal(d.get('padding'), '0 16px', `${selector}: padding`);
      }
    }
  });

  it('dùng min-height chứ KHÔNG dùng height cố định — height cắt mất nhãn 2 dòng', () => {
    for (const selector of ['.ias-btn', ':root[data-brand="ias"] .ui-button']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('height'), undefined, `${selector} không được đặt height cố định`);
    }
  });

  it('primary: nền brand, chữ inverse, hover primary-700', () => {
    for (const selector of ['.ias-btn-primary', ':root[data-brand="ias"] .ui-button-primary']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#141ed2');
      assert.equal(resolveValue(d.get('color') ?? '').toLowerCase(), '#ffffff');
    }
    for (const selector of [
      '.ias-btn-primary:hover',
      ':root[data-brand="ias"] .ui-button-primary:hover',
    ]) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#0e15a8');
    }
  });

  it('outline: trong suốt + viền primary-200, hover viền thành border-focus', () => {
    for (const selector of ['.ias-btn-outline', ':root[data-brand="ias"] .ui-button-secondary']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('background'), 'transparent', `${selector}: nền phải trong suốt`);
      assert.equal(resolveValue(d.get('border') ?? '').toLowerCase(), '1px solid #c4c6f7');
      assert.equal(resolveValue(d.get('color') ?? '').toLowerCase(), '#14142a');
    }
    for (const selector of [
      '.ias-btn-outline:hover',
      ':root[data-brand="ias"] .ui-button-secondary:hover',
    ]) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('border-color') ?? '').toLowerCase(), '#141ed2');
    }
  });

  it('icon-only: ô vuông 40×40, viền như outline', () => {
    for (const selector of ['.ias-btn-icon', ':root[data-brand="ias"] .ui-icon-button']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('width'), '40px');
      assert.equal(d.get('height'), '40px');
      assert.equal(resolveValue(d.get('border-radius') ?? ''), '8px');
      assert.equal(resolveValue(d.get('border') ?? '').toLowerCase(), '1px solid #c4c6f7');
    }
  });

  it('cỡ nhỏ là 32px — mật độ của card, không phải của trang', () => {
    for (const selector of ['.ias-btn-sm', ':root[data-brand="ias"] .ui-button-sm']) {
      assert.equal(declarationsFor(GLOBALS_CSS, selector).get('min-height'), '32px');
    }
    assert.equal(declarationsFor(GLOBALS_CSS, '.ias-btn-icon-sm').get('width'), '32px');
  });

  it('danger giữ lại dù IAS không có, và dùng bậc màu đạt AA', () => {
    // button.md: "Button has no separate danger variant". Giữ vì app đang dùng cho
    // hành động phá huỷ — bỏ đi là đổi affordance (R2). Phải là --color-text-error
    // (#C30052, 6.1:1 với chữ trắng), KHÔNG phải #EB2D4B (chỉ 4.0:1).
    for (const selector of ['.ias-btn-danger', ':root[data-brand="ias"] .ui-button-danger']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#c30052');
      assert.equal(resolveValue(d.get('color') ?? '').toLowerCase(), '#ffffff');
    }
  });

  it('focus dùng viền brand + glow 3px, không dùng outline mặc định', () => {
    for (const selector of ['.ias-btn:focus-visible', '.ias-btn-icon:focus-visible']) {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(d.get('outline'), 'none');
      assert.equal(resolveValue(d.get('border-color') ?? '').toLowerCase(), '#141ed2');
      assert.match(resolveValue(d.get('box-shadow') ?? ''), /rgba\(20,\s*30,\s*210,\s*0?\.08\)/);
    }
  });

  it('bỏ hiệu ứng nhấn lún của base .ui-button', () => {
    const d = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-button:active');
    assert.equal(d.get('transform'), 'none');
  });

  it('KHÔNG có uppercase ở bất kỳ rule button nào — sentence case', () => {
    for (const { ias, legacy } of SELECTOR_PAIRS) {
      for (const selector of [ias, legacy]) {
        const d = declarationsFor(GLOBALS_CSS, selector);
        assert.notEqual(d.get('text-transform'), 'uppercase', `${selector} bị uppercase`);
      }
    }
  });

  it('mọi variant/size đều khai báo cho CẢ primitive mới và class cũ', () => {
    const missing: string[] = [];
    for (const { label, ias, legacy } of SELECTOR_PAIRS) {
      if (declarationsFor(GLOBALS_CSS, ias).size === 0) missing.push(`${label}: thiếu ${ias}`);
      if (declarationsFor(GLOBALS_CSS, legacy).size === 0) missing.push(`${label}: thiếu ${legacy}`);
    }
    assert.deepEqual(missing, []);
  });
});

describe('Button.tsx giữ nguyên API', () => {
  const BUTTON_TSX = readFileSync(path.join(SRC_DIR, 'components', 'ui', 'Button.tsx'), 'utf8');

  it('vẫn nhận đủ 6 variant và 3 size như trước Task 5', () => {
    // Ràng buộc R2: chỉ đổi class bên trong, KHÔNG đổi prop. Bỏ bớt một variant
    // sẽ làm vỡ call site và đổi affordance.
    for (const variant of ['primary', 'secondary', 'outline', 'danger', 'ghost', 'glass']) {
      assert.match(BUTTON_TSX, new RegExp(`'${variant}'`), `mất variant ${variant}`);
    }
    for (const size of ['sm', 'md', 'lg']) {
      assert.match(BUTTON_TSX, new RegExp(`'${size}'`), `mất size ${size}`);
    }
  });

  it('vẫn phát ra class .ui-button* để nhận spec IAS qua CSS', () => {
    for (const className of [
      'ui-button',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-ghost',
      'ui-button-sm',
      'ui-button-lg',
    ]) {
      // Tên class có thể đứng một mình trong chuỗi, hoặc mở đầu một chuỗi nhiều class
      // (`'ui-button whitespace-nowrap …'`), nên không khoá bằng dấu nháy đóng.
      assert.match(
        BUTTON_TSX,
        new RegExp(`['\`]${className}(['\`\\s])`),
        `không còn phát ${className}`,
      );
    }
  });
});

/**
 * "Một primary duy nhất mỗi toolbar/footer" — đo, chưa chặn.
 *
 * Không chặn được bằng static analysis: `variant` của Button.tsx MẶC ĐỊNH là 'primary',
 * nên mọi `<Button>` không ghi variant đều là CTA tô đặc. Quyết định nút nào là nút
 * trội trong một hàng là việc của từng màn hình, thuộc Nhịp B — làm hàng loạt bằng
 * regex sẽ đổi affordance một cách mù quáng.
 *
 * Test này khoá con số lại để tình hình không xấu thêm, và cung cấp danh sách cho
 * các đợt Nhịp B.
 */
describe('một primary mỗi hàng — baseline đo được', () => {
  /**
   * Đo được 2026-10-10: 83 trong tổng 131 chỗ `<Button>` không ghi variant.
   * Nặng nhất: admin/users 20 · StatusAlertRulesSettings 13 · ChangePasswordModal 6
   * · admin/projects 5 · login 5. Đều thuộc Task 12/13.
   */
  const IMPLICIT_PRIMARY_BASELINE = 83;

  it('số <Button> không ghi variant (tức mặc định primary) không tăng', () => {
    let implicit = 0;
    for (const file of walk(SRC_DIR, ['.tsx'])) {
      if (file.includes('__tests__')) continue;
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(/<Button\b([^>]*)>/g)) {
        if (!/\bvariant\s*=/.test(match[1])) implicit += 1;
      }
    }
    assert.ok(
      implicit <= IMPLICIT_PRIMARY_BASELINE,
      `${implicit} chỗ <Button> không ghi variant (baseline ${IMPLICIT_PRIMARY_BASELINE}). ` +
        'Mặc định là primary, nên mỗi chỗ như vậy là một CTA tô đặc. IAS yêu cầu ' +
        'một primary mỗi toolbar/footer — ghi rõ variant="secondary"/"ghost" cho các ' +
        'nút phụ thay vì dựa vào mặc định.',
    );
  });
});
