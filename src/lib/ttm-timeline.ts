/**
 * Logic thuần của timeline SVG trên màn hình TTM Calculator (REQ-20261119-02): xác định ngày làm việc / ngày nghỉ
 * theo cấu hình của ứng dụng, và sinh lưới các ngày trong khoảng [firstDay, lastDay]. Tách khỏi component để test đơn vị.
 * Pure: không phụ thuộc React, database hay đồng hồ.
 */

/** Một ngày dạng `YYYY-MM-DD` trên timeline, kèm trạng thái ngày nghỉ. */
export interface TimelineDay {
  iso: string;
  /** Ngày nghỉ theo logic `addWorkingDays`: không phải ngày làm bù và là Thứ 7/Chủ nhật/ngày Lễ cấu hình. */
  isNonWorking: boolean;
  /** Chữ trong thứ (CN, T2, …, T7) — đã dùng `getUTCDay()` để không phụ thuộc múi giờ server. */
  weekday: string;
  /** Số ngày trong tháng (1-31). */
  day: number;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** Ngày tiếp theo (calendar day) của một `YYYY-MM-DD`. */
export function nextCalendarDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Một ngày có phải "ngày nghỉ" trên timeline không: ngày làm bù (makeup workday) luôn là ngày làm việc (đúng logic
 * `addWorkingDays` trong `src/lib/scoring/dates.ts`); ngược lại Thứ 7 / Chủ nhật / ngày Lễ cấu hình là ngày nghỉ.
 */
export function isNonWorkingDayForTimeline(iso: string, holidays: ReadonlySet<string>, workdays: ReadonlySet<string>): boolean {
  if (workdays.has(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6 || holidays.has(iso);
}

/** Sinh lưới các ngày từ `first` đến `last` (bao gồm cả hai đầu). Trả về [] nếu `last` trước `first`. */
export function buildTimelineDays(first: string, last: string, holidays: ReadonlySet<string>, workdays: ReadonlySet<string>): TimelineDay[] {
  const days: TimelineDay[] = [];
  let cursor = first;
  let guard = 0;
  while (cursor <= last && guard < 1000) {
    const [year, month, day] = cursor.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    days.push({ iso: cursor, isNonWorking: isNonWorkingDayForTimeline(cursor, holidays, workdays), weekday, day });
    cursor = nextCalendarDay(cursor);
    guard += 1;
  }
  return days;
}
