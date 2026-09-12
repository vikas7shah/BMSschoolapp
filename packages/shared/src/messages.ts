import { formatLong, formatShort, type CivilDate } from './dates.js';
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
      + `fruit for the class.\n\nWhat to bring: {{APP}}/what-to-bring/\n\nIf you can no `
      + `longer make it, please release your day in the app so another family can pick it up.`
      + `\n\n— ${c.schoolName}`,
    link: `/snacks?date=${c.date}`,
    dedupeKey: `SNACK_TOMORROW#${c.userId}#${c.date}`,
  };
}

export function snackNextWeek(c: SnackContext): ComposedMessage {
  return {
    type: 'SNACK_NEXT_WEEK',
    title: `Snack day coming up — ${formatShort(c.date)}`,
    body: `Heads up: you're bringing ${forChild(c)} to ${c.classroomName} on ${formatLong(c.date)}.`,
    sms: `${c.schoolName}: Heads up — you're bringing snacks to ${c.classroomName} on `
      + `${formatShort(c.date)} (dry snack and fruit). Reply STOP to opt out.`,
    emailSubject: `Coming up: snacks for ${c.classroomName} on ${formatShort(c.date)}`,
    emailText: `Hi ${c.firstName},\n\nA week's notice: you're signed up to bring snacks — a dry `
      + `snack and fruit — to ${c.classroomName} on ${formatLong(c.date)}.\n\n— ${c.schoolName}`,
    link: `/snacks?date=${c.date}`,
    dedupeKey: `SNACK_NEXT_WEEK#${c.userId}#${c.date}`,
  };
}

export interface OpenSlotContext {
  userId: string;
  firstName: string;
  schoolName: string;
  classroomName: string;
  openCount: number;
  soonestDate: CivilDate;
  /** Civil date the digest covers, so we send at most one of these per day. */
  digestDate: CivilDate;
}

export function openSlots(c: OpenSlotContext): ComposedMessage {
  const plural = c.openCount === 1 ? 'day still needs' : 'days still need';
  const when = `${c.openCount === 1 ? '' : 'starting '}${formatShort(c.soonestDate)}`;
  return {
    type: 'SLOT_OPEN',
    title: `${c.openCount} snack ${c.openCount === 1 ? 'day' : 'days'} open in ${c.classroomName}`,
    body: `${c.openCount} snack ${plural} a family, ${when}. Can you take one?`,
    sms: `${c.schoolName}: ${c.openCount} snack ${plural} a family in ${c.classroomName}, ${when}. Reply STOP to opt out. Sign up: `,
    emailSubject: `${c.openCount} open snack ${c.openCount === 1 ? 'day' : 'days'} in ${c.classroomName}`,
    emailText: `Hi ${c.firstName},\n\n${c.openCount} upcoming snack ${plural} a family in `
      + `${c.classroomName}, ${when}.\n\nWhoever signs up brings a dry snack and fruit for the `
      + `class that morning. If you can help, please claim a day in the app.\n\n— ${c.schoolName}`,
    link: '/snacks',
    dedupeKey: `SLOT_OPEN#${c.userId}#${c.digestDate}`,
  };
}

export interface NeverSignedUpContext {
  userId: string;
  firstName: string;
  schoolName: string;
  classroomName: string;
  digestDate: CivilDate;
}

export function neverSignedUp(c: NeverSignedUpContext): ComposedMessage {
  return {
    type: 'NEVER_SIGNED_UP',
    title: "You haven't signed up for a snack day yet",
    body: `${c.classroomName} families take turns bringing snacks. You don't have a day booked `
      + 'yet — please pick one that works for you.',
    sms: `${c.schoolName}: You haven't signed up for a snack day in ${c.classroomName} yet. `
      + 'Reply STOP to opt out. Please pick a day: ',
    emailSubject: `Please pick a snack day for ${c.classroomName}`,
    emailText: `Hi ${c.firstName},\n\nOur records show you don't have an upcoming snack day booked `
      + `for ${c.classroomName}. Families take turns bringing a dry snack and fruit for the `
      + `children.\n\nPlease choose a day that works for you in the app.\n\n— ${c.schoolName}`,
    link: '/snacks',
    dedupeKey: `NEVER_SIGNED_UP#${c.userId}#${c.digestDate}`,
  };
}

export function slotClaimed(c: SnackContext): ComposedMessage {
  return {
    type: 'SLOT_CLAIMED',
    title: `You're booked for ${formatShort(c.date)}`,
    body: `You're bringing snacks to ${c.classroomName} on ${formatLong(c.date)} — a dry snack `
      + "and fruit. We'll remind you the day before.",
    sms: `${c.schoolName}: You're booked to bring snacks to ${c.classroomName} on `
      + `${formatShort(c.date)} (dry snack and fruit). We'll remind you the day before.`,
    emailSubject: `Confirmed: snacks on ${formatShort(c.date)}`,
    emailText: `Hi ${c.firstName},\n\nYou're confirmed to bring snacks to ${c.classroomName} on `
      + `${formatLong(c.date)}.\n\nPlease bring both a dry snack and fruit for the class.\n\n`
      + `What to bring: {{APP}}/what-to-bring/\n\nWe'll send you a reminder the day before.`
      + `\n\n— ${c.schoolName}`,
    link: `/snacks?date=${c.date}`,
    dedupeKey: `SLOT_CLAIMED#${c.userId}#${c.date}`,
  };
}
