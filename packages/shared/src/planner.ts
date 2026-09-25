/**
 * Decides *what* reminders should exist on a given day. Pure and side-effect free
 * so the rules can be unit-tested without AWS; the reminders Lambda only handles
 * fetching input and performing delivery.
 *
 * The whole schedule:
 *  - 2 days before a family's snack day: "coming up", to whoever booked it.
 *  - 1 day before: only to a parent who tapped "Remind me tomorrow".
 *  - 1st of the month: families with no day that month are asked to pick one.
 *  - 8th of the month: one follow-up to families still without a day.
 * Anything else is the office's "Remind them", sent by hand.
 */
import { addDays, monthOf, type CivilDate } from './dates.js';
import { signUpReminder, snackSoon, snackTomorrow, type ComposedMessage, type SignUpKind } from './messages.js';
import { SIGNUP_FOLLOW_UP_DAY, SOON_REMINDER_DAYS } from './rules.js';
import type { SnackSlot } from './types.js';

export interface PlannerParent {
  userId: string;
  firstName: string;
  classroomIds: string[];
  /** The family's children — a day booked for any of them counts as the family's. */
  childIds?: string[];
}

export interface PlannerInput {
  today: CivilDate;
  schoolName: string;
  classroomNames: Record<string, string>;
  /**
   * Every slot from the 1st of this month through at least the soon-reminder
   * day: "has this family booked this month?" must see days already past.
   */
  slots: SnackSlot[];
  parents: PlannerParent[];
}

export interface PlannedNotification {
  userId: string;
  message: ComposedMessage;
}

/** Which sign-up reminder, if any, today's date calls for. */
export function signUpKindFor(today: CivilDate): Exclude<SignUpKind, 'NUDGE'> | null {
  const day = Number(today.slice(8, 10));
  if (day === 1) return 'MONTH_START';
  if (day === SIGNUP_FOLLOW_UP_DAY) return 'FOLLOW_UP';
  return null;
}

export function planReminders(input: PlannerInput): PlannedNotification[] {
  const { today, schoolName } = input;
  const nameOf = (id: string) => input.classroomNames[id] ?? 'your classroom';
  const parentById = new Map(input.parents.map((p) => [p.userId, p]));
  const out: PlannedNotification[] = [];

  const soon = addDays(today, SOON_REMINDER_DAYS);
  const tomorrow = addDays(today, 1);

  // --- A family's own day -----------------------------------------------------
  for (const slot of input.slots) {
    if (slot.status !== 'CLAIMED') continue;
    const ctxFor = (parent: PlannerParent) => ({
      userId: parent.userId,
      firstName: parent.firstName,
      schoolName,
      classroomName: nameOf(slot.classroomId),
      date: slot.date,
      childName: slot.claimedForChildName,
    });

    if (slot.date === soon && slot.claimedByUserId) {
      const parent = parentById.get(slot.claimedByUserId);
      if (parent) out.push({ userId: parent.userId, message: snackSoon(ctxFor(parent)) });
    }
    if (slot.date === tomorrow) {
      for (const userId of slot.remindTomorrowUserIds ?? []) {
        const parent = parentById.get(userId);
        if (parent) out.push({ userId, message: snackTomorrow(ctxFor(parent)) });
      }
    }
  }

  // --- Sign-up reminders: the 1st and the 8th, nothing in between -------------
  const kind = signUpKindFor(today);
  if (!kind) return out;

  const month = monthOf(today);
  const claimed = input.slots.filter((s) => s.status === 'CLAIMED' && monthOf(s.date) === month);
  // Booked is per family: a day for any of their children, taken by either parent.
  const familyHasDay = (parent: PlannerParent) => claimed.some((s) =>
    s.claimedByUserId === parent.userId
    || (!!s.claimedForChildId && (parent.childIds ?? []).includes(s.claimedForChildId)));

  const openByClassroom = new Map<string, number>();
  for (const s of input.slots) {
    if (s.status !== 'OPEN' || s.date < today || monthOf(s.date) !== month) continue;
    openByClassroom.set(s.classroomId, (openByClassroom.get(s.classroomId) ?? 0) + 1);
  }

  for (const parent of input.parents) {
    if (familyHasDay(parent)) continue;
    // Nothing left to pick (all taken, or no snack days this month) means no ask.
    const rooms = parent.classroomIds.filter((cid) => (openByClassroom.get(cid) ?? 0) > 0);
    if (!rooms.length) continue;
    out.push({
      userId: parent.userId,
      message: signUpReminder(kind, {
        userId: parent.userId,
        firstName: parent.firstName,
        schoolName,
        classroomName: nameOf(rooms[0]!),
        month,
        openCount: rooms.reduce((n, cid) => n + (openByClassroom.get(cid) ?? 0), 0),
        today,
      }),
    });
  }

  return out;
}
