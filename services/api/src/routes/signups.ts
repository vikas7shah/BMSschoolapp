import { Hono } from 'hono';
import { ulid } from 'ulid';
import {
  addDays, formatShort, signupEventSchema, signupHoursSchema, signupScheduleSchema, todayIn,
  type ComposedMessage, type SignupEvent, type SignupSlot, type User,
} from '@bms/shared';
import {
  addSignupSlot, bookSignupSlot, cancelSignupBooking, deleteEmptySignupSlot, deleteSignupItems, deliver,
  getSchool, getSignupEvent, getSignupSlot, listAllGuardianships, listChildBookings, listChildren, listClassrooms,
  listSignupEvents, listSignupSlots, listUsers, putSignupEvent, setSlotCapacity, signupSlotSk,
} from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/** "08:20" → "8:20 am" */
export const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmmOf = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** The last day families can book: as set, or the day before the first time. */
function closesOn(event: SignupEvent, slots: SignupSlot[]): string | null {
  if (event.closesOn) return event.closesOn;
  const first = slots.map((s) => s.date).sort()[0];
  return first ? addDays(first, -1) : null;
}

const isOpenFor = (event: SignupEvent, slots: SignupSlot[], today: string) => {
  const last = closesOn(event, slots);
  return event.status === 'OPEN' && (!last || today <= last);
};

async function today(schoolId: string) {
  return todayIn((await getSchool(schoolId))?.timezone ?? 'America/New_York');
}

/**
 * Every sign-up the viewer should see, with its times. Families see the times
 * in their children's classrooms as counts only — never other families' names
 * — and which time each child holds. Teachers see the full sheet for the rooms
 * they teach; the office sees everything, drafts included.
 */
route.get('/api/signups', async (c) => {
  const user = c.get('user');
  const [events, rooms, children, links, users, now] = await Promise.all([
    listSignupEvents(user.schoolId), listClassrooms(user.schoolId), listChildren(user.schoolId),
    listAllGuardianships(), listUsers(user.schoolId), today(user.schoolId),
  ]);
  const isAdmin = user.role === 'ADMIN';
  const isStaff = isAdmin || user.role === 'TEACHER';
  const myKids = new Set(links.filter((l) => l.userId === user.userId).map((l) => l.childId));
  const myChildren = children.filter((k) => myKids.has(k.childId));
  const myRooms = new Set(isAdmin
    ? rooms.map((r) => r.classroomId)
    : user.role === 'TEACHER' ? user.teachesClassroomIds ?? [] : myChildren.map((k) => k.classroomId));
  const userById = new Map(users.map((u) => [u.userId, u]));
  const parentsOf = (childId: string) => links.filter((l) => l.childId === childId).map((l) => userById.get(l.userId)).filter((u): u is User => !!u);

  const out = [];
  for (const event of events.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!isAdmin && event.status === 'DRAFT') continue;
    const rel = event.classroomIds.filter((id) => myRooms.has(id));
    if (!rel.length && !isAdmin) continue;
    // Only its current classrooms: a classroom taken off it no longer counts.
    const slots = (await listSignupSlots(user.schoolId, event.eventId))
      .filter((s) => event.classroomIds.includes(s.classroomId) && (isAdmin || rel.includes(s.classroomId)));
    const lastDay = slots.map((s) => s.date).sort().at(-1);
    // Over once its last day has passed; the office keeps it in its list.
    if (!isAdmin && lastDay && lastDay < now) continue;

    const held = new Map((await listChildBookings(user.schoolId, event.eventId)).map((b) => [b.childId, b.slotSk]));
    const roomIds = isAdmin ? event.classroomIds : rel;
    out.push({
      eventId: event.eventId, kind: event.kind, title: event.title, status: event.status,
      classroomIds: event.classroomIds, slotMinutes: event.slotMinutes, capacity: event.capacity,
      location: event.location, closesOn: closesOn(event, slots), setClosesOn: event.closesOn ?? null,
      days: event.days ?? [...new Set(slots.map((s) => s.date))].sort(),
      times: event.times ?? [...new Set(slots.map((s) => s.start))].sort(),
      open: isOpenFor(event, slots, now),
      slots: slots.map((s) => ({
        slotId: s.sk, classroomId: s.classroomId, date: s.date, start: s.start, end: s.end,
        capacity: s.capacity, booked: s.booked,
        // Staff see who; a family sees only which of their own children holds it.
        ...(isStaff
          ? {
            bookings: Object.values(s.bookings ?? {}).sort((a, b) => a.bookedAt.localeCompare(b.bookedAt)).map((b) => {
              const p = userById.get(b.userId);
              return { childId: b.childId, childName: b.childName, parentName: b.parentName, email: p?.email, phone: p?.phone, byOffice: !!b.byOffice };
            }),
          }
          : { mine: Object.keys(s.bookings ?? {}).filter((id) => myKids.has(id)) }),
      })),
      // A family's children in this sign-up, and the time each holds.
      children: myChildren.filter((k) => event.classroomIds.includes(k.classroomId))
        .map((k) => ({ childId: k.childId, firstName: k.firstName, classroomId: k.classroomId, slotId: held.get(k.childId) ?? null })),
      // Staff: who hasn't booked yet, room by room.
      ...(isStaff
        ? {
          notBooked: children
            .filter((k) => roomIds.includes(k.classroomId) && !held.has(k.childId))
            .sort((a, b) => a.firstName.localeCompare(b.firstName))
            .map((k) => ({
              childId: k.childId, name: `${k.firstName} ${k.lastName}`.trim(), classroomId: k.classroomId,
              parents: parentsOf(k.childId).map((p) => `${p.firstName} ${p.lastName}`.trim()),
            })),
        }
        : {}),
    });
  }
  return c.json({ today: now, signups: out });
});

