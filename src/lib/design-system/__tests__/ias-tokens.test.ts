/**
 * Task 2 — khoá tầng token IAS.
 *
 * Ba nhóm việc test này canh:
 *   1. Mọi alias resolve được về giá trị thật. Một `var()` trỏ sai tên sẽ resolve
 *      thành RỖNG mà CSS không hề báo lỗi — chính cơ chế đã sinh ra lỗi
 *      "`--color-fb-blue` tên là blue nhưng ra xanh lá rừng".
 *   2. Các token trọng yếu đúng bằng hex IAS đã công bố.
 *   3. Mọi cặp chữ/nền đạt WCAG AA. `ias-design` không phát hành số contrast, nên
 *      đây là phần ttm-tool tự kiểm — và nó đã bắt được lý do brand `wise` phải
 *      thay lime #9FE870 bằng forest green khi dùng làm màu chữ (lime chỉ ~1.7:1).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  collectDeclarations,
  contrastRatio,
  flatten,
  parseColor,
  parseTokenBlocks,
  resolveToken,
  TokenResolutionError,
} from '../css-tokens';
import { THEME_BRANDS } from '../../theme-brand';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'app');
const CSS_SOURCES = [
  readFileSync(path.join(APP_DIR, 'ias-tokens.css'), 'utf8'),
  readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8'),
];

function tokensFor(brand: string) {
  const declared = collectDeclarations(CSS_SOURCES, brand);
  return {
    declared,
    resolve: (token: string) => resolveToken(token, declared),
    color: (token: string) => {
      const parsed = parseColor(resolveToken(token, declared));
      assert.ok(parsed, `${token} không resolve về một màu đọc được`);
      return parsed;
    },
  };
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 } as const;

/** Token mà MỌI brand phải khai báo — thiếu một cái là brand đó có chỗ mất màu. */
const REQUIRED_PER_BRAND = [
  '--surface-app',
  '--surface-sidebar',
  '--surface-panel',
  '--surface-elevated',
  '--surface-hover',
  '--border-subtle',
  '--border-default',
  '--border-strong',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-disabled',
  '--accent',
  '--accent-hover',
  '--accent-soft',
  '--success',
  '--warning',
  '--danger',
  '--color-primary',
  '--color-on-primary',
  '--radius-sm',
  '--radius-md',
  '--radius-xl',
] as const;

/** Các token `@theme` mà utility class trong JSX đang dùng trực tiếp. */
const THEME_TOKENS = [
  '--color-fb-blue',
  '--color-fb-blue-soft',
  '--color-fb-bg',
  '--color-fb-surface',
  '--color-fb-surface-muted',
  '--color-fb-control',
  '--color-fb-border',
  '--color-fb-border-strong',
  '--color-fb-text-primary',
  '--color-fb-text-secondary',
  '--color-fb-text-placeholder',
  '--color-fb-primary',
  '--color-fb-on-primary',
  '--color-table-header',
  '--color-status-success',
  '--color-status-warning',
  '--color-status-danger',
  '--color-sidebar-text',
  '--color-sidebar-muted',
  '--color-sidebar-active',
] as const;

describe('parser CSS token', () => {
  it('bỏ qua comment có chứa dấu ngoặc nhọn', () => {
    const blocks = parseTokenBlocks(`
      /* comment có { ngoặc } gây lệch nếu không bỏ trước */
      :root { --a: red; }
    `);
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0].declarations, [['--a', 'red']]);
  });

  it('chỉ lấy block :root và @theme', () => {
    const blocks = parseTokenBlocks(`
      @theme { --x: 1px; }
      :root { --a: red; }
      .card { --ignored: blue; color: red; }
    `);
    assert.deepEqual(
      blocks.map((b) => b.selector),
      ['@theme', ':root'],
    );
  });

  it('resolve var() lồng nhau và fallback', () => {
    const declared = new Map([
      ['--base', '#141ed2'],
      ['--mid', 'var(--base)'],
      ['--top', 'var(--mid)'],
      ['--with-fallback', 'var(--missing, var(--base))'],
    ]);
    assert.equal(resolveToken('--top', declared), '#141ed2');
    assert.equal(resolveToken('--with-fallback', declared), '#141ed2');
  });

  it('báo lỗi khi alias trỏ tới token không tồn tại', () => {
    const declared = new Map([['--broken', 'var(--does-not-exist)']]);
    assert.throws(() => resolveToken('--broken', declared), TokenResolutionError);
  });

  it('báo lỗi khi alias tham chiếu vòng', () => {
    const declared = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ]);
    assert.throws(() => resolveToken('--a', declared), TokenResolutionError);
  });

  it('đọc được hex, rgb cú pháp phẩy và cú pháp khoảng trắng', () => {
    assert.deepEqual(parseColor('#141ED2'), { r: 20, g: 30, b: 210, a: 1 });
    assert.deepEqual(parseColor('rgba(20, 30, 210, 0.08)'), { r: 20, g: 30, b: 210, a: 0.08 });
    assert.deepEqual(parseColor('rgb(14 15 12 / 0.20)'), { r: 14, g: 15, b: 12, a: 0.2 });
    assert.equal(parseColor('none'), null);
  });

  it('tính contrast khớp số tham chiếu WCAG', () => {
    // Đen trên trắng là 21:1 — mốc chuẩn để biết công thức không bị lệch.
    assert.equal(Math.round(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, WHITE)), 21);
    // Lime #9FE870 làm màu chữ trên trắng chỉ ~1.7:1 — đúng lý do DESIGN.md loại nó.
    const lime = parseColor('#9fe870')!;
    assert.ok(contrastRatio(lime, WHITE) < 2);
  });
});

