/**
 * Retention of the `issues` history (owner decision 2026-10-24) — pure rules, no database.
 *
 * `issues` holds one row per issue per import in which it changed (a "version"). The state of an issue at
 * date D is its newest version with aggregated_at::date <= D, and a version is in force from its own date
 * until the date of the next version of the same issue. History is kept like this:
 *
 *   - dense zone: every version of the DENSE_IMPORT_DAYS newest import days (dates >= denseStart);
 *   - sparse zone: older versions are kept only when they are in force at one of the anchor dates — the fixed
 *     weekly snapshot dates (the last working day of each week, table data_snapshot_dates, inside the retention)
 *     and denseStart itself, so the boundary of the dense zone always has its state;
 *   - the newest version of every issue is always kept, however old, so an Epic nobody touched for months still
 *     shows on today's screens.
 *
 * So every selectable date (an import day of the dense zone, or a snapshot date) gives every issue its true
 * state, and an issue that stopped changing keeps a single row. The SQL in data-layer-retention-service.ts
 * implements exactly versionsToDelete; a test pins the two together.
 */

export const DENSE_IMPORT_DAYS = 30;

export interface RetentionHolidays {
  /** Non-working dates (public holidays). */
  holidays: ReadonlySet<string>;
  /** Weekend dates declared as working days ("ngày làm bù"). */
  workdays: ReadonlySet<string>;
}

const MS_PER_DAY = 86_400_000;

function toDayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

function isWorkingDay(iso: string, calendar: RetentionHolidays): boolean {
  if (calendar.workdays.has(iso)) return true;
  const weekday = new Date(toDayNumber(iso) * MS_PER_DAY).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.holidays.has(iso);
}

/** Monday ("YYYY-MM-DD") of the week containing `iso`. */
export function weekMonday(iso: string): string {
  const day = toDayNumber(iso);
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return fromDayNumber(day - ((weekday + 6) % 7));
}

/** The last working day (Monday..Sunday, holidays out, "ngày làm bù" in) of the week starting on `monday`; null when the whole week is off. */
export function lastWorkingDayOfWeek(monday: string, calendar: RetentionHolidays): string | null {
  const start = toDayNumber(monday);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const candidate = fromDayNumber(start + offset);
    if (isWorkingDay(candidate, calendar)) return candidate;
  }
  return null;
}

/**
 * The weekly snapshot dates to record: for every week from the one containing `firstDate` on, the week's last
 * working day, once it lies strictly before `today` (the week's own imports are all in by then).
 */
export function weeklySnapshotDates(firstDate: string, today: string, calendar: RetentionHolidays): string[] {
  const dates: string[] = [];
  const lastMonday = toDayNumber(weekMonday(today));
  for (let monday = toDayNumber(weekMonday(firstDate)); monday <= lastMonday; monday += 7) {
    const date = lastWorkingDayOfWeek(fromDayNumber(monday), calendar);
    if (date && date < today) dates.push(date);
  }
  return dates;
}

/**
 * For the selectable dates that are not an import day themselves (a weekly snapshot date with no import that
 * day), the import day their state actually comes from: the latest import day before them. Dates with an import,
 * or before the first import, are left out.
 */
export function layerDateSources(dates: readonly string[], importDates: readonly string[]): Record<string, string> {
  const imports = [...new Set(importDates)].sort();
  const importSet = new Set(imports);
  const sources: Record<string, string> = {};
  for (const date of dates) {
    if (importSet.has(date)) continue;
    let source: string | null = null;
    for (const day of imports) { if (day < date) source = day; else break; }
    if (source) sources[date] = source;
  }
  return sources;
}

/** The date `days` before `iso`. */
export function daysBefore(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) - days);
}

/** The oldest of the `count` newest import dates (all dates given, any order) — the dense zone starts there; null when there is no import. */
export function denseZoneStart(importDates: readonly string[], count = DENSE_IMPORT_DAYS): string | null {
  const distinct = [...new Set(importDates)].sort().reverse();
  return distinct.length === 0 ? null : distinct[Math.min(count, distinct.length) - 1];
}

export interface IssueVersion {
  /** Row id. */
  id: number;
  issueKey: string;
  /** aggregated_at::date ("YYYY-MM-DD"). */
  date: string;
}

/**
 * Ids of the versions history keeps no more: dated before `denseStart`, not the newest of their issue, and in
 * force at none of the `anchors`. Versions of one issue are ordered by (date, id); a version superseded within
 * its own day is in force at no date at all.
 */
export function versionsToDelete(versions: readonly IssueVersion[], denseStart: string, anchors: readonly string[]): Set<number> {
  const byIssue = new Map<string, IssueVersion[]>();
  for (const version of versions) {
    const list = byIssue.get(version.issueKey);
    if (list) list.push(version); else byIssue.set(version.issueKey, [version]);
  }
  const doomed = new Set<number>();
  for (const list of byIssue.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    list.forEach((version, index) => {
      const next = list[index + 1];
      if (!next || version.date >= denseStart) return;
      const inForceAtAnchor = anchors.some((anchor) => anchor >= version.date && anchor < next.date);
      if (!inForceAtAnchor) doomed.add(version.id);
    });
  }
  return doomed;
}

/** The anchor dates: snapshot dates inside the retention (>= cutoff) plus the start of the dense zone. */
export function retentionAnchors(snapshotDates: readonly string[], denseStart: string, cutoff: string): string[] {
  return [...new Set([...snapshotDates.filter((date) => date >= cutoff), denseStart])].sort();
}
