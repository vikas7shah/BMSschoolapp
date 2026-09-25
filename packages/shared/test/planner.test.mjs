import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planReminders, signUpKindFor, canAskRemindTomorrow, addDays, startOfWeek, isoWeekday, relativeLabel, normalizePhone,
} from '../dist/index.js';

const TODAY = '2026-09-15'; // an ordinary Tuesday: no sign-up reminder due
const base = { schoolId: 'sch', classroomId: 'c1', status: 'OPEN', updatedAt: '' };
// One slot per day: whoever takes it brings both a dry snack and fruit.
const claimed = (date, userId, childName, extra = {}) => ({
  ...base, date, status: 'CLAIMED', claimedByUserId: userId, claimedByName: 'X',
  claimedForChildName: childName, ...extra,
});
const open = (date) => ({ ...base, date });

const parents = [
  { userId: 'u1', firstName: 'Ana', classroomIds: ['c1'] },
  { userId: 'u2', firstName: 'Ben', classroomIds: ['c1'] },
];
const input = (slots, extra = {}) => ({
  today: TODAY, schoolName: 'BMS', classroomNames: { c1: 'Primary' }, slots, parents, ...extra,
});
const types = (r) => r.map((x) => `${x.userId}:${x.message.type}`).sort();

/* --- a family's own day ---------------------------------------------------- */

test('two days before, the family who booked hears their day is coming up', () => {
  const r = planReminders(input([claimed(addDays(TODAY, 2), 'u1', 'Amelia')]));
  assert.deepEqual(types(r), ['u1:SNACK_SOON']);
  assert.match(r[0].message.body, /Amelia/);
  assert.match(r[0].message.body, /remind/i, 'offers the reminder tomorrow');
  assert.equal(r[0].message.link, `/snacks?date=${addDays(TODAY, 2)}`, 'opens the day with the button');
  assert.ok(r[0].message.sms.length <= 320, 'SMS should stay short');
});

test('no week-before reminder, and no day-before one unless asked', () => {
  for (const d of [1, 3, 7]) {
    assert.deepEqual(planReminders(input([claimed(addDays(TODAY, d), 'u1')])), [], `${d} days out`);
  }
});

test('"Remind me tomorrow" earns the day-before reminder, to whoever asked', () => {
  const slot = claimed(addDays(TODAY, 1), 'u1', 'Amelia', { remindTomorrowUserIds: new Set(['u2']) });
  const r = planReminders(input([slot]));
  assert.deepEqual(types(r), ['u2:SNACK_TOMORROW']);
  assert.match(r[0].message.sms, /tomorrow/i);
  assert.match(r[0].message.sms, /dry snack and fruit/i, 'the SMS says what to bring');
});

/* --- sign-up reminders ----------------------------------------------------- */

test('on the 1st, every family without a day that month is asked to pick one', () => {
  const first = '2026-10-01';
  const r = planReminders(input([claimed('2026-10-06', 'u1'), open('2026-10-07'), open('2026-10-08')], { today: first }));
  assert.deepEqual(types(r), ['u2:SIGNUP_MONTH_START'], 'u1 already has a day');
  assert.match(r[0].message.title, /October/);
  assert.equal(r[0].message.dedupeKey, 'SIGNUP_MONTH_START#u2#2026-10', 'once a month');
});

test('on the 8th, one follow-up to families still without a day', () => {
  const eighth = '2026-10-08';
  // u1 booked the 2nd — already past, and it still counts.
  const r = planReminders(input([claimed('2026-10-02', 'u1'), open('2026-10-20')], { today: eighth }));
  assert.deepEqual(types(r), ['u2:SIGNUP_FOLLOW_UP']);
  assert.match(r[0].message.body, /1 day is still open/);
  assert.equal(r[0].message.dedupeKey, 'SIGNUP_FOLLOW_UP#u2#2026-10');
});

test('no sign-up reminders on any other day — open days or not', () => {
  for (const today of ['2026-10-02', '2026-10-07', '2026-10-09', '2026-10-15', '2026-10-31']) {
    const r = planReminders(input([open('2026-10-31')], { today }));
    assert.deepEqual(r, [], today);
  }
});

test('a reminder skipped on the 1st is not made up later', () => {
  // The sweep was paused on the 1st and resumed on the 3rd: nothing goes.
  assert.deepEqual(planReminders(input([open('2026-10-20')], { today: '2026-10-03' })), []);
});

test('no sign-up ask when there is nothing left to pick', () => {
  const full = planReminders(input([claimed('2026-10-06', 'u3')], { today: '2026-10-01' }));
  assert.deepEqual(full, [], 'every day taken');
  const summer = planReminders(input([], { today: '2026-07-01' }));
  assert.deepEqual(summer, [], 'no snack days that month');
});

test('the other parent of a booked child is not asked either', () => {
  const kids = { today: '2026-10-01', parents: [
    { userId: 'u1', firstName: 'Ana', classroomIds: ['c1'], childIds: ['k1'] },
    { userId: 'u2', firstName: 'Ben', classroomIds: ['c1'], childIds: ['k1'] },
    { userId: 'u3', firstName: 'Cy', classroomIds: ['c1'], childIds: ['k2'] },
  ] };
  const slot = claimed('2026-10-25', 'u1', 'Kid', { claimedForChildId: 'k1' });
  const r = planReminders(input([slot, open('2026-10-02')], kids));
  assert.deepEqual(types(r), ['u3:SIGNUP_MONTH_START'], 'only the family without a day');
});

test('the same input always produces the same keys, so a re-run sends nothing', () => {
  const slots = [claimed(addDays(TODAY, 2), 'u1'), claimed(addDays(TODAY, 1), 'u2', 'K', { remindTomorrowUserIds: ['u2'] })];
  const keys = planReminders(input(slots)).map((x) => x.message.dedupeKey);
  assert.equal(new Set(keys).size, keys.length, 'no two reminders share a key');
  assert.deepEqual(planReminders(input(slots)).map((x) => x.message.dedupeKey), keys);
});

test('which sign-up reminder a date calls for', () => {
  assert.equal(signUpKindFor('2026-11-01'), 'MONTH_START');
  assert.equal(signUpKindFor('2026-11-08'), 'FOLLOW_UP');
  assert.equal(signUpKindFor('2026-11-09'), null);
});

test('"Remind me tomorrow" is offered only on the two-day reminder\'s day', () => {
  assert.equal(canAskRemindTomorrow(addDays(TODAY, 2), TODAY), true);
  assert.equal(canAskRemindTomorrow(addDays(TODAY, 1), TODAY), false);
  assert.equal(canAskRemindTomorrow(addDays(TODAY, 3), TODAY), false);
});

test('civil-date helpers do not drift across month ends or DST', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02'); // US DST change
  assert.equal(isoWeekday('2026-09-08'), 2);
  assert.equal(startOfWeek('2026-09-08'), '2026-09-07');
  assert.equal(relativeLabel(addDays(TODAY, 1), TODAY), 'Tomorrow');
});

test('phone normalisation accepts what parents actually type', () => {
  for (const v of ['(415) 555-0123', '415-555-0123', '4155550123', '+1 415 555 0123', '14155550123'])
    assert.equal(normalizePhone(v), '+14155550123', v);
  assert.equal(normalizePhone('abc'), null);
});
