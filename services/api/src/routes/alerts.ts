import { Hono } from 'hono';
import { ulid } from 'ulid';
import { alertSchema, type ComposedMessage, type SchoolAlert, type User } from '@bms/shared';
import {
  bumpRateLimit, deliver, getSchool, listAlerts, listAllGuardianships, listChildren, listClassrooms, listUsers,
  putAlert,
} from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/** A teacher can send this many alerts an hour; enough for a bad-weather morning. */
const TEACHER_ALERTS_PER_HOUR = 10;
/** How far back the Alerts tab looks. */
const KEEP_DAYS = 90;

/**
 * Who an alert reaches. A classroom alert goes to the parents of its children
 * and to the room's teachers; a whole-school alert to every parent with a
 * child on the roster and every teacher. Never the sender; never anyone
 * disabled. The office reads every alert in the tab, so it is not emailed.
 */
async function recipientsFor(
  schoolId: string, audience: SchoolAlert['audience'], classroomIds: string[], senderId: string,
): Promise<User[]> {
  const [users, children, links] = await Promise.all([
    listUsers(schoolId), listChildren(schoolId), listAllGuardianships(),
  ]);
  const inScope = (roomId: string) => audience === 'SCHOOL' || classroomIds.includes(roomId);
  const kids = new Set(children.filter((k) => inScope(k.classroomId)).map((k) => k.childId));
  const parents = new Set(links.filter((l) => kids.has(l.childId)).map((l) => l.userId));
  return users.filter((u) => u.userId !== senderId && u.status !== 'DISABLED' && (
    parents.has(u.userId)
    || (u.role === 'TEACHER' && (audience === 'SCHOOL' || (u.teachesClassroomIds ?? []).some(inScope)))
  ));
}

/** The classrooms a viewer's alerts concern: their children's, or the rooms they teach. */
async function roomsOf(user: User): Promise<Set<string> | 'ALL'> {
  if (user.role === 'ADMIN') return 'ALL';
  if (user.role === 'TEACHER') return new Set(user.teachesClassroomIds ?? []);
  const [children, links] = await Promise.all([listChildren(user.schoolId), listAllGuardianships()]);
  const mine = new Set(links.filter((l) => l.userId === user.userId).map((l) => l.childId));
  return new Set(children.filter((k) => mine.has(k.childId)).map((k) => k.classroomId));
}

const view = (a: SchoolAlert) => ({
  alertId: a.alertId, kind: a.kind, title: a.title, message: a.message,
  audience: a.audience, classroomIds: a.classroomIds,
  sentByName: a.sentByName, sentByRole: a.sentByRole, recipients: a.recipients, createdAt: a.createdAt,
});

route.get('/api/alerts', async (c) => {
  const user = c.get('user');
  const since = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
  const [alerts, rooms] = await Promise.all([listAlerts(user.schoolId, since), roomsOf(user)]);
  const visible = alerts.filter((a) => rooms === 'ALL' || a.audience === 'SCHOOL'
    || a.classroomIds.some((id) => rooms.has(id)) || a.sentByUserId === user.userId);
  return c.json({ alerts: visible.map(view) });
});

/** Rules shared by the preview count and the send. */
async function checkAudience(user: User, audience: SchoolAlert['audience'], classroomIds: string[]) {
  if (user.role !== 'ADMIN' && user.role !== 'TEACHER') return 'Only teachers and the office send alerts';
  const rooms = new Set((await listClassrooms(user.schoolId)).map((r) => r.classroomId));
  if (audience === 'CLASSROOMS') {
    if (!classroomIds.length) return 'Choose at least one classroom';
    if (classroomIds.some((id) => !rooms.has(id))) return 'Unknown classroom';
  }
  if (user.role === 'TEACHER') {
    if (audience === 'SCHOOL') return 'Only the office can alert the whole school';
    if (classroomIds.some((id) => !(user.teachesClassroomIds ?? []).includes(id))) return 'You can only alert your own class';
  }
  return null;
}

