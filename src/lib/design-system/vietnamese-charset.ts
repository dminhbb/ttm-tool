/**
 * Bộ ký tự tiếng Việt bắt buộc cho mọi font dùng làm body text của ứng dụng.
 *
 * Lý do file này tồn tại: "Averta Std CY" (bộ font trong `ias-design/fonts`) là biến thể
 * **Cyrillic**. Một font Cyrillic không bảo đảm có khối Latin Extended Additional
 * (U+1EA0–U+1EF9) — nơi chứa phần lớn chữ tiếng Việt có dấu. Khi font thiếu glyph,
 * browser không báo lỗi: nó fallback **theo từng glyph**, nên "Hoàn thành" render một
 * phần bằng font brand còn `ồ`/`à` nhảy sang font hệ thống, lệch chiều cao và nét đậm
 * ngay trong cùng một từ — tệ hơn là dùng một font duy nhất không phải brand.
 *
 * Vì vậy việc nạp một font mới PHẢI đi qua cửa kiểm tra này trước.
 */

/** Một khối codepoint liên tục cần kiểm tra. */
export interface CharsetBlock {
  /** Tên khối Unicode, dùng để in báo cáo. */
  readonly name: string;
  /** Codepoint đầu (đã bao gồm). */
  readonly from: number;
  /** Codepoint cuối (đã bao gồm). */
  readonly to: number;
}

/**
 * Các ký tự tiếng Việt nằm rải rác trong Latin-1 Supplement.
 * Không liên tục, nên liệt kê tường minh thay vì dùng khoảng.
 */
const LATIN1_VIETNAMESE = [
  0x00c0, 0x00c1, 0x00c2, 0x00c3, // À Á Â Ã
  0x00c8, 0x00c9, 0x00ca, // È É Ê
  0x00cc, 0x00cd, // Ì Í
  0x00d2, 0x00d3, 0x00d4, 0x00d5, // Ò Ó Ô Õ
  0x00d9, 0x00da, // Ù Ú
  0x00dd, // Ý
  0x00e0, 0x00e1, 0x00e2, 0x00e3, // à á â ã
  0x00e8, 0x00e9, 0x00ea, // è é ê
  0x00ec, 0x00ed, // ì í
  0x00f2, 0x00f3, 0x00f4, 0x00f5, // ò ó ô õ
  0x00f9, 0x00fa, // ù ú
  0x00fd, // ý
] as const;

/** Ă ă Đ đ Ĩ ĩ Ũ ũ — Latin Extended-A. */
const LATIN_EXT_A_VIETNAMESE = [
  0x0102, 0x0103, // Ă ă
  0x0110, 0x0111, // Đ đ
  0x0128, 0x0129, // Ĩ ĩ
  0x0168, 0x0169, // Ũ ũ
] as const;

/** Ơ ơ Ư ư — Latin Extended-B. */
const LATIN_EXT_B_VIETNAMESE = [
  0x01a0, 0x01a1, // Ơ ơ
  0x01af, 0x01b0, // Ư ư
] as const;

/**
 * Latin Extended Additional — toàn bộ khoảng U+1EA0–U+1EF9 đều là chữ tiếng Việt
 * (Ạ ạ Ả ả … Ỹ ỹ), 90 codepoint liên tục. Đây chính là khối mà một font Cyrillic
 * có nguy cơ thiếu nhất.
 */
export const LATIN_EXT_ADDITIONAL_BLOCK: CharsetBlock = {
  name: 'Latin Extended Additional',
  from: 0x1ea0,
  to: 0x1ef9,
};

function expandBlock(block: CharsetBlock): number[] {
  const out: number[] = [];
  for (let cp = block.from; cp <= block.to; cp += 1) out.push(cp);
  return out;
}

/**
 * 134 codepoint tiếng Việt bắt buộc (32 Latin-1 + 8 Ext-A + 4 Ext-B + 90 Ext Additional).
 * Đây là tập "chữ dựng sẵn" (precomposed) — dạng NFC mà browser dùng để render.
 */
export const VIETNAMESE_REQUIRED_CODEPOINTS: readonly number[] = Object.freeze([
  ...LATIN1_VIETNAMESE,
  ...LATIN_EXT_A_VIETNAMESE,
  ...LATIN_EXT_B_VIETNAMESE,
  ...expandBlock(LATIN_EXT_ADDITIONAL_BLOCK),
]);

/**
 * Nhóm codepoint theo khối Unicode, chỉ để in báo cáo cho dễ đọc.
 */
export const VIETNAMESE_CHARSET_GROUPS: readonly { name: string; codepoints: readonly number[] }[] =
  Object.freeze([
    { name: 'Latin-1 Supplement', codepoints: LATIN1_VIETNAMESE },
    { name: 'Latin Extended-A', codepoints: LATIN_EXT_A_VIETNAMESE },
    { name: 'Latin Extended-B', codepoints: LATIN_EXT_B_VIETNAMESE },
    { name: LATIN_EXT_ADDITIONAL_BLOCK.name, codepoints: expandBlock(LATIN_EXT_ADDITIONAL_BLOCK) },
  ]);

/**
 * Các ký tự "nên có" nhưng không chặn việc chọn font: dấu ₫, và các dấu thanh tổ hợp
 * dùng khi text ở dạng NFD (một số nguồn dữ liệu Jira trả về dạng này).
 */
export const VIETNAMESE_OPTIONAL_CODEPOINTS: readonly number[] = Object.freeze([
  0x20ab, // ₫ dong sign
  0x0300, // combining grave
  0x0301, // combining acute
  0x0303, // combining tilde
  0x0309, // combining hook above
  0x0323, // combining dot below
]);

/** Chuỗi kiểm tra bằng mắt: phủ đủ 5 dấu thanh + mọi nguyên âm biến đổi của tiếng Việt. */
export const VIETNAMESE_PANGRAM =
  'Hoàn thành TTM-CNTT (QLDA) — Đơn vị yêu cầu đã rà soát kỹ lưỡng, Epic chưa có mốc R4Golive.';

/** Định dạng codepoint thành `U+XXXX` để in báo cáo. */
export function formatCodepoint(codepoint: number): string {
  return `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

export interface CoverageResult {
  /** Codepoint bắt buộc nhưng font không có. */
  readonly missing: readonly number[];
  /** Codepoint "nên có" mà font không có — chỉ cảnh báo, không chặn. */
  readonly missingOptional: readonly number[];
  readonly requiredTotal: number;
  /** Tỉ lệ phủ các codepoint bắt buộc, 0–100, làm tròn 1 chữ số. */
  readonly coveragePercent: number;
}

/**
 * Đối chiếu charset của một font với bộ ký tự tiếng Việt bắt buộc.
 */
export function checkVietnameseCoverage(charset: ReadonlySet<number>): CoverageResult {
  const missing = VIETNAMESE_REQUIRED_CODEPOINTS.filter((cp) => !charset.has(cp));
  const missingOptional = VIETNAMESE_OPTIONAL_CODEPOINTS.filter((cp) => !charset.has(cp));
  const requiredTotal = VIETNAMESE_REQUIRED_CODEPOINTS.length;
  const covered = requiredTotal - missing.length;
  return {
    missing,
    missingOptional,
    requiredTotal,
    coveragePercent: Math.round((covered / requiredTotal) * 1000) / 10,
  };
}