const CONTRAST_SURFACES = [
  ['page', '--surface-app'],
  ['panel', '--surface-panel'],
] as const;

/** --text-disabled cố tình mờ (nội dung không tương tác được) nên không nằm trong danh sách. */
const CONTRAST_FOREGROUNDS = [
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--success',
  '--warning',
  '--danger',
] as const;

/**
 * Các cặp chữ/nền ĐÃ ĐO và KHÔNG đạt WCAG AA (4.5:1 cho chữ thường).
 *
 * Đây là baseline, không phải sự chấp thuận: test khoá con số lại để chúng không tệ
 * thêm, và cũng fail nếu một cặp được sửa cho đạt AA mà quên xoá khỏi đây — baseline
 * chỉ được phép CO LẠI.
 *
 * Toàn bộ số sinh từ `node scripts/audit-token-contrast.mjs`.
 *
 * Phân nhóm lý do:
 *   - brand `ias`: 1 cặp duy nhất, là khiếm khuyết của chính palette IAS (xem bên dưới).
 *     Riêng --success đã được chữa bằng --color-success-300 nên KHÔNG còn ở đây.
 *   - brand `wise`/`legacy`/`pink`: nằm ngoài phạm vi chuẩn hoá lần này (ràng buộc R2 —
 *     không chạm các brand đang có). Ghi nhận để thấy rõ `ias` là brand sạch nhất:
 *     1 cặp, so với 4 của wise, 5 của legacy, 4 của pink. Đáng chú ý
 *     `legacy|--accent|panel` chỉ 4.10:1 — màu nhấn của chính brand đang là mặc định
 *     cũ cũng trượt AA, trong khi --accent của `ias` đạt 9.79:1.
 */
