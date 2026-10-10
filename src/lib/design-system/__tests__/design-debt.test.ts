/**
 * Task 8 + Task 9 — lint chống tái phát cho tầng thiết kế.
 *
 * Thiếu test này thì toàn bộ công việc ở Nhịp A sẽ bị xói mòn sau vài sprint: hệ token
 * cũ đã có đầy đủ tài liệu (design-system-spec.md) mà vẫn trôi thành 5 bộ palette song
 * song, vì không có gì CHẶN được việc gõ thêm một mã hex.
 *
 * Cơ chế: mọi chỉ số đều có BASELINE đo được ngày chốt. Baseline chỉ được CO LẠI.
 * Test fail khi (a) một file mới xuất hiện ngoài danh sách, (b) một file vượt hạn mức
 * của nó, hoặc (c) một file đã giảm mà hạn mức chưa được hạ theo.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const APP_DIR = path.join(SRC_DIR, 'app');

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

function relative(file: string): string {
  return path.relative(SRC_DIR, file).split(path.sep).join('/');
}

/**
 * Bỏ comment trước khi đo.
 *
 * Một mã hex được NHẮC TỚI trong ghi chú ("phần `bg-[#f8fafc]` khoá cứng theme sáng
 * sẽ xử lý ở Task 10") không phải một quyết định tạo kiểu — tính nó vào nợ kỹ thuật
 * sẽ khiến con số sai, và tệ hơn là khiến người ta không dám viết ghi chú.
 *
 * Chỉ bỏ comment khối, và comment dòng khi dấu `//` MỞ ĐẦU dòng. Không bắt `//` giữa
 * dòng để tránh cắt mất phần sau của `'https://...'` trong code thật.
 */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

const SOURCE_FILES = walk(SRC_DIR, ['.tsx', '.ts']).filter(
  (f) => !f.includes('__tests__') && !f.includes(`${path.sep}design-system${path.sep}`),
);

/* ── Đo ─────────────────────────────────────────────────────────────────────── */

const RAW_PALETTE_HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
] as const;
const RAW_PALETTE_PREFIXES = [
  'text', 'bg', 'border', 'ring', 'from', 'via', 'to', 'fill', 'stroke',
  'divide', 'outline', 'shadow', 'accent', 'decoration', 'caret', 'placeholder',
] as const;
const RAW_PALETTE_PATTERN = new RegExp(
  `\\b(?:${RAW_PALETTE_PREFIXES.join('|')})-(?:${RAW_PALETTE_HUES.join('|')})-\\d{2,3}\\b`,
  'g',
);

const MEASURES = {
  /** Màu gõ tay thay vì token — nguồn gốc của 5 bộ palette song song. */
  hexLiteral: (content: string) => [...content.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]),
  /** rgb()/rgba() gõ tay. */
  rgbLiteral: (content: string) => [...content.matchAll(/\brgba?\([^)]*\)/g)].map((m) => m[0]),
  /** Class bảng màu mặc định của Tailwind — bỏ qua hoàn toàn tầng token, không theo brand. */
  rawPalette: (content: string) => [...content.matchAll(RAW_PALETTE_PATTERN)].map((m) => m[0]),
} as const;

type MeasureName = keyof typeof MEASURES;

/**
 * Baseline đo được 2026-10-10 bằng `node scripts/audit-design-debt.mjs`.
 *
 * Phân đợt xử lý: xem docs/design/IAS-DESIGN-ADOPTION.md.
 */
