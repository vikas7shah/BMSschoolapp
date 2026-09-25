import { formatLong, formatShort, monthLabel, type CivilDate } from './dates.js';
import type { NotificationType } from './types.js';

export interface ComposedMessage {
  type: NotificationType;
  title: string;
  /** In-app + push body. */
  body: string;
  /** Kept under 320 chars so it stays one or two SMS segments. */
  sms: string;
  emailSubject: string;
  emailText: string;
  /** Deep link into the app. */
  link: string;
  /** Stable key so a reminder is never sent to the same person twice. */
  dedupeKey: string;
}

export interface SnackContext {
  userId: string;
  firstName: string;
  schoolName: string;
  classroomName: string;
  date: CivilDate;
  /** Whose turn it is, for the "you're bringing snacks for X" wording. */
  childName?: string;
}

/** "snacks for Amelia" when we know the child, plain "snacks" otherwise. */
const forChild = (c: SnackContext) => (c.childName ? `snacks for ${c.childName}'s class` : 'snacks');

export function snackTomorrow(c: SnackContext): ComposedMessage {
  return {
    type: 'SNACK_TOMORROW',
    title: 'Snack day tomorrow',
    body: `Reminder: you're bringing ${forChild(c)} to ${c.classroomName} tomorrow, `
      + `${formatLong(c.date)} — a dry snack and fruit.`,
    sms: `${c.schoolName}: Reminder — you're bringing snacks to ${c.classroomName} tomorrow `
      + `(${formatShort(c.date)}): a dry snack and fruit. Thank you! Reply STOP to opt out.`,
    emailSubject: `Tomorrow: you're bringing snacks to ${c.classroomName}`,
    emailText: `Hi ${c.firstName},\n\nA friendly reminder that you signed up to bring snacks to `
      + `${c.classroomName} tomorrow, ${formatLong(c.date)}.\n\nPlease bring both a dry snack and `
      + `fruit for the class.\n\nWhat to bring: {{APP}}/what-to-bring/\n\n— ${c.schoolName}`,
    link: `/snacks?date=${c.date}`,
    dedupeKey: `SNACK_TOMORROW#${c.userId}#${c.date}`,
  };
}

/**
 * Two days out: the only automatic reminder about a family's own day. The
 * day-before one follows only if they ask for it from here.
 */
export function snackSoon(c: SnackContext): ComposedMessage {
  return {
    type: 'SNACK_SOON',
    title: `Snack day coming up — ${formatShort(c.date)}`,
    body: `You're bringing ${forChild(c)} to ${c.classroomName} on ${formatLong(c.date)} — a dry `
      + 'snack and fruit. Want a reminder tomorrow too? Tap here.',
    sms: `${c.schoolName}: Your snack day for ${c.classroomName} is ${formatShort(c.date)} `
      + '(dry snack and fruit). Reply STOP to opt out. Remind me tomorrow: ',
    emailSubject: `Coming up: snacks for ${c.classroomName} on ${formatShort(c.date)}`,
    emailText: `Hi ${c.firstName},\n\nYour snack day is coming up: you're bringing snacks — a dry `
      + `snack and fruit — to ${c.classroomName} on ${formatLong(c.date)}.\n\nWould a reminder `
      + 'tomorrow help? Open the app and tap "Remind me tomorrow" on the day.\n\nIf something has '
      + 'come up, please contact the school office.\n\n'
      + `What to bring: {{APP}}/what-to-bring/\n\n— ${c.schoolName}`,
    link: `/snacks?date=${c.date}`,
    dedupeKey: `SNACK_SOON#${c.userId}#${c.date}`,
  };
}

export type SignUpKind = 'MONTH_START' | 'FOLLOW_UP' | 'NUDGE';

export interface SignUpContext {
  userId: string;
  firstName: string;
  schoolName: string;
  classroomName: string;
  /** "2026-10": the month they have no day in. */
  month: string;
  /** Snack days still open in that month, from today on. */
  openCount: number;
  /** The office's "Remind them" is keyed by day so it can go again tomorrow. */
  today: CivilDate;
}

/**
 * Asks a family with no day this month to pick one: on the 1st, once more on
 * the 8th, and whenever the office presses "Remind them".
 */
export function signUpReminder(kind: SignUpKind, c: SignUpContext): ComposedMessage {
  const monthName = monthLabel(c.month).split(' ')[0];
  const open = `${c.openCount} ${c.openCount === 1 ? 'day is' : 'days are'} still open`;
  const first = kind === 'MONTH_START';
  return {
    type: first ? 'SIGNUP_MONTH_START' : kind === 'FOLLOW_UP' ? 'SIGNUP_FOLLOW_UP' : 'SIGNUP_NUDGE',
    title: first ? `Pick your ${monthName} snack day` : `Still time to pick a ${monthName} snack day`,
    body: first
      ? `${monthName} snack days for ${c.classroomName} are open — please pick one that works for you.`
      : `You don't have a ${monthName} snack day in ${c.classroomName} yet. ${open} — can you take one?`,
    sms: `${c.schoolName}: ${first ? `Please pick your ${monthName} snack day` : `You haven't picked a ${monthName} snack day yet`} `
      + `for ${c.classroomName}. Reply STOP to opt out. Sign up: `,
    emailSubject: first
      ? `Pick your ${monthName} snack day for ${c.classroomName}`
      : `Reminder: pick a ${monthName} snack day for ${c.classroomName}`,
    emailText: `Hi ${c.firstName},\n\n`
      + (first
        ? `${monthName} snack days for ${c.classroomName} are open. Families take turns bringing a dry `
          + 'snack and fruit for the class — please pick a day that works for you.'
        : `You don't have a ${monthName} snack day in ${c.classroomName} yet, and ${open}. Families `
          + 'take turns bringing a dry snack and fruit for the class — please pick one if you can.')
      + `\n\n— ${c.schoolName}`,
    link: '/snacks',
    dedupeKey: kind === 'NUDGE'
      ? `SIGNUP_NUDGE#${c.userId}#${c.today}`
      : `SIGNUP_${kind}#${c.userId}#${c.month}`,
  };
}

export function slotClaimed(c: SnackContext): ComposedMessage {
  return {
    type: 'SLOT_CLAIMED',
    title: `You're booked for ${formatShort(c.date)}`,
    body: `You're bringing snacks to ${c.classroomName} on ${formatLong(c.date)} — a dry snack `
      + "and fruit. We'll remind you two days before.",
    sms: `${c.schoolName}: You're booked to bring snacks to ${c.classroomName} on `
      + `${formatShort(c.date)} (dry snack and fruit). We'll remind you two days before.`,
    emailSubject: `Confirmed: snacks on ${formatShort(c.date)}`,
    emailText: `Hi ${c.firstName},\n\nYou're confirmed to bring snacks to ${c.classroomName} on `
      + `${formatLong(c.date)}.\n\nPlease bring both a dry snack and fruit for the class.\n\n`
      + `What to bring: {{APP}}/what-to-bring/\n\nWe'll send you a reminder two days before.`
      + `\n\n— ${c.schoolName}`,
    link: `/snacks?date=${c.date}`,
    dedupeKey: `SLOT_CLAIMED#${c.userId}#${c.date}`,
  };
}
