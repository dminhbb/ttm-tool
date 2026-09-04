/**
 * Working-day engine's calendar overrides. `holidays` are dates excluded from working days
 * regardless of weekday (Sat/Sun included — e.g. a public holiday that happens to fall midweek is
 * already excluded by isWeekend, but this also covers weekday holidays). `workdays` are the
 * opposite: "ngày làm bù" (Vietnamese compensatory workdays) — a Saturday or Sunday explicitly
 * declared a normal working day, to make up for an extended holiday block before/after it. A date
 * in `workdays` always wins over both the weekend check and `holidays` (see isNonWorkingDay) —
 * declaring a date a makeup workday is a deliberate override, so it should never silently lose to
 * an overlapping holiday range or the weekend default.
 */
export interface HolidaySet {
  holidays: Set<string>;
  workdays: Set<string>;
}

export function emptyHolidaySet(): HolidaySet {
  return { holidays: new Set(), workdays: new Set() };
}

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Core logic: the ONLY correct way to turn a Date into a "YYYY-MM-DD" string anywhere date-only
 * values are computed via local-calendar arithmetic (this file, addWorkingDays included) — i.e.
 * everywhere except values that came straight from a DB `date` column as text. `date.toISOString()`
 * converts to UTC first, which silently shifts the calendar day backward for any positive-UTC-
 * offset timezone (e.g. Asia/Saigon, UTC+7): a Date built via `new Date(y, m, d)` (local midnight)
 * serializes to the PREVIOUS day once re-read through toISOString(). Use this instead everywhere
 * a computed (not DB-sourced) Date needs to become a date string.
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** True if `date` is a Saturday, Sunday, or falls inside an active holiday range — UNLESS it's an
 * explicitly declared makeup workday ("ngày làm bù"), which always overrides both. */
export function isNonWorkingDay(date: Date, holidays: HolidaySet): boolean {
  const key = toDateKey(date);
  if (holidays.workdays.has(key)) return false;
  return isWeekend(date) || holidays.holidays.has(key);
}

/** Adds `offset` working days to `date`, skipping weekends and configured holidays (makeup workdays count as working). */
export function addWorkingDays(date: Date, offset: number, holidays: HolidaySet = emptyHolidaySet()): Date {
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
export function diffWorkingDays(from: Date, to: Date, holidays: HolidaySet = emptyHolidaySet()): number {
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
export function expandHolidayRanges(ranges: { endDate: string; startDate: string }[]): Set<string> {
  const set = new Set<string>();
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
