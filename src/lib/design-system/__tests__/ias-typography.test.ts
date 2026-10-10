/**
 * Task 4 — khoá type scale IAS và sàn 12px.
 *
 * Hai thứ test này canh:
 *   1. Scale khớp đúng bảng trong references/typography-rules.md, và KHÔNG tồn tại
 *      Overline/`.ias-button` (hai thứ cố tình bị loại — xem ghi chú trong ias-tokens.css).
 *   2. Không có cỡ chữ nào dưới 12px lọt vào code mới. Đây là lint chống tái phát:
 *      app hiện còn nhiều `text-[10px]`/`text-[8.5px]`/`clamp(6.5px,…)` và danh sách
 *      ngoại lệ bên dưới CHỈ ĐƯỢC CO LẠI theo từng đợt của Nhịp B, không được nở ra.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { collectDeclarations, resolveToken } from '../css-tokens';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const APP_DIR = path.join(SRC_DIR, 'app');
const CSS_SOURCES = [
  readFileSync(path.join(APP_DIR, 'ias-tokens.css'), 'utf8'),
  readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8'),
];
const IAS_TOKENS_CSS = CSS_SOURCES[0];
/** Bỏ comment trước khi assert "không được chứa X" — comment giải thích CHÍNH quy tắc
    đó đương nhiên có chứa X, và sẽ làm assertion báo động giả. */
const IAS_TOKENS_CODE = IAS_TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const declared = collectDeclarations(CSS_SOURCES, 'ias');
const resolve = (token: string) => resolveToken(token, declared);

/** Bảng scale theo references/typography-rules.md. */
const TYPE_SCALE: { name: string; size: string; weight: string; lineHeight: string }[] = [
  { name: 'h1', size: '88px', weight: '300', lineHeight: '100px' },
  { name: 'h2', size: '44px', weight: '500', lineHeight: '52px' },
  { name: 'h3', size: '32px', weight: '500', lineHeight: '36px' },
  { name: 'h4', size: '22px', weight: '500', lineHeight: '24px' },
  { name: 'h5', size: '18px', weight: '500', lineHeight: '20px' },
  { name: 'subtitle1', size: '16px', weight: '600', lineHeight: '20px' },
  { name: 'subtitle2', size: '14px', weight: '600', lineHeight: '20px' },
  { name: 'body1', size: '16px', weight: '500', lineHeight: '20px' },
  { name: 'body2', size: '14px', weight: '400', lineHeight: '20px' },
  { name: 'caption', size: '12px', weight: '500', lineHeight: '16px' },
];

function walkFiles(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'fonts') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return path.relative(SRC_DIR, file).split(path.sep).join('/');
}

/**
 * Các file còn chữ dưới sàn 12px, kèm SỐ LẦN đo được hôm nay (2026-10-10).
 *
 * Danh sách này là nợ kỹ thuật đã được đo đếm, không phải sự cho phép. Mỗi đợt của
 * Nhịp B phải làm con số giảm; test fail nếu một file vượt quá hạn mức của nó, hoặc
 * nếu một file MỚI xuất hiện mà không có trong danh sách. Khi một file về 0 thì xoá
 * dòng của nó khỏi đây.
 *
 * Đợt xử lý theo kế hoạch:
 *   Task 10 → dashboard-new, ttm-dashboard-2, DashboardInsights, DonutChartCard, FunnelLayers
 *   Task 11 → epic-alerts-15, epic-in-po, reports
 *   Task 12 → admin/*, data-source/*, settings/*, visit-counter/*
 *   Task 13 → login, epic-alerts (legacy), dashboard (legacy), sso
 */
const SUB_FLOOR_BUDGET: Record<string, number> = {
  // `clamp(6.5px…)` / `clamp(7px…)` của KPI strip trong ttm-dashboard-2 — không sửa
  // được bằng codemod vì phải bỏ hẳn cơ chế co font theo container, tức viết lại bố
  // cục card. Xem KPI_TITLE_CLASS / KPI_SUBTITLE_CLASS trong file đó.
  'components/ttm-dashboard-2/DashboardInsights.tsx': 4,
};

/**
 * Sàn CỨNG là 11px, không phải 12px.
 *
 * Type scale của IAS có Caption 12px là bậc nhỏ nhất cho chữ TỰ ĐẶT, nhưng spec
 * COMPONENT của chính IAS dùng 11px ở ba chỗ: header bảng (11px/700), Badge size
 * medium (11px), status pill (11px). Vì vậy 11px hợp lệ, dưới 11px thì không.
 *
 * Vì sao KHÔNG ép tất cả lên 12px: `text-[11px]` chiếm 127 trong 201 chỗ đo được
 * ngày 2026-10-10, và phần lớn nằm trong ô bảng. Nới mỗi ô ra 1px sẽ làm bảng rộng
 * thêm và TÁI SINH đúng lỗi tràn mà cả đợt này đang đi sửa. Nâng các NHÃN ngoài
 * bảng lên Caption 12px là việc theo từng màn hình, không làm bằng regex.
 */