const SUB_AA_BASELINE: Record<string, { ratio: number; reason: string }> = {
  // IAS công bố --color-text-secondary = #6E7191. Trên nền card trắng đạt 4.74:1 (ok),
  // nhưng trên nền trang #F4F6FA chỉ 4.38:1 — thiếu 2.7%. Không sửa được mà không hoặc
  // làm sụp thang 4 bậc chữ của IAS, hoặc đổi nền trang khỏi #F4F6FA. Phơi nhiễm thực
  // tế hẹp: `.ui-info-banner` và `.ui-helper` khi nằm ngoài card.
  'ias|--text-muted|page': { ratio: 4.38, reason: 'IAS text-secondary trên bg-page, thiếu 2.7%' },

  'wise|--text-muted|page': { ratio: 4.34, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'wise|--success|page': { ratio: 4.17, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'wise|--warning|page': { ratio: 4.17, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'wise|--danger|page': { ratio: 4.01, reason: 'brand cũ, ngoài phạm vi (R2)' },

  'legacy|--accent|page': { ratio: 3.45, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'legacy|--accent|panel': { ratio: 4.1, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'legacy|--success|page': { ratio: 4.23, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'legacy|--warning|page': { ratio: 4.23, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'legacy|--danger|page': { ratio: 4.07, reason: 'brand cũ, ngoài phạm vi (R2)' },

  // Nút primary của `legacy`: chữ trắng trên #0284c7 chỉ 4.10:1. Cùng một màu nhấn
  // quá nhạt đã làm nó trượt AA ở cả hai nền. Brand `ias` đạt 9.79:1 (#FFF trên #141ED2).
  'legacy|primary-button': { ratio: 4.1, reason: 'brand cũ, ngoài phạm vi (R2)' },

  'pink|--text-muted|page': { ratio: 4.08, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'pink|--success|page': { ratio: 3.68, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'pink|--warning|page': { ratio: 3.68, reason: 'brand cũ, ngoài phạm vi (R2)' },
  'pink|--danger|page': { ratio: 3.54, reason: 'brand cũ, ngoài phạm vi (R2)' },
};

describe('semantic alias của IAS', () => {
  const { resolve } = tokensFor('ias');

  it('36 semantic alias đều resolve về màu đọc được', () => {
    const aliasNames = [
      ...new Set(
        CSS_SOURCES.flatMap((css) => parseTokenBlocks(css))
          .flatMap((block) => block.declarations.map(([name]) => name))
          .filter((name) => /^--color-(bg|text|border|icon)-/.test(name)),
      ),
    ];

    // 36 = 11 background + 11 text + 6 border + 8 icon, đếm theo bảng trong
    // references/color-rules.md. (Con số "37" trong bản kế hoạch là đếm sai; chính
    // test này phát hiện ra.)
    assert.equal(aliasNames.length, 36, `đang có ${aliasNames.length} alias, kỳ vọng 36`);
    for (const name of aliasNames) {
      assert.ok(parseColor(resolve(name)), `${name} = "${resolve(name)}" không phải màu`);
    }
  });

  it('giữ đúng hex đã công bố trong references/color-rules.md', () => {
    const expected: Record<string, string> = {
      '--color-bg-page': '#f4f6fa',
      '--color-bg-surface': '#ffffff',
      '--color-bg-hover': '#f4f5ff',
      '--color-bg-brand': '#141ed2',
      '--color-bg-success-solid': '#00ba88',
      '--color-bg-warning-solid': '#f4b740',
      '--color-bg-error-solid': '#eb2d4b',
      '--color-text-primary': '#14142a',
      '--color-text-body': '#4e4b66',
      '--color-text-secondary': '#6e7191',
      '--color-text-muted': '#a0a3bd',
      '--color-text-brand': '#141ed2',
      '--color-text-error': '#c30052',
      '--color-text-success': '#00966d',
      '--color-text-warning': '#946200',
      '--color-border-default': '#d9dbe9',
      '--color-border-strong': '#c4c4d4',
      '--color-border-focus': '#141ed2',
      '--color-icon-default': '#6e7191',
      '--color-icon-inverse': '#ffffff',
    };
    for (const [token, hex] of Object.entries(expected)) {
      assert.equal(resolve(token).toLowerCase(), hex, `${token} lệch khỏi hex IAS`);
    }
  });
});

describe('tầng compat theo từng brand', () => {
  for (const brand of THEME_BRANDS) {
    describe(`brand "${brand}"`, () => {
      const { declared, resolve } = tokensFor(brand);

      it('khai báo đủ mọi token nền tảng', () => {
        const missing = REQUIRED_PER_BRAND.filter((token) => !declared.has(token));
        assert.deepEqual(missing, [], `brand ${brand} thiếu token`);
      });

      it('mọi token nền tảng resolve về giá trị không rỗng', () => {
        for (const token of REQUIRED_PER_BRAND) {
          const value = resolve(token);
          assert.notEqual(value, '', `${token} resolve thành rỗng ở brand ${brand}`);
        }
      });

      it('mọi token @theme resolve được (không mắt alias nào đứt)', () => {
        for (const token of THEME_TOKENS) {
          assert.doesNotThrow(
            () => resolve(token),
            `${token} không resolve được ở brand ${brand}`,
          );
          assert.notEqual(resolve(token), '', `${token} rỗng ở brand ${brand}`);
        }
      });

      it('mọi cặp chữ/nền đạt WCAG AA, trừ các ngoại lệ đã ghi nhận', () => {
        for (const [surfaceName, surfaceToken] of CONTRAST_SURFACES) {
          const surface = parseColor(resolve(surfaceToken))!;
          for (const token of CONTRAST_FOREGROUNDS) {
            const ratio = contrastRatio(flatten(parseColor(resolve(token))!, surface), surface);
            const baselineKey = `${brand}|${token}|${surfaceName}`;
            const baseline = SUB_AA_BASELINE[baselineKey];

            if (baseline === undefined) {
              assert.ok(
                ratio >= 4.5,
                `${token} trên nền ${surfaceName} chỉ đạt ${ratio.toFixed(2)}:1 ở brand ` +
                  `${brand} (cần ≥ 4.5:1).\nNếu đây là khiếm khuyết đã biết và chấp nhận ` +
                  `được, thêm '${baselineKey}': ${(Math.round(ratio * 100) / 100).toFixed(2)} ` +
                  'vào SUB_AA_BASELINE KÈM lý do — đừng hạ ngưỡng chung.',
              );
            } else {
              // Đã dưới AA từ trước: khoá lại để không tệ thêm. Nếu ai sửa cho đạt AA,
              // test cũng fail và nhắc xoá khỏi baseline — baseline chỉ được co lại.
              assert.ok(
                ratio >= baseline.ratio - 0.01,
                `${baselineKey} tụt từ ${baseline.ratio}:1 xuống ${ratio.toFixed(2)}:1`,
              );
              assert.ok(
                ratio < 4.5,
                `${baselineKey} giờ đã đạt ${ratio.toFixed(2)}:1 — xoá khỏi SUB_AA_BASELINE`,
              );
            }
          }
        }
      });

      it('nút primary: chữ trên nền primary đạt WCAG AA', () => {
        const fill = parseColor(resolve('--color-primary'))!;
        const label = parseColor(resolve('--color-on-primary'))!;
        const ratio = contrastRatio(label, fill);
        const baseline = SUB_AA_BASELINE[`${brand}|primary-button`];

        if (baseline === undefined) {
          assert.ok(ratio >= 4.5, `nút primary chỉ đạt ${ratio.toFixed(2)}:1 ở brand ${brand}`);
        } else {
          assert.ok(
            ratio >= baseline.ratio - 0.01,
            `nút primary brand ${brand} tụt từ ${baseline.ratio}:1 xuống ${ratio.toFixed(2)}:1`,
          );
        }
      });
    });
  }
});

describe('brand "ias" — các giá trị chốt của Task 2', () => {
  const { resolve } = tokensFor('ias');

  it('chữa xung đột xanh lá / xanh dương: --accent về đúng brand blue', () => {
    // Trước Task 2: brand `wise` cho #1c6e2e (xanh lá rừng), brand `legacy` cho #0284c7,
    // trong khi dashboard vẽ ring bằng #0866ff / #1463f7. Giờ chỉ còn một màu.
    assert.equal(resolve('--accent').toLowerCase(), '#141ed2');
    assert.equal(resolve('--color-fb-blue').toLowerCase(), '#141ed2');
    assert.equal(resolve('--color-fb-blue').toLowerCase(), resolve('--accent').toLowerCase());
  });

  it('nền trang là #F4F6FA, không phải xám-oliu #e8ebe6', () => {
    assert.equal(resolve('--surface-app').toLowerCase(), '#f4f6fa');
    assert.equal(resolve('--color-fb-bg').toLowerCase(), '#f4f6fa');
  });

  it('header bảng dùng đúng nền bg-page của IAS', () => {
    assert.equal(resolve('--color-table-header').toLowerCase(), '#f4f6fa');
  });

  it('sidebar là navy #0D0D2B', () => {
    assert.equal(resolve('--surface-sidebar').toLowerCase(), '#0d0d2b');
  });

  it('thang radius theo IAS: card 12 · control 8 · menu 6 · badge 4', () => {
    assert.equal(resolve('--radius-xs'), '4px');
    assert.equal(resolve('--radius-sm'), '6px');
    assert.equal(resolve('--radius-md'), '8px');
    assert.equal(resolve('--radius-lg'), '12px');
    assert.equal(resolve('--radius-xl'), '12px');
    // Brand `wise` để 24px cho cả xl và 2xl — thang 24px đó đã bị bỏ.
    assert.equal(resolve('--radius-2xl'), '12px');
  });

  it('chữ trên sidebar navy đạt WCAG AA', () => {
    const navy = parseColor(resolve('--ias-sidebar-bg'))!;
    const onNavy = ['--ias-sidebar-item-text', '--ias-sidebar-leaf-text'] as const;
    for (const token of onNavy) {
      const ratio = contrastRatio(flatten(parseColor(resolve(token))!, navy), navy);
      assert.ok(ratio >= 4.5, `${token} trên navy chỉ đạt ${ratio.toFixed(2)}:1`);
    }
  });

  it('item sidebar đang chọn: chữ trắng trên nền brand, đạt WCAG AA', () => {
    const activeBg = parseColor(resolve('--color-bg-brand'))!;
    const activeText = parseColor(resolve('--color-text-inverse'))!;
    assert.ok(contrastRatio(activeText, activeBg) >= 4.5);
  });
});
