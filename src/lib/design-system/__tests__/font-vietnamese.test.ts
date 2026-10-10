/**
 * Cửa gate Task 1 — regression test cho glyph tiếng Việt của font brand.
 *
 * Test này canh một lỗi KHÔNG bao giờ hiện ra ở console: khi font thiếu glyph, browser
 * fallback theo từng glyph, nên chữ có dấu render bằng font khác ngay trong cùng một từ.
 * Lỗi chỉ thấy bằng mắt, và rất dễ lọt qua review vì phần lớn tên biến/nhãn kỹ thuật là
 * tiếng Anh không dấu.
 *
 * Vì vậy: mỗi lần đổi/thêm/subset lại font brand, test này phải chạy lại.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { readFontCharset } from '../font-cmap';
import {
  VIETNAMESE_REQUIRED_CODEPOINTS,
  VIETNAMESE_CHARSET_GROUPS,
  checkVietnameseCoverage,
  formatCodepoint,
} from '../vietnamese-charset';

const FONT_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'app', 'fonts');

/** Weight mà app thực sự nạp (xem src/app/layout.tsx). Thiếu một file là lỗi cấu hình. */
const EXPECTED_WEIGHTS = [400, 600, 700] as const;

function fontFileFor(weight: number): string {
  return path.join(FONT_DIR, `averta-std-cy-${weight}.woff2`);
}

describe('bộ ký tự tiếng Việt', () => {
  it('gồm đúng 134 codepoint bắt buộc, không trùng lặp', () => {
    assert.equal(VIETNAMESE_REQUIRED_CODEPOINTS.length, 134);
    assert.equal(new Set(VIETNAMESE_REQUIRED_CODEPOINTS).size, 134);
  });

  it('phủ trọn khối Latin Extended Additional U+1EA0–U+1EF9', () => {
    const extAdditional = VIETNAMESE_CHARSET_GROUPS.find(
      (g) => g.name === 'Latin Extended Additional',
    );
    assert.ok(extAdditional, 'thiếu nhóm Latin Extended Additional');
    assert.equal(extAdditional.codepoints.length, 90);
    assert.equal(extAdditional.codepoints[0], 0x1ea0);
    assert.equal(extAdditional.codepoints.at(-1), 0x1ef9);
  });

  it('báo thiếu khi charset rỗng', () => {
    const result = checkVietnameseCoverage(new Set());
    assert.equal(result.missing.length, 134);
    assert.equal(result.coveragePercent, 0);
  });

  it('báo đủ khi charset chứa trọn bộ', () => {
    const result = checkVietnameseCoverage(new Set(VIETNAMESE_REQUIRED_CODEPOINTS));
    assert.equal(result.missing.length, 0);
    assert.equal(result.coveragePercent, 100);
  });
});

describe('font brand ship trong repo', () => {
  it('có đủ file WOFF2 cho mọi weight app nạp', () => {
    assert.ok(existsSync(FONT_DIR), `thiếu thư mục font: ${FONT_DIR}`);
    for (const weight of EXPECTED_WEIGHTS) {
      assert.ok(
        existsSync(fontFileFor(weight)),
        `thiếu font weight ${weight}: ${fontFileFor(weight)}\n` +
          'Chạy lại: python scripts/build-brand-font.py',
      );
    }
  });

  it('không ship weight lạ ngoài danh sách app nạp', () => {
    // Bắt trường hợp copy thêm file vào mà quên khai báo @font-face — font tải về
    // nhưng không bao giờ dùng, hoặc ngược lại khai báo thừa dẫn tới 404.
    const shipped = readdirSync(FONT_DIR)
      .filter((f) => f.endsWith('.woff2'))
      .sort();
    const expected = EXPECTED_WEIGHTS.map((w) => `averta-std-cy-${w}.woff2`).sort();
    assert.deepEqual(shipped, expected);
  });

  for (const weight of EXPECTED_WEIGHTS) {
    it(`weight ${weight} phủ 100% ký tự tiếng Việt`, () => {
      const data = readFileSync(fontFileFor(weight));
      const { codepoints, familyName } = readFontCharset(data);
      const coverage = checkVietnameseCoverage(codepoints);

      assert.equal(
        coverage.missing.length,
        0,
        `weight ${weight} (${familyName ?? 'không đọc được family'}) thiếu ` +
          `${coverage.missing.length} glyph: ` +
          coverage.missing.slice(0, 20).map(formatCodepoint).join(', ') +
          (coverage.missing.length > 20 ? ` … (+${coverage.missing.length - 20})` : '') +
          '\nFont thiếu glyph sẽ khiến browser fallback theo từng glyph — chữ có dấu ' +
          'render bằng font khác ngay trong cùng một từ.',
      );
      assert.equal(coverage.coveragePercent, 100);
    });

    it(`weight ${weight} vẫn giữ các ký tự ASCII và dấu câu cơ bản`, () => {
      // Subset quá tay là lỗi dễ xảy ra: giữ được chữ Việt nhưng mất "–", "…", "•".
      const data = readFileSync(fontFileFor(weight));
      const { codepoints } = readFontCharset(data);
      const essentials = [
        0x0041, // A
        0x007a, // z
        0x0030, // 0
        0x0039, // 9
        0x0025, // %
        0x002f, // /
        0x0028, // (
        0x2013, // – en dash (dùng trong khoảng ngày)
        0x2014, // — em dash
        0x2026, // … ellipsis (truncate)
        0x2022, // • bullet
        0x00d7, // × (dấu đóng)
      ];
      const missing = essentials.filter((cp) => !codepoints.has(cp));
      assert.deepEqual(
        missing.map(formatCodepoint),
        [],
        `weight ${weight} bị subset mất ký tự cơ bản — nới UNICODE_RANGES trong ` +
          'scripts/build-brand-font.py',
      );
    });
  }

  it('mỗi weight dưới 60KB — subset còn hiệu lực', () => {
    // Nếu ai đó copy thẳng OTF (~131KB) hoặc bỏ bước subset, số này sẽ vọt lên.
    for (const weight of EXPECTED_WEIGHTS) {
      const sizeKb = readFileSync(fontFileFor(weight)).byteLength / 1024;
      assert.ok(
        sizeKb < 60,
        `weight ${weight} nặng ${sizeKb.toFixed(1)}KB — quá 60KB, có vẻ chưa subset/WOFF2`,
      );
    }
  });
});