/** A family books a time for their child, or switches the time they hold. */
route.post('/api/signups/:eventId/book', async (c) => {
  const user = c.get('user');
  const { slotId, childId } = (await c.req.json().catch(() => ({}))) as { slotId?: string; childId?: string };
  if (!slotId || !childId) return c.json({ error: 'Choose a time' }, 400);
  const event = await getSignupEvent(user.schoolId, c.req.param('eventId'));
  if (!event || event.status === 'DRAFT') return c.json({ error: 'Not found' }, 404);

  const [slot, children, links, slots, now] = await Promise.all([
    getSignupSlot(user.schoolId, slotId), listChildren(user.schoolId), listAllGuardianships(),
    listSignupSlots(user.schoolId, event.eventId), today(user.schoolId),
  ]);
  const child = children.find((k) => k.childId === childId);
  if (!child || !links.some((l) => l.userId === user.userId && l.childId === childId)) {
    return c.json({ error: 'You can only book for your own child.' }, 403);
  }
  if (!slot || slot.eventId !== event.eventId || slot.classroomId !== child.classroomId) {
    return c.json({ error: 'That time is not in your child\'s classroom.' }, 400);
  }
  if (!isOpenFor(event, slots, now)) {
    return c.json({ error: 'Sign-ups have closed. Contact the school to make a change.' }, 409);
  }

  const result = await bookSignupSlot({
    schoolId: user.schoolId, eventId: event.eventId, slotSk: slot.sk,
    booking: {
      childId, childName: child.firstName, userId: user.userId,
      parentName: `${user.firstName} ${user.lastName}`.trim(), bookedAt: new Date().toISOString(),
    },
  });
  if (result === 'FULL') {
    const roomFull = slots.filter((s) => s.classroomId === child.classroomId).every((s) => s.booked >= s.capacity);
    return c.json({
      error: roomFull ? 'Every time is taken. Contact the school to switch.' : 'That time just filled up. Pick another.',
      code: 'FULL',
    }, 409);
  }
  if (result === 'CHANGED') return c.json({ error: 'Something changed while you were booking. Please try again.' }, 409);
  return c.json({ ok: true, slot: { date: slot.date, start: slot.start, end: slot.end } });
});

