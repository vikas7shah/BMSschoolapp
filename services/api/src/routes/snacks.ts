import { Hono } from 'hono';
import {
  addDays, canAskRemindTomorrow, claimSlotSchema, formatShort, releaseBlockedReason, releaseSlotSchema,
  remindTomorrowSchema, slotClaimed, todayIn, RELEASE_BLOCK_MESSAGE, RELEASE_NOTICE_DAYS, SCHOOL_YEAR,
  type Child, type SnackSlot,
} from '@bms/shared';
import {
  childrenForGuardian, claimSlot, classroomHasOpenDay, deliver, getClassroom, getSchool,
  listClassrooms, listSlots, releaseSlot, setRemindTomorrow, slotsForUser,
} from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/** Classrooms a parent may act in: those their children belong to. Admins see all. */
async function visibleClassroomIds(user: Vars['user']): Promise<string[]> {
  if (user.role === 'ADMIN') {
    return (await listClassrooms(user.schoolId)).map((c) => c.classroomId);
  }
  const kids = await childrenForGuardian(user.userId);
  return [...new Set(kids.map((k) => k.classroomId))];
}

/**
 * Hide other families' contact details. The child's name is what goes on the
 * board — that is what a whiteboard would have said — with the parent's name
 * kept alongside for the day detail.
 */
/** A day is "mine" if I booked it or it is for one of my children. */
function isFamilyDay(slot: SnackSlot, viewer: { userId: string; childIds: Set<string> }): boolean {
  return slot.claimedByUserId === viewer.userId
    || (!!slot.claimedForChildId && viewer.childIds.has(slot.claimedForChildId));
}

async function viewerOf(user: { userId: string }): Promise<{ userId: string; childIds: Set<string> }> {
  const kids = await childrenForGuardian(user.userId);
  return { userId: user.userId, childIds: new Set(kids.map((k) => k.childId)) };
}

function publicSlot(slot: SnackSlot, viewer: { userId: string; childIds: Set<string> }) {
  return {
    classroomId: slot.classroomId,
    date: slot.date,
    status: slot.status,
    claimedByName: slot.claimedByName,
    claimedForChildName: slot.claimedForChildName,
    claimedForChildId: slot.claimedForChildId,
    note: slot.note,
    isMine: isFamilyDay(slot, viewer),
    /** This viewer asked for the day-before reminder. */
    remindTomorrow: [...(slot.remindTomorrowUserIds ?? [])].includes(viewer.userId),
  };
}

route.get('/api/snacks', async (c) => {
  const user = c.get('user');
  const school = await getSchool(user.schoolId);
  const tz = school?.timezone ?? 'America/Los_Angeles';
  const today = todayIn(tz);

  // The whole school year by default, past days included: the calendar pages
  // through every month of it, and who brought snacks on day one is still
  // there to see. A day outside the year is drawn as such, not as "no data".
  const from = c.req.query('from') ?? (SCHOOL_YEAR.start < today ? SCHOOL_YEAR.start : today);
  const to = c.req.query('to') ?? (SCHOOL_YEAR.end > today ? SCHOOL_YEAR.end : addDays(today, 42));

  const allowed = await visibleClassroomIds(user);
  const requested = c.req.query('classroomId');
  const classroomIds = requested
    ? allowed.filter((id) => id === requested)
    : allowed;

  if (requested && !classroomIds.length) return c.json({ error: 'Not your classroom' }, 403);

  const classrooms = (await listClassrooms(user.schoolId))
    .filter((cl) => classroomIds.includes(cl.classroomId));

  const slotLists = await Promise.all(classroomIds.map((id) => listSlots(id, from, to)));
  const viewer = await viewerOf(user);

  // Computed server-side so the app explains exactly what the API will enforce.
  const openFlags = await Promise.all(
    classrooms.map((cl) => classroomHasOpenDay(cl.classroomId, today)),
  );

  return c.json({
    today,
    from,
    to,
    releaseNoticeDays: RELEASE_NOTICE_DAYS,
    isAdmin: user.role === 'ADMIN',
    classrooms: classrooms.map((cl, i) => ({
      classroomId: cl.classroomId,
      name: cl.name,
      /** Every upcoming day is taken, so parents can no longer swap out. */
      full: !openFlags[i],
    })),
    slots: slotLists.flat().map((s) => publicSlot(s, viewer)),
  });
});

