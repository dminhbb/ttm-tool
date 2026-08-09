export type HolidaySet = Set<string>;

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** True if `date` is a Saturday, Sunday, or falls inside an active holiday range. */
export function isNonWorkingDay(date: Date, holidays: HolidaySet): boolean {
  return isWeekend(date) || holidays.has(toDateKey(date));
}

/** Adds `offset` working days to `date`, skipping weekends and configured holidays. */
export function addWorkingDays(date: Date, offset: number, holidays: HolidaySet = new Set()): Date {
  const result = atMidnight(date);
  let remaining = offset;
  const step = remaining >= 0 ? 1 : -1;
  while (remaining !== 0) {
    result.setDate(result.getDate() + step);
    if (!isNonWorkingDay(result, holidays)) remaining -= step;
  }
  return result;
}

/** Counts working days strictly between `from` and `to` (exclusive of `from`, inclusive of `to`). Negative if `to` is before `from`. */
export function diffWorkingDays(from: Date, to: Date, holidays: HolidaySet = new Set()): number {
  const start = atMidnight(from);
  const end = atMidnight(to);
  if (end.getTime() === start.getTime()) return 0;

  const direction = end.getTime() > start.getTime() ? 1 : -1;
  const cursor = new Date(start);
  let count = 0;
  while (cursor.getTime() !== end.getTime()) {
    cursor.setDate(cursor.getDate() + direction);
    if (!isNonWorkingDay(cursor, holidays)) count += direction;
  }
  return count;
}

/** Expands a list of [start, end] date ranges into a flat set of "YYYY-MM-DD" keys. */
export function expandHolidayRanges(ranges: { endDate: string; startDate: string }[]): HolidaySet {
  const set: HolidaySet = new Set();
  for (const range of ranges) {
    const cursor = atMidnight(new Date(range.startDate));
    const end = atMidnight(new Date(range.endDate));
    while (cursor.getTime() <= end.getTime()) {
      set.add(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return set;
}