/** A teacher or the office nudges the families in a room who haven't booked. */
route.post('/api/signups/:eventId/remind', async (c) => {
  const user = c.get('user');
  const { classroomId } = (await c.req.json().catch(() => ({}))) as { classroomId?: string };
  if (!classroomId) return c.json({ error: 'Choose a classroom' }, 400);
  if (user.role !== 'ADMIN' && !(user.role === 'TEACHER' && (user.teachesClassroomIds ?? []).includes(classroomId))) {
    return c.json({ error: 'Only this classroom\'s teachers and the office can send reminders' }, 403);
  }
  const event = await getSignupEvent(user.schoolId, c.req.param('eventId'));
  if (!event || event.status !== 'OPEN') return c.json({ error: 'That sign-up is not open' }, 409);

  const [children, links, users, held, slots, school] = await Promise.all([
    listChildren(user.schoolId), listAllGuardianships(), listUsers(user.schoolId),
    listChildBookings(user.schoolId, event.eventId), listSignupSlots(user.schoolId, event.eventId), getSchool(user.schoolId),
  ]);
  const booked = new Set(held.map((b) => b.childId));
  const waiting = children.filter((k) => k.classroomId === classroomId && !booked.has(k.childId));
  const last = closesOn(event, slots);
  let sent = 0;
  for (const kid of waiting) {
    for (const l of links.filter((x) => x.childId === kid.childId)) {
      const parent = users.find((u) => u.userId === l.userId);
      if (!parent) continue;
      const msg: ComposedMessage = {
        type: 'SIGNUP_REMINDER',
        title: `Pick a time for ${kid.firstName}`,
        body: `${event.title}: ${kid.firstName} doesn't have a time yet.${last ? ` Sign-ups close ${formatShort(last)}.` : ''}`,
        sms: `${school?.name ?? 'School'}: pick a ${event.title.toLowerCase()} time for ${kid.firstName}: `,
        emailSubject: `Pick a time for ${kid.firstName} — ${event.title}`,
        emailText: `${kid.firstName} doesn't have a ${event.title.toLowerCase()} time yet.${last ? ` Sign-ups close ${formatShort(last)}.` : ''}`,
        link: `/signups/?event=${event.eventId}`,
        dedupeKey: `signup-remind:${event.eventId}:${parent.userId}:${Date.now()}`,
      };
      if (await deliver(parent, msg, { force: true }).catch(() => null)) sent += 1;
    }
  }
  return c.json({ sent, families: waiting.length });
});

/* ------------------------------------------------------------- the office */

/**
 * A classroom is in at most one sign-up of each kind at a time (closed ones
 * aside), so a family never sees two observations for the same child.
 * Returns the names of the classrooms already taken, if any.
 */
async function takenRooms(schoolId: string, kind: SignupEvent['kind'], classroomIds: string[], exceptEventId?: string) {
  const [events, rooms] = await Promise.all([listSignupEvents(schoolId), listClassrooms(schoolId)]);
  const taken = new Set(events
    .filter((e) => e.kind === kind && e.status !== 'CLOSED' && e.eventId !== exceptEventId)
    .flatMap((e) => e.classroomIds));
  return rooms.filter((r) => classroomIds.includes(r.classroomId) && taken.has(r.classroomId)).map((r) => r.name);
}

const takenMessage = (names: string[], kind: SignupEvent['kind']) =>
  `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} already in another ${kind === 'CONFERENCE' ? 'conference' : 'observation'} sign-up. Take ${names.length === 1 ? 'it' : 'them'} off that one first.`;

route.post('/api/admin/signups', async (c) => {
  const admin = c.get('user');
  const parsed = signupEventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, 400);
  const d = parsed.data;
  const clash = await takenRooms(admin.schoolId, d.kind, d.classroomIds);
  if (clash.length) return c.json({ error: takenMessage(clash, d.kind) }, 409);
  const eventId = ulid();
  const event: SignupEvent = {
    schoolId: admin.schoolId, sk: `EVENT#${eventId}`, eventId, kind: d.kind, title: d.title, status: 'DRAFT',
    classroomIds: d.classroomIds, slotMinutes: d.slotMinutes, capacity: d.capacity,
    closesOn: d.closesOn || undefined, location: d.location || 'In person', createdAt: new Date().toISOString(),
  };
  await putSignupEvent(event);
  return c.json({ eventId }, 201);
});

