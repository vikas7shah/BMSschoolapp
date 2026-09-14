import {
  DEFAULT_REMINDER_CONFIG, SCHOOL_YEAR, addDays, hourIn, planReminders, todayIn,
  type PlannerParent,
} from '@bms/shared';
import {
  deliver, env, getSchool, listAllGuardianships, listChildren, listClassrooms,
  listSlotsBySchool, listUsers, publishSchoolYear,
} from '@bms/backend';

interface InvokeEvent {
  /** Bypass the hour check — used by `npm run reminders:dry-run` and manual sends. */
  force?: boolean;
  /** Log what would be sent without sending anything. */
  dryRun?: boolean;
  /** Send only to these users — for a test send to one parent. */
  onlyUserIds?: string[];
}

export const handler = async (event: InvokeEvent = {}) => {
  const school = await getSchool(env.schoolId);
  if (!school) {
    console.error(`School ${env.schoolId} not found; nothing to do`);
    return { sent: 0, skipped: 0, reason: 'NO_SCHOOL' };
  }

  const today = todayIn(school.timezone);
  const hour = hourIn(school.timezone);

  // The job runs hourly and decides for itself, so changing the school's
  // timezone or send hour in the app takes effect without a redeploy.
  // Keep the calendar published through the last day of school. Runs every
  // hour but is a no-op once each classroom is marked done.
  const published = await publishSchoolYear(env.schoolId);
  if (published.classrooms) console.log(`Published ${published.created} snack days for ${published.classrooms} classroom(s) through ${SCHOOL_YEAR.end}`);

  if (school.remindersPaused && !event.onlyUserIds?.length) {
    console.log('Reminders are paused for this school; nothing sent.');
    return { sent: 0, skipped: 0, reason: 'PAUSED' };
  }
  if (!event.force && hour !== school.reminderHour) {
    return { sent: 0, skipped: 0, reason: 'NOT_THE_HOUR', hour, wanted: school.reminderHour };
  }

  const cfg = DEFAULT_REMINDER_CONFIG;
  const horizon = Math.max(cfg.nextWeekDays, cfg.openSlotHorizonDays) + 1;

  const [slots, users, children, links, classrooms] = await Promise.all([
    listSlotsBySchool(school.schoolId, today, addDays(today, horizon)),
    listUsers(school.schoolId),
    listChildren(school.schoolId),
    listAllGuardianships(),
    listClassrooms(school.schoolId),
  ]);

  const classroomOf = new Map(children.map((k) => [k.childId, k.classroomId]));
  const roomsByUser = new Map<string, Set<string>>();
  for (const link of links) {
    const room = classroomOf.get(link.childId);
    if (!room) continue;
    const set = roomsByUser.get(link.userId) ?? new Set<string>();
    set.add(room);
    roomsByUser.set(link.userId, set);
  }

  const userById = new Map(users.map((u) => [u.userId, u]));

  // Only active parents with a child in a classroom are in scope. Admins are
  // left out unless they are also a parent.
  const parents: PlannerParent[] = users
    .filter((u) => u.status !== 'DISABLED' && roomsByUser.has(u.userId))
    .map((u) => ({
      userId: u.userId,
      firstName: u.firstName,
      classroomIds: [...(roomsByUser.get(u.userId) ?? [])],
    }));

  const only = event.onlyUserIds?.length ? new Set(event.onlyUserIds) : null;
  const planned = planReminders({
    today,
    schoolName: school.name,
    classroomNames: Object.fromEntries(classrooms.map((cl) => [cl.classroomId, cl.name])),
    slots,
    parents,
    config: cfg,
  }).filter((p) => !only || only.has(p.userId));

  if (event.dryRun) {
    console.log(JSON.stringify({
      today, planned: planned.map((p) => ({ userId: p.userId, type: p.message.type, sms: p.message.sms })),
    }, null, 2));
    return { sent: 0, skipped: planned.length, reason: 'DRY_RUN' };
  }

  let sent = 0;
  let skipped = 0;

  // Small batches keep us well under SNS and SES per-second limits.
  const BATCH = 5;
  for (let i = 0; i < planned.length; i += BATCH) {
    const batch = planned.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async (p) => {
      const user = userById.get(p.userId);
      if (!user) return null;
      return deliver(user, p.message);
    }));
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('Delivery threw', r.reason);
        skipped += 1;
      } else if (r.value) sent += 1;
      else skipped += 1; // duplicate suppressed by the dedupe table
    }
  }

  // One JSON line per sweep; the dashboard's "reminders sent" series reads it.
  console.log(JSON.stringify({ metric: 'reminder-sweep', today, sent, skipped }));
  return { sent, skipped, today };
};
