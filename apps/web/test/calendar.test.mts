import test from 'node:test';
import assert from 'node:assert/strict';
import { monthWeeks } from '../lib/calendar.ts';

const flat = (m: string) => monthWeeks(m).flat();

test('every weekday of the month appears exactly once', () => {
  for (const month of ['2026-09', '2026-02', '2027-02', '2026-11', '2026-12']) {
    const days = flat(month).filter((d) => d.startsWith(month));
    const inMonth = new Set(days);
    assert.equal(days.length, inMonth.size, `${month}: no duplicates`);

    // Count weekdays independently as a cross-check.
    const y = Number(month.slice(0, 4));
    const mo = Number(month.slice(5, 7));
    const total = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    let expected = 0;
    for (let d = 1; d <= total; d++) {
      const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
      if (wd >= 1 && wd <= 5) expected++;
    }
    assert.equal(days.length, expected, `${month}: all ${expected} weekdays present`);
  }
});

test('every row is Monday to Friday', () => {
  for (const week of monthWeeks('2026-09')) {
    assert.equal(week.length, 5);
    for (let i = 0; i < 5; i++) {
      const wd = new Date(`${week[i]}T00:00:00Z`).getUTCDay();
      assert.equal(wd, i + 1, `${week[i]} should be weekday ${i + 1}`);
    }
  }
});

test('a month starting on a weekend still renders its first week', () => {
  // 1 Aug 2026 is a Saturday; the first weekday is Mon 3 Aug.
  const days = flat('2026-08').filter((d) => d.startsWith('2026-08'));
  assert.equal(days[0], '2026-08-03');
  assert.ok(!days.includes('2026-08-01'), 'Saturday is not in the grid');
});

test('a month ending on a weekend keeps its last weekday', () => {
  // 31 Oct 2026 is a Saturday; the last weekday is Fri 30 Oct.
  const days = flat('2026-10').filter((d) => d.startsWith('2026-10'));
  assert.equal(days[days.length - 1], '2026-10-30');
});

test('leading and trailing cells spill into the neighbouring months', () => {
  // Sep 2026 starts on a Tuesday, so Mon 31 Aug leads the first row.
  const all = flat('2026-09');
  assert.equal(all[0], '2026-08-31');
  assert.ok(all.some((d) => d.startsWith('2026-10')), 'trailing days from October');
});

test('February in a leap year is complete', () => {
  const days = flat('2028-02').filter((d) => d.startsWith('2028-02'));
  assert.ok(days.includes('2028-02-29'), 'leap day present');
});