async function eventOr404(c: { get: (k: 'user') => User; req: { param: (k: string) => string } }) {
  return getSignupEvent(c.get('user').schoolId, c.req.param('eventId'));
}

route.patch('/api/admin/signups/:eventId', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = signupEventSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, 400);
  const d = parsed.data;
  const status = ['DRAFT', 'OPEN', 'CLOSED'].includes(body.status) ? body.status as SignupEvent['status'] : event.status;
  const nextRooms = d.classroomIds ?? event.classroomIds;

  // Adding a classroom, or reopening, can't put it in two sign-ups at once.
  if (status !== 'CLOSED') {
    const added = event.status === 'CLOSED' ? nextRooms : nextRooms.filter((id) => !event.classroomIds.includes(id));
    const clash = await takenRooms(event.schoolId, event.kind, added, event.eventId);
    if (clash.length) return c.json({ error: takenMessage(clash, event.kind) }, 409);
  }

  // Taking a classroom off takes its times with it — unless families are
  // booked there, who have to be moved or removed first.
  const removed = event.classroomIds.filter((id) => !nextRooms.includes(id));
  if (removed.length) {
    const slots = (await listSignupSlots(event.schoolId, event.eventId)).filter((x) => removed.includes(x.classroomId));
    const busyRooms = [...new Set(slots.filter((x) => x.booked > 0).map((x) => x.classroomId))];
    if (busyRooms.length) {
      const names = (await listClassrooms(event.schoolId)).filter((r) => busyRooms.includes(r.classroomId)).map((r) => r.name);
      const families = slots.reduce((n, x) => n + x.booked, 0);
      return c.json({
        error: `${names.join(' and ')} ${families === 1 ? 'has a family' : `${names.length === 1 ? 'has' : 'have'} ${families} families`} booked. Remove ${families === 1 ? 'it' : 'them'} on the sheet first.`,
      }, 409);
    }
    for (const x of slots) await deleteEmptySignupSlot(event.schoolId, x.sk);
  }

  // Families per time applies to every time, never below what is booked.
  if (d.capacity && d.capacity !== event.capacity) {
    const slots = (await listSignupSlots(event.schoolId, event.eventId)).filter((x) => nextRooms.includes(x.classroomId));
    const over = slots.find((x) => x.booked > d.capacity!);
    if (over) {
      return c.json({ error: `${formatShort(over.date)} ${clock(over.start)} already has ${over.booked} families. Move some first, or keep the number at ${over.booked} or more.` }, 409);
    }
    for (const x of slots) await setSlotCapacity(event.schoolId, x.sk, d.capacity);
  }

  await putSignupEvent({
    ...event, ...(d.title ? { title: d.title } : {}), ...(d.classroomIds ? { classroomIds: d.classroomIds } : {}),
    ...(d.capacity ? { capacity: d.capacity } : {}), ...(d.location !== undefined ? { location: d.location || 'In person' } : {}),
    ...(d.closesOn !== undefined ? { closesOn: d.closesOn || undefined } : {}), status,
  });
  return c.json({ ok: true });
});

/**
 * An observation's schedule: every day gets every time. Adds the slots that
 * are missing and removes the ones no longer wanted — unless families are
 * booked into one, in which case nothing changes and the office is told which.
 */
route.put('/api/admin/signups/:eventId/schedule', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const parsed = signupScheduleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the days and times' }, 400);
  const days = [...new Set(parsed.data.days)].sort();
  const times = [...new Set(parsed.data.times)].sort();

  const slots = await listSignupSlots(event.schoolId, event.eventId);
  const wanted = new Set(days.flatMap((d) => times.map((t) => `${d}#${t}`)));
  const unwanted = slots.filter((s) => !wanted.has(`${s.date}#${s.start}`));
  const busy = unwanted.find((s) => s.booked > 0);
  if (busy) {
    return c.json({ error: `${formatShort(busy.date)} at ${clock(busy.start)} has families booked. Move or remove them on the sheet first.` }, 409);
  }
  for (const s of unwanted) await deleteEmptySignupSlot(event.schoolId, s.sk);
  for (const room of event.classroomIds) {
    for (const date of days) {
      for (const start of times) {
        await addSignupSlot({
          schoolId: event.schoolId, sk: signupSlotSk(event.eventId, room, date, start), eventId: event.eventId,
          classroomId: room, date, start, end: hhmmOf(minutes(start) + event.slotMinutes),
          capacity: event.capacity, booked: 0, bookings: {},
        });
      }
    }
  }
  await putSignupEvent({ ...event, days, times });
  return c.json({ ok: true });
});