const BASELINE: Record<MeasureName, { total: number; perFile: Record<string, number> }> = {
  /**
   * 341 (lúc chốt baseline 2026-10-10) → 322 sau KPI strip dashboard-new → 131 sau
   * codemod `scripts/codemod-ias-tokens.mjs`.
   *
   * 131 chỗ còn lại KHÔNG cùng loại nợ với 191 chỗ đã dọn. Codemod chỉ đổi màu nằm
   * trong NGỮ CẢNH CSS (class Tailwind arbitrary value). Số còn lại nằm trong chuỗi
   * JS và thuộc tính SVG — ở đó `var()` KHÔNG resolve được, vì thuộc tính SVG không
   * phải CSS. Muốn dọn phải đổi sang `style={{ fill }}` hoặc class, tức sửa cấu trúc,
   * nên để làm theo từng màn hình.
   */
  hexLiteral: {
    total: 133,
    perFile: {
      // Màu truyền vào SVG phễu/donut dưới dạng prop (fill / lidFill / labelColor).
      'app/ttm-dashboard-2/page.tsx': 36,
      'components/ttm-dashboard-2/FunnelLayers.tsx': 5,
      'components/ttm-dashboard-2/DashboardInsights.tsx': 4,
      'components/dashboard-new/DonutChartCard.tsx': 7,
      // Bảng tra màu trạng thái dưới dạng object JS.
      'app/epic-alerts/page.tsx': 8,
      'app/epic-alerts-15/page.tsx': 8,
      'app/epic-in-po/page.tsx': 5,
      'app/reports/page.tsx': 8,
      'components/layout/HelpPanels.tsx': 8,
      /* Alert của trang login dùng tổ hợp hồng `#FFB6C1`/`#FFC0CB`/`#8B4513`.
         Codemod ban đầu đổi riêng màu chữ sang `--color-text-warning` (#946200) và
         việc đó ĐÃ ĐƯỢC HOÀN TÁC: #946200 trên nền #FFC0CB chỉ đạt ~4.0:1, còn
         #8B4513 nguyên bản đạt ~4.6:1 — tức codemod tự làm tương phản TỆ ĐI.
         Chuyển cả tổ hợp sang bộ error của IAS (`--color-bg-error` +
         `--color-text-error`) thì đúng chuẩn, nhưng sẽ bỏ màu hồng mà chủ sở hữu
         chọn — tức đổi ý định thiết kế, vượt khỏi phạm vi chuẩn hoá thuần hình ảnh.
         Cần chủ sở hữu quyết định. */
      'app/login/page.tsx': 6,
      'components/visit-counter/VisitCounterPanel.tsx': 4,
      'components/ui/ToolbarMultiSelect.tsx': 2,

      /* NGOẠI LỆ HỢP LỆ — các chỗ dưới đây PHẢI là hex literal, hạn mức không về 0:

         - AppearancePanel: swatch xem trước của từng brand. Mỗi swatch phải hiển thị
           màu THẬT của brand đó (`#f4f6fa`/`#141ed2`/`#14142a` cho ias,
           `#e8ebe6`/`#9fe870`/`#0e0f0c` cho wise, …) ngay khi người dùng đang ở một
           brand khác — dùng token sẽ ra màu của brand hiện tại cho cả bốn ô.
         - api/mcp/oauth/*: HTML trang consent OAuth render phía server dưới dạng
           chuỗi, không đi qua CSS của app.
         - captcha-service: màu vẽ ảnh captcha trên canvas, không phải CSS.
         - TtmBlackListDot: AGENTS.md quy định icon `Checks` ở cột R4Golive/Released
           phải là màu ĐEN `#000000`. */
      'components/settings/AppearancePanel.tsx': 12,
      'app/api/mcp/oauth/authorize/route.ts': 13,
      'app/api/mcp/oauth/consent/route.ts': 3,
      'lib/captcha-service.ts': 3,
      'components/ui/TtmBlackListDot.tsx': 1,
    },
  },
  rgbLiteral: {
    total: 8,
    perFile: {
      // HTML render phía server — xem ghi chú ngoại lệ ở hexLiteral.
      'app/api/mcp/oauth/authorize/route.ts': 4,
      'app/api/mcp/oauth/consent/route.ts': 1,
      // Shadow của toast và một tint tím.
      'components/ui/Toast.tsx': 2,
      'components/layout/HelpPanels.tsx': 1,
    },
  },
  /**
   * 593 → 591 → 567 sau KPI strip dashboard-new → 42 sau codemod (−93%).
   *
   * 40/42 còn lại ở `VisitCounterPanel` — các chip trên NỀN TỐI
   * (`bg-emerald-950/40`, `text-amber-400`, `bg-blue-900/40`). Map sang token mặt sáng
   * sẽ phá tương phản, nên panel đó bị loại khỏi codemod có chủ đích; cần làm lại bố
   * cục cùng lúc chứ không đổi màu riêng lẻ.
   */
  rawPalette: {
    total: 42,
    perFile: {
      'components/visit-counter/VisitCounterPanel.tsx': 40,
      'app/sso-demo/page.tsx': 2,
    },
  },
};

function measureAll(measure: MeasureName): { total: number; perFile: Map<string, number> } {
  let total = 0;
  const perFile = new Map<string, number>();
  for (const file of SOURCE_FILES) {
    const hits = MEASURES[measure](stripComments(readFileSync(file, 'utf8')));
    if (hits.length === 0) continue;
    total += hits.length;
    perFile.set(relative(file), hits.length);
  }
  return { total, perFile };
}

