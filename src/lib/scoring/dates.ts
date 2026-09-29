import type { IsoDate, ScoringHolidays } from './types';

/**
 * Working-day arithmetic on plain "YYYY-MM-DD" strings, done in UTC day numbers so the result never
 * depends on the server's time zone (the legacy helpers in working-days.ts use local-time Date
 * getters). Same semantics as working-days.ts: weekends and holidays are skipped, a declared
 * makeup workday ("ngày làm bù") always counts as a working day.
 */

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Accepts a date or a timestamp string and keeps only its "YYYY-MM-DD" part. */
export function toIsoDate(value: string | null | undefined): IsoDate | null {
  const match = ISO_DATE.exec((value ?? '').trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function toDayNumber(iso: IsoDate): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromDayNumber(dayNumber: number): IsoDate {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

function isNonWorkingDay(dayNumber: number, holidays: ScoringHolidays): boolean {
  const iso = fromDayNumber(dayNumber);
  if (holidays.workdays.has(iso)) return false;
  const weekday = new Date(dayNumber * MS_PER_DAY).getUTCDay();
  return weekday === 0 || weekday === 6 || holidays.holidays.has(iso);
}

/** `date` + `offset` working days (negative offsets walk backwards). */
export function addWorkingDays(date: IsoDate, offset: number, holidays: ScoringHolidays): IsoDate {
  let cursor = toDayNumber(date);
  let remaining = offset;
  const step = remaining >= 0 ? 1 : -1;
  while (remaining !== 0) {
    cursor += step;
    if (!isNonWorkingDay(cursor, holidays)) remaining -= step;
  }
  return fromDayNumber(cursor);
}

/** Working days after `from` up to and including `to`; negative when `to` is before `from`. */
export function diffWorkingDays(from: IsoDate, to: IsoDate, holidays: ScoringHolidays): number {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  if (start === end) return 0;
  const direction = end > start ? 1 : -1;
  let cursor = start;
  let count = 0;
  while (cursor !== end) {
    cursor += direction;
    if (!isNonWorkingDay(cursor, holidays)) count += direction;
  }
  return count;
}

/** Next calendar day. */
export function nextDay(date: IsoDate): IsoDate {
  return fromDayNumber(toDayNumber(date) + 1);
}