route.delete('/api/admin/signups/:eventId', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  await deleteSignupItems(event.schoolId, event.eventId);
  return c.json({ ok: true });
});

/*
 * Conferences have irregular hours per classroom, so they're built slot by
 * slot rather than days × times. These three serve them; conferences are
 * switched off in the app for now (CONFERENCES_ENABLED).
 */

/** Fills hours with back-to-back times: 8:00 → 11:20 makes ten 20-minute times. */
route.post('/api/admin/signups/:eventId/hours', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const parsed = signupHoursSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the times' }, 400);
  const d = parsed.data;
  if (!event.classroomIds.includes(d.classroomId)) return c.json({ error: 'That classroom is not in this sign-up' }, 400);
  const from = minutes(d.start);
  const to = minutes(d.end);
  if (to - from < event.slotMinutes) return c.json({ error: `Leave at least ${event.slotMinutes} minutes` }, 400);

  let added = 0;
  for (let t = from; t + event.slotMinutes <= to; t += event.slotMinutes) {
    const start = hhmmOf(t);
    const ok = await addSignupSlot({
      schoolId: event.schoolId, sk: signupSlotSk(event.eventId, d.classroomId, d.date, start),
      eventId: event.eventId, classroomId: d.classroomId, date: d.date, start, end: hhmmOf(t + event.slotMinutes),
      capacity: event.capacity, booked: 0, bookings: {},
    });
    if (ok) added += 1;
  }
  return c.json({ added });
});

/** Starts one classroom's times from another's. */
route.post('/api/admin/signups/:eventId/copy-times', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const { from, to } = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  if (!from || !to || !event.classroomIds.includes(to)) return c.json({ error: 'Choose both classrooms' }, 400);
  let added = 0;
  for (const s of (await listSignupSlots(event.schoolId, event.eventId)).filter((x) => x.classroomId === from)) {
    if (await addSignupSlot({ ...s, sk: signupSlotSk(event.eventId, to, s.date, s.start), classroomId: to, booked: 0, bookings: {} })) added += 1;
  }
  return c.json({ added });
});

route.post('/api/admin/signups/:eventId/remove-time', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const { slotId } = (await c.req.json().catch(() => ({}))) as { slotId?: string };
  if (!slotId?.startsWith(`SLOT#${event.eventId}#`)) return c.json({ error: 'Not found' }, 404);
  if (!await deleteEmptySignupSlot(event.schoolId, slotId)) {
    return c.json({ error: 'Families are booked into that time. Move them first.' }, 409);
  }
  return c.json({ ok: true });
});

/** An extra seat (or one fewer) in a single time. */
route.post('/api/admin/signups/:eventId/seats', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const { slotId, capacity } = (await c.req.json().catch(() => ({}))) as { slotId?: string; capacity?: number };
  const slot = slotId ? await getSignupSlot(event.schoolId, slotId) : null;
  if (!slot || slot.eventId !== event.eventId) return c.json({ error: 'Not found' }, 404);
  if (!Number.isInteger(capacity) || capacity! < Math.max(1, slot.booked) || capacity! > 30) {
    return c.json({ error: `Seats must be between ${Math.max(1, slot.booked)} and 30` }, 400);
  }
  await setSlotCapacity(event.schoolId, slot.sk, capacity!);
  return c.json({ ok: true });
});

