import { Hono } from 'hono';
import { newsletterSchema } from '@bms/shared';
import { getNewsletter, listNewsletters, putNewsletter } from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/** Every month the school has sent, newest first; each one complete. */
route.get('/api/newsletters', async (c) => {
  const user = c.get('user');
  return c.json({ newsletters: await listNewsletters(user.schoolId) });
});

route.get('/api/newsletters/:month', async (c) => {
  const n = await getNewsletter(c.get('user').schoolId, c.req.param('month'));
  if (!n) return c.json({ error: 'No newsletter for that month' }, 404);
  return c.json({ newsletter: n });
});

/** The office's editor. Whole-month replace, so a re-paste is a clean fix. */
route.put('/api/admin/newsletters/:month', async (c) => {
  const admin = c.get('user');
  const month = c.req.param('month');
  if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ error: 'Month must look like 2026-09' }, 400);
  const parsed = newsletterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the newsletter fields' }, 400);
  }
  const n = {
    ...parsed.data,
    curriculumIntro: parsed.data.curriculumIntro || undefined,
    fromEmail: parsed.data.fromEmail || undefined,
    schoolId: admin.schoolId,
    month,
    updatedAt: new Date().toISOString(),
  };
  await putNewsletter(n);
  return c.json({ newsletter: n });
});

export default route;
