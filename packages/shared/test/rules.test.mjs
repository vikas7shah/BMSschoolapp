import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseBlockedReason, RELEASE_NOTICE_DAYS, addDays } from '../dist/index.js';

const TODAY = '2026-09-09';
const ctx = (o = {}) => ({
  date: addDays(TODAY, 10), today: TODAY, classroomHasOpenDay: true, isAdmin: false, ...o,
});

test('a family can change a day with plenty of notice', () => {
  assert.equal(releaseBlockedReason(ctx()), null);
});

test('the day itself, and the two before it, are locked', () => {
  for (const n of [0, 1, 2]) {
    assert.equal(releaseBlockedReason(ctx({ date: addDays(TODAY, n) })), 'TOO_LATE', `${n} days out`);
  }
  // One day past the notice window is fine.
  assert.equal(releaseBlockedReason(ctx({ date: addDays(TODAY, RELEASE_NOTICE_DAYS + 1) })), null);
});

test('a day already past cannot be given up', () => {
  assert.equal(releaseBlockedReason(ctx({ date: addDays(TODAY, -1) })), 'TOO_LATE');
});

test('a fully booked classroom is locked to parents', () => {
  assert.equal(releaseBlockedReason(ctx({ classroomHasOpenDay: false })), 'CALENDAR_FULL');
});

test('being too late outranks the calendar being full', () => {
  const r = releaseBlockedReason(ctx({ date: addDays(TODAY, 1), classroomHasOpenDay: false }));
  assert.equal(r, 'TOO_LATE', 'the more specific reason is the one shown');
});

test('staff are never blocked', () => {
  for (const o of [{ date: TODAY }, { classroomHasOpenDay: false }, { date: addDays(TODAY, -5) }]) {
    assert.equal(releaseBlockedReason(ctx({ ...o, isAdmin: true })), null);
  }
});
