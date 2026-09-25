import { Hono } from 'hono';
import {
  createClassroomSchema, dateRange, generateSlotsSchema, importRosterSchema, inviteParentSchema,
  monthOf, signUpReminder, todayIn,
  type Child, type ImportResult,
} from '@bms/shared';
import {
  childrenForGuardian, coverageByMonth, createChild, createClassroom, createUser, deleteUser, endOfNextMonth,
  deliver, getClassroom, getSchool, getUserByEmail, getUserByPhone, linkGuardian,
  listAllGuardianships, listChildren, listClassrooms, listSlots, listSlotsBySchool, listUsers, markNudged,
  publishRange, setReminderSwitches, unbookedParents, updateUser,
} from '@bms/backend';
import { createCognitoUser } from '../cognito.js';
import { removeChild, removeParent } from '../removal.js';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/* ------------------------------------------------------------------ school */

route.get('/api/admin/school', async (c) => {
  const school = await getSchool(c.get('user').schoolId);
  if (!school) return c.json({ error: 'Not found' }, 404);
  return c.json({
    remindersPaused: !!school.remindersPaused,
    openSlotNudgesPaused: !!school.openSlotNudgesPaused,
    reminderHour: school.reminderHour,
  });
});

/**
 * Two switches. `remindersPaused` is the master switch: nothing automatic goes
 * out, confirmations included; only sign-in codes and "Remind them" still do.
 * `openSlotNudgesPaused` keeps just the 1st and 8th sign-up reminders off — a
 * family's own snack-day reminders still go.
 */
route.patch('/api/admin/school', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const patch: { remindersPaused?: boolean; openSlotNudgesPaused?: boolean } = {};
  if (typeof body.remindersPaused === 'boolean') patch.remindersPaused = body.remindersPaused;
  if (typeof body.openSlotNudgesPaused === 'boolean') patch.openSlotNudgesPaused = body.openSlotNudgesPaused;
  if (!Object.keys(patch).length) return c.json({ error: 'Nothing to change' }, 400);
  await setReminderSwitches(c.get('user').schoolId, patch);
  const school = await getSchool(c.get('user').schoolId);
  return c.json({ remindersPaused: !!school?.remindersPaused, openSlotNudgesPaused: !!school?.openSlotNudgesPaused });
});

/* --------------------------------------------------------------- classrooms */

route.get('/api/admin/classrooms', async (c) => {
  return c.json({ classrooms: await listClassrooms(c.get('user').schoolId) });
});

route.post('/api/admin/classrooms', async (c) => {
  const user = c.get('user');
  const parsed = createClassroomSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid classroom' }, 400);

  const classroom = await createClassroom({
    schoolId: user.schoolId,
    name: parsed.data.name,
    snackWeekdays: parsed.data.snackWeekdays,
  });
  return c.json({ classroom }, 201);
});

/* ------------------------------------------------------------------- roster */

route.get('/api/admin/parents', async (c) => {
  const user = c.get('user');
  const [users, children, links] = await Promise.all([
    listUsers(user.schoolId), listChildren(user.schoolId), listAllGuardianships(),
  ]);
  const childById = new Map(children.map((k) => [k.childId, k]));
  const byUser = new Map<string, string[]>();
  for (const l of links) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l.childId]);

  return c.json({
    // Every child, so the child-centric view can show those with no guardian.
    children: children
      .map((k) => ({
        childId: k.childId, firstName: k.firstName, lastName: k.lastName,
        classroomId: k.classroomId,
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName)),
    parents: users.map((u) => ({
      userId: u.userId, firstName: u.firstName, lastName: u.lastName, phone: u.phone,
      email: u.email, extraPhones: u.extraPhones, extraEmails: u.extraEmails,
      role: u.role, status: u.status, prefs: u.prefs, lastLoginAt: u.lastLoginAt,
      children: (byUser.get(u.userId) ?? [])
        .map((id) => childById.get(id))
        .filter((k) => k)
        .map((k) => ({ childId: k!.childId, firstName: k!.firstName, classroomId: k!.classroomId })),
    })),
  });
});

