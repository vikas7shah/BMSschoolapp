import { Hono } from 'hono';
import { listAllGuardianships, listChildren, listClassrooms, listUsers } from '@bms/backend';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/**
 * The class list: each child in the teacher's rooms with their parents and how
 * to reach them. Read-only — nothing here can be changed by a teacher. The
 * office sees every room, so it can check what a teacher sees.
 */
route.get('/api/class', async (c) => {
  const user = c.get('user');
  const [rooms, children, links, users] = await Promise.all([
    listClassrooms(user.schoolId), listChildren(user.schoolId), listAllGuardianships(), listUsers(user.schoolId),
  ]);
  const mine = user.role === 'ADMIN'
    ? rooms
    : rooms.filter((r) => (user.teachesClassroomIds ?? []).includes(r.classroomId));

  const userById = new Map(users.map((u) => [u.userId, u]));
  const parentsOf = new Map<string, string[]>();
  for (const l of links) parentsOf.set(l.childId, [...(parentsOf.get(l.childId) ?? []), l.userId]);

  const byName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) =>
    a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName);

  return c.json({
    classrooms: mine
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((room) => ({
        classroomId: room.classroomId,
        name: room.name,
        children: children
          .filter((k) => k.classroomId === room.classroomId)
          .sort(byName)
          .map((k) => ({
            childId: k.childId,
            firstName: k.firstName,
            lastName: k.lastName,
            parents: (parentsOf.get(k.childId) ?? [])
              .map((id) => userById.get(id))
              .filter((u) => !!u && u.status !== 'DISABLED')
              .map((u) => ({
                firstName: u!.firstName, lastName: u!.lastName,
                phone: u!.phone, email: u!.email,
                extraPhones: u!.extraPhones, extraEmails: u!.extraEmails,
              })),
          })),
      })),
  });
});

export default route;
