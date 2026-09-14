import {
  SCHOOL_YEAR, closureDates, closureReason, dateRange, isSnackEligible, isoWeekday, type Classroom,
} from '@bms/shared';
import { deleteOpenSlot, ensureSlot, listClassrooms, markPublished } from './repo.js';

export interface PublishResult {
  created: number;
  skippedHolidays: number;
  removed: number;
  holidays: { date: string; reason: string }[];
}

/**
 * Makes every snack weekday between two dates exist as an open slot, minus
 * closures. Idempotent: ensureSlot is conditional, so re-running never
 * touches a sign-up; and a date that has since become a holiday loses its
 * open slot, so the calendar heals when the school calendar changes.
 */
export async function publishRange(
  classroom: Classroom, from: string, to: string,
): Promise<PublishResult> {
  const weekdays = new Set(classroom.snackWeekdays);
  const closures = closureDates();
  const out: PublishResult = { created: 0, skippedHolidays: 0, removed: 0, holidays: [] };

  for (const date of dateRange(from, to)) {
    if (!weekdays.has(isoWeekday(date))) continue;
    if (!isSnackEligible(date, closures)) {
      out.skippedHolidays += 1;
      const reason = closureReason(date);
      if (reason) out.holidays.push({ date, reason });
      if (await deleteOpenSlot(classroom.classroomId, date)) out.removed += 1;
      continue;
    }
    // One slot per day: whoever takes it brings both a dry snack and fruit.
    if (await ensureSlot(classroom.schoolId, classroom.classroomId, date)) out.created += 1;
  }
  // A week-long vacation reads as one entry.
  out.holidays = [...new Map(out.holidays.map((h) => [h.reason, h])).values()].slice(0, 12);
  return out;
}

/**
 * The whole school year, for every classroom that is not already published
 * through the last day of school. Cheap to call often — a classroom already
 * marked done costs one read — so the hourly job calls it, and a classroom
 * created by an import is on the calendar within the hour.
 */
export async function publishSchoolYear(schoolId: string): Promise<{ classrooms: number; created: number }> {
  let classrooms = 0;
  let created = 0;
  for (const classroom of await listClassrooms(schoolId)) {
    if (classroom.publishedThrough === SCHOOL_YEAR.end) continue;
    const r = await publishRange(classroom, SCHOOL_YEAR.start, SCHOOL_YEAR.end);
    await markPublished(classroom.classroomId, SCHOOL_YEAR.end);
    classrooms += 1;
    created += r.created;
  }
  return { classrooms, created };
}
