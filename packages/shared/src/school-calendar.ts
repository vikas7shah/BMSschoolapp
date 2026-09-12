/**
 * The school year, transcribed from the published BMS calendar.
 *
 * `closed: true` is load-bearing — those dates get no snack day, and existing
 * ones are removed. A half day is *not* a closure: children are in during the
 * morning, which is when snack is served.
 */
import { addDays, type CivilDate } from './dates.js';

export interface SchoolEvent {
  date: CivilDate;
  /** Inclusive last day, for events spanning a range. */
  endDate?: CivilDate;
  title: string;
  /** As printed on the calendar, e.g. "6:00 pm". */
  time?: string;
  /** No school: no snack day is created, and any existing one is removed. */
  closed?: boolean;
  /** School is open but dismissal is early — snack still happens. */
  halfDay?: boolean;
  /** Regular classes are closed, but the school runs vacation care. */
  vacationCare?: boolean;
}

export const SCHOOL_YEAR = {
  label: '2026–27',
  /** First day of school. No snack days are created before this. */
  start: '2026-09-08',
  /** Last day of school. */
  end: '2027-06-11',
};

export const SCHOOL_EVENTS: SchoolEvent[] = [
  { date: '2026-09-02', title: 'New Student Orientation', time: '8:30–9:30 am' },
  { date: '2026-09-08', title: 'First Day of School' },

  { date: '2026-10-07', title: "Parents' Meeting", time: '6:00 pm' },
  { date: '2026-10-12', title: "Indigenous People's Day", closed: true },
  { date: '2026-10-23', title: 'Teachers Professional Day', closed: true },
  { date: '2026-10-30', title: 'Halloween Celebration', time: '9:00 am' },

  { date: '2026-11-04', title: 'Curriculum Night', time: '6:00 pm' },
  { date: '2026-11-11', title: 'Veterans Day', closed: true },
  { date: '2026-11-25', title: 'Half day — 11:30 dismissal for all children', halfDay: true },
  { date: '2026-11-26', endDate: '2026-11-27', title: 'Thanksgiving', closed: true },

  { date: '2026-12-01', endDate: '2026-12-02', title: 'Parent Observations', time: '8:30–9:15 am' },
  { date: '2026-12-04', title: 'Parent–Teacher Conferences', closed: true },
  { date: '2026-12-16', title: 'Holiday Concert', time: '9:00 am' },
  { date: '2026-12-23', title: 'Half day — 11:30 dismissal for all children', halfDay: true },
  { date: '2026-12-24', endDate: '2027-01-01', title: 'Holiday Vacation', closed: true },

  { date: '2027-01-04', title: 'BMS reopens from holiday break' },
  { date: '2027-01-18', title: 'Martin Luther King Day', closed: true },
  { date: '2027-01-19', title: 'Parents Meeting', time: '6:00 pm' },

  { date: '2027-02-12', title: '100th Day of School celebration' },
  { date: '2027-02-15', title: "President's Day", closed: true },
  {
    date: '2027-02-16', endDate: '2027-02-19',
    title: 'Winter Vacation', closed: true, vacationCare: true,
  },

  {
    date: '2027-03-02', endDate: '2027-03-03',
    title: 'Parent morning observation in the classroom', time: '8:30–9:15 am',
  },
  { date: '2027-03-05', title: 'Parent–Teacher Conferences', closed: true },
  { date: '2027-03-19', title: 'Teachers Professional Day', closed: true },
  { date: '2027-03-26', title: 'Good Friday', closed: true },

  { date: '2027-04-15', title: 'Spring Play', time: '4:00 pm' },
  { date: '2027-04-19', title: 'Patriots Day', closed: true },
  {
    date: '2027-04-20', endDate: '2027-04-23',
    title: 'Spring Vacation', closed: true, vacationCare: true,
  },
  { date: '2027-04-29', title: 'Science Fair — KG/Elementary only', time: '8:30 am' },

  { date: '2027-05-07', title: "Mother's Day Celebration", time: '9:00 am' },
  { date: '2027-05-21', title: 'Professional Development', closed: true },
  { date: '2027-05-31', title: 'Memorial Day', closed: true },

  { date: '2027-06-04', title: "Graduation & Father's Day celebration", time: '9:00 am' },
  { date: '2027-06-11', title: 'Last Day of School — 11:30 am half day', halfDay: true },
  { date: '2027-06-14', title: 'First Day of the Summer Program' },
];

/** Every date an event covers, expanding ranges. */
export function eventDates(event: SchoolEvent): CivilDate[] {
  const out: CivilDate[] = [];
  for (let d = event.date; d <= (event.endDate ?? event.date); d = addDays(d, 1)) out.push(d);
  return out;
}

/** Dates with no school, as a set — built once and reused. */
export function closureDates(events: SchoolEvent[] = SCHOOL_EVENTS): Set<CivilDate> {
  const set = new Set<CivilDate>();
  for (const e of events) {
    if (!e.closed) continue;
    for (const d of eventDates(e)) set.add(d);
  }
  return set;
}

/** Why there is no school on a date, if there isn't. */
export function closureReason(
  date: CivilDate, events: SchoolEvent[] = SCHOOL_EVENTS,
): string | undefined {
  for (const e of events) {
    if (!e.closed) continue;
    if (eventDates(e).includes(date)) return e.title;
  }
  return undefined;
}

/** Events falling on a date, ranges included. */
export function eventsOn(
  date: CivilDate, events: SchoolEvent[] = SCHOOL_EVENTS,
): SchoolEvent[] {
  return events.filter((e) => date >= e.date && date <= (e.endDate ?? e.date));
}

/**
 * Whether a snack day should exist. False outside the school year and on any
 * day the school is closed.
 */
export function isSnackEligible(
  date: CivilDate, closures: Set<CivilDate> = closureDates(),
): boolean {
  if (date < SCHOOL_YEAR.start || date > SCHOOL_YEAR.end) return false;
  return !closures.has(date);
}