route.get('/api/snacks/mine', async (c) => {
  const user = c.get('user');
  const school = await getSchool(user.schoolId);
  const today = todayIn(school?.timezone ?? 'America/Los_Angeles');
  const classrooms = await listClassrooms(user.schoolId);
  const nameOf = new Map(classrooms.map((cl) => [cl.classroomId, cl.name]));

  // The family's days, not just the ones this parent tapped: a day booked
  // for a child by one parent is on the other parent's Home too.
  const kids = await childrenForGuardian(user.userId);
  const viewer = { userId: user.userId, childIds: new Set(kids.map((k) => k.childId)) };
  const rooms = [...new Set(kids.map((k) => k.classroomId))];
  const forKids = (await Promise.all(rooms.map((id) => listSlots(id, today, SCHOOL_YEAR.end)))).flat()
    .filter((s) => s.status === 'CLAIMED' && isFamilyDay(s, viewer));
  const own = await slotsForUser(user.userId, today);
  const slots = [...new Map([...own, ...forKids].map((s) => [`${s.classroomId}#${s.date}`, s])).values()];

  return c.json({
    today,
    slots: slots
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ ...publicSlot(s, viewer), classroomName: nameOf.get(s.classroomId) })),
  });
});

route.post('/api/snacks/claim', async (c) => {
  const user = c.get('user');
  const parsed = claimSlotSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  const { classroomId, date, childId, switchFrom, note } = parsed.data;

  const allowed = await visibleClassroomIds(user);
  if (!allowed.includes(classroomId)) return c.json({ error: 'Not your classroom' }, 403);

  const school = await getSchool(user.schoolId);
  const tz = school?.timezone ?? 'America/Los_Angeles';
  if (date < todayIn(tz)) return c.json({ error: 'That day has already passed' }, 400);

  // A day is always taken for a child, and only by that child's own parent.
  // The candidates are the caller's children in this room — nothing else, for
  // staff included — so nobody can book on another family's behalf, and a
  // child with no parent on file cannot be booked at all.
  const candidates = (await childrenForGuardian(user.userId))
    .filter((k: Child) => k.classroomId === classroomId);
  if (!candidates.length) {
    return c.json({ error: 'You can only take a day for your own child in this classroom.', code: 'NOT_YOUR_CHILD' }, 403);
  }

  const picked = childId ? candidates.find((k: Child) => k.childId === childId) : candidates[0];
  if (childId && !picked) {
    return c.json({ error: 'You can only take a day for your own child.', code: 'NOT_YOUR_CHILD' }, 403);
  }
  if (!childId && candidates.length > 1) {
    return c.json({
      error: 'Which child is this for?',
      code: 'CHILD_REQUIRED',
      children: candidates
        .map((k: Child) => ({ childId: k.childId, firstName: k.firstName, lastName: k.lastName }))
        .sort((a, b) => a.firstName.localeCompare(b.firstName)),
    }, 400);
  }
  const child: Child = picked!;

  // One day per child per calendar month. Rather than refuse, tell the app
  // which day the child already holds so it can offer a switch.
  const month = date.slice(0, 7);
  const existing = (await listSlots(classroomId, `${month}-01`, `${month}-31`)).find(
    (s) => s.status === 'CLAIMED' && s.claimedForChildId === child.childId && s.date !== date,
  );

  if (existing && !switchFrom) {
    return c.json({
      error: `${child.firstName} already has ${formatShort(existing.date)} this month.`,
      code: 'MONTH_TAKEN',
      existingDate: existing.date,
      childName: child.firstName,
    }, 409);
  }
  if (switchFrom && (!existing || existing.date !== switchFrom)) {
    return c.json({ error: 'That day is no longer yours to switch from.' }, 409);
  }

  // Giving up the old day is a release, so the same notice rules apply —
  // a switch must not be a way round them. Staff are exempt as always.
  if (existing && switchFrom) {
    const isAdmin = user.role === 'ADMIN';
    const blocked = releaseBlockedReason({
      date: switchFrom, today: todayIn(tz),
      classroomHasOpenDay: true, // the new day being open proves it
      isAdmin,
    });
    if (blocked) return c.json({ error: RELEASE_BLOCK_MESSAGE[blocked], code: blocked }, 403);
    // `existing` was found by the caller's own child, so either parent may move it.
  }

  const result = await claimSlot({
    classroomId, date,
    userId: user.userId,
    // "Ana G." on the board, but just "Ana" for a parent with one name.
    userName: user.lastName ? `${user.firstName} ${user.lastName.charAt(0)}.` : user.firstName,
    childName: child.firstName, childId: child.childId, note,
  });

  if (result === 'NOT_FOUND') return c.json({ error: 'That day is not on the calendar' }, 404);
  if (result === 'TAKEN') {
    return c.json({ error: 'Another family just took that slot.', code: 'TAKEN' }, 409);
  }

  // Only now that the new day is secured is the old one let go, so a switch
  // can never leave the child with no day at all.
  if (existing && switchFrom) {
    await releaseSlot({
      classroomId, date: switchFrom, userId: user.userId, isAdmin: true,
    });
  }

  // Confirmation is forced past the dedupe table: the parent asked for this.
  // While the school has reminders paused, nothing goes out — not even this.
  if (!school?.remindersPaused) {
    const classroom = await getClassroom(classroomId);
    await deliver(user, slotClaimed({
      userId: user.userId,
      firstName: user.firstName,
      schoolName: school?.name ?? 'School',
      classroomName: classroom?.name ?? 'your classroom',
      date,
      childName: child?.firstName,
    }), { force: true }).catch((err) => console.error('confirmation failed', err));
  }

  return c.json({ slot: publicSlot(result, await viewerOf(user)) });
});