/** The office books, moves or removes a family — past the limit if it must. */
route.post('/api/admin/signups/:eventId/book', async (c) => {
  const admin = c.get('user');
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const { slotId, childId } = (await c.req.json().catch(() => ({}))) as { slotId?: string; childId?: string };
  const [slot, children, links, users] = await Promise.all([
    slotId ? getSignupSlot(event.schoolId, slotId) : null, listChildren(admin.schoolId),
    listAllGuardianships(), listUsers(admin.schoolId),
  ]);
  const child = children.find((k) => k.childId === childId);
  if (!slot || slot.eventId !== event.eventId || !child) return c.json({ error: 'Not found' }, 404);
  if (child.classroomId !== slot.classroomId) return c.json({ error: 'That time is in a different classroom' }, 400);
  const parent = users.find((u) => links.some((l) => l.childId === child.childId && l.userId === u.userId));
  const result = await bookSignupSlot({
    schoolId: event.schoolId, eventId: event.eventId, slotSk: slot.sk, ignoreCapacity: true,
    booking: {
      childId: child.childId, childName: child.firstName, userId: parent?.userId ?? admin.userId,
      parentName: parent ? `${parent.firstName} ${parent.lastName}`.trim() : 'Added by the office',
      bookedAt: new Date().toISOString(), byOffice: true,
    },
  });
  if (result === 'CHANGED' || result === 'FULL') return c.json({ error: 'Something changed. Please try again.' }, 409);
  return c.json({ ok: true });
});

route.post('/api/admin/signups/:eventId/cancel', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const { childId } = (await c.req.json().catch(() => ({}))) as { childId?: string };
  if (!childId || !await cancelSignupBooking(event.schoolId, event.eventId, childId)) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

/**
 * Publishing shows it to families and teachers; announcing emails every
 * parent with a child in its classrooms (and puts it in their Messages),
 * linking straight to the sign-up.
 */
route.post('/api/admin/signups/:eventId/publish', async (c) => {
  const event = await eventOr404(c);
  if (!event) return c.json({ error: 'Not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { announce?: boolean; title?: string; message?: string };
  const slots = await listSignupSlots(event.schoolId, event.eventId);
  const empty = event.classroomIds.filter((id) => !slots.some((s) => s.classroomId === id));
  if (empty.length) {
    const names = (await listClassrooms(event.schoolId)).filter((r) => empty.includes(r.classroomId)).map((r) => r.name);
    return c.json({ error: `Add times for ${names.join(', ')} first` }, 400);
  }
  await putSignupEvent({ ...event, status: 'OPEN', publishedAt: new Date().toISOString() });

  const announced = body.announce
    ? await announce(event, {
      title: (body.title?.trim() || `${event.title} sign-ups are open`).slice(0, 80),
      message: (body.message?.trim() || 'Pick a time for your child in the app.').slice(0, 600),
    })
    : 0;
  return c.json({ ok: true, announced });
});

/** Tells every parent with a child in the sign-up's classrooms. Returns how many it reached. */
async function announce(event: SignupEvent, text: { title: string; message: string }): Promise<number> {
  const [school, users, children, links] = await Promise.all([
    getSchool(event.schoolId), listUsers(event.schoolId), listChildren(event.schoolId), listAllGuardianships(),
  ]);
  const kids = new Set(children.filter((k) => event.classroomIds.includes(k.classroomId)).map((k) => k.childId));
  const parentIds = new Set(links.filter((l) => kids.has(l.childId)).map((l) => l.userId));
  const parents = users.filter((u) => parentIds.has(u.userId) && u.status !== 'DISABLED');
  const schoolName = school?.name ?? 'School';
  const compose = (u: User): ComposedMessage => ({
    type: 'SIGNUP_OPEN',
    title: text.title,
    body: text.message,
    sms: `${schoolName}: ${text.title}. ${text.message}`.slice(0, 300),
    emailSubject: `${text.title} — ${schoolName}`,
    emailText: text.message,
    link: `/signups/?event=${event.eventId}`,
    dedupeKey: `signup-open:${event.eventId}:${u.userId}`,
  });

  // A few at a time: quick enough inside the API's time limit, gentle on the
  // email sending rate.
  let reached = 0;
  for (let i = 0; i < parents.length; i += 8) {
    const results = await Promise.all(parents.slice(i, i + 8).map((u) =>
      deliver(u, compose(u), { force: true }).catch((err) => { console.error('announcement failed', u.userId, err); return null; })));
    reached += results.filter(Boolean).length;
  }
  return reached;
}

export default route;
