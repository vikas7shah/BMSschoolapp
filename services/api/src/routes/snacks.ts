import { Hono } from 'hono';
import {
  addDays, claimSlotSchema, formatShort, releaseBlockedReason, releaseSlotSchema, slotClaimed,
  todayIn, RELEASE_BLOCK_MESSAGE, RELEASE_NOTICE_DAYS, SCHOOL_YEAR, type Child, type SnackSlot,
} from '@bms/shared';
import {
  childrenForGuardian, claimSlot, classroomHasOpenDay, deliver, getClassroom, getSchool,
  listChildren, listClassrooms, listSlots, releaseSlot, slotsForUser,
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
function publicSlot(slot: SnackSlot, viewerId: string) {
  return {
    classroomId: slot.classroomId,
    date: slot.date,
    status: slot.status,
    claimedByName: slot.claimedByName,
    claimedForChildName: slot.claimedForChildName,
    claimedForChildId: slot.claimedForChildId,
    note: slot.note,
    isMine: slot.claimedByUserId === viewerId,
  };
}

route.get('/api/snacks', async (c) => {
  const user = c.get('user');
  const school = await getSchool(user.schoolId);
  const tz = school?.timezone ?? 'America/Los_Angeles';
  const today = todayIn(tz);

  // The whole school year by default: the calendar pages through every month
  // of it, and a day outside the year is drawn as such, not as "no data".
  const from = c.req.query('from') ?? today;
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
    slots: slotLists.flat().map((s) => publicSlot(s, user.userId)),
  });
});

route.get('/api/snacks/mine', async (c) => {
  const user = c.get('user');
  const school = await getSchool(user.schoolId);
  const today = todayIn(school?.timezone ?? 'America/Los_Angeles');
  const slots = await slotsForUser(user.userId, today);
  const classrooms = await listClassrooms(user.schoolId);
  const nameOf = new Map(classrooms.map((cl) => [cl.classroomId, cl.name]));

  return c.json({
    today,
    slots: slots
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ ...publicSlot(s, user.userId), classroomName: nameOf.get(s.classroomId) })),
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

  // The board shows the child's name, so work it out here rather than making
  // the parent pick every time. A parent's own children in this room are the
  // candidates; staff, who usually have none, choose from the class roster so
  // the board never falls back to showing an adult's name.
  const own = (await childrenForGuardian(user.userId))
    .filter((k: Child) => k.classroomId === classroomId);
  const candidates = own.length > 0
    ? own
    : user.role === 'ADMIN'
      ? (await listChildren(user.schoolId)).filter((k: Child) => k.classroomId === classroomId)
      : [];

  let child: Child | undefined;
  if (childId) {
    child = candidates.find((k: Child) => k.childId === childId);
    if (!child) return c.json({ error: 'That child is not in this classroom' }, 403);
  } else if (candidates.length === 1) {
    child = candidates[0];
  } else if (candidates.length > 1) {
    return c.json({
      error: 'Which child is this for?',
      code: 'CHILD_REQUIRED',
      children: candidates
        .map((k: Child) => ({ childId: k.childId, firstName: k.firstName, lastName: k.lastName }))
        .sort((a, b) => a.firstName.localeCompare(b.firstName)),
    }, 400);
  }

  // One day per child per calendar month. Rather than refuse, tell the app
  // which day the child already holds so it can offer a switch.
  const month = date.slice(0, 7);
  const existing = child
    ? (await listSlots(classroomId, `${month}-01`, `${month}-31`)).find(
        (s) => s.status === 'CLAIMED' && s.claimedForChildId === child!.childId && s.date !== date,
      )
    : undefined;

  if (existing && !switchFrom) {
    return c.json({
      error: `${child!.firstName} already has ${formatShort(existing.date)} this month.`,
      code: 'MONTH_TAKEN',
      existingDate: existing.date,
      childName: child!.firstName,
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
    if (!isAdmin && existing.claimedByUserId !== user.userId) {
      return c.json({ error: 'That day belongs to another family.' }, 403);
    }
  }

  const result = await claimSlot({
    classroomId, date,
    userId: user.userId,
    // "Ana G." on the board, but just "Ana" for a parent with one name.
    userName: user.lastName ? `${user.firstName} ${user.lastName.charAt(0)}.` : user.firstName,
    childName: child?.firstName, childId: child?.childId, note,
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
  const classroom = await getClassroom(classroomId);
  await deliver(user, slotClaimed({
    userId: user.userId,
    firstName: user.firstName,
    schoolName: school?.name ?? 'School',
    classroomName: classroom?.name ?? 'your classroom',
    date,
    childName: child?.firstName,
  }), { force: true }).catch((err) => console.error('confirmation failed', err));

  return c.json({ slot: publicSlot(result, user.userId) });
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

  const result = await releaseSlot({
    classroomId, date,
    userId: user.userId, isAdmin,
  });

  if (result === 'NOT_FOUND') return c.json({ error: 'That day is not on the calendar' }, 404);
  if (result === 'FORBIDDEN') return c.json({ error: 'That slot belongs to another family' }, 403);

  return c.json({ slot: publicSlot(result, user.userId) });
});

export default route;