describe('lint: nợ kỹ thuật thiết kế chỉ được giảm', () => {
  for (const measure of Object.keys(MEASURES) as MeasureName[]) {
    it(`${measure}: tổng không vượt baseline`, () => {
      const { total } = measureAll(measure);
      assert.ok(
        total <= BASELINE[measure].total,
        `${measure} = ${total}, vượt baseline ${BASELINE[measure].total}.\n` +
          'Dùng semantic alias của IAS (--color-text-*/--color-bg-*/--color-border-*/' +
          '--color-icon-*) thay vì màu gõ tay. Chạy ' +
          '`node scripts/audit-design-debt.mjs` để xem chi tiết.',
      );
    });

    it(`${measure}: không file nào trong danh sách theo dõi vượt hạn mức riêng`, () => {
      const { perFile } = measureAll(measure);
      const overBudget: string[] = [];
      for (const [file, budget] of Object.entries(BASELINE[measure].perFile)) {
        const actual = perFile.get(file) ?? 0;
        if (actual > budget) overBudget.push(`${file}: ${actual} > ${budget}`);
      }
      assert.deepEqual(overBudget, []);
    });
  }

  it('hạn mức per-file đã lạc hậu phải được hạ theo', () => {
    const stale: string[] = [];
    for (const measure of Object.keys(MEASURES) as MeasureName[]) {
      const { perFile } = measureAll(measure);
      for (const [file, budget] of Object.entries(BASELINE[measure].perFile)) {
        const actual = perFile.get(file) ?? 0;
        if (actual < budget) stale.push(`${measure} · ${file}: còn ${actual} nhưng hạn mức ${budget}`);
      }
    }
    assert.deepEqual(
      stale,
      [],
      'Đã sửa bớt thì hạ hạn mức cho khớp, để nó không âm thầm cho phép tái phát.',
    );
  });
});

