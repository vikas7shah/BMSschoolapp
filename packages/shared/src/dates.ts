/**
 * Date helpers. Everything user-facing is a plain `YYYY-MM-DD` civil date in the
 * school's own timezone — never a UTC instant — because "tomorrow's snack day"
 * must mean tomorrow for the parent, not for the Lambda's clock.
 */

export type CivilDate = string; // YYYY-MM-DD

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isCivilDate(v: unknown): v is CivilDate {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** Today's civil date in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): CivilDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Current hour (0-23) in the given IANA timezone. */
export function hourIn(timezone: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  return Number.parseInt(h, 10) % 24;
}

/** Add days to a civil date without ever touching local time. */
/** "2026-09" for any date in September 2026. */
export const monthOf = (date: CivilDate): string => date.slice(0, 7);

/** "September 2026". */
export const monthLabel = (month: string): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));

export function addDays(date: CivilDate, days: number): CivilDate {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(date: CivilDate): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return d === 0 ? 7 : d;
}

/** Inclusive list of civil dates from `start` to `end`. */
export function dateRange(start: CivilDate, end: CivilDate): CivilDate[] {
  const out: CivilDate[] = [];
  for (let d = start; daysBetween(d, end) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Mon, Sep 14" — for SMS and list rows. */
export function formatShort(date: CivilDate): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Monday, September 14" — for headings and email. */
export function formatLong(date: CivilDate): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Today" / "Tomorrow" / "in 3 days" relative to a reference civil date. */
export function relativeLabel(date: CivilDate, today: CivilDate): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `in ${n} days`;
  return formatShort(date);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: CivilDate): CivilDate {
  return addDays(date, -(isoWeekday(date) - 1));
}
