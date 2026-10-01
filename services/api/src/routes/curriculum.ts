import { Hono } from 'hono';
import { ulid } from 'ulid';
import { classCurriculumSchema, todayIn, type ClassCurriculumItem } from '@bms/shared';
import {
  curriculumSk, deleteCurriculumItem, getCurriculumItem, getSchool, listCurriculumItems, putCurriculumItem,
} from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/**
 * What teachers add to their class's curriculum. Everyone signed in can read
 * it, as with the newsletter's curriculum; only a classroom's own teachers and
 * the office can add to it or change it. The one thing a teacher may write.
 */
const mayEdit = (user: Vars['user'], classroomId: string) =>
  user.role === 'ADMIN' || (user.role === 'TEACHER' && (user.teachesClassroomIds ?? []).includes(classroomId));

const view = (i: ClassCurriculumItem) => ({
  itemId: i.itemId, month: i.month, classroomId: i.classroomId, area: i.area, text: i.text,
  addedByName: i.addedByName, updatedAt: i.updatedAt,
});

/** This school year's items: from three months back, which covers every letter still shown. */
route.get('/api/curriculum', async (c) => {
  const user = c.get('user');
  const school = await getSchool(user.schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');
  const from = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 4, 1)).toISOString().slice(0, 7);
  const items = await listCurriculumItems(user.schoolId, from);
  return c.json({ items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(view) });
});

route.post('/api/curriculum', async (c) => {
  const user = c.get('user');
  const parsed = classCurriculumSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, 400);
  const d = parsed.data;
  if (!mayEdit(user, d.classroomId)) return c.json({ error: 'You can only add to your own class' }, 403);

  const now = new Date().toISOString();
  const itemId = ulid();
  const item: ClassCurriculumItem = {
    schoolId: user.schoolId, sk: curriculumSk(d.month, d.classroomId, itemId),
    month: d.month, classroomId: d.classroomId, itemId, area: d.area, text: d.text,
    addedByUserId: user.userId, addedByName: user.firstName, createdAt: now, updatedAt: now,
  };
  await putCurriculumItem(item);
  return c.json({ item: view(item) }, 201);
});

route.put('/api/curriculum/:month/:classroomId/:itemId', async (c) => {
  const user = c.get('user');
  const { month, classroomId, itemId } = c.req.param();
  const current = await getCurriculumItem(user.schoolId, curriculumSk(month, classroomId, itemId));
  if (!current) return c.json({ error: 'Not found' }, 404);
  if (!mayEdit(user, current.classroomId)) return c.json({ error: 'You can only change your own class' }, 403);

  const parsed = classCurriculumSchema.safeParse({
    ...(await c.req.json().catch(() => ({}))), classroomId: current.classroomId, month: current.month,
  });
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, 400);

  const item = { ...current, area: parsed.data.area, text: parsed.data.text, updatedAt: new Date().toISOString() };
  await putCurriculumItem(item);
  return c.json({ item: view(item) });
});

route.delete('/api/curriculum/:month/:classroomId/:itemId', async (c) => {
  const user = c.get('user');
  const { month, classroomId, itemId } = c.req.param();
  const sk = curriculumSk(month, classroomId, itemId);
  const current = await getCurriculumItem(user.schoolId, sk);
  if (!current) return c.json({ error: 'Not found' }, 404);
  if (!mayEdit(user, current.classroomId)) return c.json({ error: 'You can only change your own class' }, 403);
  await deleteCurriculumItem(user.schoolId, sk);
  return c.json({ ok: true });
});

export default route;
