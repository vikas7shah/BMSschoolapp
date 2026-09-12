/**
 * When a family may still change a snack day they have taken.
 *
 * Pure and shared so the API can enforce exactly what the app explains — the
 * button a parent sees and the answer the server gives can never drift apart.
 */
import { daysBetween, type CivilDate } from './dates.js';

/** A day may not be given up inside this many days of the date itself. */
export const RELEASE_NOTICE_DAYS = 2;

export type ReleaseBlock = 'TOO_LATE' | 'CALENDAR_FULL';

export interface ReleaseContext {
  date: CivilDate;
  today: CivilDate;
  /** Whether the classroom still has any unclaimed day from today onwards. */
  classroomHasOpenDay: boolean;
  /** Staff can always change a day, including on behalf of a family. */
  isAdmin: boolean;
}

/** Why a family cannot give this day up, or null if they can. */
export function releaseBlockedReason(ctx: ReleaseContext): ReleaseBlock | null {
  if (ctx.isAdmin) return null;

  // Too close to the day: the school needs notice to find someone else.
  if (daysBetween(ctx.today, ctx.date) <= RELEASE_NOTICE_DAYS) return 'TOO_LATE';

  // Every day is spoken for, so giving one up would leave a gap nobody can
  // fill. The office handles swaps from here.
  if (!ctx.classroomHasOpenDay) return 'CALENDAR_FULL';

  return null;
}

export const RELEASE_BLOCK_MESSAGE: Record<ReleaseBlock, string> = {
  TOO_LATE:
    `Snack days can't be changed within ${RELEASE_NOTICE_DAYS} days of the date. `
    + 'Please contact the school office.',
  CALENDAR_FULL:
    'Every snack day is taken, so the calendar is locked. Please contact the '
    + 'school office to arrange a swap.',
};