route.post('/api/admin/parents', async (c) => {
  const admin = c.get('user');
  const parsed = inviteParentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' }, 400);
  }
  const data = parsed.data;

  if (await getUserByPhone(data.phone)) {
    return c.json({ error: 'A parent with that phone number already exists' }, 409);
  }

  const classrooms = await listClassrooms(admin.schoolId);
  const validIds = new Set(classrooms.map((cl) => cl.classroomId));
  for (const child of data.children) {
    if (!validIds.has(child.classroomId)) return c.json({ error: 'Unknown classroom' }, 400);
  }
  const clash = await siblingClash(
    null, data.children, (id) => classrooms.find((cl) => cl.classroomId === id)?.name ?? 'that classroom',
  );
  if (clash) return c.json({ error: clash }, 400);

  const user = await createUser({
    schoolId: admin.schoolId,
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    email: data.email || undefined,
  });

  try {
    await createCognitoUser(user.cognitoUsername, user.userId, user.phone);
  } catch (err) {
    // Don't leave a DynamoDB user that can never sign in.
    await deleteUser(user.userId);
    if ((err as { name?: string }).name === 'UsernameExistsException') {
      return c.json({ error: 'That phone number is already registered' }, 409);
    }
    throw err;
  }

  for (const child of data.children) {
    const created = await createChild({
      schoolId: admin.schoolId,
      classroomId: child.classroomId,
      firstName: child.firstName,
      lastName: child.lastName,
    });
    await linkGuardian(user.userId, created.childId);
  }

  return c.json({ user }, 201);
});

route.patch('/api/admin/parents/:userId', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    status?: 'ACTIVE' | 'DISABLED'; role?: 'PARENT' | 'ADMIN'; email?: string;
  };

  // An email is what lets a parent sign in while SMS is unavailable, so the
  // office needs to be able to add one after the roster import.
  let email: string | undefined;
  if (body.email !== undefined) {
    const trimmed = body.email.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      return c.json({ error: 'That is not a valid email address' }, 400);
    }
    if (trimmed) {
      const owner = await getUserByEmail(trimmed);
      if (owner && owner.userId !== c.req.param('userId')) {
        return c.json({ error: 'Another family already uses that email address' }, 409);
      }
    }
    email = trimmed;
  }

  const updated = await updateUser(c.req.param('userId'), {
    status: body.status, role: body.role, email,
  });
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ user: updated });
});

route.delete('/api/admin/parents/:userId', async (c) => {
  const admin = c.get('user');
  const userId = c.req.param('userId');
  if (userId === admin.userId) return c.json({ error: 'You cannot remove yourself' }, 400);
  const r = await removeParent(admin.schoolId, userId);
  if (r === 'NOT_FOUND') return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true, ...r });
});

/** Removing a child also removes a parent whose only child this was. */
route.delete('/api/admin/children/:childId', async (c) => {
  const admin = c.get('user');
  const r = await removeChild(admin.schoolId, c.req.param('childId'));
  if (r === 'NOT_FOUND') return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true, ...r });
});

/**
 * The school never places siblings in the same classroom — twins included.
 * Checks the children about to be attached against each other and against
 * any the guardian already has, and names the clash so the office can fix it.
 */
async function siblingClash(
  existingUserId: string | null,
  incoming: { firstName: string; classroomId: string }[],
  roomName: (id: string) => string,
): Promise<string | null> {
  const byRoom = new Map<string, string>();
  if (existingUserId) {
    for (const k of await childrenForGuardian(existingUserId)) byRoom.set(k.classroomId, k.firstName);
  }
  for (const c of incoming) {
    const other = byRoom.get(c.classroomId);
    if (other && other.toLowerCase() !== c.firstName.toLowerCase()) {
      return `${c.firstName} and ${other} would both be in ${roomName(c.classroomId)}. `
        + 'Siblings must be in different classrooms.';
    }
    byRoom.set(c.classroomId, c.firstName);
  }
  return null;
}

