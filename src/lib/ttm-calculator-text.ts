/**
 * "TTM Calculator" — nhập bằng text. Pure: no database, no clock (the caller passes today's year).
 *
 * Một dòng như "Cải tiến, Level 2, 11/11/2026" được tách thành 3 thông tin: Loại yêu cầu, Requirement level, Start date.
 * Trình tự các phần trong câu không quan trọng. Chuỗi được chuẩn hoá trước (bỏ dấu tiếng Việt, đ → d, chữ thường)
 * rồi chạy 3 Regular Expression theo thứ tự: ngày → level → loại yêu cầu.
 */

export const CALCULATOR_REQUEST_TYPES = ['Tính năng mới', 'Cải tiến', 'Sản phẩm/dịch vụ/quy trình mới', 'Sản phẩm'] as const;
export type CalculatorRequestType = (typeof CALCULATOR_REQUEST_TYPES)[number];
export const CALCULATOR_LEVELS = ['1', '2', '3', '4'] as const;

/** Ngày: d/m, d/m/yy, d/m/yyyy (phân cách "/", "." hoặc "-"). Không dính vào số lớn hơn xung quanh. */
export const DATE_PATTERN = /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?!\d)/;
/** Level: từ khoá level / lv / l / cap / muc (đứng riêng) + chữ số 1-4. */
export const LEVEL_PATTERN = /(?<![a-z0-9])(?:level|lv|l|cap|muc)\s*[:=-]?\s*([1-4])(?!\d)/;
/** Dùng để báo lỗi khi có từ khoá level nhưng số nằm ngoài 1-4. */
const LEVEL_ANY_NUMBER_PATTERN = /(?<![a-z0-9])(?:level|lv|l|cap|muc)\s*[:=-]?\s*(\d+)/;
/** Loại yêu cầu — cụm dài xếp trước để "Sản phẩm/dịch vụ/quy trình mới" thắng "Sản phẩm". */
export const REQUEST_TYPE_PATTERN = /(san\s*pham\s*\/\s*dich\s*vu\s*\/\s*quy\s*trinh\s*moi)|(tinh\s*nang\s*moi)|(cai\s*tien)|(san\s*pham)/;
const REQUEST_TYPE_BY_GROUP: readonly CalculatorRequestType[] = ['Sản phẩm/dịch vụ/quy trình mới', 'Tính năng mới', 'Cải tiến', 'Sản phẩm'];

export interface CalculatorTextResult {
  level: (typeof CALCULATOR_LEVELS)[number] | null;
  /** Lý do từng thông tin không nhận dạng được. */
  problems: string[];
  requestType: CalculatorRequestType | null;
  /** "YYYY-MM-DD". */
  startDate: string | null;
}

/** Bỏ dấu tiếng Việt, đ → d, chữ thường, gom khoảng trắng. */
export function normalizeCalculatorText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

export function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function toIsoFromParts(year: number, month: number, day: number): string | null {
  return isRealDate(year, month, day) ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export function parseCalculatorText(text: string, currentYear: number): CalculatorTextResult {
  const normalized = normalizeCalculatorText(text);
  const problems: string[] = [];

  // 1) Ngày — cắt khỏi chuỗi để chữ số của ngày không bị nhận nhầm là level.
  let startDate: string | null = null;
  let rest = normalized;
  const dateMatch = DATE_PATTERN.exec(normalized);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const rawYear = dateMatch[3];
    const year = rawYear === undefined ? currentYear : rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    startDate = toIsoFromParts(year, month, day);
    if (!startDate) problems.push(`Ngày "${dateMatch[0]}" không tồn tại trong lịch.`);
    rest = `${normalized.slice(0, dateMatch.index)} ${normalized.slice(dateMatch.index + dateMatch[0].length)}`;
  } else {
    problems.push('Không tìm thấy Start date (ví dụ 31/7, 31/07/2026, 31/7/26).');
  }

  // 2) Level.
  let level: CalculatorTextResult['level'] = null;
  const levelMatch = LEVEL_PATTERN.exec(rest);
  if (levelMatch) {
    level = levelMatch[1] as (typeof CALCULATOR_LEVELS)[number];
  } else {
    const anyNumber = LEVEL_ANY_NUMBER_PATTERN.exec(rest);
    problems.push(anyNumber ? `Level "${anyNumber[1]}" không hợp lệ — chỉ nhận 1, 2, 3 hoặc 4.` : 'Không tìm thấy Requirement level (ví dụ "Level 2").');
  }

  // 3) Loại yêu cầu.
  let requestType: CalculatorRequestType | null = null;
  const typeMatch = REQUEST_TYPE_PATTERN.exec(rest);
  if (typeMatch) {
    requestType = REQUEST_TYPE_BY_GROUP[typeMatch.slice(1).findIndex((group) => group !== undefined)] ?? null;
  } else {
    problems.push('Không tìm thấy Loại yêu cầu (Tính năng mới, Cải tiến, Sản phẩm/dịch vụ/quy trình mới, Sản phẩm).');
  }

  return { level, problems, requestType, startDate };
}