describe('lint: không import CSS chéo route', () => {
  it('không file nào trong src/app/<route>/ import CSS của route khác', () => {
    // Đây là lỗi đã khiến `:root { --ttm-* }` và `.has-filter { … !important }` của
    // /epic-alerts-15 leak ra toàn document, và khiến giá trị cuối cùng phụ thuộc
    // thứ tự nạp chunk CSS — không xác định.
    const offenders: string[] = [];
    for (const file of walk(APP_DIR, ['.tsx'])) {
      const ownRoute = path.relative(APP_DIR, path.dirname(file)).split(path.sep)[0];
      const content = stripComments(readFileSync(file, 'utf8'));
      for (const match of content.matchAll(/import\s+['"]@\/app\/([^'"]+\.css)['"]/g)) {
        const importedRoute = match[1].split('/')[0];
        // CSS dùng chung đặt ngay trong src/app/ (không thuộc route nào) thì hợp lệ.
        if (!match[1].includes('/')) continue;
        if (importedRoute !== ownRoute) {
          offenders.push(`${relative(file)} → @/app/${match[1]}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'Trích phần dùng chung ra src/app/ttm-shared.css thay vì nạp CSS global của route khác.',
    );
  });

  it('hai dashboard dùng ttm-shared.css, không dùng epic-alerts-15.css', () => {
    for (const route of ['dashboard-new', 'ttm-dashboard-2']) {
      // Bỏ comment: ghi chú ở hai file này có nhắc lại đúng câu import cũ để giải
      // thích vì sao nó bị thay.
      const content = stripComments(readFileSync(path.join(APP_DIR, route, 'page.tsx'), 'utf8'));
      assert.match(content, /@\/app\/ttm-shared\.css/, `${route} chưa nạp ttm-shared.css`);
      assert.doesNotMatch(
        content,
        /epic-alerts-15\.css/,
        `${route} vẫn còn import CSS của /epic-alerts-15`,
      );
    }
  });
});

describe('lint: !important trong CSS theo route', () => {
  /**
   * Số `!important` còn LẠI HỢP LỆ sau Task 8 — chúng cần thiết để thắng utility class
   * của Tailwind áp trực tiếp trên cùng element (cột thu gọn, z-index của ô dính).
   * Toàn bộ `!important` của nhóm `.has-filter` / `[type="search"]` đã bị bỏ: ở đó nó
   * chỉ cần cho selector `.has-filter` ĐỨNG MỘT MÌNH, và tách selector là đủ.
   */
  const IMPORTANT_BUDGET: Record<string, number> = {
    'epic-alerts/epic-alerts.css': 0,
    'epic-alerts-15/epic-alerts-15.css': 2,
    'epic-in-po/epic-in-po.css': 2,
  };

  for (const [file, budget] of Object.entries(IMPORTANT_BUDGET)) {
    it(`${file}: tối đa ${budget} chỗ !important`, () => {
      const content = readFileSync(path.join(APP_DIR, file), 'utf8');
      // Bỏ comment trước khi đếm — ghi chú giải thích chính quy tắc này có chứa từ đó.
      const code = content.replace(/\/\*[\s\S]*?\*\//g, '');
      const count = [...code.matchAll(/!important/g)].length;
      assert.ok(count <= budget, `${file} có ${count} chỗ !important, hạn mức ${budget}`);
    });
  }

  it('không còn !important nào trong nhóm has-filter', () => {
    for (const file of Object.keys(IMPORTANT_BUDGET)) {
      const code = readFileSync(path.join(APP_DIR, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );
      for (const match of code.matchAll(/\.has-filter[^{]*\{([^}]*)\}/g)) {
        assert.doesNotMatch(match[1], /!important/, `${file}: has-filter còn !important`);
      }
    }
  });

  it('không còn hex #dc2626 gõ tay cho viền bộ lọc', () => {
    for (const file of Object.keys(IMPORTANT_BUDGET)) {
      const code = readFileSync(path.join(APP_DIR, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );
      for (const match of code.matchAll(/\.has-filter[^{]*\{([^}]*)\}/g)) {
        assert.doesNotMatch(match[1], /#dc2626/, `${file}: dùng var(--color-border-error)`);
      }
    }
  });
});

describe('ttm-shared.css — remap token và clamp bề rộng', () => {
  const SHARED_CSS = readFileSync(path.join(APP_DIR, 'ttm-shared.css'), 'utf8');

  it('remap đặt ở :root[data-brand="ias"] để không phụ thuộc thứ tự nạp chunk', () => {
    // Quan trọng: `:root[data-brand="ias"]` là 0-2-0, thắng `:root` (0-1-0) của ba
    // file route BẤT KỂ file nào được nạp trước.
    assert.match(SHARED_CSS, /:root\[data-brand="ias"\]\s*\{/);
  });

  it('--ttm-font trỏ về font brand, không còn khoá cứng Segoe UI', () => {
    // Trước đây `--ttm-font: "Segoe UI", Arial, …` + `.ttm-app { font-family: var(--ttm-font) }`
    // khiến /epic-alerts, /epic-alerts-15, /epic-in-po và cả hai dashboard (qua import
    // chéo route) CHƯA BAO GIỜ dùng font brand — kể cả sau khi sửa lỗi `font-sans` ở <body>.
    assert.match(SHARED_CSS, /--ttm-font:\s*var\(--font-family-body\)/);
    const code = SHARED_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /Segoe UI/);
  });

  it('--ttm-font-size-xs được nâng lên sàn 12px', () => {
    // Giá trị cũ là 10.5px, dưới sàn Caption của IAS.
    assert.match(SHARED_CSS, /--ttm-font-size-xs:\s*var\(--type-caption-size\)/);
  });

  it('clamp bề rộng là MẶC ĐỊNH cho .ttm-field/.ttm-select', () => {
    // Trước Task 8, toàn bộ clamp chỉ nằm trong biến thể `.ttm-toolbar-row`
    // (epic-alerts-15.css:672-696) mà hai dashboard lại không dùng class đó — nên
    // <select> nở theo <option> dài nhất và đẩy hàng filter tràn ngang.
    const rule = SHARED_CSS.match(/\.ttm-field,\s*\n\.ttm-select\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.match(rule, /max-width:\s*220px/);
    assert.match(rule, /min-width:\s*0/);
    assert.match(rule, /text-overflow:\s*ellipsis/);
  });

  it('input[type=date] được phép co — UA ép min intrinsic ~110-130px', () => {
    assert.match(SHARED_CSS, /\.ttm-field\[type='date'\]/);
  });

  it('ba file route cùng nạp ttm-shared.css', () => {
    for (const route of ['epic-alerts', 'epic-alerts-15', 'epic-in-po']) {
      const css = readFileSync(path.join(APP_DIR, route, `${route}.css`), 'utf8');
      assert.match(css, /@import\s+'\.\.\/ttm-shared\.css'/, `${route}.css chưa nạp`);
    }
  });
});