/* ------------------------------------------------------------ bulk import */

/**
 * Imports a spreadsheet of families. Every family is independent: one bad row
 * never rolls back the rest, and the caller is told exactly what happened to
 * each so the admin can fix a handful by hand rather than re-importing.
 */
route.post('/api/admin/parents/import', async (c) => {
  const admin = c.get('user');
  const parsed = importRosterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid import' }, 400);
  }

  const classrooms = await listClassrooms(admin.schoolId);
  const validRooms = new Set(classrooms.map((cl) => cl.classroomId));
  const roomName = (id: string) => classrooms.find((cl) => cl.classroomId === id)?.name ?? 'that classroom';

  // One read up front, then kept current as we go, so two guardians of the
  // same child in one file link to one child record rather than creating two.
  //
  // Values are promises, not records: families are imported concurrently, and
  // two guardians of the same child would otherwise both miss the index and
  // both create a child. Storing the in-flight creation makes the second
  // caller await the first instead.
  const children = await listChildren(admin.schoolId);
  const childIndex = new Map<string, Promise<Child>>(
    children.map((k) => [childKey(k.classroomId, k.firstName, k.lastName), Promise.resolve(k)]),
  );

  const results: ImportResult[] = [];
  let childrenCreated = 0;

  // Children with no contact details, created so the class list is complete.
  for (const child of parsed.data.children) {
    if (!validRooms.has(child.classroomId)) continue;
    const key = childKey(child.classroomId, child.firstName, child.lastName);
    if (childIndex.has(key)) continue;
    childIndex.set(key, createChild({
      schoolId: admin.schoolId,
      classroomId: child.classroomId,
      firstName: child.firstName,
      lastName: child.lastName,
    }));
    childrenCreated += 1;
  }
  await Promise.all([...childIndex.values()]);

  // Small batches: enough concurrency to stay inside the Lambda timeout,
  // few enough to stay under the Cognito admin API rate limits.
  const BATCH = 5;
  const families = parsed.data.families;
  for (let i = 0; i < families.length; i += BATCH) {
    const batch = families.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map((f) => importFamily(admin.schoolId, f, validRooms, childIndex, roomName)),
    );
    settled.forEach((r, j) => {
      const f = batch[j]!;
      results.push(r.status === 'fulfilled' ? r.value : {
        phone: f.phone ?? f.email ?? '',
        name: `${f.firstName} ${f.lastName}`,
        outcome: 'FAILED',
        reason: (r.reason as Error)?.message ?? 'Unknown error',
        childrenCreated: 0,
        childrenLinked: 0,
      });
    });
  }

  return c.json({
    results,
    summary: {
      created: results.filter((r) => r.outcome === 'CREATED').length,
      linked: results.filter((r) => r.outcome === 'LINKED').length,
      skipped: results.filter((r) => r.outcome === 'SKIPPED_EXISTS').length,
      failed: results.filter((r) => r.outcome === 'FAILED').length,
      childrenCreated,
    },
  });
});

const childKey = (classroomId: string, first: string, last: string) =>
  `${classroomId}#${first.trim().toLowerCase()}#${last.trim().toLowerCase()}`;

