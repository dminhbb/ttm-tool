import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareEpicListRows, type EpicListSortRow } from '../epic-alert-sort-rules';

const row = (epicKey: string, t0: string | null, t1: string | null): EpicListSortRow => ({ epicKey, t1StartDate: t1, stages: { release: { baselineSourceDate: t0 } } });

describe('Quản trị Epic list order (owner 2026-11-10)', () => {
  it('Epics with T1 first (T0 newest, T1 newest, Epic A→Z natural), then those without T1 (T0 newest, Epic A→Z)', () => {
    const rows = [
      row('MO-100', '2026-10-01', '2026-10-05'),
      row('MO-99', '2026-10-01', '2026-10-05'),
      row('AB-1', '2026-10-01', '2026-10-20'),
      row('ZZ-1', '2026-11-02', null),
      row('CD-7', null, '2026-11-01'),
      row('EF-3', '2026-10-01', null),
    ];
    // ZZ-1 has the newest T0 but no T1: it opens the second group.
    assert.deepEqual([...rows].sort(compareEpicListRows).map((item) => item.epicKey), ['AB-1', 'MO-99', 'MO-100', 'CD-7', 'ZZ-1', 'EF-3']);
  });
});
