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
 * Parents who have a child in the classroom and no snack day booked for that
 * child this month (either parent's booking counts). The same list drives the
 * dashboard count and the "remind now" send, so the two can never disagree.
 */
export async function unbookedParents(
  schoolId: string, classroom: Classroom, today: string,
): Promise<User[]> {
  const month = monthOf(today);
  const [users, links, children, slots] = await Promise.all([
    listUsers(schoolId),
    listAllGuardianships(),
    listChildren(schoolId),
    listSlotsBySchool(schoolId, `${month}-01`, `${month}-31`),
  ]);
  const inRoom = new Set(children.filter((k) => k.classroomId === classroom.classroomId).map((k) => k.childId));
  const bookedKids = new Set(
    slots.filter((s) => s.classroomId === classroom.classroomId && s.status === 'CLAIMED' && s.claimedForChildId)
      .map((s) => s.claimedForChildId!),
  );
  const bookedByUser = new Set(
    slots.filter((s) => s.classroomId === classroom.classroomId && s.status === 'CLAIMED').map((s) => s.claimedByUserId),
  );
  // A parent is booked if any of their children in this room has a day.
  const kidsOf = new Map<string, string[]>();
  for (const l of links) if (inRoom.has(l.childId)) kidsOf.set(l.userId, [...(kidsOf.get(l.userId) ?? []), l.childId]);
  return users.filter((u) => u.role === 'PARENT' && u.status !== 'DISABLED'
    && kidsOf.has(u.userId)
    && !bookedByUser.has(u.userId)
    && !(kidsOf.get(u.userId) ?? []).some((k) => bookedKids.has(k)));
}