async function importFamily(
  schoolId: string,
  family: { firstName: string; lastName: string; phone?: string; email?: string;
    extraPhones?: string[]; extraEmails?: string[];
    children: { firstName: string; lastName: string; classroomId: string }[] },
  validRooms: Set<string>,
  childIndex: Map<string, Promise<Child>>,
  roomName: (id: string) => string,
): Promise<ImportResult> {
  const name = `${family.firstName} ${family.lastName}`.trim();
  const base = { phone: family.phone ?? family.email ?? '', name, childrenCreated: 0, childrenLinked: 0 };

  for (const child of family.children) {
    if (!validRooms.has(child.classroomId)) {
      return { ...base, outcome: 'FAILED', reason: 'Unknown classroom' };
    }
  }

  // The same person may already be on the roster — often a parent who is also
  // staff, or a second import. Match on either handle, and attach their
  // children rather than skipping the row and losing the link.
  const existing = (family.phone ? await getUserByPhone(family.phone) : null)
    ?? (family.email ? await getUserByEmail(family.email) : null);

  const clash = await siblingClash(existing?.userId ?? null, family.children, roomName);
  if (clash) return { ...base, outcome: 'FAILED', reason: clash };

  let user = existing;
  if (!user) {
    user = await createUser({
      schoolId,
      role: 'PARENT',
      firstName: family.firstName,
      lastName: family.lastName,
      phone: family.phone,
      email: family.email || undefined,
      extraPhones: family.extraPhones?.length ? family.extraPhones : undefined,
      extraEmails: family.extraEmails?.length ? family.extraEmails : undefined,
    });

    try {
      await createCognitoUser(user.cognitoUsername, user.userId, user.phone);
    } catch (err) {
      // Never leave behind a parent who exists but can never sign in.
      await deleteUser(user.userId);
      const reason = (err as { name?: string }).name === 'UsernameExistsException'
        ? 'That account is already registered'
        : 'Could not create the sign-in account';
      return { ...base, outcome: 'FAILED', reason };
    }
  }

  let created = 0;
  let linked = 0;
  for (const child of family.children) {
    const key = childKey(child.classroomId, child.firstName, child.lastName);

    let pending = childIndex.get(key);
    if (pending) {
      linked += 1;
    } else {
      // The map is populated synchronously, before the first await, so a
      // concurrent import of the same child cannot slip in between.
      pending = createChild({
        schoolId,
        classroomId: child.classroomId,
        firstName: child.firstName,
        lastName: child.lastName,
      });
      childIndex.set(key, pending);
      created += 1;
    }

    const record = await pending;
    await linkGuardian(user.userId, record.childId);
  }

  return {
    ...base,
    outcome: existing ? (created + linked > 0 ? 'LINKED' : 'SKIPPED_EXISTS') : 'CREATED',
    userId: user.userId,
    childrenCreated: created, childrenLinked: linked,
  };
}

/* --------------------------------------------------------- snack day set-up */

route.post('/api/admin/slots/generate', async (c) => {
  const admin = c.get('user');
  const parsed = generateSlotsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid range' }, 400);
  const { classroomId, from, to } = parsed.data;

  const classroom = await getClassroom(classroomId);
  if (!classroom || classroom.schoolId !== admin.schoolId) {
    return c.json({ error: 'Unknown classroom' }, 404);
  }
  if (from > to) return c.json({ error: 'Start date must come first' }, 400);
  if (dateRange(from, to).length > 400) return c.json({ error: 'Please generate at most a year at a time' }, 400);

  return c.json(await publishRange(classroom, from, to));
});

/**
 * Coverage view: this month and next, per classroom — which days still have
 * nobody on them, and which families have not booked. The same horizon feeds
 * the admin Home dashboard and the Overview tab.
 */
