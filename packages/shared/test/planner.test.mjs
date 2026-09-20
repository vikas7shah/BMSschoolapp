import test from 'node:test';
import assert from 'node:assert/strict';
import { planReminders, addDays, startOfWeek, isoWeekday, relativeLabel, normalizePhone } from '../dist/index.js';

const TODAY = '2026-09-08'; // a Tuesday
const base = { schoolId: 'sch', classroomId: 'c1', status: 'OPEN', updatedAt: '' };
// One slot per day: whoever takes it brings both a dry snack and fruit.
const claimed = (date, userId, childName) => ({
  ...base, date, status: 'CLAIMED', claimedByUserId: userId, claimedByName: 'X',
  claimedForChildName: childName,
});
const open = (date) => ({ ...base, date });

const parents = [
  { userId: 'u1', firstName: 'Ana', classroomIds: ['c1'] },
  { userId: 'u2', firstName: 'Ben', classroomIds: ['c1'] },
];
const input = (slots, extra = {}) => ({
  today: TODAY, schoolName: 'BMS', classroomNames: { c1: 'Primary' }, slots, parents, ...extra,
});

test('reminds the family who signed up, the day before', () => {
  const r = planReminders(input([claimed(addDays(TODAY, 1), 'u1', 'Amelia')]));
  const m = r.find((x) => x.userId === 'u1' && x.message.type === 'SNACK_TOMORROW');
  assert.ok(m, 'expected a day-before reminder');
  assert.match(m.message.sms, /tomorrow/i);
  assert.ok(m.message.sms.length <= 320, 'SMS should stay short');
});

test('sends a one-week heads-up', () => {
  const r = planReminders(input([claimed(addDays(TODAY, 7), 'u1')]));
  assert.ok(r.some((x) => x.userId === 'u1' && x.message.type === 'SNACK_NEXT_WEEK'));
});

test('does not nudge a parent who already has a day booked', () => {
  const r = planReminders(input([claimed(addDays(TODAY, 4), 'u1'), open(addDays(TODAY, 5))]));
  assert.equal(r.filter((x) => x.userId === 'u1' && x.message.type === 'SLOT_OPEN').length, 0);
  assert.ok(r.some((x) => x.userId === 'u2' && x.message.type === 'SLOT_OPEN'), 'u2 has nothing booked');
});

test('flags parents who never signed up at all', () => {
  const r = planReminders(input([]));
  const m = r.filter((x) => x.message.type === 'NEVER_SIGNED_UP');
  assert.equal(m.length, 2);
  assert.ok(m[0].message.dedupeKey.endsWith(startOfWeek(TODAY)), 'weekly bucket keeps it to once a week');
});

test('an empty calendar is nudged weekly, not daily, even when it starts tomorrow', () => {
  const fresh = planReminders(input([1, 2, 3, 4, 5, 8, 9].map((d) => open(addDays(TODAY, d)))));
  assert.equal(fresh.length, parents.length, 'one nudge per parent');
  for (const n of fresh) assert.ok(n.message.dedupeKey.endsWith(startOfWeek(TODAY)), 'weekly bucket');
});

test('a family with a day this month is not nudged, even if it is outside the horizon', () => {
  // u1 holds the 25th (well past the 10-day horizon); open days remain.
  const month = TODAY.slice(0, 7);
  const r = planReminders(input([claimed(`${month}-25`, 'u1'), open(addDays(TODAY, 2))]));
  assert.ok(!r.some((n) => n.userId === 'u1' && n.message.type === 'SLOT_OPEN'), 'u1 left alone');
  assert.ok(r.some((n) => n.userId === 'u2' && n.message.type === 'SLOT_OPEN'), 'u2 still nudged');
});

test('the other parent of a booked child is not nudged either', () => {
  const month = TODAY.slice(0, 7);
  const kids = { parents: [
    { userId: 'u1', firstName: 'Ana', classroomIds: ['c1'], childIds: ['k1'] },
    { userId: 'u2', firstName: 'Ben', classroomIds: ['c1'], childIds: ['k1'] },
    { userId: 'u3', firstName: 'Cy', classroomIds: ['c1'], childIds: ['k2'] },
  ] };
  const slot = { ...claimed(`${month}-25`, 'u1', 'Kid'), claimedForChildId: 'k1' };
  const r = planReminders(input([slot, open(addDays(TODAY, 2))], kids));
  const nudged = r.filter((n) => n.message.type === 'SLOT_OPEN').map((n) => n.userId);
  assert.deepEqual(nudged, ['u3'], 'only the family without a day');
});

test('urgent gaps dedupe daily, distant gaps dedupe weekly', () => {
  const urgent = planReminders(input([open(addDays(TODAY, 2))]));
  assert.ok(urgent[0].message.dedupeKey.endsWith(TODAY));
  const distant = planReminders(input([open(addDays(TODAY, 9))]));
  assert.ok(distant[0].message.dedupeKey.endsWith(startOfWeek(TODAY)));
});

test('ignores open slots beyond the horizon', () => {
  const r = planReminders(input([open(addDays(TODAY, 40))]));
  assert.ok(r.every((x) => x.message.type === 'NEVER_SIGNED_UP'));
});

test('dedupe keys are stable and unique per parent and day', () => {
  const slots = [claimed(addDays(TODAY, 1), 'u1'), claimed(addDays(TODAY, 7), 'u1')];
  const keys = planReminders(input(slots)).map((x) => x.message.dedupeKey);
  assert.equal(new Set(keys).size, keys.length, 'no two reminders share a key');
  assert.deepEqual(planReminders(input(slots)).map((x) => x.message.dedupeKey), keys,
    'the same input always produces the same keys, so a re-run sends nothing');
});

test('a reminder names the child whose turn it is', () => {
  const r = planReminders(input([claimed(addDays(TODAY, 1), 'u1', 'Amelia')]));
  const m = r.find((x) => x.message.type === 'SNACK_TOMORROW');
  assert.match(m.message.body, /Amelia/);
  assert.match(m.message.sms, /dry snack and fruit/i, 'the SMS says what to bring');
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
