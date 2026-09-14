import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { pushSubscribeSchema, updatePrefsSchema, type SessionUser } from '@bms/shared';
import {
  childrenForGuardian, deletePushSubscription, getVapidPublicKey, listClassrooms, listNotifications,
  markNotificationRead, putPushSubscription, updateUser,
} from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

const endpointId = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

route.get('/api/me', async (c) => {
  const user = c.get('user');
  const children = await childrenForGuardian(user.userId);
  const rooms = await listClassrooms(user.schoolId);
  const payload: SessionUser = {
    userId: user.userId,
    schoolId: user.schoolId,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    prefs: user.prefs,
    children,
    classroomIds: [...new Set(children.map((k) => k.classroomId))],
    classroomNames: Object.fromEntries(rooms.map((r) => [r.classroomId, r.name])),
  };
  return c.json(payload);
});

route.patch('/api/me/prefs', async (c) => {
  const user = c.get('user');
  const parsed = updatePrefsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid preferences' }, 400);

  const prefs = { ...user.prefs, ...parsed.data.prefs };
  // The address is now how a parent signs in, so it is kept even when they have
  // reminder emails switched off.
  const email = parsed.data.email === '' ? undefined : parsed.data.email ?? user.email;
  if (prefs.email && !email) return c.json({ error: 'Add an email address first' }, 400);

  if (email && email !== user.email) {
    const { getUserByEmail } = await import('@bms/backend');
    const owner = await getUserByEmail(email);
    if (owner && owner.userId !== user.userId) {
      return c.json({ error: 'Another family already uses that email address' }, 409);
    }
  }

  const updated = await updateUser(user.userId, { prefs, email });
  return c.json({ prefs: updated?.prefs, email: updated?.email });
});

route.get('/api/notifications', async (c) => {
  const user = c.get('user');
  const items = await listNotifications(user.userId);
  return c.json({
    notifications: items.map((n) => ({
      notificationId: n.notificationId,
      sk: `${n.createdAt}#${n.notificationId}`,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      createdAt: n.createdAt,
      readAt: n.readAt,
    })),
    unread: items.filter((n) => !n.readAt).length,
  });
});

route.post('/api/notifications/read', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { sk?: string };
  if (!body.sk) return c.json({ error: 'Missing sk' }, 400);
  await markNotificationRead(user.userId, body.sk).catch(() => undefined);
  return c.json({ ok: true });
});

route.get('/api/push/key', async (c) => {
  const key = await getVapidPublicKey();
  return key ? c.json({ publicKey: key }) : c.json({ error: 'Push is not configured' }, 503);
});

route.post('/api/push/subscribe', async (c) => {
  const user = c.get('user');
  const parsed = pushSubscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid subscription' }, 400);

  await putPushSubscription({
    userId: user.userId,
    endpointId: endpointId(parsed.data.endpoint),
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    createdAt: new Date().toISOString(),
    failureCount: 0,
  });
  // Subscribing is the parent asking for push; switch the channel on for them.
  await updateUser(user.userId, { prefs: { ...user.prefs, push: true } });
  return c.json({ ok: true });
});

route.post('/api/push/unsubscribe', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) await deletePushSubscription(user.userId, endpointId(body.endpoint));
  await updateUser(user.userId, { prefs: { ...user.prefs, push: false } });
  return c.json({ ok: true });
});

export default route;
