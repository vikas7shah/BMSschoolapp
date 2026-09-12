import { addDays, startOfWeek, type CivilDate } from '@bms/shared';

/**
 * The Mon–Fri rows covering a month. Weekends are dropped entirely: snack days
 * are weekdays, and five columns leave enough width on a phone to show a name
 * rather than a coloured dot.
 *
 * Rows always run Monday to Friday, so the first and last may spill into the
 * neighbouring months.
 */
export function monthWeeks(month: string): CivilDate[][] {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  // Day 0 of the following month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const last = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const weeks: CivilDate[][] = [];
  const lastMonday = startOfWeek(last);
  for (let monday = startOfWeek(`${month}-01`); monday <= lastMonday; monday = addDays(monday, 7)) {
    weeks.push([0, 1, 2, 3, 4].map((i) => addDays(monday, i)));
  }
  return weeks;
}

export const monthOf = (date: CivilDate) => date.slice(0, 7);

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