route.get('/api/admin/overview', async (c) => {
  const admin = c.get('user');
  const school = await getSchool(admin.schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');
  const to = endOfNextMonth(today);
  const months = [monthOf(today), monthOf(to)];

  const [slots, classrooms, users, links, children] = await Promise.all([
    listSlotsBySchool(admin.schoolId, today, to),
    listClassrooms(admin.schoolId),
    listUsers(admin.schoolId),
    listAllGuardianships(),
    listChildren(admin.schoolId),
  ]);

  const parentsWithClaim = new Set(
    slots.filter((s) => s.status === 'CLAIMED').map((s) => s.claimedByUserId),
  );
  const guardianIds = new Set(links.map((l) => l.userId));
  const parents = users.filter((u) => u.role === 'PARENT' && guardianIds.has(u.userId));

  // Staff think in children, not account holders, so the outstanding list is
  // keyed on the child's name.
  const childById = new Map(children.map((k) => [k.childId, k]));
  const childrenOf = new Map<string, string[]>();
  for (const l of links) {
    const kid = childById.get(l.childId);
    if (!kid) continue;
    childrenOf.set(l.userId, [...(childrenOf.get(l.userId) ?? []), kid.firstName]);
  }

  const byClassroom = await Promise.all(classrooms.map(async (cl) => {
    const own = slots.filter((s) => s.classroomId === cl.classroomId);
    const kids = new Set(children.filter((k) => k.classroomId === cl.classroomId).map((k) => k.childId));
    return {
      classroomId: cl.classroomId,
      name: cl.name,
      slots: own.length,
      filled: own.filter((s) => s.status === 'CLAIMED').length,
      open: own.filter((s) => s.status === 'OPEN').length,
      months: coverageByMonth(own, months),
      families: new Set(links.filter((l) => kids.has(l.childId)).map((l) => l.userId)).size,
      unbookedFamilies: (await unbookedParents(admin.schoolId, cl, today)).length,
      nudgedToday: cl.nudgedOn === today,
    };
  }));

  return c.json({
    today,
    range: { from: today, to },
    months,
    classrooms: classrooms.map((cl) => ({ classroomId: cl.classroomId, name: cl.name })),
    totals: {
      slots: slots.length,
      filled: slots.filter((s) => s.status === 'CLAIMED').length,
      open: slots.filter((s) => s.status === 'OPEN').length,
    },
    byClassroom,
    openSlots: slots
      .filter((s) => s.status === 'OPEN')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ date: s.date, classroomId: s.classroomId })),
    childrenWithNothingBooked: dedupeByChild(
      parents
        .filter((p) => !parentsWithClaim.has(p.userId))
        .flatMap((p) => (childrenOf.get(p.userId) ?? []).map((childName) => ({
          childName,
          classroomId: classroomOfChild(children, links, p.userId, childName),
        }))),
    ),
  });
});

/**
 * "Remind them": the sign-up reminder to every family in the room with nothing
 * booked this month, sent straight away. The office's forced send: it goes
 * even while reminders are paused, and is limited to once a day per classroom.
 */
route.post('/api/admin/classrooms/:classroomId/nudge', async (c) => {
  const admin = c.get('user');
  const classroom = await getClassroom(c.req.param('classroomId'));
  if (!classroom || classroom.schoolId !== admin.schoolId) return c.json({ error: 'Unknown classroom' }, 404);

  const school = await getSchool(admin.schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');
  if (classroom.nudgedOn === today) {
    return c.json({ error: `${classroom.name} was already reminded today. Try again tomorrow.` }, 409);
  }

  const families = await unbookedParents(admin.schoolId, classroom, today);
  if (!families.length) return c.json({ sent: 0, families: 0 });

  const month = monthOf(today);
  const openCount = (await listSlots(classroom.classroomId, today, `${month}-31`))
    .filter((s) => s.status === 'OPEN').length;
  const results = await Promise.allSettled(families.map((u) => deliver(u, signUpReminder('NUDGE', {
    userId: u.userId,
    firstName: u.firstName,
    schoolName: school?.name ?? 'School',
    classroomName: classroom.name,
    month,
    openCount,
    today,
  }), { force: true })));
  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  for (const r of results) if (r.status === 'rejected') console.error('Remind-now delivery failed', r.reason);

  await markNudged(classroom.classroomId, today);
  console.log(`Remind-now for ${classroom.name} by ${admin.userId}: ${sent} sent to ${families.length} families`);
  return c.json({ sent, families: families.length });
});

/** A child with two guardians appears once, not twice. */
function dedupeByChild<T extends { childName: string; classroomId?: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const i of items) seen.set(`${i.classroomId ?? ''}|${i.childName.toLowerCase()}`, i);
  return [...seen.values()].sort((a, b) => a.childName.localeCompare(b.childName));
}

function classroomOfChild(
  children: Child[],
  links: { userId: string; childId: string }[],
  userId: string,
  firstName: string,
): string | undefined {
  const ids = new Set(links.filter((l) => l.userId === userId).map((l) => l.childId));
  return children.find((k) => ids.has(k.childId) && k.firstName === firstName)?.classroomId;
}


export default route;