route.post('/api/snacks/release', async (c) => {
  const user = c.get('user');
  const parsed = releaseSlotSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  const { classroomId, date } = parsed.data;

  const allowed = await visibleClassroomIds(user);
  if (!allowed.includes(classroomId)) return c.json({ error: 'Not your classroom' }, 403);

  const isAdmin = user.role === 'ADMIN';
  const school = await getSchool(user.schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');

  const blocked = releaseBlockedReason({
    date,
    today,
    classroomHasOpenDay: isAdmin || await classroomHasOpenDay(classroomId, today),
    isAdmin,
  });
  if (blocked) {
    return c.json({ error: RELEASE_BLOCK_MESSAGE[blocked], code: blocked }, 403);
  }

  const viewer = await viewerOf(user);
  const result = await releaseSlot({
    classroomId, date,
    userId: user.userId, isAdmin, childIds: viewer.childIds,
  });

  if (result === 'NOT_FOUND') return c.json({ error: 'That day is not on the calendar' }, 404);
  if (result === 'FORBIDDEN') return c.json({ error: 'That slot belongs to another family' }, 403);

  return c.json({ slot: publicSlot(result, viewer) });
});

/** "Remind me tomorrow" from the two-day reminder, or undoing it. */
route.post('/api/snacks/remind-tomorrow', async (c) => {
  const user = c.get('user');
  const parsed = remindTomorrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  const { classroomId, date, on } = parsed.data;

  const school = await getSchool(user.schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');
  if (on && !canAskRemindTomorrow(date, today)) {
    return c.json({ error: 'A reminder for tomorrow can be set two days before your snack day.' }, 400);
  }

  const viewer = await viewerOf(user);
  const result = await setRemindTomorrow({ classroomId, date, userId: user.userId, childIds: viewer.childIds, on });
  if (result === 'NOT_FOUND') return c.json({ error: 'That day is not on the calendar' }, 404);
  if (result === 'FORBIDDEN') return c.json({ error: 'That day is not your family\'s' }, 403);

  return c.json({ slot: publicSlot(result, viewer) });
});

export default route;