/** "Sends to 23 parents and 2 teachers", shown before sending. */
route.get('/api/alerts/recipients', async (c) => {
  const user = c.get('user');
  const audience = c.req.query('audience') === 'SCHOOL' ? 'SCHOOL' : 'CLASSROOMS';
  const classroomIds = (c.req.query('classroomIds') ?? '').split(',').filter(Boolean);
  const problem = await checkAudience(user, audience, classroomIds);
  if (problem) return c.json({ error: problem }, 403);
  const people = await recipientsFor(user.schoolId, audience, classroomIds, user.userId);
  return c.json({
    parents: people.filter((u) => u.role !== 'TEACHER').length,
    teachers: people.filter((u) => u.role === 'TEACHER').length,
  });
});

route.post('/api/alerts', async (c) => {
  const user = c.get('user');
  const parsed = alertSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the alert' }, 400);
  const d = parsed.data;
  const classroomIds = d.audience === 'SCHOOL' ? [] : [...new Set(d.classroomIds)];

  const problem = await checkAudience(user, d.audience, classroomIds);
  if (problem) return c.json({ error: problem }, 403);
  if (user.role === 'TEACHER'
    && await bumpRateLimit(`alert:${user.userId}`, 3600) > TEACHER_ALERTS_PER_HOUR) {
    return c.json({ error: 'That is a lot of alerts in an hour. Please try again later.' }, 429);
  }

  const alert = await sendAlert(user, { ...d, classroomIds });
  return c.json({ alert: view(alert) }, 201);
});

/**
 * Sends an alert and records it: delivered in the app and by email/push to
 * everyone it reaches, and listed in the Alerts tab. Also how a published
 * sign-up is announced.
 */
export async function sendAlert(user: User, d: {
  kind: SchoolAlert['kind']; title: string; message: string;
  audience: SchoolAlert['audience']; classroomIds: string[];
}, link = '/alerts/'): Promise<SchoolAlert> {
  const [school, rooms, people] = await Promise.all([
    getSchool(user.schoolId), listClassrooms(user.schoolId),
    recipientsFor(user.schoolId, d.audience, d.classroomIds, user.userId),
  ]);
  const schoolName = school?.name ?? 'School';
  const to = d.audience === 'SCHOOL'
    ? 'the whole school'
    : rooms.filter((r) => d.classroomIds.includes(r.classroomId)).map((r) => r.name).join(', ');
  const from = user.role === 'ADMIN' ? `${schoolName} office` : `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`;

  const alertId = ulid();
  const createdAt = new Date().toISOString();
  const compose = (u: User): ComposedMessage => ({
    type: 'ALERT',
    title: d.title,
    body: d.message,
    sms: `${schoolName}: ${d.title}. ${d.message}`.slice(0, 300),
    emailSubject: `${d.title} — ${schoolName}`,
    emailText: `${d.message}\n\nFrom ${from}, to ${to}.`,
    link,
    dedupeKey: `alert:${alertId}:${u.userId}`,
  });

  // A few at a time: fast enough for a whole school inside the API's time,
  // gentle enough on the email sending rate.
  let delivered = 0;
  for (let i = 0; i < people.length; i += 8) {
    const batch = people.slice(i, i + 8);
    const results = await Promise.all(batch.map((u) =>
      deliver(u, compose(u), { force: true }).catch((err) => { console.error('alert delivery failed', u.userId, err); return null; })));
    delivered += results.filter(Boolean).length;
  }

  const alert: SchoolAlert = {
    schoolId: user.schoolId, sk: `${createdAt}#${alertId}`, alertId,
    kind: d.kind, title: d.title, message: d.message, audience: d.audience, classroomIds: d.classroomIds,
    sentByUserId: user.userId, sentByName: from, sentByRole: user.role, recipients: delivered, createdAt,
  };
  await putAlert(alert);
  return alert;
}

export default route;
