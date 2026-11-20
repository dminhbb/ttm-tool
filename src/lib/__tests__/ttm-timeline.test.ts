import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTimelineDays, isNonWorkingDayForTimeline, nextCalendarDay } from '../ttm-timeline';

describe('TTM Timeline — isNonWorkingDayForTimeline', () => {
  const noHoliday: ReadonlySet<string> = new Set();
  const noWorkday: ReadonlySet<string> = new Set();

  it('Thứ Bảy / Chủ nhật là ngày nghỉ; ngày thường trong tuần là ngày làm việc', () => {
    // 2026-11-14 = Thứ 7, 2026-11-15 = Chủ nhật, 2026-11-13 = Thứ 6.
    assert.equal(isNonWorkingDayForTimeline('2026-11-14', noHoliday, noWorkday), true);
    assert.equal(isNonWorkingDayForTimeline('2026-11-15', noHoliday, noWorkday), true);
    assert.equal(isNonWorkingDayForTimeline('2026-11-13', noHoliday, noWorkday), false);
  });

  it('ngày Lễ theo cấu hình là ngày nghỉ (kể cả ngày thường trong tuần)', () => {
    const holiday = new Set(['2026-11-24']); // Thứ 3
    assert.equal(isNonWorkingDayForTimeline('2026-11-24', holiday, noWorkday), true);
    assert.equal(isNonWorkingDayForTimeline('2026-11-23', holiday, noWorkday), false);
  });

  it('ngày làm bù (makeup workday) trên cuối tuần/ngày Lễ được coi là ngày làm việc', () => {
    const holiday = new Set(['2026-11-24']);
    const workday = new Set(['2026-11-14']); // Thứ 7 làm bù
    assert.equal(isNonWorkingDayForTimeline('2026-11-14', noHoliday, workday), false);
    // Ngày Lễ nhưng được khai báo làm bù → vẫn là ngày làm việc.
    assert.equal(isNonWorkingDayForTimeline('2026-11-24', holiday, new Set(['2026-11-24'])), false);
  });
});

describe('TTM Timeline — nextCalendarDay', () => {
  it('tăng thêm 1 ngày theo lịch, qua tháng và năm', () => {
    assert.equal(nextCalendarDay('2026-11-11'), '2026-11-12');
    assert.equal(nextCalendarDay('2026-11-30'), '2026-12-01');
    assert.equal(nextCalendarDay('2026-12-31'), '2027-01-01');
  });
});

describe('TTM Timeline — buildTimelineDays', () => {
  it('sinh đủ các ngày từ first đến last, gồm cả 2 đầu, đánh dấu đúng ngày nghỉ', () => {
    // 2026-11-11 (T4) → 2026-11-16 (T2), có 24/11 không nằm trong khoảng.
    const days = buildTimelineDays('2026-11-11', '2026-11-16', new Set(), new Set());
    assert.deepEqual(days.map((d) => d.iso), ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']);
    // 14 (T7) và 15 (CN) là ngày nghỉ.
    assert.equal(days[3].isNonWorking, true);
    assert.equal(days[4].isNonWorking, true);
    assert.equal(days[3].weekday, 'T7');
    assert.equal(days[4].weekday, 'CN');
  });

  it('ngày Lễ trong khoảng được đánh dấu là ngày nghỉ', () => {
    const days = buildTimelineDays('2026-11-24', '2026-11-24', new Set(['2026-11-24']), new Set());
    assert.equal(days.length, 1);
    assert.equal(days[0].isNonWorking, true);
  });

  it('first > last → trả về mảng rỗng', () => {
    assert.deepEqual(buildTimelineDays('2026-11-16', '2026-11-11', new Set(), new Set()), []);
  });
});