const HARD_FLOOR_PX = 11;

/**
 * Tổng nợ hiện tại — chỉ được giảm.
 * Mốc: 215 (ngưỡng 12px, 2026-10-10) → 201 sau KPI strip dashboard-new
 *      → 4 sau codemod (ngưỡng 11px).
 */
const SUB_FLOOR_TOTAL_AT_BASELINE = 4;

describe('type scale IAS', () => {
  for (const scale of TYPE_SCALE) {
    it(`${scale.name} khớp bảng trong typography-rules.md`, () => {
      assert.equal(resolve(`--type-${scale.name}-size`), scale.size);
      assert.equal(resolve(`--type-${scale.name}-weight`), scale.weight);
      assert.equal(resolve(`--type-${scale.name}-line-height`), scale.lineHeight);
    });

    it(`${scale.name} có utility class .ias-${scale.name}`, () => {
      assert.match(
        IAS_TOKENS_CSS,
        new RegExp(`\\.ias-${scale.name}\\s*\\{`),
        `thiếu class .ias-${scale.name}`,
      );
    });
  }

  it('KHÔNG khai báo Overline — nó không có class trong chính IAS', () => {
    // typography-rules.md: "Do not use the raw var(--type-overline-*) as a workaround
    // either; that's just inventing a class-less exception by another name."
    assert.doesNotMatch(IAS_TOKENS_CODE, /--type-overline/);
    assert.doesNotMatch(IAS_TOKENS_CODE, /\.ias-overline/);
  });

  it('KHÔNG có .ias-button và KHÔNG có uppercase — sentence case thắng', () => {
    // component-rules.md (mới hơn tokens/typography.css): "Sentence case, never
    // uppercase, on all interactive labels... Vietnamese doesn't use letter-casing
    // for emphasis."
    assert.doesNotMatch(IAS_TOKENS_CODE, /\.ias-button\s*\{/);
    assert.doesNotMatch(IAS_TOKENS_CODE, /text-transform:\s*uppercase/);
  });

  it('sàn chữ TỰ ĐẶT là 12px và khớp scale Caption', () => {
    assert.equal(resolve('--ias-type-floor'), '12px');
    assert.equal(resolve('--type-caption-size'), resolve('--ias-type-floor'));
  });

  it('sàn CỨNG là 11px — khớp spec header bảng của IAS', () => {
    // Hai con số khác nhau một cách có chủ đích: 12px là bậc nhỏ nhất của type scale
    // (cho chữ tự đặt), 11px là mức dày nhất mà spec component của IAS dùng
    // (header bảng, Badge medium, status pill). Dưới 11px thì không có gì trong IAS.
    assert.equal(resolve('--ias-type-table-header-size'), '11px');
    assert.equal(Number(resolve('--ias-type-floor').replace('px', '')), 12);
    assert.ok(HARD_FLOOR_PX < Number(resolve('--ias-type-floor').replace('px', '')));
  });

  it('hai cỡ lệch có chủ đích của template được khai báo tường minh', () => {
    assert.equal(resolve('--ias-type-page-title-size'), '20px');
    assert.equal(resolve('--ias-type-page-title-weight'), '700');
    assert.equal(resolve('--ias-type-table-header-size'), '11px');
  });

  it('cỡ số liệu KPI theo anatomy DataCard: 24px bold', () => {
    assert.equal(resolve('--ias-type-metric-size'), '24px');
    assert.equal(resolve('--ias-type-metric-weight'), '700');
  });

  it('khai báo đủ 6 bậc font-weight', () => {
    const expected = {
      light: '300',
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    };
    for (const [name, value] of Object.entries(expected)) {
      assert.equal(resolve(`--font-weight-${name}`), value);
    }
  });
});

describe('contract chống tràn', () => {
  for (const className of [
    'ias-td-truncate',
    'ias-clamp-2',
    'ias-shrinkable',
    'ias-tooltip-bubble',
    'ias-tile-grid',
    'ias-filter-control',
  ]) {
    it(`khai báo .${className}`, () => {
      assert.match(IAS_TOKENS_CSS, new RegExp(`\\.${className}[\\s,{\\[]`));
    });
  }

  it('.ias-td-truncate có cả max-width (nowrap một mình không cắt được gì)', () => {
    const rule = IAS_TOKENS_CSS.match(/\.ias-td-truncate\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.match(rule, /max-width/);
    assert.match(rule, /text-overflow:\s*ellipsis/);
    assert.match(rule, /white-space:\s*nowrap/);
  });

  it('.ias-tooltip-bubble dùng position:fixed để thoát clip của overflow-x:auto', () => {
    const rule = IAS_TOKENS_CSS.match(/\.ias-tooltip-bubble\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.match(rule, /position:\s*fixed/);
    assert.doesNotMatch(rule, /position:\s*absolute/);
  });
});

describe('lint: sàn chữ 12px', () => {
  const sourceFiles = walkFiles(SRC_DIR, ['.tsx', '.ts']).filter(
    (f) => !f.includes('__tests__') && !f.includes('design-system'),
  );

  /**
   * `text-[Npx]`, `text-[N.Npx]`, và cả `clamp(Npx, …)` dùng cho font-size.
   *
   * Ngưỡng là 11px — xem ghi chú ở SUB_FLOOR_BUDGET về vì sao không phải 12px.
   */
  function countSubFloor(content: string): string[] {
    const hits: string[] = [];

    for (const match of content.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (Number(match[1]) < HARD_FLOOR_PX) hits.push(match[0]);
    }
    // clamp() trong font-size: lấy giá trị nhỏ nhất (tham số đầu).
    for (const match of content.matchAll(/clamp\(\s*(\d+(?:\.\d+)?)px/g)) {
      if (Number(match[1]) < HARD_FLOOR_PX) hits.push(match[0]);
    }

    return hits;
  }

  it('không file nào vượt hạn mức nợ kỹ thuật của mình', () => {
    const overBudget: string[] = [];
    const unlisted: string[] = [];

    for (const file of sourceFiles) {
      const hits = countSubFloor(readFileSync(file, 'utf8'));
      if (hits.length === 0) continue;

      const key = relative(file);
      const budget = SUB_FLOOR_BUDGET[key];
      if (budget === undefined) {
        unlisted.push(`${key}: ${hits.length} chỗ (${[...new Set(hits)].slice(0, 5).join(', ')})`);
      } else if (hits.length > budget) {
        overBudget.push(`${key}: ${hits.length} chỗ, hạn mức ${budget}`);
      }
    }

    assert.deepEqual(
      unlisted,
      [],
      'File MỚI có chữ dưới sàn 12px. Dùng scale IAS (nhỏ nhất là Caption 12px) ' +
        'thay vì thêm vào SUB_FLOOR_BUDGET.',
    );
    assert.deepEqual(overBudget, [], 'Nợ kỹ thuật tăng lên — hạn mức chỉ được giảm.');
  });

  it('tổng nợ không vượt mốc baseline', () => {
    const total = sourceFiles.reduce(
      (sum, file) => sum + countSubFloor(readFileSync(file, 'utf8')).length,
      0,
    );
    assert.ok(
      total <= SUB_FLOOR_TOTAL_AT_BASELINE,
      `tổng chữ dưới sàn 12px = ${total}, vượt baseline ${SUB_FLOOR_TOTAL_AT_BASELINE}`,
    );
  });

  it('hạn mức chỉ được co lại — file đã về 0 phải bị xoá khỏi danh sách', () => {
    const shouldBeRemoved: string[] = [];
    for (const [key, budget] of Object.entries(SUB_FLOOR_BUDGET)) {
      const file = path.join(SRC_DIR, key);
      const hits = countSubFloor(readFileSync(file, 'utf8'));
      if (hits.length === 0 && budget === 0) continue;
      if (hits.length < budget) {
        shouldBeRemoved.push(`${key}: còn ${hits.length} chỗ nhưng hạn mức vẫn ${budget}`);
      }
    }
    assert.deepEqual(
      shouldBeRemoved,
      [],
      'Đã sửa bớt rồi thì hạ hạn mức trong SUB_FLOOR_BUDGET cho khớp, để nó không ' +
        'âm thầm cho phép tái phát.',
    );
  });
});

describe('lint: không dùng lại class font-sans', () => {
  it('`font-sans` không xuất hiện ở bất kỳ file nguồn nào', () => {
    // `--font-sans` của @theme không thể trỏ về font brand (next/font sinh biến lúc
    // runtime, Tailwind resolve @theme lúc build). Nên class `font-sans` sẽ ĐÈ font
    // brand bằng font hệ thống trên đúng nhánh DOM đó. Khi nó còn nằm trên <body>,
    // cả app render bằng Segoe UI thay vì font đã preload.
    const offenders: string[] = [];
    for (const file of walkFiles(SRC_DIR, ['.tsx'])) {
      const content = readFileSync(file, 'utf8');
      for (const [index, line] of content.split('\n').entries()) {
        // Bỏ qua comment giải thích chính quy tắc này.
        if (line.includes('`font-sans`')) continue;
        if (/\bfont-sans\b/.test(line)) offenders.push(`${relative(file)}:${index + 1}`);
      }
    }
    assert.deepEqual(offenders, [], 'Bỏ `font-sans`; body đã dùng font brand sẵn.');
  });
});
