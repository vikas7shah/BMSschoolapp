import { Hono } from 'hono';
import { ulid } from 'ulid';
import { classCurriculumSchema, todayIn, type ClassCurriculumItem } from '@bms/shared';
import {
  curriculumSk, deleteCurriculumItem, getCurriculumItem, getSchool, listClassrooms, listCurriculumItems,
  putCurriculumItem,
} from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The curriculum groups a teacher teaches: the ones they chose, or else their
 * classrooms' names, which match the newsletter's "Classroom 1" groups.
 */
export async function teacherGroups(user: Vars['user']): Promise<string[]> {
  if (user.curriculumGroups) return user.curriculumGroups;
  const rooms = await listClassrooms(user.schoolId);
  return rooms.filter((r) => (user.teachesClassroomIds ?? []).includes(r.classroomId)).map((r) => r.name);
}

/**
 * Additions to a curriculum group's month. Everyone signed in can read them,
 * as with the newsletter's curriculum; the group's teachers and the office
 * can add and change them. The one thing a teacher may write.
 */
async function mayEdit(user: Vars['user'], group: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'TEACHER') return false;
  return (await teacherGroups(user)).some((g) => same(g, group));
}

const view = (i: ClassCurriculumItem) => ({
  itemId: i.itemId, month: i.month, group: i.group, area: i.area, text: i.text,
  addedByName: i.addedByName, updatedAt: i.updatedAt,
});

/** This school year's items: from four months back, which covers every letter still shown. */
route.get('/api/curriculum', async (c) => {
  const user = c.get('user');
  const school = await getSchool(user.schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');
  const from = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 5, 1)).toISOString().slice(0, 7);
  const items = await listCurriculumItems(user.schoolId, from);
  return c.json({
    items: items
      // Items from before additions were keyed by group have none; skip them.
      .filter((i) => i.group)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(view),
  });
});

route.post('/api/curriculum', async (c) => {
  const user = c.get('user');
  const parsed = classCurriculumSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, 400);
  const d = parsed.data;
  if (!await mayEdit(user, d.group)) return c.json({ error: 'Add that group to your curriculum first' }, 403);

  const now = new Date().toISOString();
  const itemId = ulid();
  const item: ClassCurriculumItem = {
    schoolId: user.schoolId, sk: curriculumSk(d.month, itemId),
    month: d.month, group: d.group, itemId, area: d.area, text: d.text,
    addedByUserId: user.userId, addedByName: user.role === 'ADMIN' ? 'the office' : user.firstName,
    createdAt: now, updatedAt: now,
  };
  await putCurriculumItem(item);
  return c.json({ item: view(item) }, 201);
});

route.put('/api/curriculum/:month/:itemId', async (c) => {
  const user = c.get('user');
  const current = await getCurriculumItem(user.schoolId, curriculumSk(c.req.param('month'), c.req.param('itemId')));
  if (!current) return c.json({ error: 'Not found' }, 404);
  if (!await mayEdit(user, current.group)) return c.json({ error: 'That group is not yours to change' }, 403);

  const parsed = classCurriculumSchema.safeParse({
    ...(await c.req.json().catch(() => ({}))), group: current.group, month: current.month,
  });
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, 400);

  const item = { ...current, area: parsed.data.area, text: parsed.data.text, updatedAt: new Date().toISOString() };
  await putCurriculumItem(item);
  return c.json({ item: view(item) });
});

route.delete('/api/curriculum/:month/:itemId', async (c) => {
  const user = c.get('user');
  const sk = curriculumSk(c.req.param('month'), c.req.param('itemId'));
  const current = await getCurriculumItem(user.schoolId, sk);
  if (!current) return c.json({ error: 'Not found' }, 404);
  if (!await mayEdit(user, current.group)) return c.json({ error: 'That group is not yours to change' }, 403);
  await deleteCurriculumItem(user.schoolId, sk);
  return c.json({ ok: true });
});

export default route;
