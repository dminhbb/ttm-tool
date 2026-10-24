import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  daysBefore, denseZoneStart, DENSE_IMPORT_DAYS, lastWorkingDayOfWeek, layerDateSources, retentionAnchors, versionsToDelete, weekMonday, weeklySnapshotDates,
} from '../data-layer-retention';
import type { IssueVersion, RetentionHolidays } from '../data-layer-retention';

const noHolidays: RetentionHolidays = { holidays: new Set(), workdays: new Set() };

describe('weekly snapshot dates (last working day of the week)', () => {
  it('week starts on Monday and ends on the last working day', () => {
    assert.equal(weekMonday('2026-10-24'), '2026-10-19'); // Saturday
    assert.equal(weekMonday('2026-10-19'), '2026-10-19');
    assert.equal(weekMonday('2026-10-25'), '2026-10-19'); // Sunday
    assert.equal(lastWorkingDayOfWeek('2026-10-19', noHolidays), '2026-10-23'); // Friday
  });

  it('a holiday Friday moves the date back; a declared make-up Saturday moves it forward; a whole week off has none', () => {
    assert.equal(lastWorkingDayOfWeek('2026-10-19', { holidays: new Set(['2026-10-23']), workdays: new Set() }), '2026-10-22');
    assert.equal(lastWorkingDayOfWeek('2026-10-19', { holidays: new Set(), workdays: new Set(['2026-10-24']) }), '2026-10-24');
    const weekOff = new Set(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    assert.equal(lastWorkingDayOfWeek('2026-10-19', { holidays: weekOff, workdays: new Set() }), null);
  });

  it('records only the weeks that have passed, strictly before today, from the first import week on', () => {
    // Today is Friday 2026-10-23: that week's own last working day is today → not due yet.
    assert.deepEqual(weeklySnapshotDates('2026-10-06', '2026-10-23', noHolidays), ['2026-10-09', '2026-10-16']);
    // The next day it is.
    assert.deepEqual(weeklySnapshotDates('2026-10-06', '2026-10-24', noHolidays), ['2026-10-09', '2026-10-16', '2026-10-23']);
    assert.deepEqual(weeklySnapshotDates('2026-10-23', '2026-10-23', noHolidays), []);
  });
});

describe('layerDateSources ("lấy từ lần import ngày X")', () => {
  it('labels only the selectable dates that had no import, with the latest import before them', () => {
    const imports = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-27'];
    assert.deepEqual(layerDateSources(['2026-10-27', '2026-10-23', '2026-10-22', '2026-10-16'], imports), { '2026-10-23': '2026-10-22' });
    assert.deepEqual(layerDateSources(['2026-10-23'], []), {});
  });
});

describe('dense zone', () => {
  it('starts at the oldest of the 30 newest import days; with fewer imports than that it starts at the first', () => {
    const dates = Array.from({ length: DENSE_IMPORT_DAYS + 5 }, (_, index) => daysBefore('2026-10-23', index));
    assert.equal(denseZoneStart(dates), daysBefore('2026-10-23', DENSE_IMPORT_DAYS - 1));
    assert.equal(denseZoneStart(['2026-10-01', '2026-10-02']), '2026-10-01');
    assert.equal(denseZoneStart([]), null);
    assert.equal(denseZoneStart(['2026-10-02', '2026-10-02', '2026-10-01'], 2), '2026-10-01'); // duplicates count once
  });

  it('anchors: the snapshot dates inside the retention plus the start of the dense zone', () => {
    assert.deepEqual(retentionAnchors(['2026-08-07', '2026-09-04', '2026-09-11'], '2026-10-01', '2026-09-01'), ['2026-09-04', '2026-09-11', '2026-10-01']);
  });
});

/** The newest version of every issue with date <= `date` — "the state at that date". */
function stateAt(versions: readonly IssueVersion[], date: string): Map<string, number> {
  const state = new Map<string, IssueVersion>();
  for (const version of [...versions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))) {
    if (version.date <= date) state.set(version.issueKey, version);
  }
  return new Map([...state].map(([key, version]) => [key, version.id]));
}

describe('versionsToDelete', () => {
  const v = (id: number, issueKey: string, date: string): IssueVersion => ({ date, id, issueKey });

  it('keeps the newest version of every issue however old, and everything inside the dense zone', () => {
    const versions = [v(1, 'E-1', '2026-03-01'), v(2, 'E-2', '2026-03-01'), v(3, 'E-2', '2026-04-01'), v(4, 'E-1', '2026-10-20')];
    const doomed = versionsToDelete(versions, '2026-10-10', ['2026-10-10']);
    // E-1 v1 is in force at the anchor 2026-10-10 (v4 comes later) → kept; E-2 v2 is not in force at any anchor → deleted; E-2 v3 is its newest → kept.
    assert.deepEqual([...doomed], [2]);
  });

  it('a version superseded on its own day is in force at no date at all', () => {
    const versions = [v(1, 'E-1', '2026-09-01'), v(2, 'E-1', '2026-09-01'), v(3, 'E-1', '2026-10-20')];
    assert.deepEqual([...versionsToDelete(versions, '2026-10-10', ['2026-09-01', '2026-10-10'])], [1]);
  });

  it('every anchor and every dense import day still gives each issue the same state after the deletion', () => {
    // Deterministic pseudo-random history: 40 issues, ~60 import days, each issue changes on ~1/4 of the days.
    let seed = 7;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const days = Array.from({ length: 60 }, (_, index) => daysBefore('2026-10-23', 59 - index)).filter((_, index) => index % 7 !== 5 && index % 7 !== 6);
    const versions: IssueVersion[] = [];
    let id = 1;
    for (let issue = 0; issue < 40; issue += 1) {
      const born = Math.floor(random() * days.length);
      for (let index = born; index < days.length; index += 1) {
        if (index === born || random() < 0.25) {
          versions.push(v(id++, `E-${issue}`, days[index]));
          if (random() < 0.1) versions.push(v(id++, `E-${issue}`, days[index])); // a second import the same day
        }
      }
    }
    const denseStart = denseZoneStart(days)!;
    const denseDates = days.filter((day) => day >= denseStart);
    const snapshots = weeklySnapshotDates(days[0], days[days.length - 1], noHolidays);
    const anchors = retentionAnchors(snapshots, denseStart, days[0]);
    const doomed = versionsToDelete(versions, denseStart, anchors);
    const kept = versions.filter((version) => !doomed.has(version.id));
    assert.ok(doomed.size > 0 && kept.length < versions.length);
    for (const date of [...new Set([...anchors, ...denseDates])]) {
      assert.deepEqual([...stateAt(kept, date)].sort(), [...stateAt(versions, date)].sort(), `state at ${date}`);
    }
    // And the current state (newest version of each issue) survives.
    assert.deepEqual([...stateAt(kept, '2999-01-01')].sort(), [...stateAt(versions, '2999-01-01')].sort());
  });

  it('an issue that stopped changing keeps a single row', () => {
    const versions = [v(1, 'E-1', '2026-05-04'), v(2, 'E-1', '2026-05-06'), v(3, 'E-1', '2026-05-12')];
    // Weekly anchors every Friday: 05-08 sees v2, 05-15 and later see v3 — v1 is never in force on an anchor.
    const doomed = versionsToDelete(versions, '2026-10-01', ['2026-05-08', '2026-05-15', '2026-05-22', '2026-10-01']);
    assert.deepEqual([...doomed], [1]);
  });
});
