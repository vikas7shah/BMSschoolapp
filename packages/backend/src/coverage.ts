import { addDays, monthOf, type Classroom, type SnackSlot, type User } from '@bms/shared';
import { listAllGuardianships, listChildren, listSlotsBySchool, listUsers } from './repo.js';

/** The last day of the month after `date`'s — the dashboard's horizon. */
export function endOfNextMonth(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const firstOfMonthAfterNext = new Date(Date.UTC(y, m + 1, 1)); // m is 1-based, so m+1 = two months on
  return addDays(firstOfMonthAfterNext.toISOString().slice(0, 10), -1);
}

export interface MonthCoverage { month: string; slots: number; filled: number; open: number }

export function coverageByMonth(slots: SnackSlot[], months: string[]): MonthCoverage[] {
  return months.map((month) => {
    const own = slots.filter((s) => monthOf(s.date) === month);
    return {
      month,
      slots: own.length,
      filled: own.filter((s) => s.status === 'CLAIMED').length,
      open: own.filter((s) => s.status === 'OPEN').length,
    };
  });
}

/**
 * Parents who have a child in the classroom and no snack day booked there
 * from `today` on. The same list drives the dashboard count and the
 * "remind now" send, so the two can never disagree.
 */
export async function unbookedParents(
  schoolId: string, classroom: Classroom, today: string,
): Promise<User[]> {
  const [users, links, children, slots] = await Promise.all([
    listUsers(schoolId),
    listAllGuardianships(),
    listChildren(schoolId),
    listSlotsBySchool(schoolId, today, '9999-12-31'),
  ]);
  const inRoom = new Set(children.filter((k) => k.classroomId === classroom.classroomId).map((k) => k.childId));
  const parentIds = new Set(links.filter((l) => inRoom.has(l.childId)).map((l) => l.userId));
  const booked = new Set(
    slots.filter((s) => s.classroomId === classroom.classroomId && s.status === 'CLAIMED')
      .map((s) => s.claimedByUserId),
  );
  return users.filter((u) => u.role === 'PARENT' && u.status !== 'DISABLED'
    && parentIds.has(u.userId) && !booked.has(u.userId));
}
