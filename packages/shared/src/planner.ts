/**
 * Decides *what* reminders should exist on a given day. Pure and side-effect free
 * so the rules can be unit-tested without AWS; the reminders Lambda only handles
 * fetching input and performing delivery.
 */
import { addDays, startOfWeek, type CivilDate } from './dates.js';
import {
  neverSignedUp,
  openSlots,
  snackNextWeek,
  snackTomorrow,
  type ComposedMessage,
} from './messages.js';
import type { SnackSlot } from './types.js';

export interface ReminderConfig {
  /** Days ahead for the "coming up" nudge to the family who signed up. */
  nextWeekDays: number;
  /** How far ahead we look when telling parents that days are unfilled. */
  openSlotHorizonDays: number;
  /** Open slots this close are urgent enough to nudge about daily... */
  urgentDays: number;
  /**
   * ...but only when they are a gap, not an unfilled calendar. With more open
   * days than this in view, the nudge stays weekly — a fresh term has every
   * day open and "urgent" every day would be noise.
   */
  urgentMaxOpen: number;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  nextWeekDays: 7,
  openSlotHorizonDays: 10,
  urgentDays: 3,
  urgentMaxOpen: 2,
};

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
  /** All slots from today forward, within the horizon. */
  slots: SnackSlot[];
  parents: PlannerParent[];
  config?: ReminderConfig;
}

export interface PlannedNotification {
  userId: string;
  message: ComposedMessage;
}

export function planReminders(input: PlannerInput): PlannedNotification[] {
  const cfg = input.config ?? DEFAULT_REMINDER_CONFIG;
  const { today, schoolName } = input;
  const nameOf = (id: string) => input.classroomNames[id] ?? 'your classroom';
  const parentById = new Map(input.parents.map((p) => [p.userId, p]));
  const out: PlannedNotification[] = [];

  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, cfg.nextWeekDays);
  const horizonEnd = addDays(today, cfg.openSlotHorizonDays);

  // --- 1 & 2: direct reminders to whoever claimed the day -------------------
  for (const slot of input.slots) {
    if (slot.status !== 'CLAIMED' || !slot.claimedByUserId) continue;
    const parent = parentById.get(slot.claimedByUserId);
    if (!parent) continue;

    const ctx = {
      userId: parent.userId,
      firstName: parent.firstName,
      schoolName,
      classroomName: nameOf(slot.classroomId),
      date: slot.date,
      childName: slot.claimedForChildName,
    };

    if (slot.date === tomorrow) out.push({ userId: parent.userId, message: snackTomorrow(ctx) });
    else if (slot.date === nextWeek) out.push({ userId: parent.userId, message: snackNextWeek(ctx) });
  }

  // --- 3 & 4: nudges about unfilled days -----------------------------------
  // Only families with nothing booked are asked to step up. "Booked" is per
  // month and per family: a day for any of the family's children, taken by
  // either parent, in the month the open days fall in, and the whole month
  // counts — not just the days inside the reminder horizon.
  const openByClassroom = new Map<string, CivilDate[]>();
  for (const slot of input.slots) {
    if (slot.status !== 'OPEN') continue;
    if (slot.date < today || slot.date > horizonEnd) continue;
    const list = openByClassroom.get(slot.classroomId) ?? [];
    list.push(slot.date);
    openByClassroom.set(slot.classroomId, list);
  }
  const claimed = input.slots.filter((s) => s.status === 'CLAIMED');
  const familyHasDayIn = (parent: PlannerParent, month: string) => claimed.some((s) =>
    s.date.slice(0, 7) === month
    && (s.claimedByUserId === parent.userId
      || (!!s.claimedForChildId && (parent.childIds ?? []).includes(s.claimedForChildId))));

  const weekBucket = startOfWeek(today);

  for (const parent of input.parents) {
    // The months the open days fall in; a family booked in every one of them
    // has nothing to be asked for.
    const openMonths = new Set(
      parent.classroomIds.flatMap((cid) => (openByClassroom.get(cid) ?? []).map((d) => d.slice(0, 7))),
    );
    const monthsNeeding = [...openMonths].filter((m) => !familyHasDayIn(parent, m));
    if (openMonths.size > 0 && monthsNeeding.length === 0) continue; // already doing their part
    if (openMonths.size === 0 && familyHasDayIn(parent, today.slice(0, 7))) continue;

    // Aggregate across every classroom this parent has a child in.
    let openCount = 0;
    let soonest: CivilDate | undefined;
    let classroomName: string | undefined;
    for (const cid of parent.classroomIds) {
      const dates = openByClassroom.get(cid)?.filter((d) => monthsNeeding.includes(d.slice(0, 7)));
      if (!dates?.length) continue;
      openCount += dates.length;
      const min = dates.reduce((a, b) => (a < b ? a : b));
      if (!soonest || min < soonest) {
        soonest = min;
        classroomName = nameOf(cid);
      }
    }

    if (!soonest || !classroomName) {
      // Nothing open to point them at, but they still have no day booked at all.
      const anyClassroom = parent.classroomIds[0];
      if (anyClassroom) {
        out.push({
          userId: parent.userId,
          message: neverSignedUp({
            userId: parent.userId,
            firstName: parent.firstName,
            schoolName,
            classroomName: nameOf(anyClassroom),
            digestDate: weekBucket, // at most once a week
          }),
        });
      }
      continue;
    }

    // Urgent gaps earn a daily nudge; everything else is weekly, so the app
    // never becomes something parents mute.
    const urgent = soonest <= addDays(today, cfg.urgentDays) && openCount <= cfg.urgentMaxOpen;
    out.push({
      userId: parent.userId,
      message: openSlots({
        userId: parent.userId,
        firstName: parent.firstName,
        schoolName,
        classroomName,
        openCount,
        soonestDate: soonest,
        digestDate: urgent ? today : weekBucket,
      }),
    });
  }

  return out;
}
